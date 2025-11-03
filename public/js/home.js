// public/js/home.js (Atualizado para usar post.js otimizado)

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, getDocs, doc, getDoc, limit, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// Importa as funções necessárias de post.js
import { loadPosts, createPostElement, setupInfiniteScroll } from './post.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos do DOM ---
    const searchInput = document.getElementById('home-search-input');
    const postsFeedContainer = document.getElementById('posts-feed');
    const gamesListContainer = document.getElementById('games-list-container');
    const expandedGamePostsContainer = document.getElementById('expanded-game-posts');
    const feedColumn = document.querySelector('.feed-column .feed'); // Container com scroll

    // Cache de perfis local para a busca e posts de jogos expandidos
    let userProfilesCache = {};
    async function getUserProfile(uid) { // Função local para busca/expansão
        if (userProfilesCache[uid]) return userProfilesCache[uid];
        try {
            const userDocRef = doc(db, 'users', uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                const profile = {
                    uid: uid, // Adiciona UID
                    nickname: userData.nickname || 'Usuário',
                    avatarUrl: userData.photoURL || '/imagens/avatar_padrao.png',
                    bio: userData.bio || '' // Adiciona bio se necessário para busca
                };
                userProfilesCache[uid] = profile;
                return profile;
            }
        } catch (error) { console.error("Erro ao buscar perfil (local home):", error); }
        return { uid: uid, nickname: 'Usuário Desconhecido', avatarUrl: '/imagens/avatar_padrao.png', bio: '' };
    }

    // --- Lógica da Seção de Comunidades (mantém igual) ---
    async function loadGames() {
        if (!gamesListContainer) return;
        try {
            // ... (código existente para carregar a lista de jogos) ...
             const gamesCollection = collection(db, 'games');
             const q = query(gamesCollection, orderBy('nome'));
             const snapshot = await getDocs(q);
             if (snapshot.empty) { gamesListContainer.innerHTML = '<p>Nenhuma comunidade encontrada.</p>'; return; }
             gamesListContainer.innerHTML = '';
             snapshot.forEach(doc => {
                 const game = doc.data();
                 const gameId = doc.id;
                 const gameCard = document.createElement('div');
                 gameCard.className = 'game-card';
                 gameCard.dataset.gameId = gameId;
                 gameCard.dataset.gameName = game.nome;
                 gameCard.innerHTML = `<img src="${game.urlDaImagemCapa || '/imagens/capa.jpg'}" alt="Capa de ${game.nome}" class="game-card-image"><div class="game-card-info"><h3>${game.nome}</h3></div>`;
                 gamesListContainer.appendChild(gameCard);
             });
        } catch (error) {
            console.error("Erro ao carregar as comunidades:", error);
            gamesListContainer.innerHTML = '<p>Ocorreu um erro ao carregar as comunidades.</p>';
        }
    }

    // Função para carregar posts de um jogo específico (para a coluna da direita)
    async function loadGamePostsExpanded(gameId) {
        const user = auth.currentUser;
        if (!user || !expandedGamePostsContainer) return;
        expandedGamePostsContainer.innerHTML = '<p>Carregando posts...</p>';
        // Limpa cache local ANTES de carregar posts expandidos
        userProfilesCache = {};
        try {
            const q = query(collection(db, 'posts'), where('gameId', '==', gameId), orderBy('createdAt', 'desc'), limit(5)); // Limita a 5 posts
            const querySnapshot = await getDocs(q);
            expandedGamePostsContainer.innerHTML = ''; // Limpa antes de adicionar
            if (querySnapshot.empty) {
                expandedGamePostsContainer.innerHTML += '<p>Ainda não há posts nesta comunidade.</p>'; // Append
                return;
            }
             // Busca bloqueios para filtrar posts expandidos também
            const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
            const blockedByList = currentUserDoc.data()?.blockedBy || [];
            const blockedUsersList = currentUserDoc.data()?.blockedUsers || [];
            const combinedBlockList = new Set([...blockedByList, ...blockedUsersList]);

            const postPromises = querySnapshot.docs
                .filter(doc => !combinedBlockList.has(doc.data().userId)) // Filtra bloqueados
                .map(async (postDoc) => {
                    const postData = postDoc.data();
                    // Para os posts expandidos, não precisamos da lógica complexa de reposts aqui, simplificamos
                    // Basta buscar o perfil do autor
                    const authorProfile = await getUserProfile(postData.userId); // Usa a função getUserProfile LOCAL
                    // Chama createPostElement importado de post.js
                    return createPostElement(postDoc.id, postData, authorProfile, user.uid); // Passa os args necessários
            });

            const postElements = (await Promise.all(postPromises)).filter(Boolean); // Filtra nulos (posts bloqueados)

            if(postElements.length === 0 && !querySnapshot.empty){
                 expandedGamePostsContainer.innerHTML += '<p>Não há posts visíveis nesta comunidade.</p>';
            } else {
                 postElements.forEach(el => expandedGamePostsContainer.appendChild(el));
            }


        } catch (error) {
            console.error("Erro ao carregar posts do jogo (expandido):", error);
            expandedGamePostsContainer.innerHTML += '<p>Ocorreu um erro ao carregar os posts.</p>'; // Append
        }
    }

    // --- Listener para expandir/recolher posts de jogos ---
     if (gamesListContainer && expandedGamePostsContainer) {
        gamesListContainer.addEventListener('click', (e) => {
            const gameCard = e.target.closest('.game-card');
            if (gameCard) {
                const gameId = gameCard.dataset.gameId;
                const gameName = gameCard.dataset.gameName;

                // Se já estiver ativo, recolhe
                if (gameCard.classList.contains('active-game')) {
                    gameCard.classList.remove('active-game');
                    document.querySelectorAll('.game-card').forEach(card => card.style.display = 'flex'); // Mostra todos
                    expandedGamePostsContainer.style.display = 'none';
                    expandedGamePostsContainer.innerHTML = ''; // Limpa
                }
                // Se não estiver ativo, expande
                else {
                    // Recolhe qualquer outro ativo
                    document.querySelectorAll('.game-card.active-game').forEach(activeCard => {
                        activeCard.classList.remove('active-game');
                    });
                    gameCard.classList.add('active-game'); // Marca como ativo

                    // Esconde os outros cards
                    document.querySelectorAll('.game-card').forEach(card => {
                        if (card !== gameCard) card.style.display = 'none';
                    });

                    // Mostra e prepara o container de posts expandidos
                    expandedGamePostsContainer.style.display = 'block';
                    expandedGamePostsContainer.innerHTML = ''; // Limpa antes de adicionar header

                    // Adiciona header com nome do jogo e botão fechar
                    const header = document.createElement('div');
                    header.style.display = 'flex';
                    header.style.justifyContent = 'space-between';
                    header.style.alignItems = 'center';
                    header.style.marginBottom = '1rem';
                    header.innerHTML = `
                        <h3>Posts em ${gameName}</h3>
                        <a href="game-posts.html?gameId=${gameId}" class="back-link-styled" style="font-size: 0.7rem; padding: 0.4rem 0.8rem;">Ver Todos</a>
                        <button id="close-expanded-posts" style="background:none; border:none; color: var(--cor-secundaria); cursor:pointer; font-size: 1.2rem;">&times;</button>
                    `;
                    expandedGamePostsContainer.appendChild(header); // Usa appendChild

                    // Adiciona listener ao botão fechar
                    header.querySelector('#close-expanded-posts').addEventListener('click', () => {
                        gameCard.classList.remove('active-game');
                        document.querySelectorAll('.game-card').forEach(card => card.style.display = 'flex');
                        expandedGamePostsContainer.style.display = 'none';
                        expandedGamePostsContainer.innerHTML = '';
                    });

                    // Carrega os posts do jogo selecionado
                    loadGamePostsExpanded(gameId);
                }
            }
        });
    }


    // --- Lógica de Notificação de Chat (mantém igual) ---
    let messageListeners = [];
    function showChatNotificationDot() { /* ... (igual) ... */
        const chatLink = document.getElementById('chat-link'); // ID correto para sidebar desktop
        const mobileChatLink = document.getElementById('mobile-chat-link'); // ID correto para nav mobile
        if (chatLink) { const dot = chatLink.querySelector('.notification-dot'); if (dot) dot.style.display = 'block'; }
        if (mobileChatLink) { const dot = mobileChatLink.querySelector('.notification-dot'); if (dot) dot.style.display = 'block'; }
    }
    async function listenForNewMessages(currentUser) { /* ... (igual) ... */
         messageListeners.forEach(unsubscribe => unsubscribe());
        messageListeners = [];
        const lastVisitISO = localStorage.getItem('lastChatVisit');
        const lastVisitDate = lastVisitISO ? new Date(lastVisitISO) : null;
        const friends = new Set();
        const sentQ = query(collection(db, "pedidosAmizade"), where("from", "==", currentUser.uid), where("status", "==", "aceito"));
        const receivedQ = query(collection(db, "pedidosAmizade"), where("to", "==", currentUser.uid), where("status", "==", "aceito"));
        try {
            const [sentSnapshot, receivedSnapshot] = await Promise.all([getDocs(sentQ), getDocs(receivedQ)]);
            sentSnapshot.forEach(doc => friends.add(doc.data().to));
            receivedSnapshot.forEach(doc => friends.add(doc.data().from));
            friends.forEach(friendId => {
                const conversationId = [currentUser.uid, friendId].sort().join('_');
                const messagesRef = collection(db, 'conversations', conversationId, 'messages');
                const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(1));
                const unsubscribe = onSnapshot(q, (snapshot) => {
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === "added") {
                            const message = change.doc.data();
                            const messageTime = message.timestamp?.toDate();
                            if (message.senderId !== currentUser.uid && messageTime) {
                                if (!lastVisitDate || messageTime > lastVisitDate) {
                                    sessionStorage.setItem('newChatMessage', 'true');
                                    showChatNotificationDot();
                                }
                            }
                        }
                    });
                }, (error) => {});
                messageListeners.push(unsubscribe);
            });
        } catch (error) { console.error("Erro ao configurar ouvintes de mensagem: ", error); }
    }

    // --- Listener de Autenticação Modificado ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Define as constraints para o feed principal
            const homeFeedConstraints = [
                where('viewableBy', 'array-contains', user.uid),
                where('gameId', '==', null) // Apenas posts gerais na home
            ];
            // Carrega a primeira página do feed principal usando a função de post.js
            await loadPosts(postsFeedContainer, homeFeedConstraints, false);
            // Configura o scroll infinito para o feed principal
            setupInfiniteScroll('.feed-column .feed', postsFeedContainer, homeFeedConstraints);

            // Lógica restante
            if (sessionStorage.getItem('newChatMessage') === 'true') {
                showChatNotificationDot();
            }
            if (gamesListContainer) loadGames();
            listenForNewMessages(user);
        } else {
            // Limpa tudo se deslogar
             if (postsFeedContainer) postsFeedContainer.innerHTML = '<p>Faça login para ver o feed.</p>';
             if (gamesListContainer) gamesListContainer.innerHTML = '<p>Faça login para ver as comunidades.</p>';
             if (expandedGamePostsContainer) { expandedGamePostsContainer.style.display = 'none'; expandedGamePostsContainer.innerHTML = ''; }
             messageListeners.forEach(unsubscribe => unsubscribe());
             messageListeners = [];
             // Remove listener de scroll se existir (pode precisar de abordagem mais robusta)
             if(feedColumn && feedColumn.scrollListenerAttached) {
                 feedColumn.removeEventListener('scroll', feedColumn.scrollListenerAttached);
                 feedColumn.scrollListenerAttached = null;
             }
        }
    });

    // --- Lógica de Busca Modificada ---
    let searchTimeout;
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const searchTerm = searchInput.value.trim();
            const resultsContainer = postsFeedContainer; // Resultados no mesmo container

             // Remove o listener de scroll infinito ANTES de buscar ou limpar
             if(feedColumn && feedColumn.scrollListenerAttached) {
                 feedColumn.removeEventListener('scroll', feedColumn.scrollListenerAttached);
                 feedColumn.scrollListenerAttached = null;
                 console.log("Infinite scroll listener removed for search.");
             }


            if (searchTerm === '') {
                // Define constraints e recarrega a primeira página do feed principal
                const homeFeedConstraints = [
                    where('viewableBy', 'array-contains', auth.currentUser.uid),
                    where('gameId', '==', null)
                ];
                loadPosts(resultsContainer, homeFeedConstraints, false).then(() => {
                    // Reconfigura o scroll infinito DEPOIS que a primeira página carregar
                    setupInfiniteScroll('.feed-column .feed', resultsContainer, homeFeedConstraints);
                     console.log("Infinite scroll listener re-attached after clearing search.");
                });
            } else {
                searchTimeout = setTimeout(() => {
                    executeSearch(searchTerm, resultsContainer);
                }, 500);
            }
        });
    }

    async function executeSearch(searchTerm, resultsContainer) {
        if (!auth.currentUser) return;
        resultsContainer.innerHTML = '<p>Buscando...</p>';
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        // Limpa cache local antes da busca
        userProfilesCache = {};
        try {
            // Busca usuários (máx 5)
            const userQuery = query(collection(db, 'users'), where('nickname', '>=', searchTerm), where('nickname', '<=', searchTerm + '\uf8ff'), limit(5));
            const userSnapshot = await getDocs(userQuery);
            const userResults = [];
            userSnapshot.forEach(doc => { if (doc.id !== auth.currentUser.uid) userResults.push({ id: doc.id, ...doc.data() }); });

            // Busca posts (sem limite inicial, mas filtra no cliente - pode otimizar depois se necessário)
            // IMPORTANTE: Esta busca lê TODOS os posts visíveis e filtra no cliente.
            // Para otimizar MUITO, seria necessário indexar o texto dos posts (ex: com Algolia ou similar)
            // ou usar queries mais complexas que o Firestore pode ter dificuldade em suportar nativamente para 'contains'.
            const postsQuery = query(collection(db, 'posts'), where('viewableBy', 'array-contains', auth.currentUser.uid));
            const postSnapshot = await getDocs(postsQuery);
            const postElements = [];

            // Busca bloqueios para filtrar resultados da busca
            const currentUserDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
            const blockedByList = currentUserDoc.data()?.blockedBy || [];
            const blockedUsersList = currentUserDoc.data()?.blockedUsers || [];
            const combinedBlockList = new Set([...blockedByList, ...blockedUsersList]);


            for (const postDoc of postSnapshot.docs) {
                const postData = postDoc.data();
                 // Filtra por bloqueio E pelo termo de busca
                if (!combinedBlockList.has(postData.userId) && postData.text && postData.text.toLowerCase().includes(lowerCaseSearchTerm)) {
                     // Lógica simplificada para buscar reposts/likes aqui se necessário, ou usar 0/false
                    const authorProfile = await getUserProfile(postData.userId); // Usa getUserProfile local
                    const postElement = createPostElement(postDoc.id, postData, authorProfile, auth.currentUser.uid, postData.likes?.length || 0, postData.likes?.includes(auth.currentUser.uid) || false); // Adapte se precisar de contagem de reposts na busca
                    postElements.push(postElement);
                }
            }

            // Filtra usuários bloqueados dos resultados
             const filteredUserResults = userResults.filter(user => !combinedBlockList.has(user.id));


            renderSearchResults(filteredUserResults, postElements, searchTerm, resultsContainer);

        } catch (error) {
            console.error("Erro ao executar a busca:", error);
            resultsContainer.innerHTML = '<p>Ocorreu um erro ao buscar.</p>';
        }
    }

    function renderSearchResults(users, posts, searchTerm, resultsContainer) {
        resultsContainer.innerHTML = '';
        if (users.length === 0 && posts.length === 0) {
            resultsContainer.innerHTML = `<p>Nenhum resultado encontrado para "${searchTerm}".</p>`;
            return;
        }
        if (users.length > 0) {
            const usersSection = document.createElement('div');
            usersSection.className = 'search-results-section';
            usersSection.innerHTML = '<h3>Usuários</h3>';
            users.forEach(user => usersSection.appendChild(createUserResultCard(user)));
            resultsContainer.appendChild(usersSection);
        }
        if (posts.length > 0) {
            const postsSection = document.createElement('div');
            postsSection.className = 'search-results-section';
            postsSection.innerHTML = '<h3>Publicações</h3>';
            // Limita o número de posts exibidos diretamente nos resultados da busca
            posts.slice(0, 10).forEach(postElement => postsSection.appendChild(postElement));
             if(posts.length > 10) {
                 postsSection.innerHTML += `<p style="text-align:center; color: var(--cor-texto-secundario); font-size: 0.8rem;">Mais posts podem existir...</p>`;
             }
            resultsContainer.appendChild(postsSection);
        }
    }

    function createUserResultCard(userData) { /* ... (igual) ... */
        const card = document.createElement('a');
        card.href = `profile.html?uid=${userData.id}`; // Usa userData.id (passado da busca)
        card.className = 'user-result-card';
        card.innerHTML = `<img src="${userData.photoURL || '/imagens/avatar_padrao.png'}" alt="Avatar de ${userData.nickname}"><div class="user-result-info"><span class="nickname">${userData.nickname}</span><span class="bio">${userData.bio || 'Sem bio.'}</span></div>`;
        return card;
    }

}); // Fim do DOMContentLoaded