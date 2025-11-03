// public/js/post.js (Atualizado com Paginação e Scroll Infinito)

import { auth, db, storage } from './firebase-config.js';
import {
    collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc, getCountFromServer, writeBatch,
    limit, startAfter // Adicionado limit e startAfter
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { removeFriend, blockUser, checkFriendshipStatus } from './friends.js'; // Mantido se usado nas ações
import { containsForbiddenWords } from './profanity-filter.js';

// --- Função linkifyText (AJUSTADA para não linkar imagens) ---
function linkifyText(inputText) {
  if (!inputText) return '';
  const urlRegex = /(\b(https?:\/\/|www\.)[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
  const imageRegex = /\.(gif|jpe?g|png|webp)$/i;
  return inputText.replace(urlRegex, function(url) {
    if (imageRegex.test(url)) return url;
    let href = url;
    if (!href.match(/^https?:\/\//i)) href = 'http://' + href;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}
// --- Fim da Função linkifyText ---

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); }, 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { if (container.contains(toast)) { container.removeChild(toast); } }, 500);
    }, 5000);
}

// --- CAPTURA DE ELEMENTOS (mantidos para createPost e modal) ---
const postTextInput = document.getElementById('post-text');
const postButton = document.getElementById('post-button');
const createPostModal = document.getElementById('create-post-modal');
const closeModalBtn = document.querySelector('.close-modal-btn');
const charCounter = document.getElementById('post-char-counter');
const fabCreatePost = document.getElementById('fab-create-post'); // Botão FAB

let userProfilesCache = {}; // Cache de perfis

async function getUserProfile(uid) {
    if (userProfilesCache[uid]) return userProfilesCache[uid];
    try {
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const profile = {
                uid: uid,
                nickname: userData.nickname || 'Usuário Desconhecido',
                avatarUrl: userData.photoURL || '/imagens/avatar_padrao.png'
            };
            userProfilesCache[uid] = profile;
            return profile;
        }
        return { uid: uid, nickname: 'Usuário Desconhecido', avatarUrl: '/imagens/avatar_padrao.png' };
    } catch (error) {
        console.error("Erro ao buscar perfil:", error);
        return { uid: uid, nickname: 'Usuário Desconhecido', avatarUrl: '/imagens/avatar_padrao.png' };
    }
}

// --- FUNÇÕES DE POSTS (createPost permanece aqui) ---

async function createPost() {
    const user = auth.currentUser;
    const text = postTextInput.value;
    // Verifica filtro de palavras
    if (containsForbiddenWords(text)) {
        showToast("Sua publicação contém palavras não permitidas.", "error");
        return;
    }
    // Validações
    if (!user || text.trim() === '') { showToast("Você precisa escrever algo para postar.", "error"); return; }
    if (text.length > 2000) { showToast("A publicação não pode ter mais de 2000 caracteres.", "error"); return; }
    const lines = text.split('\n');
    for (const line of lines) { if (line.length > 120) { showToast("Cada linha da publicação não pode ter mais de 120 caracteres.", "error"); return; } }

    postButton.disabled = true;
    postButton.textContent = 'Publicando...';

    // Determina gameId baseado na página atual (se aplicável)
    const params = new URLSearchParams(window.location.search);
    const gameIdFromUrl = window.location.pathname.includes('/game-posts.html') ? params.get('gameId') : null;

    try {
        const friends = await getUserFriends(user.uid);
        const viewableBy = [user.uid, ...friends];
        await addDoc(collection(db, 'posts'), {
            userId: user.uid,
            text: text,
            imageUrl: null,
            createdAt: serverTimestamp(),
            likes: [],
            comments: [],
            viewableBy: viewableBy,
            gameId: gameIdFromUrl // Associa gameId se estiver na página de jogo
        });
        postTextInput.value = '';
        if (createPostModal) createPostModal.style.display = 'none';

        // Recarrega os posts da página correta
        if (gameIdFromUrl && typeof baseLoadPosts === 'function') { // Verifica se baseLoadPosts existe no contexto de game-posts.js
            const feedContainer = document.getElementById('posts-feed');
            const gameFeedConstraints = [where('gameId', '==', gameIdFromUrl)];
            if(feedContainer) await baseLoadPosts(feedContainer, gameFeedConstraints, false);
        } else if (typeof loadPosts === 'function') { // Verifica se loadPosts existe no contexto de home.js/post.js
            const feedContainer = document.getElementById('posts-feed');
             const homeFeedConstraints = [where('viewableBy', 'array-contains', user.uid), where('gameId', '==', null)];
            if(feedContainer) await loadPosts(feedContainer, homeFeedConstraints, false); // Chama a função deste ficheiro
        }

    } catch (error) {
        console.error("Erro ao criar post:", error);
        showToast("Ocorreu um erro ao publicar seu post.", "error");
    } finally {
        postButton.disabled = false;
        postButton.textContent = 'Postar';
    }
}


// --- Variáveis Globais para Paginação ---
let lastVisiblePost = null; // Guarda a referência do último post carregado
let isLoadingPosts = false; // Evita carregamentos múltiplos simultâneos
const POSTS_PER_PAGE = 10; // Número de posts a carregar por vez

// --- Função Centralizada loadPosts com Paginação ---
async function loadPosts(containerElement, queryConstraints = [], loadMore = false) {
    if (!containerElement || isLoadingPosts) return;

    isLoadingPosts = true;
    const user = auth.currentUser;

    if (!loadMore) {
        containerElement.innerHTML = '<p>Carregando posts...</p>';
        lastVisiblePost = null;
        userProfilesCache = {};
    } else {
        const loadingIndicator = document.createElement('p');
        loadingIndicator.textContent = 'Carregando mais posts...';
        loadingIndicator.id = 'loading-more-posts';
        loadingIndicator.style.textAlign = 'center'; // Estilo básico
        containerElement.appendChild(loadingIndicator);
    }

    if (!user) {
        containerElement.innerHTML = '<p>Faça login para ver o feed.</p>';
        isLoadingPosts = false;
        return;
    }

    try {
        const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
        const blockedByList = currentUserDoc.data()?.blockedBy || [];
        const blockedUsersList = currentUserDoc.data()?.blockedUsers || [];
        const combinedBlockList = new Set([...blockedByList, ...blockedUsersList]);

        let q = query(
            collection(db, 'posts'),
            ...queryConstraints,
            orderBy('createdAt', 'desc'),
            limit(POSTS_PER_PAGE)
        );

        if (loadMore && lastVisiblePost) {
            q = query(q, startAfter(lastVisiblePost));
        }

        const querySnapshot = await getDocs(q);

        const loadingMoreIndicator = containerElement.querySelector('#loading-more-posts');
        if (loadingMoreIndicator) loadingMoreIndicator.remove();

        if (!loadMore) {
             // Limpa "Carregando..." APENAS se houver resultados ou se for o fim da lista
             if(!querySnapshot.empty || querySnapshot.docs.length < POSTS_PER_PAGE){
                 containerElement.innerHTML = '';
             }
        }

        if (!querySnapshot.empty) {
            lastVisiblePost = querySnapshot.docs[querySnapshot.docs.length - 1];
        } else {
            lastVisiblePost = null; // Chegou ao fim
        }


        const filteredDocs = querySnapshot.docs.filter(doc => !combinedBlockList.has(doc.data().userId));

        // Condição para "Não há posts" (Carregamento inicial SEM resultados E fim da lista)
        if (!loadMore && containerElement.innerHTML === '' && filteredDocs.length === 0 && querySnapshot.docs.length < POSTS_PER_PAGE) {
            containerElement.innerHTML = '<p style="text-align: center; color: var(--cor-texto-secundario);">Ainda não há posts aqui.</p>';
            isLoadingPosts = false;
            return;
        }
        // Condição para "Não há mais posts" (LoadMore SEM resultados)
        else if (loadMore && querySnapshot.empty) {
            const noMorePosts = document.createElement('p');
            noMorePosts.textContent = 'Não há mais posts para mostrar.';
            noMorePosts.style.textAlign = 'center';
            noMorePosts.style.color = 'var(--cor-texto-secundario)';
            containerElement.appendChild(noMorePosts);
            isLoadingPosts = false;
            return;
        }

        const postPromises = filteredDocs.map(async (postDoc) => {
            const postData = postDoc.data();
            const repostsQuery = query(collection(db, 'posts'), where('repostOf', '==', postDoc.id));
            const userRepostQuery = query(collection(db, 'posts'), where('repostOf', '==', postDoc.id), where('userId', '==', user.uid));
            const [repostSnapshot, userRepostSnapshot] = await Promise.all([
                 getCountFromServer(repostsQuery),
                 getDocs(userRepostQuery)
            ]);
            const repostCount = repostSnapshot.data().count;
            const isReposted = !userRepostSnapshot.empty;

            if (postData.repostOf) {
                const originalPostRef = doc(db, 'posts', postData.repostOf);
                const originalPostSnap = await getDoc(originalPostRef);
                if (originalPostSnap.exists()) {
                    const originalPostData = originalPostSnap.data();
                    if (combinedBlockList.has(originalPostData.userId)) return null;
                    const reposterProfile = await getUserProfile(postData.userId);
                    const originalAuthorProfile = await getUserProfile(originalPostData.userId);
                    return createPostElement(originalPostSnap.id, originalPostData, originalAuthorProfile, user.uid, repostCount, isReposted, reposterProfile);
                }
                 return null;
            } else {
                const authorProfile = await getUserProfile(postData.userId);
                return createPostElement(postDoc.id, postData, authorProfile, user.uid, repostCount, isReposted);
            }
        });

        const postElements = (await Promise.all(postPromises)).filter(Boolean);

         // Caso especial: Carregamento inicial, todos os posts encontrados foram filtrados (bloqueados)
         if (!loadMore && containerElement.innerHTML === '' && postElements.length === 0 && !querySnapshot.empty) {
              containerElement.innerHTML = '<p style="text-align: center; color: var(--cor-texto-secundario);">Não há posts visíveis no momento.</p>';
              // Se ainda houver posts não visíveis para carregar (não chegou ao fim real da lista)
              if(querySnapshot.docs.length === POSTS_PER_PAGE) {
                  // Tenta carregar a próxima página automaticamente
                  console.log("Todos os posts iniciais filtrados, tentando carregar mais...");
                  isLoadingPosts = false; // Permite o próximo carregamento
                  await loadPosts(containerElement, queryConstraints, true);
                  return; // Sai da execução atual
              } else {
                  lastVisiblePost = null; // Realmente não há mais posts (ou só bloqueados)
              }
         } else {
             postElements.forEach(el => containerElement.appendChild(el));
         }


    } catch (error) {
        console.error("Erro ao carregar posts:", error);
        const loadingMoreIndicator = containerElement.querySelector('#loading-more-posts');
        if (loadingMoreIndicator) loadingMoreIndicator.remove();
        if (!loadMore || containerElement.children.length <= 1) { // Mostra erro principal se for inicial ou se só tiver o placeholder/erro
           containerElement.innerHTML = '<p>Ocorreu um erro ao carregar o feed.</p>';
        } else {
            showToast("Erro ao carregar mais posts.", "error");
        }
       lastVisiblePost = null;
    } finally {
        isLoadingPosts = false;
    }
}


// --- Função para Configurar Scroll Infinito ---
function setupInfiniteScroll(scrollContainerSelector, contentContainer, queryConstraints = []) {
    let scrollContainer = document.querySelector(scrollContainerSelector);
    if (!scrollContainer || !contentContainer) {
        console.warn("Scroll container or content container not found for infinite scroll.");
        return;
    }

    // Remove listener antigo antes de adicionar um novo (essencial ao trocar filtros/busca)
    // Uma forma simples é clonar e substituir o elemento, mas pode quebrar outras referências.
    // Outra forma é guardar a função do listener numa variável acessível.
    // Por simplicidade aqui, vamos apenas adicionar, mas CUIDADO com listeners duplicados.
    // Idealmente, a lógica de remover/readicionar listeners seria mais robusta.

    const scrollHandler = () => {
        // Verifica se chegou perto do fim (ex: 85% da altura)
        const nearBottom = scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight * 0.85;

        if (lastVisiblePost !== null && !isLoadingPosts && nearBottom) {
            console.log("Scroll near bottom, loading more posts...");
            // Chama a função centralizada loadPosts para carregar mais
            loadPosts(contentContainer, queryConstraints, true);
        }
    };

    // Remove listener anterior se existir um (abordagem simples)
    if (scrollContainer.scrollListenerAttached) {
        scrollContainer.removeEventListener('scroll', scrollContainer.scrollListenerAttached);
    }

    // Adiciona o novo listener
    scrollContainer.addEventListener('scroll', scrollHandler);
    scrollContainer.scrollListenerAttached = scrollHandler; // Guarda referência
}


// --- FUNÇÃO processPostTextForMedia (Igual à anterior) ---
function processPostTextForMedia(text) {
    if (!text) return { isMedia: false, isOnlyMedia: false, html: '' };
    const imageUrlRegex = /(\b(https?:\/\/|www\.)[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|](\.(gif|jpe?g|png|webp))\b)/ig;
    const sanitizedText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const match = sanitizedText.trim().match(imageUrlRegex);
    if (match && match[0] === sanitizedText.trim()) {
        return { isMedia: true, isOnlyMedia: true, html: `<div class="post-media-container"><img src="${match[0]}" alt="Imagem do post" class="post-image"></div>` };
    }
    let processedHtml = sanitizedText.replace(imageUrlRegex, (url) => `<img src="${url}" alt="Imagem" class="post-gif">`);
    processedHtml = linkifyText(processedHtml);
    return { isMedia: processedHtml !== sanitizedText, isOnlyMedia: false, html: `<p>${processedHtml.replace(/\n/g, '<br>')}</p>` };
}

// --- FUNÇÃO createPostElement (Igual à anterior) ---
function createPostElement(postId, postData, authorProfile, currentUserId, repostCount = 0, isReposted = false, reposterProfile = null) {
    const postDiv = document.createElement('div');
    postDiv.className = 'post-card';
    postDiv.dataset.postId = postId;
    if (reposterProfile) postDiv.dataset.repostOf = postId;

    const timeAgo = postData.createdAt ? formatTimeAgo(postData.createdAt.toDate()) : 'agora';
    const isEdited = postData.editedAt ? ' (editado)' : '';
    const isLiked = postData.likes?.includes(currentUserId) || false;
    const likeCount = postData.likes?.length || 0;
    const commentCount = postData.comments?.length || 0;
    const textProcessingResult = processPostTextForMedia(postData.text);
    const postContentHTML = textProcessingResult.isOnlyMedia ? textProcessingResult.html : `<div class="post-text-content">${textProcessingResult.html}</div>`;
    const uploadedImageHTML = postData.imageUrl && !textProcessingResult.isOnlyMedia ? `<div class="post-media-container"><img src="${postData.imageUrl}" alt="Imagem do post" class="post-image"></div>` : '';

    postDiv.innerHTML = `
        ${reposterProfile ? `<div class="repost-info"><i class="fas fa-retweet"></i><span><a href="profile.html?uid=${reposterProfile.uid}" style="color: inherit; text-decoration: none;">${reposterProfile.nickname}</a> repostou</span></div>` : ''}
        <div style="display: flex; gap: 1rem; width: 100%;">
            <div class="post-avatar-column"><a href="profile.html?uid=${authorProfile.uid}"><img src="${authorProfile.avatarUrl}" alt="Avatar de ${authorProfile.nickname}" class="post-avatar"></a></div>
            <div class="post-main-column">
                <div class="post-header">
                    <div class="post-author-info"><a href="profile.html?uid=${authorProfile.uid}" class="post-author-name">${authorProfile.nickname}</a><span class="post-timestamp">· ${timeAgo}${isEdited}</span></div>
                    <div class="post-more-options"><button class="icon-btn" data-author-id="${authorProfile.uid}" data-author-nickname="${authorProfile.nickname}" data-post-id="${postId}"><i class="fas fa-ellipsis-h"></i></button></div>
                </div>
                <div class="post-content">${postContentHTML}${uploadedImageHTML}</div>
                <div class="post-actions">
                    <div class="action-item comment-action"><button class="action-btn comment-btn" title="Comentar"><i class="far fa-comment"></i></button><span class="action-count">${commentCount}</span></div>
                    <div class="action-item retweet-action"><button class="action-btn retweet-btn ${isReposted ? 'reposted' : ''}" title="Repostar"><i class="fas fa-retweet"></i></button><span class="action-count repost-count">${repostCount}</span></div>
                    <div class="action-item like-action"><button class="action-btn like-btn ${isLiked ? 'liked' : ''}" title="Curtir"><i class="${isLiked ? 'fas' : 'far'} fa-heart"></i></button><span class="action-count likes-count">${likeCount}</span></div>
                    <div class="action-item share-action"><button class="action-btn share-btn" title="Compartilhar"><i class="fas fa-upload"></i></button></div>
                </div>
                <div class="comments-section" style="display: none;">
                    <div class="comment-input-area"><input type="text" class="comment-input" placeholder="Escreva um comentário..."><button class="submit-comment-btn">Enviar</button></div><div class="comments-list"></div>
                </div>
            </div>
        </div>`;
    return postDiv;
}

// --- Listener Principal para Ações nos Posts (igual ao anterior) ---
// Adiciona um listener ao body para delegar eventos dos posts
// Isto garante que funcione mesmo para posts carregados dinamicamente
document.body.addEventListener('click', async (e) => {
    const user = auth.currentUser;
    if (!user) return;

    // Ações dentro de um post-card
    const postCard = e.target.closest('.post-card');
    if (postCard) {
        const postId = postCard.dataset.postId;
        const postRef = doc(db, "posts", postId);

        // Botão de opções (...)
        const optionsButton = e.target.closest('.post-more-options .icon-btn');
        if (optionsButton) {
            showOptionsMenu(optionsButton, optionsButton.dataset.authorId, optionsButton.dataset.authorNickname, optionsButton.dataset.postId, user.uid);
            return; // Impede outras ações no mesmo clique
        }

        // Ação de Repostar
        const retweetButton = e.target.closest('.retweet-btn');
        if (retweetButton) {
            retweetButton.disabled = true;
            await handleRepost(postId, user); // handleRepost precisa recarregar posts da página certa
            retweetButton.disabled = false;
            return;
        }

        // Ação de Compartilhar
        if (e.target.closest('.share-btn')) {
            handleShare(postId);
            return;
        }

        // Ação de Curtir/Descurtir
        const likeBtn = e.target.closest('.like-btn');
        if (likeBtn) {
            const likesCountSpan = postCard.querySelector('.likes-count');
            likeBtn.disabled = true;
            try {
                const postDoc = await getDoc(postRef);
                const postLikes = postDoc.data()?.likes || [];
                const isCurrentlyLiked = postLikes.includes(user.uid);
                await updateDoc(postRef, { likes: isCurrentlyLiked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
                likeBtn.classList.toggle('liked', !isCurrentlyLiked);
                likeBtn.querySelector('i').className = !isCurrentlyLiked ? 'fas fa-heart' : 'far fa-heart';
                likesCountSpan.textContent = `${isCurrentlyLiked ? postLikes.length - 1 : postLikes.length + 1}`;
            } catch(error){ console.error("Error liking post:", error)}
            finally { likeBtn.disabled = false; }
            return;
        }

        // Ação de Abrir/Fechar Comentários
        if (e.target.closest('.comment-btn')) {
            const commentsSection = postCard.querySelector('.comments-section');
            const isHidden = commentsSection.style.display === 'none';
            commentsSection.style.display = isHidden ? 'block' : 'none';
            if (isHidden) {
                const postDoc = await getDoc(postRef);
                const comments = postDoc.data()?.comments || [];
                await renderComments(postId, comments, user.uid);
                postCard.querySelector('.comment-input')?.focus();
            }
            return;
        }

        // Ação de Enviar Comentário
        const submitCommentBtn = e.target.closest('.submit-comment-btn');
        if (submitCommentBtn) {
            const input = postCard.querySelector('.comment-input');
            const commentText = input.value.trim();
            if (commentText === '' || containsForbiddenWords(commentText)) {
                if(commentText !== '') showToast("Seu comentário contém palavras não permitidas.", "error");
                return;
            }
            submitCommentBtn.disabled = true;
            const newComment = { id: `comment_${Date.now()}_${user.uid}`, userId: user.uid, text: commentText, createdAt: new Date() };
            try {
                await updateDoc(postRef, { comments: arrayUnion(newComment) });
                input.value = '';
                const postDoc = await getDoc(postRef);
                const updatedComments = postDoc.data()?.comments || [];
                postCard.querySelector('.action-item.comment-action .action-count').textContent = `${updatedComments.length}`;
                await renderComments(postId, updatedComments, user.uid);
            } catch(error){ console.error("Error adding comment:", error)}
            finally { submitCommentBtn.disabled = false; }
            return;
        }

        // Ação de Apagar Comentário
        const deleteCommentBtn = e.target.closest('.delete-comment-btn');
        if (deleteCommentBtn) {
            const commentElement = deleteCommentBtn.closest('.comment');
            const commentId = commentElement?.dataset.commentId;
            if (commentId && confirm('Tem certeza que deseja apagar este comentário?')) {
                try {
                    const postDoc = await getDoc(postRef);
                    let comments = postDoc.data()?.comments || [];
                    const updatedComments = comments.filter(c => c.id !== commentId);
                    if (comments.length !== updatedComments.length) {
                         await updateDoc(postRef, { comments: updatedComments });
                         postCard.querySelector('.action-item.comment-action .action-count').textContent = `${updatedComments.length}`;
                         await renderComments(postId, updatedComments, user.uid);
                         showToast("Comentário apagado.", "info");
                    } else { showToast("Não foi possível apagar (ID não encontrado).", "error"); }
                } catch (error) { console.error("Error deleting comment:", error); showToast("Erro ao apagar comentário.", "error"); }
            }
            return;
        }

        // Ação de Editar Comentário
        const editCommentBtn = e.target.closest('.edit-comment-btn');
        if (editCommentBtn) {
            handleEditComment(postId, editCommentBtn.closest('.comment'));
            return;
        }
    }

    // Ações do Menu de Opções (fora do post-card mas ainda no body)
    const optionButton = e.target.closest('.post-options-dropdown button');
    if (optionButton) {
        handleOptionMenuClick(optionButton, user.uid); // Chama a função refatorada
        return;
    }
});


// --- Funções Auxiliares (mantidas iguais ou com pequenas adaptações) ---
// handleRepost precisa saber qual feed recarregar
async function handleRepost(originalPostId, user) {
    if (!user) return;
    const postsRef = collection(db, 'posts');
    const repostQuery = query(postsRef, where('repostOf', '==', originalPostId), where('userId', '==', user.uid));
    try {
        const querySnapshot = await getDocs(repostQuery);
        if (!querySnapshot.empty) {
            if (confirm("Você quer remover seu repost?")) {
                const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
                await Promise.all(deletePromises);
                showToast("Repost removido.", "info");
            }
        } else {
            if (confirm("Você quer repostar isso?")) {
                const friends = await getUserFriends(user.uid);
                const viewableBy = [user.uid, ...friends];
                const originalPostSnap = await getDoc(doc(db, 'posts', originalPostId));
                const originalGameId = originalPostSnap.exists() ? originalPostSnap.data().gameId : null;
                await addDoc(postsRef, { userId: user.uid, repostOf: originalPostId, createdAt: serverTimestamp(), viewableBy: viewableBy, text: null, imageUrl: null, likes: [], comments: [], gameId: originalGameId });
                showToast("Repostado com sucesso!", "success");
            }
        }

        // --- Recarrega o feed correto ---
        const params = new URLSearchParams(window.location.search);
        const gameIdFromUrl = window.location.pathname.includes('/game-posts.html') ? params.get('gameId') : null;
        const feedContainer = document.getElementById('posts-feed');

        if(feedContainer) {
            if (gameIdFromUrl) {
                const gameFeedConstraints = [where('gameId', '==', gameIdFromUrl)];
                await loadPosts(feedContainer, gameFeedConstraints, false); // Recarrega feed do jogo
            } else {
                const homeFeedConstraints = [where('viewableBy', 'array-contains', user.uid), where('gameId', '==', null)];
                await loadPosts(feedContainer, homeFeedConstraints, false); // Recarrega feed principal
            }
        }
        // --- Fim do recarregamento ---

    } catch (error) {
        console.error("Erro ao processar o repost:", error);
        showToast("Ocorreu um erro ao processar sua solicitação.", "error");
    }
}

function handleShare(postId) { /* ... (igual) ... */
    const postUrl = `${window.location.origin}/post.html?id=${postId}`;
    if (navigator.share) {
        navigator.share({ title: 'Veja este post no Level Up!', text: 'Encontrei este post e achei que você gostaria de ver.', url: postUrl })
        .catch((error) => console.log('Erro ao compartilhar', error));
    } else {
        navigator.clipboard.writeText(postUrl).then(() => { showToast("Link do post copiado!", "info"); });
    }
}
async function renderComments(postId, comments, currentUserId) { /* ... (igual) ... */
    const postElement = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    if (!postElement) return;
    const commentsList = postElement.querySelector('.comments-list');
    if (!commentsList) return;
    commentsList.innerHTML = '';

    const currentUserDoc = await getDoc(doc(db, 'users', currentUserId));
    const blockedByList = currentUserDoc.data()?.blockedBy || [];
    const blockedUsersList = currentUserDoc.data()?.blockedUsers || [];
    const combinedBlockList = new Set([...blockedByList, ...blockedUsersList]);
    const filteredComments = comments.filter(comment => !combinedBlockList.has(comment.userId));

    if (filteredComments.length === 0) {
        commentsList.innerHTML = '<p style="color: var(--cor-texto-secundario); font-size: 0.8rem; text-align: center;">Nenhum comentário ainda.</p>';
        return;
    }

    filteredComments.sort((a, b) => (a.createdAt?.toDate?.() || 0) - (b.createdAt?.toDate?.() || 0));

    const profilePromises = filteredComments.map(comment => getUserProfile(comment.userId));
    const profiles = await Promise.all(profilePromises);

    filteredComments.forEach((comment, index) => {
        const authorProfile = profiles[index];
        const commentDiv = document.createElement('div');
        commentDiv.className = 'comment';
        commentDiv.dataset.commentId = comment.id || '';
        let commentActions = '';
        if (comment.userId === currentUserId) {
            commentActions = `<div class="comment-actions"><button class="edit-comment-btn" title="Editar"><i class="fas fa-edit"></i></button><button class="delete-comment-btn" title="Apagar"><i class="fas fa-trash"></i></button></div>`;
        }
        const safeCommentText = comment.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        commentDiv.innerHTML = `<a href="profile.html?uid=${comment.userId}" style="flex-shrink: 0;"><img src="${authorProfile.avatarUrl}" alt="Avatar" class="comment-avatar"></a><div class="comment-body">${commentActions}<a href="profile.html?uid=${comment.userId}" class="comment-author" style="text-decoration: none;">${authorProfile.nickname}</a><p class="comment-text">${safeCommentText}</p></div>`;
        commentsList.appendChild(commentDiv);
    });
}
function showOptionsMenu(button, authorId, authorNickname, postId, currentUserId) { /* ... (igual) ... */
    document.querySelectorAll('.post-options-dropdown').forEach(menu => menu.remove());
    const dropdown = document.createElement('div');
    dropdown.className = 'post-options-dropdown';
    if (authorId === currentUserId) {
        dropdown.innerHTML = `<button data-action="edit" data-post-id="${postId}"><i class="fas fa-edit"></i> Editar Post</button><button data-action="delete" data-post-id="${postId}" class="danger"><i class="fas fa-trash"></i> Apagar Post</button>`;
    } else {
        dropdown.innerHTML = `<button data-action="unfollow" data-author-id="${authorId}" data-author-nickname="${authorNickname}"><i class="fas fa-user-minus"></i> Deixar de seguir @${authorNickname}</button><button data-action="block" data-author-id="${authorId}" data-author-nickname="${authorNickname}" class="danger"><i class="fas fa-ban"></i> Bloquear @${authorNickname}</button><button data-action="report" data-post-id="${postId}" class="danger"><i class="far fa-flag"></i> Denunciar post</button>`;
    }
    button.parentElement.appendChild(dropdown);
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(event) {
            if (!dropdown.contains(event.target) && !button.contains(event.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}
function handleEditPost(postId) { /* ... (igual) ... */
     const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    if (!postCard) return;
    const postTextContent = postCard.querySelector('.post-text-content');
    const originalPTag = postTextContent?.querySelector('p'); // Adiciona verificação

    if (postTextContent?.querySelector('.edit-post-textarea') || !originalPTag) return;

    // Converte <br> de volta para \n e também `&lt;` `&gt;` para `<` `>` se linkifyText foi usado
    let originalText = originalPTag.innerHTML.replace(/<br\s*[\/]?>/gi, "\n");
    // Basicamente desfaz a sanitização para edição
    originalText = originalText.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
     // Remove links <a> criados por linkifyText antes de editar
     const tempDiv = document.createElement('div');
     tempDiv.innerHTML = originalText;
     tempDiv.querySelectorAll('a').forEach(a => a.replaceWith(a.href)); // Substitui link pelo URL
     originalText = tempDiv.textContent || tempDiv.innerText || "";


    const originalHTML = postTextContent.innerHTML;

    postTextContent.innerHTML = `<textarea class="edit-post-textarea">${originalText}</textarea><div class="edit-post-actions"><button class="save-edit-btn">Salvar</button><button class="cancel-edit-btn">Cancelar</button></div>`;
    const textarea = postTextContent.querySelector('.edit-post-textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    postTextContent.querySelector('.save-edit-btn').addEventListener('click', async () => {
        const newText = textarea.value;
        if (containsForbiddenWords(newText)) { showToast("Publicação contém palavras não permitidas.", "error"); return; }
        if (newText.trim() === '') { showToast("A publicação não pode ficar vazia.", "error"); return; }
        if (newText.length > 2000) { showToast("A publicação excede 2000 caracteres.", "error"); return; }
        const lines = newText.split('\n');
        for (const line of lines) { if (line.length > 120) { showToast("Cada linha não pode ter mais de 120 caracteres.", "error"); return; } }

        const saveButton = postTextContent.querySelector('.save-edit-btn');
        saveButton.disabled = true; saveButton.textContent = 'Salvando...';
        try {
            const postRef = doc(db, 'posts', postId);
            await updateDoc(postRef, { text: newText, editedAt: serverTimestamp() });
            const processedResult = processPostTextForMedia(newText); // Re-processa
            postTextContent.innerHTML = `<div class="post-text-content">${processedResult.html}</div>`; // Garante a div externa
            const timestampSpan = postCard.querySelector('.post-timestamp');
            if (timestampSpan && !timestampSpan.textContent.includes('(editado)')) timestampSpan.textContent += ' (editado)';
            showToast("Post atualizado!", "success");
        } catch (error) { console.error("Erro ao salvar edição:", error); showToast("Erro ao salvar.", "error"); postTextContent.innerHTML = originalHTML; }
    });
    postTextContent.querySelector('.cancel-edit-btn').addEventListener('click', () => { postTextContent.innerHTML = originalHTML; });
}
function showBlockConfirmationModal(authorId, authorNickname) { /* ... (igual) ... */
    const existingModal = document.querySelector('.block-modal-overlay');
    if (existingModal) existingModal.remove();
    const modal = document.createElement('div');
    modal.className = 'block-modal-overlay';
    modal.innerHTML = `<div class="block-modal-content"><h3>Bloquear @${authorNickname}?</h3><p>Eles não poderão seguir ou enviar mensagens para você, e você não verá notificações, postagens ou comentários deles.</p><div class="block-modal-actions"><button class="block-btn-confirm" data-author-id="${authorId}">Bloquear</button><button class="block-btn-cancel">Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    const confirmButton = modal.querySelector('.block-btn-confirm');
    const cancelButton = modal.querySelector('.block-btn-cancel');
    const handleBlock = async () => {
        confirmButton.disabled = true; confirmButton.textContent = 'Bloqueando...';
        try {
            const success = await blockUser(authorId);
            if (success) {
                showToast(`@${authorNickname} foi bloqueado.`, "info");
                // Recarrega o feed correto
                const params = new URLSearchParams(window.location.search);
                const gameIdFromUrl = window.location.pathname.includes('/game-posts.html') ? params.get('gameId') : null;
                const feedContainer = document.getElementById('posts-feed');
                if(feedContainer) {
                    if (gameIdFromUrl) {
                        const gameFeedConstraints = [where('gameId', '==', gameIdFromUrl)];
                        await loadPosts(feedContainer, gameFeedConstraints, false);
                    } else {
                        const homeFeedConstraints = [where('viewableBy', 'array-contains', auth.currentUser.uid), where('gameId', '==', null)];
                        await loadPosts(feedContainer, homeFeedConstraints, false);
                    }
                }
            } else { showToast("Erro ao bloquear.", "error"); }
        } catch (error) { console.error("Falha ao bloquear:", error); showToast("Erro ao bloquear.", "error"); }
        finally { modal.remove(); }
    };
    const handleCancel = () => modal.remove();
    confirmButton.addEventListener('click', handleBlock);
    cancelButton.addEventListener('click', handleCancel);
    modal.addEventListener('click', (e) => { if (e.target === modal) handleCancel(); });
}
async function getUserFriends(userId) { /* ... (igual) ... */
    const friends = new Set();
    const sentQ = query(collection(db, "pedidosAmizade"), where("from", "==", userId), where("status", "==", "aceito"));
    const receivedQ = query(collection(db, "pedidosAmizade"), where("to", "==", userId), where("status", "==", "aceito"));
    try {
        const [sentSnapshot, receivedSnapshot] = await Promise.all([getDocs(sentQ), getDocs(receivedQ)]);
        sentSnapshot.forEach(doc => friends.add(doc.data().to));
        receivedSnapshot.forEach(doc => friends.add(doc.data().from));
    } catch (error) { console.error("Erro ao buscar amigos:", error); }
    return Array.from(friends);
}
function formatTimeAgo(date) { /* ... (igual) ... */
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000; if (interval > 1) return Math.floor(interval) + "a";
    interval = seconds / 2592000; if (interval > 1) return Math.floor(interval) + "m";
    interval = seconds / 86400; if (interval > 1) return Math.floor(interval) + "d";
    interval = seconds / 3600; if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60; if (interval > 1) return Math.floor(interval) + "min";
    return "agora";
}
async function handleEditComment(postId, commentElement) { /* ... (igual) ... */
     const commentId = commentElement.dataset.commentId;
    if (!commentId) { showToast("Não é possível editar (falta ID).", "error"); return; }
    const commentBody = commentElement.querySelector('.comment-body');
    const originalTextElement = commentBody.querySelector('.comment-text');
    const originalAuthorElement = commentBody.querySelector('.comment-author');
    const originalActionsElement = commentBody.querySelector('.comment-actions');
    if (commentBody.querySelector('.edit-comment-textarea')) return;
    const originalText = originalTextElement.innerText;
    const originalActionsHTML = originalActionsElement ? originalActionsElement.innerHTML : '';
    const authorHTML = originalAuthorElement ? originalAuthorElement.outerHTML : '';
    commentBody.innerHTML = `<textarea class="edit-comment-textarea">${originalText}</textarea><div class="edit-comment-actions"><button class="save-edit-comment-btn">Salvar</button><button class="cancel-edit-comment-btn">Cancelar</button></div>${authorHTML} ${originalActionsHTML ? `<div class="comment-actions" style="display:none;">${originalActionsHTML}</div>` : ''} `;
    const hiddenAuthor = commentBody.querySelector('.comment-author');
    if (hiddenAuthor) hiddenAuthor.style.display = 'none';
    const textarea = commentBody.querySelector('.edit-comment-textarea');
    textarea.focus();
    commentBody.querySelector('.cancel-edit-comment-btn').addEventListener('click', async () => {
        const postRef = doc(db, 'posts', postId);
        const postDoc = await getDoc(postRef);
        const comments = postDoc.data()?.comments || [];
        await renderComments(postId, comments, auth.currentUser.uid);
    });
    commentBody.querySelector('.save-edit-comment-btn').addEventListener('click', async () => {
        const newText = textarea.value.trim();
        if (containsForbiddenWords(newText)) { showToast("Comentário contém palavras não permitidas.", "error"); return; }
        if (newText) {
            const saveButton = commentBody.querySelector('.save-edit-comment-btn');
            saveButton.disabled = true; saveButton.textContent = 'Salvando...';
            try {
                const postRef = doc(db, 'posts', postId);
                const postDoc = await getDoc(postRef);
                let comments = postDoc.data()?.comments || [];
                const commentIndex = comments.findIndex(c => c.id === commentId);
                if (commentIndex > -1) {
                    comments[commentIndex].text = newText;
                    await updateDoc(postRef, { comments: comments });
                    await renderComments(postId, comments, auth.currentUser.uid);
                    showToast("Comentário atualizado.", "success");
                } else { showToast("Erro: Comentário não encontrado.", "error"); await renderComments(postId, comments, auth.currentUser.uid); }
            } catch (error) { console.error("Erro ao salvar edição:", error); showToast("Erro ao salvar.", "error"); const postRef = doc(db, 'posts', postId); const postDoc = await getDoc(postRef); const comments = postDoc.data()?.comments || []; await renderComments(postId, comments, auth.currentUser.uid); }
        } else { showToast("O comentário não pode ficar vazio.", "warning"); }
    });
}

// --- NOVA Função Refatorada para Lidar com Ações do Menu de Opções ---
async function handleOptionMenuClick(optionButton, currentUserId) {
    const action = optionButton.dataset.action;
    const postId = optionButton.dataset.postId;
    const authorId = optionButton.dataset.authorId;
    const authorNickname = optionButton.dataset.authorNickname;

    optionButton.closest('.post-options-dropdown')?.remove(); // Fecha o menu

    switch (action) {
        case 'edit':
            handleEditPost(postId);
            break;
        case 'delete':
            if (confirm("Tem certeza que quer apagar este post e todos os seus reposts?")) {
                try {
                     const repostsQuery = query(collection(db, 'posts'), where('repostOf', '==', postId));
                     const repostsSnapshot = await getDocs(repostsQuery);
                     const batch = writeBatch(db);
                     batch.delete(doc(db, "posts", postId));
                     repostsSnapshot.forEach(repostDoc => batch.delete(repostDoc.ref));
                     await batch.commit();
                     document.querySelector(`.post-card[data-post-id="${postId}"]`)?.remove();
                     document.querySelectorAll(`.post-card[data-repost-of="${postId}"]`)?.forEach(el => el.remove());
                    showToast("Post e reposts apagados.", "info");
                } catch (error) { console.error("Erro ao apagar post/reposts:", error); showToast("Erro ao apagar.", "error"); }
            }
            break;
        case 'unfollow':
             optionButton.disabled = true; optionButton.style.opacity = '0.5'; optionButton.textContent = 'Aguarde...';
            try {
                const status = await checkFriendshipStatus(authorId);
                if (status === 'friends') {
                    if (confirm(`Deixar de seguir @${authorNickname}?`)) {
                        const success = await removeFriend(authorId);
                        if (success) {
                            showToast(`Você deixou de seguir @${authorNickname}.`, "info");
                            // Recarrega o feed correto (igual ao handleRepost)
                            const params = new URLSearchParams(window.location.search);
                            const gameIdFromUrl = window.location.pathname.includes('/game-posts.html') ? params.get('gameId') : null;
                            const feedContainer = document.getElementById('posts-feed');
                            if(feedContainer) {
                                if (gameIdFromUrl) {
                                    const gameFeedConstraints = [where('gameId', '==', gameIdFromUrl)];
                                    await loadPosts(feedContainer, gameFeedConstraints, false);
                                } else {
                                    const homeFeedConstraints = [where('viewableBy', 'array-contains', currentUserId), where('gameId', '==', null)];
                                    await loadPosts(feedContainer, homeFeedConstraints, false);
                                }
                            }
                        } else { showToast("Erro ao deixar de seguir.", "error"); /* Reativar botão se necessário */ }
                    } else { /* Reativar botão se cancelado */ }
                } else if (status === 'none' || status === 'request_sent' || status === 'request_received') { showToast(`Você já não segue @${authorNickname}.`, "info"); }
                else if (status === 'blocked') { showToast(`Você bloqueou ou foi bloqueado por @${authorNickname}.`, "warning"); }
            } catch (error) { console.error("Erro no 'unfollow':", error); showToast("Ocorreu um erro.", "error"); /* Reativar botão */ }
            // Reativação do botão é complexa aqui porque o elemento é removido. Idealmente, a UI atualizaria sem precisar reativar.
            break;
        case 'block':
            showBlockConfirmationModal(authorId, authorNickname);
            break;
        case 'report':
            showToast("Post denunciado. A nossa equipa irá rever.", "info");
            break;
    }
}


// --- Eventos de UI para Modal de Criação e FAB (iguais) ---
if (createPostModal) {
    const openModal = () => { /* ... (igual) ... */
         createPostModal.style.display = 'flex';
         if(postTextInput) postTextInput.focus();
         if (charCounter && postTextInput) {
            const length = postTextInput.value.length;
            charCounter.textContent = `${length}/2000`;
            charCounter.classList.remove('error');
        }
    };
    // Botão "+" no header (se existir E NÃO for mobile) -> REMOVIDO DO HTML DA HOME, pode remover o if daqui se não for usar em outro lugar
    // const openPostModalBtnHeader = document.getElementById('open-post-modal');
    // if (openPostModalBtnHeader && window.innerWidth > 768) {
    //      openPostModalBtnHeader.addEventListener('click', openModal);
    // }
    // Botão FAB
    if (fabCreatePost) { fabCreatePost.addEventListener('click', openModal); }
    // Botão de fechar (X)
    if (closeModalBtn) { closeModalBtn.addEventListener('click', () => createPostModal.style.display = 'none'); }
    // Fechar clicando fora
    createPostModal.addEventListener('click', (e) => { if (e.target === createPostModal) { createPostModal.style.display = 'none'; } });
}
if (postButton) { postButton.addEventListener('click', createPost); } // Chama o createPost deste ficheiro
if (postTextInput && charCounter) { /* ... (igual) ... */
    postTextInput.addEventListener('input', () => {
        const currentLength = postTextInput.value.length;
        const maxLength = 2000;
        charCounter.textContent = `${currentLength}/${maxLength}`;
        charCounter.classList.toggle('error', currentLength > maxLength);
    });
}


// Exporta as funções necessárias
export { loadPosts, createPostElement, processPostTextForMedia, handleEditPost, setupInfiniteScroll };