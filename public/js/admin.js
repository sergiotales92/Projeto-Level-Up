import { db } from './firebase-config.js';
import { addDoc, collection } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { seedDatabase } from './seeder.js'; // 1. Importar a função

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
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
            container.removeChild(toast);
        }, 500);
    }, 5000);
}

const addGameForm = document.getElementById("add-game-form");
const seedButton = document.getElementById("seed-button"); // 2. Capturar o botão

addGameForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const gameNameInput = document.getElementById("game-name");
    const gameImageUrlInput = document.getElementById("game-image-url");

    const gameName = gameNameInput.value;
    const gameImageUrl = gameImageUrlInput.value;

 
    if (!gameName || !gameImageUrl) {
        showToast("Por favor, preencha todos os campos.", "error");
        return; 
    }

    addDoc(collection(db, 'games'), {
        nome: gameName,
        urlDaImagemCapa: gameImageUrl,
    })
    .then(() => {
        showToast("Jogo adicionado com sucesso!", "success");
        gameNameInput.value = "";
        gameImageUrlInput.value = "";
    })
    .catch((error) => {
        
        showToast("Erro ao adicionar o jogo: " + error.message, "error");
        console.error("Erro ao adicionar o documento: ", error);
    });
});

// 3. Adicionar o ouvinte de evento
seedButton.addEventListener('click', () => {
    console.log("Iniciando processo para popular o banco de dados a partir da página de admin...");
    seedDatabase(db);
});