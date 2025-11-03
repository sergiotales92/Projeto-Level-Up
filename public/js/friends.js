// public/js/friends.js

import { auth, db } from './firebase-config.js';
// Adicione 'writeBatch' e 'getDocs' à importação
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, updateDoc, arrayUnion, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

/**
 * Envia um novo pedido de amizade.
 * @param {string} targetUserId - O UID do usuário que receberá o pedido.
 */
export async function sendFriendRequest(targetUserId) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showToast("Você precisa estar logado para enviar pedidos de amizade.", "error");
      return;
    }

    if (currentUser.uid === targetUserId) {
        showToast("Você não pode adicionar a si mesmo!", "error");
        return;
    }

    // Verifica se já existe um pedido (pendente, aceito ou bloqueado)
    const q1 = query(collection(db, "pedidosAmizade"), where("from", "==", currentUser.uid), where("to", "==", targetUserId));
    const q2 = query(collection(db, "pedidosAmizade"), where("from", "==", targetUserId), where("to", "==", currentUser.uid));
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    if (!snap1.empty || !snap2.empty) {
        // Verifica o status específico para dar uma mensagem mais precisa
        let existingStatus = 'pendente'; // Assume pendente se não encontrar outro
        const checkStatus = (snapshot) => {
            if (!snapshot.empty) {
                existingStatus = snapshot.docs[0].data().status;
            }
        };
        checkStatus(snap1);
        if (existingStatus === 'pendente') checkStatus(snap2); // Só checa q2 se q1 não for definitivo

        if (existingStatus === 'aceito') {
            showToast("Vocês já são amigos.", "info");
        } else if (existingStatus === 'bloqueado') {
             showToast("Não é possível enviar pedido. Há um bloqueio entre vocês.", "warning");
        } else { // Pendente
             showToast("Já existe um pedido de amizade pendente com este usuário.", "info");
        }
        return;
    }


    const request = {
      from: currentUser.uid,
      to: targetUserId,
      status: 'pendente',
      criadoEm: new Date()
    };

    await addDoc(collection(db, "pedidosAmizade"), request);
    showToast("Pedido de amizade enviado!", "success");

  } catch (error) {
    console.error("Erro ao enviar pedido:", error);
    showToast("Erro ao enviar pedido. Tente novamente.", "error");
  }
}

/**
 * Remove a amizade entre o usuário atual e outro usuário.
 * @param {string} friendUid - O UID do amigo a ser removido.
 * @returns {Promise<boolean>} - Retorna true se a amizade foi removida, false caso contrário.
 */
export async function removeFriend(friendUid) {
    const currentUser = auth.currentUser;
    if (!currentUser) return false;

    try {
        const q1 = query(collection(db, "pedidosAmizade"), where("from", "==", currentUser.uid), where("to", "==", friendUid), where("status", "==", "aceito"));
        const q2 = query(collection(db, "pedidosAmizade"), where("from", "==", friendUid), where("to", "==", currentUser.uid), where("status", "==", "aceito"));

        const [snapshot1, snapshot2] = await Promise.all([getDocs(q1), getDocs(q2)]);

        const batch = writeBatch(db);
        snapshot1.forEach(doc => batch.delete(doc.ref));
        snapshot2.forEach(doc => batch.delete(doc.ref));

        // Verifica se algum documento foi encontrado para deletar
        if (snapshot1.empty && snapshot2.empty) {
            console.warn("Nenhum registro de amizade encontrado para remover entre", currentUser.uid, "e", friendUid);
            // Considera retornar false ou lançar um erro se a intenção era que *deveria* existir amizade
            return true; // Retorna true mesmo assim, pois o estado final (não amigos) foi alcançado
        }

        await batch.commit();
        return true;
    } catch (error) {
        console.error("Erro ao remover amizade:", error);
        return false;
    }
}


/**
 * CORRIGIDO: Bloqueia um usuário, alterando o status da amizade para 'bloqueado' em vez de apagar.
 * @param {string} targetUserId - O UID do usuário a ser bloqueado.
 * @returns {Promise<boolean>} - Retorna true se o bloqueio for bem-sucedido.
 */
