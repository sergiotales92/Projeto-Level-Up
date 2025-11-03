import { auth, db } from './firebase-config.js';
import { collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { sendFriendRequest } from './friends.js';

const gameSelect = document.getElementById('game-select');
const searchByGameButton = document.getElementById('search-by-game-button');
const nicknameInput = document.getElementById('nickname-search-input');
const searchByNicknameButton = document.getElementById('search-by-nickname-button');
const searchResultsContainer = document.getElementById('search-results');

async function getFriendshipStatus(targetUserId) {
    const currentUser = auth.currentUser;
    if (!currentUser) return 'none';

    const currentUserId = currentUser.uid;
    
    const pedidosRef = collection(db, 'pedidosAmizade');

    const qFriends1 = query(pedidosRef, where('from', '==', currentUserId), where('to', '==', targetUserId), where('status', '==', 'aceito'));
    const qFriends2 = query(pedidosRef, where('from', '==', targetUserId), where('to', '==', currentUserId), where('status', '==', 'aceito'));
    
    const friendsSnapshot1 = await getDocs(qFriends1);
    const friendsSnapshot2 = await getDocs(qFriends2);

    if (!friendsSnapshot1.empty || !friendsSnapshot2.empty) {
        return 'friends';
    }

    const qSent = query(pedidosRef, 
        where('from', '==', currentUserId), 
        where('to', '==', targetUserId),
        where('status', '==', 'pendente')
    );
    const sentSnapshot = await getDocs(qSent);
    if (!sentSnapshot.empty) {
        return 'request_sent';
    }

    const qReceived = query(pedidosRef,
        where('from', '==', targetUserId),
        where('to', '==', currentUserId),
        where('status', '==', 'pendente')
    );
    const receivedSnapshot = await getDocs(qReceived);
    if (!receivedSnapshot.empty) {
        return 'request_received';
    }

    return 'none';
}

function createPlayerCard(userData, userId, friendshipStatus) {
    const playerCard = document.createElement('div');
    playerCard.className = 'player-card';

    const photoURL = userData.photoURL || 'imagens/avatar_padrao.png';

    // Cria um link que envolve a imagem e o nome
    playerCard.innerHTML = `
        <a href="profile.html?uid=${userId}" class="player-card-link">
            <img src="${photoURL}" alt="Avatar de ${userData.nickname}" class="player-avatar">
            <span class="player-nickname">${userData.nickname || 'Jogador'}</span>
        </a>
    `;

    const actionButton = document.createElement('button');
    actionButton.className = 'upload-image-label';

    switch (friendshipStatus) {
        case 'friends':
            actionButton.textContent = 'Amigos';
            actionButton.disabled = true;
            break;
        case 'request_sent':
            actionButton.textContent = 'Pedido Enviado';
            actionButton.disabled = true;
            break;
        case 'request_received':
            actionButton.textContent = 'Pedido Recebido';
            actionButton.disabled = true;
            break;
        default:
            actionButton.textContent = 'Adicionar Amigo';
            actionButton.dataset.userId = userId;
            actionButton.addEventListener('click', (e) => {
                e.target.disabled = true;
                e.target.textContent = 'Enviando...';
                sendFriendRequest(userId).then(() => {
                    e.target.textContent = 'Pedido Enviado';
                }).catch(() => {
                    e.target.textContent = 'Adicionar Amigo';
                    e.target.disabled = false;
                });
            });
            break;
    }
    
    playerCard.appendChild(actionButton);
    return playerCard;
}

async function displayResults(querySnapshot) {
    searchResultsContainer.innerHTML = '';
    const currentUser = auth.currentUser;

    if (querySnapshot.empty) {
        searchResultsContainer.innerHTML = '<p style="grid-column: 1 / -1;">Nenhum jogador encontrado.</p>';
        return;
    }

    const otherUsersDocs = querySnapshot.docs.filter(doc => doc.id !== currentUser.uid);

    if (otherUsersDocs.length === 0) {
        searchResultsContainer.innerHTML = '<p style="grid-column: 1 / -1;">Nenhum outro jogador encontrado.</p>';
        return;
    }
    
    for (const doc of otherUsersDocs) {
        const friendshipStatus = await getFriendshipStatus(doc.id);
        const playerCard = createPlayerCard(doc.data(), doc.id, friendshipStatus);
        searchResultsContainer.appendChild(playerCard);
    }
}

async function loadGames() {
    try {
        const gamesSnapshot = await getDocs(collection(db, 'games'));
        gameSelect.innerHTML = '<option value="">-- Selecione um jogo --</option>';
        gamesSnapshot.forEach(doc => {
            const game = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = game.nome;
            gameSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Erro ao carregar os jogos:", error);
        gameSelect.innerHTML = '<option value="">-- Erro ao carregar jogos --</option>';
    }
}

async function searchPlayersByGame() {
    const selectedGameId = gameSelect.value;
    searchResultsContainer.innerHTML = '<p style="grid-column: 1 / -1;">Buscando...</p>';

    if (!auth.currentUser) {
        searchResultsContainer.innerHTML = '<p style="grid-column: 1 / -1;">Você precisa estar logado para buscar.</p>';
        return;
    }

    if (!selectedGameId) {
        searchResultsContainer.innerHTML = '<p style="grid-column: 1 / -1;">Por favor, selecione um jogo.</p>';
        return;
    }

    try {
        const usersCollection = collection(db, 'users');
        const searchQuery = query(usersCollection, where('jogosFavoritos', 'array-contains', selectedGameId));
        const querySnapshot = await getDocs(searchQuery);
        await displayResults(querySnapshot);
    } catch (error) {
        console.error("Erro ao buscar jogadores por jogo:", error);
        searchResultsContainer.innerHTML = '<p style="grid-column: 1 / -1;">Ocorreu um erro na busca. Tente novamente.</p>';
    }
}

async function searchPlayersByNickname() {
    const nickname = nicknameInput.value.trim();
    searchResultsContainer.innerHTML = '<p style="grid-column: 1 / -1;">Buscando...</p>';

    if (!auth.currentUser) {
        searchResultsContainer.innerHTML = '<p style="grid-column: 1 / -1;">Você precisa estar logado para buscar.</p>';
        return;
    }

    if (!nickname) {
        searchResultsContainer.innerHTML = '<p style="grid-column: 1 / -1;">Por favor, digite um nickname.</p>';
        return;
    }

    try {
        const usersCollection = collection(db, 'users');
        const searchQuery = query(usersCollection, where('nickname', '==', nickname));
        const querySnapshot = await getDocs(searchQuery);
        await displayResults(querySnapshot);
    } catch (error) {
        console.error("Erro ao buscar jogadores por nickname:", error);
        searchResultsContainer.innerHTML = '<p style="grid-column: 1 / -1;">Ocorreu um erro na busca. Tente novamente.</p>';
    }
}

searchByGameButton.addEventListener('click', searchPlayersByGame);
searchByNicknameButton.addEventListener('click', searchPlayersByNickname);

document.addEventListener('DOMContentLoaded', loadGames);