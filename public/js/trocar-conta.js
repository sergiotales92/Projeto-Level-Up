// levelup-squad-app/public/js/trocar-conta.js

document.addEventListener('DOMContentLoaded', () => {
    const accountsListContainer = document.getElementById('saved-accounts-list');
    const storageKey = 'savedUsers';

    /**
     * Carrega e renderiza as contas salvas do localStorage.
     */
    function renderSavedAccounts() {
        const savedUsers = JSON.parse(localStorage.getItem(storageKey)) || [];
        accountsListContainer.innerHTML = ''; // Limpa a lista antes de renderizar

        if (savedUsers.length === 0) {
            accountsListContainer.innerHTML = '<p style="text-align: center; color: var(--cor-texto-secundario);">Nenhuma conta salva.</p>';
            return;
        }

        savedUsers.forEach(user => {
            const accountItem = document.createElement('div');
            accountItem.className = 'saved-account-item';
            // Adiciona o email como um data attribute para facilitar o login e a remoção
            accountItem.dataset.email = user.email;
            accountItem.dataset.uid = user.uid;

            accountItem.innerHTML = `
                <div class="account-info">
                    <img src="${user.photoURL || 'imagens/avatar_padrao.png'}" alt="Avatar de ${user.displayName}">
                    <div class="account-details">
                        <span class="account-nickname">${user.displayName}</span>
                        <span class="account-email">${user.email}</span>
                    </div>
                </div>
                <button class="remove-account-btn" title="Remover esta conta da lista">
                    <i class="fas fa-times"></i>
                </button>
            `;
            accountsListContainer.appendChild(accountItem);
        });
    }

    /**
     * Lida com os cliques na lista de contas.
     */
    accountsListContainer.addEventListener('click', (e) => {
        const removeButton = e.target.closest('.remove-account-btn');
        const accountItem = e.target.closest('.saved-account-item');

        if (removeButton) {
            e.stopPropagation(); // Impede que o clique no botão ative o clique no item
            const userUidToRemove = accountItem.dataset.uid;
            
            let savedUsers = JSON.parse(localStorage.getItem(storageKey)) || [];
            // Filtra o array, mantendo apenas os usuários com UID diferente
            savedUsers = savedUsers.filter(u => u.uid !== userUidToRemove);
            
            // Salva o novo array de volta no localStorage
            localStorage.setItem(storageKey, JSON.stringify(savedUsers));
            
            // Re-renderiza a lista para mostrar a mudança
            renderSavedAccounts();

        } else if (accountItem) {
            const email = accountItem.dataset.email;
            // Armazena o e-mail na sessionStorage para ser pego pela página de login
            sessionStorage.setItem('loginEmail', email);
            // Redireciona para a página de autenticação
            window.location.href = 'auth.html';
        }
    });

    // Renderiza as contas assim que a página carregar
    renderSavedAccounts();
});