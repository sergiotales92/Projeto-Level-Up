import { logoutUser } from './auth.js';
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, query, where, getDocs, doc, getDoc, limit, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos do DOM do Cabeçalho ---
    const settingsMenuToggle = document.getElementById('settings-menu-toggle');
    const settingsDropdown = document.getElementById('settings-dropdown');
    const notificationsMenuToggle = document.getElementById('notifications-menu-toggle');
    const notificationsDropdown = document.getElementById('notifications-dropdown');
    const logoutButton = document.getElementById('logout-button');
    const notificationsList = document.querySelector('.notifications-list');
    const viewAllNotificationsButton = document.getElementById('view-all-notifications');
    const notificationBadge = document.getElementById('notification-badge');

    // --- Controle dos Dropdowns ---
    function toggleDropdown(toggle, dropdown, otherDropdown) {
        if (!toggle || !dropdown) return;
        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            if (otherDropdown && otherDropdown.classList.contains('active')) {
                otherDropdown.classList.remove('active');
            }
            dropdown.classList.toggle('active');
        });
    }

    toggleDropdown(settingsMenuToggle, settingsDropdown, notificationsDropdown);
    toggleDropdown(notificationsMenuToggle, notificationsDropdown, settingsDropdown);

    window.addEventListener('click', (event) => {
        if (settingsMenuToggle && settingsDropdown && !settingsDropdown.contains(event.target) && !settingsMenuToggle.contains(event.target)) {
            settingsDropdown.classList.remove('active');
        }
        if (notificationsMenuToggle && notificationsDropdown && !notificationsDropdown.contains(event.target) && !notificationsMenuToggle.contains(event.target)) {
            notificationsDropdown.classList.remove('active');
        }
    });

    // --- Lógica de Logout ---
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            logoutUser()
                .then(() => {
                    console.log('Usuário deslogado com sucesso!');
                    window.location.href = 'auth.html';
                })
                .catch(error => {
                    console.error('Erro ao deslogar:', error);
                });
        });
    }

    // --- Lógica de Notificações ---
    async function getNickname(uid) {
        try {
            const userDocRef = doc(db, 'users', uid);
            const userDocSnap = await getDoc(userDocRef);
            return (userDocSnap.exists() && userDocSnap.data().nickname) ? userDocSnap.data().nickname : 'Usuário Desconhecido';
        } catch (error) {
            console.error("Erro ao buscar nickname:", error);
            return 'Usuário Desconhecido';
        }
    }

    function updateNotificationBadge(count) {
        if (notificationBadge) {
            if (count > 0) {
                notificationBadge.textContent = count;
                notificationBadge.style.display = 'flex';
            } else {
                notificationBadge.style.display = 'none';
            }
        }
    }

    async function loadNotifications(queryLimit = null) {
        const currentUser = auth.currentUser;
        if (!currentUser || !notificationsList) return;

        notificationsList.innerHTML = '<p class="empty-notification">Carregando...</p>';
        let q = query(collection(db, "pedidosAmizade"), where("to", "==", currentUser.uid), where("status", "==", "pendente"), orderBy("criadoEm", "desc"));
        const countQuery = query(collection(db, "pedidosAmizade"), where("to", "==", currentUser.uid), where("status", "==", "pendente"));
        if (queryLimit) {
            q = query(q, limit(queryLimit));
        }
        try {
            const [querySnapshot, totalSnapshot] = await Promise.all([getDocs(q), getDocs(countQuery)]);
            const totalCount = totalSnapshot.size;
            updateNotificationBadge(totalCount);
            notificationsList.innerHTML = '';
            if (querySnapshot.empty) {
                notificationsList.innerHTML = '<p class="empty-notification">Nenhuma nova notificação</p>';
                if(viewAllNotificationsButton) viewAllNotificationsButton.style.display = 'none';
                return;
            }
            if (viewAllNotificationsButton) {
                 viewAllNotificationsButton.style.display = (queryLimit && totalCount > queryLimit) || (!queryLimit && totalCount > 3) ? 'block' : 'none';
            }

            for (const requestDoc of querySnapshot.docs) {
                const request = requestDoc.data();
                const senderNickname = await getNickname(request.from);
                const notificationLink = document.createElement('a');
                notificationLink.href = 'notifications.html';
                notificationLink.className = 'notification-item';
                notificationLink.innerHTML = `
                    <p><strong>${senderNickname}</strong> enviou um pedido de amizade.</p>
                    <small>${request.criadoEm.toDate().toLocaleDateString()}</small>
                `;
                notificationsList.appendChild(notificationLink);
            }
        } catch (error) {
            console.error("Erro ao carregar notificações:", error);
            notificationsList.innerHTML = '<p class="empty-notification">Erro ao carregar.</p>';
            updateNotificationBadge(0);
        }
    }

    if (viewAllNotificationsButton) {
        viewAllNotificationsButton.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'notifications.html';
        });
    }
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadNotifications(5); // Carrega as 5 notificações mais recentes em todas as páginas
        } else if (notificationsList) {
            notificationsList.innerHTML = '<p class="empty-notification">Faça login para ver suas notificações.</p>';
            updateNotificationBadge(0);
        }
    });
});
