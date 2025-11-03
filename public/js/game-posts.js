// public/js/game-posts.js (Atualizado para usar post.js otimizado)

import { auth, db, storage } from './firebase-config.js';
import {
    doc, getDoc, collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, updateDoc, arrayUnion, arrayRemove, deleteDoc, getCountFromServer, writeBatch,
    limit, startAfter // Adicionado limit e startAfter
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { removeFriend, blockUser, checkFriendshipStatus } from './friends.js';
import { containsForbiddenWords } from './profanity-filter.js';
// Importa as funções necessárias de post.js, renomeando loadPosts para evitar conflito de nome se necessário
import { loadPosts as baseLoadPosts, createPostElement, processPostTextForMedia, handleEditPost, setupInfiniteScroll } from './post.js';

// --- ELEMENTOS DO DOM ---
const postsFeed = document.getElementById('posts-feed');
const feedContainerForScroll = document.querySelector('.feed'); // Elemento com scroll
const createPostModal = document.getElementById('create-post-modal');
const closeModalBtn = document.querySelector('.close-modal-btn');
const postTextInput = document.getElementById('post-text');
const postButton = document.getElementById('post-button');
const charCounter = document.getElementById('post-char-counter');
const fabCreatePost = document.getElementById('fab-create-post'); // Botão FAB

const params = new URLSearchParams(window.location.search);
const gameId = params.get('gameId');

if (!gameId) {
    window.location.href = 'comunidade.html';
}

function showToast(message, type = 'info') { /* ... (igual) ... */
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

// --- Funções Principais ---

async function loadGameDetails() {
    const headerElement = document.querySelector('.main-header');
    let pageTitleContainer = headerElement || document.getElementById('game-specific-header');
    if (!pageTitleContainer) return;

    try {
        const gameDocRef = doc(db, 'games', gameId);
        const gameDocSnap = await getDoc(gameDocRef);
        if (gameDocSnap.exists()) {
            const gameData = gameDocSnap.data();
            document.title = `${gameData.nome} - Comunidade`;
            let titleElement = pageTitleContainer.querySelector('h1, h2');
            if (!titleElement) { titleElement = document.createElement('h1'); pageTitleContainer.prepend(titleElement); }
            titleElement.textContent = gameData.nome;
            titleElement.style.fontSize = '1.2rem'; titleElement.style.margin = '0'; titleElement.style.fontFamily = 'var(--fonte-principal)';
            if (!pageTitleContainer.querySelector('.back-button')) {
                const backButton = document.createElement('a');
                backButton.href = "comunidade.html"; backButton.className = "back-button"; backButton.title = "Voltar";
                backButton.style.fontSize = "1.2rem"; backButton.style.color = "var(--cor-texto-primario)"; backButton.style.textDecoration = "none"; backButton.style.marginRight = "1rem";
                backButton.innerHTML = `<i class="fas fa-arrow-left"></i>`;
                pageTitleContainer.prepend(backButton);
            }
            // Não chama loadGamePosts aqui, será chamado no onAuthStateChanged
        } else {
             let titleElement = pageTitleContainer.querySelector('h1, h2');
             if(!titleElement) {titleElement = document.createElement('h1'); pageTitleContainer.prepend(titleElement);}
            titleElement.textContent = 'Comunidade não encontrada';
            if(postsFeed) postsFeed.innerHTML = '<p>Esta comunidade de jogo não existe.</p>';
        }
    } catch (error) {
        console.error("Erro ao buscar detalhes do jogo:", error);
         let titleElement = pageTitleContainer.querySelector('h1, h2');
         if(!titleElement) {titleElement = document.createElement('h1'); pageTitleContainer.prepend(titleElement);}
        titleElement.textContent = 'Erro ao carregar';
    }
}

// createPost permanece igual (usa a função de post.js implicitamente via botão)

// REMOVER as funções: getUserProfile, loadGamePosts, processPostTextForMedia, createPostElement
// REMOVER as funções auxiliares duplicadas: handleRepost, handleShare, renderComments, showOptionsMenu, handleEditPost, showBlockConfirmationModal, getUserFriends, formatTimeAgo, handleEditComment
// REMOVER o listener de clique GERAL do document.body (ele está em post.js agora)

// --- Eventos de UI para Modal (mantidos, mas createPost é chamado de post.js) ---
if (postButton) {
    // O listener de clique no postButton ainda chama a função createPost GLOBAL (que agora está em post.js)
    // Se houver problemas, garanta que createPost está acessível globalmente ou importe-a explicitamente aqui
    // e adicione o listener aqui. A forma mais simples é deixar como está, assumindo que post.js
    // é carregado antes e torna createPost global ou que o listener em post.js cobre isso.
}
if (postTextInput && charCounter) { /* ... (igual) ... */
    postTextInput.addEventListener('input', () => {
        const currentLength = postTextInput.value.length;
        const maxLength = 2000;
        charCounter.textContent = `${currentLength}/${maxLength}`;
        charCounter.classList.toggle('error', currentLength > maxLength);
    });
}
function openCreatePostModal() { /* ... (igual) ... */
     if (createPostModal) {
         createPostModal.style.display = 'flex';
         if(postTextInput) postTextInput.focus();
         if (charCounter && postTextInput) {
             const length = postTextInput.value.length;
             charCounter.textContent = `${length}/2000`;
             charCounter.classList.remove('error');
         }
     }
}
function closeCreatePostModal() { /* ... (igual) ... */
    if (createPostModal) {
        createPostModal.style.display = 'none';
        if(postTextInput) postTextInput.value = '';
    }
}
// const openPostModalBtnHeader = document.getElementById('open-post-modal'); // Pode não existir
// if (openPostModalBtnHeader && window.innerWidth > 768) { openPostModalBtnHeader.addEventListener('click', openCreatePostModal); }
if (fabCreatePost) { fabCreatePost.addEventListener('click', openCreatePostModal); }
if (closeModalBtn) closeModalBtn.addEventListener('click', closeCreatePostModal);
if (createPostModal) { createPostModal.addEventListener('click', (e) => { if (e.target === createPostModal) closeCreatePostModal(); }); }


// --- Autenticação e Carregamento Inicial Modificado ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await loadGameDetails(); // Carrega detalhes primeiro

        // Define as constraints para o feed do jogo atual
        const gameFeedConstraints = [
            where('gameId', '==', gameId)
        ];
        // Carrega a primeira página de posts do jogo usando a função importada
        await baseLoadPosts(postsFeed, gameFeedConstraints, false);
        // Configura o scroll infinito para o feed do jogo
        setupInfiniteScroll('.feed', postsFeed, gameFeedConstraints); // Usa '.feed' como seletor do container com scroll

    } else {
        window.location.href = `auth.html?redirect=${encodeURIComponent(window.location.href)}`;
    }
});

// REMOVER a exportação (se existia)
// export { loadGamePosts };