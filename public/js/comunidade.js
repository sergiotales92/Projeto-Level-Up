// public/js/comunidade.js

import { db } from './firebase-config.js';
import { collection, getDocs, orderBy, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const gamesListContainer = document.getElementById('games-list-container');

    async function loadGames() {
        if (!gamesListContainer) return;

        try {
            const gamesCollection = collection(db, 'games');
            const q = query(gamesCollection, orderBy('nome')); // Ordena os jogos por nome
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                gamesListContainer.innerHTML = '<p>Nenhuma comunidade de jogo encontrada.</p>';
                return;
            }

            gamesListContainer.innerHTML = ''; // Limpa a mensagem de "carregando"

            snapshot.forEach(doc => {
                const game = doc.data();
                const gameId = doc.id;

                const gameCard = document.createElement('a');
                gameCard.href = `game-posts.html?gameId=${gameId}`;
                gameCard.className = 'game-card';

                gameCard.innerHTML = `
                    <img src="${game.urlDaImagemCapa || '/imagens/capa.jpg'}" alt="Capa de ${game.nome}" class="game-card-image">
                    <div class="game-card-info">
                        <h3>${game.nome}</h3>
                    </div>
                `;
                gamesListContainer.appendChild(gameCard);
            });

        } catch (error) {
            console.error("Erro ao carregar as comunidades de jogos:", error);
            gamesListContainer.innerHTML = '<p>Ocorreu um erro ao carregar as comunidades. Tente novamente mais tarde.</p>';
        }
    }

    loadGames();
});