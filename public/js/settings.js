import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, updateDoc, arrayRemove, query, collection, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { deleteUserAccount, getUserProfile } from './auth.js';

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

document.addEventListener('DOMContentLoaded', () => {
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    const manageBlockedBtn = document.getElementById('manage-blocked-users');
    const blockedUsersModal = document.getElementById('blocked-users-modal');
    const closeModalBtn = blockedUsersModal.querySelector('.close-modal-btn');
    const blockedUsersList = document.getElementById('blocked-users-list');

    // Novos elementos para o modal de confirmação de exclusão
    const deleteConfirmModal = document.getElementById('delete-confirm-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');


    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'auth.html';
            return;
        }

        if (manageBlockedBtn) {
            manageBlockedBtn.addEventListener('click', () => {
                blockedUsersModal.style.display = 'flex';
                loadBlockedUsers(user.uid);
            });
        }
        
        if(closeModalBtn) {
            closeModalBtn.addEventListener('click', () => blockedUsersModal.style.display = 'none');
        }

        blockedUsersModal.addEventListener('click', (e) => {
            if (e.target === blockedUsersModal) {
                 blockedUsersModal.style.display = 'none';
            }
        });

        // Lógica de exclusão de conta atualizada
        if (deleteAccountBtn) {
            deleteAccountBtn.addEventListener('click', () => {
                deleteConfirmModal.style.display = 'flex';
            });
        }

        if (cancelDeleteBtn) {
            cancelDeleteBtn.addEventListener('click', () => {
                deleteConfirmModal.style.display = 'none';
            });
        }
        
        if (deleteConfirmModal) {
            deleteConfirmModal.addEventListener('click', (e) => {
                if(e.target === deleteConfirmModal){
                     deleteConfirmModal.style.display = 'none';
                }
            });
        }


        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', async () => {
                try {
                    confirmDeleteBtn.disabled = true;
                    confirmDeleteBtn.textContent = 'Aguarde...';
                    await deleteUserAccount();
                    showToast('A sua conta foi excluída com sucesso.', 'success');
                    window.location.href = 'index.html';
                } catch (error) {
                    console.error("Erro ao excluir conta:", error);
                    showToast(`Não foi possível excluir a sua conta: ${error.message}`, 'error');
                    confirmDeleteBtn.disabled = false;
                    confirmDeleteBtn.textContent = 'Sim';
                } finally {
                    deleteConfirmModal.style.display = 'none';
                }
            });
        }
    });
    
    async function loadBlockedUsers(currentUserId) {
        blockedUsersList.innerHTML = '<p>A carregar...</p>';
        try {
            const userRef = doc(db, 'users', currentUserId);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists() || !userSnap.data().blockedUsers || userSnap.data().blockedUsers.length === 0) {
                blockedUsersList.innerHTML = '<p>Você não bloqueou nenhum utilizador.</p>';
                return;
            }

            const blockedIds = userSnap.data().blockedUsers;
            blockedUsersList.innerHTML = '';

            for (const userId of blockedIds) {
                const profile = await getUserProfile(userId);
                if (profile) {
                    const userItem = document.createElement('div');
                    userItem.className = 'blocked-user-item';
                    userItem.innerHTML = `
                        <div class="blocked-user-info">
                            <img src="${profile.photoURL}" alt="Avatar de ${profile.nickname}">
                            <span>${profile.nickname}</span>
                        </div>
                        <button class="setting-button unblock-btn" data-uid="${userId}">Desbloquear</button>
                    `;
                    blockedUsersList.appendChild(userItem);
                }
            }

            document.querySelectorAll('.unblock-btn').forEach(button => {
                button.addEventListener('click', handleUnblockUser);
            });

        } catch (error) {
            console.error("Erro ao carregar utilizadores bloqueados:", error);
            blockedUsersList.innerHTML = '<p>Ocorreu um erro ao carregar a lista.</p>';
        }
    }
    
    async function handleUnblockUser(event) {
        const button = event.target;
        const userToUnblockId = button.dataset.uid;
        const currentUser = auth.currentUser;

        if (!currentUser || !userToUnblockId) return;

        button.disabled = true;
        button.textContent = 'Aguarde...';

        try {
            const batch = writeBatch(db);

            // 1. Reverte o status da amizade para 'aceito'
            const q1 = query(collection(db, "pedidosAmizade"), where("from", "==", currentUser.uid), where("to", "==", userToUnblockId), where("status", "==", "bloqueado"));
            const q2 = query(collection(db, "pedidosAmizade"), where("from", "==", userToUnblockId), where("to", "==", currentUser.uid), where("status", "==", "bloqueado"));
            const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
            
            snap1.forEach(doc => batch.update(doc.ref, { status: "aceito", bloqueadoPor: null }));
            snap2.forEach(doc => batch.update(doc.ref, { status: "aceito", bloqueadoPor: null }));

            // 2. Remove o usuário da sua lista de bloqueados
            const currentUserRef = doc(db, 'users', currentUser.uid);
            batch.update(currentUserRef, {
                blockedUsers: arrayRemove(userToUnblockId)
            });

            // 3. Remove você da lista de "bloqueado por" do outro usuário
            const userToUnblockRef = doc(db, 'users', userToUnblockId);
            batch.update(userToUnblockRef, {
                blockedBy: arrayRemove(currentUser.uid)
            });

            await batch.commit();

            showToast('Utilizador desbloqueado com sucesso!', 'success');
            loadBlockedUsers(currentUser.uid); // Recarrega a lista para refletir a mudança

        } catch (error) {
            console.error("Erro ao desbloquear utilizador:", error);
            showToast("Não foi possível desbloquear o utilizador.", "error");
            button.disabled = false;
            button.textContent = 'Desbloquear';
        }
    }
});