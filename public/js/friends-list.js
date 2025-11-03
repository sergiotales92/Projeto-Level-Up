import { db, auth } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 500);
    }, 5000);
}

const friendsContainer = document.getElementById('friends-list-container');

/**
 * Busca o perfil de um usuário (nickname, bio, etc.) pelo seu UID.
 * @param {string} uid - O ID do usuário.
 * @returns {Promise<object|null>} O objeto com os dados do usuário ou null.
 */
async function getUserProfile(uid) {
    try {
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);
        return userDocSnap.exists() ? userDocSnap.data() : null;
    } catch (error) {
        console.error("Erro ao buscar perfil de usuário:", error);
        return null;
    }
}

/**
 * Remove o documento de amizade entre dois usuários.
 * @param {string} friendUid - O UID do amigo a ser removido.
 */
async function removeFriendship(friendUid) {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    if (!confirm("Tem certeza que deseja remover esta amizade?")) {
        return;
    }

    try {
        const q1 = query(collection(db, "pedidosAmizade"), where("from", "==", currentUser.uid), where("to", "==", friendUid), where("status", "==", "aceito"));
        const q2 = query(collection(db, "pedidosAmizade"), where("from", "==", friendUid), where("to", "==", currentUser.uid), where("status", "==", "aceito"));

        const [snapshot1, snapshot2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        
        const docsToDelete = [];
        snapshot1.forEach(doc => docsToDelete.push(doc.ref));
        snapshot2.forEach(doc => docsToDelete.push(doc.ref));

        if (docsToDelete.length > 0) {
            await Promise.all(docsToDelete.map(docRef => deleteDoc(docRef)));
            showToast("Amizade removida com sucesso!", "success");
            loadFriends(); // Recarrega a lista de amigos
        } else {
            showToast("Não foi possível encontrar o registro da amizade para remover.", "error");
        }
    } catch (error) {
        console.error("Erro ao remover amizade:", error);
        showToast("Ocorreu um erro ao tentar remover a amizade.", "error");
    }
}


/**
 * Carrega e exibe a lista de amigos do usuário logado.
 */
async function loadFriends() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        friendsContainer.innerHTML = "<p>Faça login para ver seus amigos.</p>";
        return;
    }
    
    friendsContainer.innerHTML = "<p>Carregando amigos...</p>";

    try {
        const sentRequestsQuery = query(collection(db, "pedidosAmizade"), where("from", "==", currentUser.uid), where("status", "==", "aceito"));
        const receivedRequestsQuery = query(collection(db, "pedidosAmizade"), where("to", "==", currentUser.uid), where("status", "==", "aceito"));

        const [sentSnapshot, receivedSnapshot] = await Promise.all([getDocs(sentRequestsQuery), getDocs(receivedRequestsQuery)]);
        const friendUids = new Set();
        sentSnapshot.forEach(doc => friendUids.add(doc.data().to));
        receivedSnapshot.forEach(doc => friendUids.add(doc.data().from));

        friendsContainer.innerHTML = '';

        if (friendUids.size === 0) {
            friendsContainer.innerHTML = "<p>Você ainda não tem amigos. Use a busca para encontrar jogadores!</p>";
            return;
        }

        for (const uid of friendUids) {
            const profile = await getUserProfile(uid);
            const friendCard = document.createElement('div');
            friendCard.className = 'user-item'; 
            
            const photoURL = profile?.photoURL || '/imagens/avatar_padrao.png';

            friendCard.innerHTML = `
                <a href="profile.html?uid=${uid}" class="user-profile-link">
                    <div class="user-info">
                        <img src="${photoURL}" alt="Foto de perfil" class="profile-pic">
                        <div>
                            <h4>${profile?.nickname || 'Nome não definido'}</h4>
                            <p>${profile?.bio || 'Sem bio.'}</p>
                        </div>
                    </div>
                </a>
                <button class="delete-friend-btn" data-friend-uid="${uid}" title="Remover Amizade">&times;</button>
            `;
            friendsContainer.appendChild(friendCard);
        }

    } catch (error) {
        console.error("Erro ao carregar amigos:", error);
        friendsContainer.innerHTML = "<p>Ocorreu um erro ao buscar sua lista de amigos.</p>";
    }
}

function setupEventListeners() {
    document.body.addEventListener('click', (e) => {
        const removeButton = e.target.closest('.delete-friend-btn');
        if (removeButton) {
            const friendUid = removeButton.dataset.friendUid;
            removeFriendship(friendUid);
        }
    });
}

// Inicialização
onAuthStateChanged(auth, (user) => {
    if (user) {
        loadFriends();
    } else {
         friendsContainer.innerHTML = "<p>Faça login para ver seus amigos.</p>";
    }
});

setupEventListeners();