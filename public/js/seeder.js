import { db } from "./firebase-config.js";
// CORREÇÃO: Todas as importações do Firestore foram consolidadas em uma única linha.
import { collection, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

// Dados de teste para os jogos (sem duplicatas)
export const JOGOS = [
    { id: "lol", nome: "League of Legends", urlDaImagemCapa: "https://via.placeholder.com/150/33A2FF/FFFFFF?text=LoL" },
    { id: "minecraft", nome: "Minecraft", urlDaImagemCapa: "https://via.placeholder.com/150/33FF57/FFFFFF?text=Minecraft" },
    { id: "genshin", nome: "Genshin Impact", urlDaImagemCapa: "https://via.placeholder.com/150/B533FF/FFFFFF?text=Genshin" },
    { id: "csgo", nome: "Counter-Strike 2", urlDaImagemCapa: "https://via.placeholder.com/150/F0FF33/000000?text=CS2" },
    { id: "crash", nome: "Crash Bandicoot", urlDaImagemCapa: "https://via.placeholder.com/150/FF9633/FFFFFF?text=Crash" },
];

// Dados de teste para os usuários (sem duplicatas)
const USUARIOS = [
    {
        uid: "rjUXr8AmYcxmn0y81Bi4CAsEJdiq",
        nickname: "PlayerZero",
        bio: "Focado em FPS competitivo.",
        plataformas: ["PC"],
        jogosFavoritos: ["valorant", "csgo"]
    },
    {
        uid: "wk6hHOFZ03XC8bAgRhGYhFqPE3V0",
        nickname: "CraftyGirl",
        bio: "Construindo mundos e relaxando.",
        plataformas: ["PC", "PlayStation"],
        jogosFavoritos: ["minecraft", "crash"]
    },
    {
        uid: "YhJc1P6bKdHgB3JmyivoExiImmU4",
        nickname: "MobaMaster",
        bio: "Apenas mais uma partida de LoL.",
        plataformas: ["PC"],
        jogosFavoritos: ["lol", "valorant"]
    }
];

export async function seedDatabase() {
    console.log("Iniciando o seeding do banco de dados...");
    try {
        // Popula a coleção de jogos
        for (const jogo of JOGOS) {
            const docRef = doc(db, "games", jogo.id);
            await setDoc(docRef, { nome: jogo.nome, urlDaImagemCapa: jogo.urlDaImagemCapa });
        }
        console.log("Coleção `games` alimentada com sucesso!");

        // Popula a coleção de usuários
        for (const usuario of USUARIOS) {
            const docRef = doc(db, "users", usuario.uid);
            await setDoc(docRef, {
                nickname: usuario.nickname,
                bio: usuario.bio,
                plataformas: usuario.plataformas,
                jogosFavoritos: usuario.jogosFavoritos
            });
        }
        console.log("Coleção `users` alimentada com sucesso!");
        
        // Exibe o alerta de sucesso
        showToast("Banco de dados populado com dados de teste!", "success");

    } catch (error) {
        console.error("Erro ao popular o banco de dados:", error);
        showToast("Erro ao popular o banco de dados. Veja o console para mais detalhes.", "error");
    }
}