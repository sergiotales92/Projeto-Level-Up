// Importa as ferramentas de autenticação e do Firestore
import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// 1. IMPORTA A FUNÇÃO DO FILTRO
import { containsForbiddenWords } from './profanity-filter.js';


// Cache para perfis de utilizador para evitar buscas repetidas
let userProfilesCache = {};

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
 * [FUNÇÃO ADICIONADA] Busca o perfil de um utilizador pelo seu UID.
 * Guarda os perfis em cache para melhorar a performance.
 */
export async function getUserProfile(uid) {
    if (userProfilesCache[uid]) {
        return userProfilesCache[uid];
    }
    try {
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const profile = {
                uid: uid,
                nickname: userData.nickname || 'Utilizador Desconhecido',
                photoURL: userData.photoURL || '/imagens/avatar_padrao.png',
                bio: userData.bio || ''
            };
            userProfilesCache[uid] = profile;
            return profile;
        }
        return null;
    } catch (error) {
        console.error("Erro ao buscar perfil do utilizador:", error);
        return null;
    }
}

/**
 * Salva ou atualiza os dados de um usuário na lista de contas salvas no localStorage.
 */
function storeUserLocally(userData) {
    if (!userData || !userData.uid) return;

    const key = 'savedUsers';
    let users = JSON.parse(localStorage.getItem(key)) || [];

    users = users.filter(u => u.uid !== userData.uid);
    users.unshift({
        uid: userData.uid,
        email: userData.email,
        displayName: userData.displayName,
        photoURL: userData.photoURL
    });

    if (users.length > 5) {
        users = users.slice(0, 5);
    }

    localStorage.setItem(key, JSON.stringify(users));
}

/**
 * Verifica se um nickname já está em uso.
 */
export async function isNicknameTaken(nickname) {
    const nicknameLower = nickname.toLowerCase();
    const nicknameRef = doc(db, "nicknames", nicknameLower);
    const docSnap = await getDoc(nicknameRef);
    return docSnap.exists();
}

/**
 * CORRIGIDO: Cria um documento para o usuário no Firestore, inicializando os campos de bloqueio.
 */
async function createUserDocument(user, nickname) {
    const userRef = doc(db, "users", user.uid);
    const nicknameRef = doc(db, "nicknames", nickname.toLowerCase());
    
    const photoURL = `https://ui-avatars.com/api/?name=${nickname.replace(/\s/g, '+')}&background=random&color=fff`;

    const userData = {
        uid: user.uid,
        email: user.email,
        displayName: nickname,
        nickname: nickname,
        photoURL: photoURL,
        bio: "Olá! Sou novo por aqui!",
        createdAt: new Date(),
        // ADICIONADO: Inicializa as listas de bloqueio como vazias.
        blockedUsers: [],
        blockedBy: []
    };

    // Usa uma operação em lote para garantir que ambos os documentos sejam criados.
    const batch = writeBatch(db);
    batch.set(userRef, userData);
    batch.set(nicknameRef, { uid: user.uid });
    await batch.commit();


    storeUserLocally({
        uid: user.uid,
        email: user.email,
        displayName: nickname,
        photoURL: photoURL
    });
}


/**
 * Cadastra um novo usuário.
 */
export async function signupUser(email, password, nickname) {
    // 2. ADICIONA A VERIFICAÇÃO DO NICKNAME
    if (containsForbiddenWords(nickname)) {
        throw new Error("O nickname contém palavras não permitidas.");
    }
    const nicknameTaken = await isNicknameTaken(nickname);
    if (nicknameTaken) {
        throw new Error("Este nickname já está em uso. Por favor, escolha outro.");
    }
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await createUserDocument(userCredential.user, nickname);
    return userCredential;
}

/**
 * Autentica um usuário existente.
 */
export async function loginUser(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    const userDocRef = doc(db, 'users', userCredential.user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        storeUserLocally({
            uid: userData.uid,
            email: userData.email,
            displayName: userData.nickname || userData.displayName,
            photoURL: userData.photoURL
        });
    }
    return userCredential;
}

/**
 * Desconecta o usuário.
 */
export function logoutUser() {
    return signOut(auth);
}

/**
 * Observa mudanças no estado de autenticação.
 */
export function addAuthObserver(callback) {
    onAuthStateChanged(auth, callback);
}

/**
 * [FUNÇÃO ATUALIZADA] Exclui a conta de um utilizador e todos os seus dados.
 */
export async function deleteUserAccount() {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("Nenhum utilizador autenticado encontrado para exclusão.");
    }

    const uid = user.uid;

    try {
        // Inicia uma operação em lote para garantir a consistência dos dados
        const batch = writeBatch(db);

        // 1. Apaga o documento do usuário
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const nickname = userDocSnap.data().nickname;
            // 2. Se houver nickname, apaga o documento de referência do nickname
            if (nickname) {
                const nicknameDocRef = doc(db, 'nicknames', nickname.toLowerCase());
                batch.delete(nicknameDocRef);
            }
            batch.delete(userDocRef);
        }

        // 3. Apaga todos os posts do usuário
        const postsQuery = query(collection(db, 'posts'), where('userId', '==', uid));
        const postsSnapshot = await getDocs(postsQuery);
        postsSnapshot.forEach(doc => batch.delete(doc.ref));

        // 4. Apaga todos os pedidos de amizade enviados e recebidos
        const sentReqQuery = query(collection(db, 'pedidosAmizade'), where('from', '==', uid));
        const receivedReqQuery = query(collection(db, 'pedidosAmizade'), where('to', '==', uid));
        const [sentSnapshot, receivedSnapshot] = await Promise.all([getDocs(sentReqQuery), getDocs(receivedReqQuery)]);
        sentSnapshot.forEach(doc => batch.delete(doc.ref));
        receivedSnapshot.forEach(doc => batch.delete(doc.ref));

        // 5. Executa todas as operações de exclusão no Firestore
        await batch.commit();

        // 6. Por fim, exclui o usuário do serviço de autenticação
        await deleteUser(user);
        
        // --- INÍCIO DA LÓGICA ADICIONADA ---
        // 7. Remove o usuário da lista de contas salvas no localStorage
        const key = 'savedUsers';
        let savedUsers = JSON.parse(localStorage.getItem(key)) || [];
        savedUsers = savedUsers.filter(u => u.uid !== uid);
        localStorage.setItem(key, JSON.stringify(savedUsers));
        // --- FIM DA LÓGICA ADICIONADA ---

        console.log(`Conta e dados do usuário ${uid} foram excluídos com sucesso.`);

    } catch (error) {
        console.error("Erro crítico ao excluir a conta:", error);
        // Lança o erro para que a interface possa notificar o usuário adequadamente
        throw new Error(`Falha ao excluir a conta: ${error.message}`);
    }
}