export async function blockUser(targetUserId) {
    const currentUser = auth.currentUser;
    if (!currentUser) return false;

    console.log(`Tentando bloquear ${targetUserId} por ${currentUser.uid}`);

    try {
        const batch = writeBatch(db);

        // Atualiza o status da amizade para 'bloqueado' (se existir)
        const q1 = query(collection(db, "pedidosAmizade"), where("from", "==", currentUser.uid), where("to", "==", targetUserId));
        const q2 = query(collection(db, "pedidosAmizade"), where("from", "==", targetUserId), where("to", "==", currentUser.uid));
        const [snapshot1, snapshot2] = await Promise.all([getDocs(q1), getDocs(q2)]);

        snapshot1.forEach(doc => batch.update(doc.ref, { status: "bloqueado", bloqueadoPor: currentUser.uid }));
        snapshot2.forEach(doc => batch.update(doc.ref, { status: "bloqueado", bloqueadoPor: currentUser.uid }));

        // Adiciona o targetUserId à lista de 'blockedUsers' do usuário atual
        const currentUserRef = doc(db, 'users', currentUser.uid);
        batch.update(currentUserRef, {
            blockedUsers: arrayUnion(targetUserId)
        });

        // Adiciona o currentUser.uid à lista de 'blockedBy' do usuário alvo
        const targetUserRef = doc(db, 'users', targetUserId);
        batch.update(targetUserRef, {
            blockedBy: arrayUnion(currentUser.uid)
        });

        await batch.commit();
        console.log("Usuário bloqueado com sucesso.");
        return true;
    } catch (error) {
        console.error("Erro ao bloquear usuário:", error);
        return false;
    }
}

/**
 * Verifica o status da amizade entre o utilizador atual e outro utilizador.
 * @param {string} targetUserId - O UID do outro utilizador.
 * @returns {Promise<string>} O status: 'friends', 'request_sent', 'request_received', 'blocked', 'none'.
 */
export async function checkFriendshipStatus(targetUserId) {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid === targetUserId) return 'none'; // Não pode ser amigo de si mesmo

    const currentUserId = currentUser.uid;
    const pedidosRef = collection(db, 'pedidosAmizade');

    // Verifica se estão bloqueados (prioridade)
    const qBlocked1 = query(pedidosRef, where('from', '==', currentUserId), where('to', '==', targetUserId), where('status', '==', 'bloqueado'));
    const qBlocked2 = query(pedidosRef, where('from', '==', targetUserId), where('to', '==', currentUserId), where('status', '==', 'bloqueado'));
    const [blockedSnap1, blockedSnap2] = await Promise.all([getDocs(qBlocked1), getDocs(qBlocked2)]);
    if (!blockedSnap1.empty || !blockedSnap2.empty) {
        return 'blocked';
    }

    // Verifica se são amigos
    const qFriends1 = query(pedidosRef, where('from', '==', currentUserId), where('to', '==', targetUserId), where('status', '==', 'aceito'));
    const qFriends2 = query(pedidosRef, where('from', '==', targetUserId), where('to', '==', currentUserId), where('status', '==', 'aceito'));
    const [friendsSnap1, friendsSnap2] = await Promise.all([getDocs(qFriends1), getDocs(qFriends2)]);
    if (!friendsSnap1.empty || !friendsSnap2.empty) {
        return 'friends';
    }

    // Verifica pedido enviado
    const qSent = query(pedidosRef, where('from', '==', currentUserId), where('to', '==', targetUserId), where('status', '==', 'pendente'));
    const sentSnapshot = await getDocs(qSent);
    if (!sentSnapshot.empty) {
        return 'request_sent';
    }

    // Verifica pedido recebido
    const qReceived = query(pedidosRef, where('from', '==', targetUserId), where('to', '==', currentUserId), where('status', '==', 'pendente'));
    const receivedSnapshot = await getDocs(qReceived);
    if (!receivedSnapshot.empty) {
        return 'request_received';
    }

    return 'none'; // Nenhum relacionamento encontrado
}