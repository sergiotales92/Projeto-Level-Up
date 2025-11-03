import { db, auth } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

const requestsListDiv = document.getElementById('requests-list');

/**
 * Busca o perfil de um usuário (nickname e avatar) pelo seu UID.
 * @param {string} uid - O ID do usuário.
 * @returns {Promise<object>} Um objeto com nickname e avatarUrl.
 */
async function getUserProfile(uid) {
    try {
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            return {
                nickname: userData.nickname || 'Usuário Desconhecido',
                avatarUrl: userData.photoURL || '/imagens/avatar_padrao.png'
            };
        }
        return { nickname: 'Usuário Desconhecido', avatarUrl: '/imagens/avatar_padrao.png' };
    } catch (error) {
        console.error("Erro ao buscar perfil:", error);
        return { nickname: 'Usuário Desconhecido', avatarUrl: '/imagens/avatar_padrao.png' };
    }
}

/**
 * Carrega e exibe os pedidos de amizade pendentes.
 */
async function loadFriendRequests() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        requestsListDiv.innerHTML = "<p>Faça login para ver suas notificações.</p>";
        return;
    }

    requestsListDiv.innerHTML = "<p>Carregando pedidos...</p>";

    const q = query(
        collection(db, "pedidosAmizade"),
        where("to", "==", currentUser.uid),
        where("status", "==", "pendente"),
        orderBy("criadoEm", "desc")
    );

    try {
        const querySnapshot = await getDocs(q);
        requestsListDiv.innerHTML = '';

        if (querySnapshot.empty) {
            requestsListDiv.innerHTML = "<p>Nenhum pedido de amizade pendente.</p>";
            return;
        }

        requestsListDiv.removeEventListener('click', handleRequestAction);

        for (const requestDoc of querySnapshot.docs) {
            const request = requestDoc.data();
            const senderProfile = await getUserProfile(request.from);

            const card = document.createElement('div');
            card.className = 'player-card';
            card.innerHTML = `
                <div class="user-info">
                    <img src="${senderProfile.avatarUrl}" alt="Avatar de ${senderProfile.nickname}" class="avatar">
                    <p><strong>${senderProfile.nickname}</strong> enviou um pedido de amizade.</p>
                </div>
                <div class="request-actions">
                    <button class="accept-btn" data-id="${requestDoc.id}">Aceitar</button>
                    <button class="reject-btn" data-id="${requestDoc.id}">Rejeitar</button>
                </div>
            `;
            requestsListDiv.appendChild(card);
        }
        
        requestsListDiv.addEventListener('click', handleRequestAction);

    } catch (error) {
        console.error("Erro ao carregar pedidos:", error);
        requestsListDiv.innerHTML = "<p>Ocorreu um erro ao buscar os pedidos.</p>";
    }
}

/**
 * Lida com os cliques nos botões de aceitar ou rejeitar.
 */
async function handleRequestAction(e) {
    const target = e.target;
    const requestId = target.dataset.id;

    if (!requestId || !target.closest('.request-actions')) return;

    target.closest('.request-actions').querySelectorAll('button').forEach(button => button.disabled = true);

    const requestRef = doc(db, 'pedidosAmizade', requestId);

    try {
        if (target.classList.contains('accept-btn')) {
            await updateDoc(requestRef, { status: 'aceito' });
            showToast('Pedido de amizade aceito!', 'success');
        } else if (target.classList.contains('reject-btn')) {
            await deleteDoc(requestRef);
            showToast('Pedido de amizade rejeitado.', 'info');
        }
        loadFriendRequests();
    } catch (error) {
        console.error("Erro ao processar o pedido:", error);
        showToast("Não foi possível processar a solicitação.", "error");
    }
}

// Inicia o processo quando o estado de autenticação é confirmado
onAuthStateChanged(auth, (user) => {
    if (user) {
        loadFriendRequests();
    } else {
        requestsListDiv.innerHTML = "<p>Você precisa estar logado para ver seus pedidos.</p>";
    }
});