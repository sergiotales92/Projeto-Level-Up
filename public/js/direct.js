import { db, auth } from './firebase-config.js';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    addDoc,
    serverTimestamp,
    doc,
    getDoc,
    getDocs,
    getCountFromServer,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// --- Função linkifyText (AJUSTADA para não linkar imagens) ---
/**
 * Converte URLs encontradas em um texto para links HTML clicáveis, ignorando URLs de imagens.
 * @param {string} inputText - O texto a ser processado (já sanitizado).
 * @returns {string} O texto com URLs convertidas em tags <a>.
 */
function linkifyText(inputText) {
  if (!inputText) return '';
  // Regex para encontrar URLs, incluindo www. sem http/https
  const urlRegex = /(\b(https?:\/\/|www\.)[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
  // Regex para verificar se uma URL é de imagem (simples)
  const imageRegex = /\.(gif|jpe?g|png|webp)$/i; // Inclui mais extensões

  return inputText.replace(urlRegex, function(url) {
    // Se a URL encontrada termina com uma extensão de imagem, não a transforma em link
    if (imageRegex.test(url)) {
      return url;
    }

    let href = url;
    // Adiciona http:// se a URL começar com www.
    if (!href.match(/^https?:\/\//i)) {
      href = 'http://' + href;
    }
    // Adiciona rel="noopener noreferrer" por segurança
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}
// --- Fim da Função linkifyText ---


function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); }, 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { if (container.contains(toast)) { container.removeChild(toast); } }, 500);
    }, 5000);
}

const conversationsList = document.querySelector('.conversations-list');
const chatPlaceholder = document.querySelector('.chat-placeholder');
const chatHeader = document.querySelector('.chat-header');
const chatBody = document.querySelector('.chat-body');
const directContainer = document.querySelector('.direct-container');
const chatInputs = document.querySelectorAll('.chat-message-input');
const sendButtons = document.querySelectorAll('.send-button');
const addMediaButtons = document.querySelectorAll('.add-media-button');

let currentChatPartnerId = null;
let unsubscribeFromMessages = null;
let conversationListeners = [];
let conversationsState = {}; // Guarda estado das conversas (perfil, última msg, não lidas)

async function getUserProfile(uid) {
    if (!uid) return null;
    // Tenta obter do cache primeiro (se implementado em outro lugar, senão busca sempre)
    // if (userProfilesCache[uid]) return userProfilesCache[uid];
    try {
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
             const profileData = { id: userDocSnap.id, ...userDocSnap.data() };
             // userProfilesCache[uid] = profileData; // Guarda no cache se implementado
             return profileData;
        }
        return null;
    } catch (error) {
        console.error("Erro ao buscar perfil de usuário:", error);
        return null;
    }
}


function renderConversationList() {
    // Ordena as conversas pela timestamp da última mensagem (mais recente primeiro)
    const sortedConversations = Object.values(conversationsState).sort((a, b) => {
        // Usa getTime() para comparar, tratando timestamps nulos como 0
        const timeA = a.lastMessage?.timestamp instanceof Date ? a.lastMessage.timestamp.getTime() : 0;
        const timeB = b.lastMessage?.timestamp instanceof Date ? b.lastMessage.timestamp.getTime() : 0;
        return timeB - timeA; // Descendente
    });

    conversationsList.innerHTML = ''; // Limpa a lista atual

    if (sortedConversations.length === 0) {
        conversationsList.innerHTML = '<p class="conversation-item-placeholder">Adicione amigos para conversar.</p>';
        return;
    }

    sortedConversations.forEach(convo => {
        const item = document.createElement('a');
        item.href = '#'; // Link dummy, a navegação é via JS
        item.className = 'conversation-item';
        if (convo.profile.id === currentChatPartnerId) {
            item.classList.add('active'); // Marca a conversa ativa
        }
        item.dataset.userId = convo.profile.id; // Guarda o ID do amigo no elemento

        // Define o texto da última mensagem (ou placeholder)
        const lastMessageText = convo.lastMessage?.mediaUrl
            ? '<em>Mídia</em>' // Mostra 'Mídia' se for ficheiro
            : (convo.lastMessage?.text || 'Clique para conversar');

        // Cria o HTML interno do item da lista
        item.innerHTML = `
            <div class="avatar">
                <img src="${convo.profile.photoURL || '/imagens/avatar_padrao.png'}" alt="Avatar de ${convo.profile.nickname}">
            </div>
            <div class="conversation-info">
                <p class="name">${convo.profile.nickname}</p>
                <p class="last-message">${lastMessageText}</p>
            </div>
            <div class="unread-counter" style="display: ${convo.unreadCount > 0 ? 'flex' : 'none'}">
                ${convo.unreadCount}
            </div>
        `;
        conversationsList.appendChild(item);

        // Adiciona listener para abrir o chat ao clicar
        item.addEventListener('click', (e) => {
            e.preventDefault();
            openChatWithUser(convo.profile.id);
        });
    });
}

async function initializeConversations(currentUser) {
    // Cancela listeners antigos
    conversationListeners.forEach(unsubscribe => unsubscribe());
    conversationListeners = [];
    conversationsState = {}; // Reseta o estado

    // Busca todos os pedidos de amizade aceites (enviados e recebidos)
    const sentQ = query(collection(db, "pedidosAmizade"), where("from", "==", currentUser.uid), where("status", "==", "aceito"));
    const receivedQ = query(collection(db, "pedidosAmizade"), where("to", "==", currentUser.uid), where("status", "==", "aceito"));

    try {
        const [sentSnapshot, receivedSnapshot] = await Promise.all([getDocs(sentQ), getDocs(receivedQ)]);
        const friendUids = new Set(); // Usa Set para evitar duplicados
        sentSnapshot.forEach(doc => friendUids.add(doc.data().to));
        receivedSnapshot.forEach(doc => friendUids.add(doc.data().from));

        if (friendUids.size === 0) {
            renderConversationList(); // Mostra placeholder se não houver amigos
            return;
        }

        // Para cada amigo, busca o perfil e configura o listener da última mensagem
        for (const friendId of friendUids) {
            const profile = await getUserProfile(friendId);
            if (profile) {
                const conversationId = [currentUser.uid, friendId].sort().join('_'); // ID único da conversa

                // Calcula contagem inicial de não lidas desde a última leitura guardada
                const lastReadMillis = parseInt(localStorage.getItem(`lastRead_${conversationId}`) || '0');
                const lastReadTimestamp = Timestamp.fromMillis(lastReadMillis);
                const unreadQuery = query(
                    collection(db, 'conversations', conversationId, 'messages'),
                    where('senderId', '==', friendId), // Mensagens do amigo
                    where('timestamp', '>', lastReadTimestamp) // Mais recentes que a última leitura
                );
                const unreadSnapshot = await getCountFromServer(unreadQuery);
                const initialUnreadCount = unreadSnapshot.data().count;

                // Guarda o estado inicial da conversa
                conversationsState[friendId] = { profile, lastMessage: null, unreadCount: initialUnreadCount };

                // Listener para a ÚLTIMA mensagem da conversa (para atualizar a lista)
                const messagesRef = collection(db, 'conversations', conversationId, 'messages');
                const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(1));

                const unsubscribe = onSnapshot(q, (snapshot) => {
                    if (!snapshot.empty) {
                        const lastMsgData = snapshot.docs[0].data();
                        const lastMsgTimestamp = lastMsgData.timestamp?.toDate(); // Converte para Date

                        // Verifica se a mensagem é realmente nova e não lida
                        const currentLastReadMillis = parseInt(localStorage.getItem(`lastRead_${conversationId}`) || '0');
                        const isTrulyNewUnread = lastMsgTimestamp && lastMsgTimestamp.getTime() > currentLastReadMillis;

                         // Incrementa não lidas se a mensagem for do amigo, não estiver no chat atual e for nova
                        if (lastMsgData.senderId === friendId && friendId !== currentChatPartnerId && isTrulyNewUnread) {
                            if (conversationsState[friendId]) {
                                conversationsState[friendId].unreadCount++;
                            } else {
                                // Caso raro: A conversa não estava no estado inicial mas chegou mensagem
                                conversationsState[friendId] = { profile, lastMessage: null, unreadCount: 1 };
                            }
                        }

                        // Atualiza a última mensagem no estado (mesmo que não seja nova)
                        if (conversationsState[friendId]) {
                            conversationsState[friendId].lastMessage = { ...lastMsgData, timestamp: lastMsgTimestamp };
                        }
                    }
                    renderConversationList(); // Re-renderiza a lista com dados atualizados
                }, (error) => {
                     console.error(`Erro no listener da conversa ${conversationId}:`, error);
                     // Pode adicionar um toast aqui se quiser notificar o user
                });
                conversationListeners.push(unsubscribe); // Guarda o listener para cancelar depois
            }
        }
        renderConversationList(); // Renderiza a lista inicial
    } catch (error) {
        console.error("Erro ao inicializar conversas:", error);
        conversationsList.innerHTML = '<p class="conversation-item-placeholder">Erro ao carregar conversas.</p>';
    }
}


async function openChatWithUser(userId) {
    const currentUser = auth.currentUser;
    // Evita reabrir o mesmo chat ou abrir sem user logado
    if (!currentUser || (currentChatPartnerId === userId && directContainer.classList.contains('chat-active'))) return;

    // Zera contador de não lidas e atualiza a lista
    if (conversationsState[userId]) conversationsState[userId].unreadCount = 0;
    renderConversationList(); // Atualiza a lista para remover o contador

    currentChatPartnerId = userId; // Define o parceiro de chat atual
    if (unsubscribeFromMessages) unsubscribeFromMessages(); // Cancela listener de mensagens anterior

    const userProfile = await getUserProfile(userId);
    if (!userProfile) {
        showToast("Não foi possível carregar o perfil do usuário.", "error");
        currentChatPartnerId = null; // Reseta se não encontrar perfil
        return;
    }

    // Ativa a UI do chat
    directContainer.classList.add('chat-active');
    chatPlaceholder.style.display = 'none'; // Esconde placeholder
    chatHeader.style.display = 'flex'; // Mostra header do chat
    chatHeader.innerHTML = `
        <a href="#" class="back-to-conversations"><i class="fas fa-arrow-left"></i></a>
        <div class="user-profile">
            <a href="profile.html?uid=${userId}" title="Ver perfil">
                <div class="avatar"><img src="${userProfile.photoURL || '/imagens/avatar_padrao.png'}" alt="Avatar"></div>
                <div><h3 class="name">${userProfile.nickname}</h3></div>
            </a>
        </div>
        `;
    // Adiciona listener ao botão de voltar
    chatHeader.querySelector('.back-to-conversations').addEventListener('click', (e) => {
        e.preventDefault();
        directContainer.classList.remove('chat-active'); // Desativa UI do chat
        currentChatPartnerId = null; // Reseta parceiro atual
        if (unsubscribeFromMessages) unsubscribeFromMessages(); // Cancela listener de mensagens
         // Remove a classe 'active' de todos os itens da lista
         document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
         // Guarda timestamp da última visita ao chat (para notificações futuras)
         localStorage.setItem('lastChatVisit', new Date().toISOString());
    });

     // Adiciona a classe 'active' ao item da lista correspondente
     document.querySelector(`.conversation-item[data-user-id="${userId}"]`)?.classList.add('active');


    // Configura listener para as mensagens DESTA conversa
    const conversationId = [currentUser.uid, userId].sort().join('_');
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc')); // Ordena por mais antiga primeiro

    unsubscribeFromMessages = onSnapshot(q, (snapshot) => {
        chatBody.innerHTML = ''; // Limpa mensagens antigas
        let lastMessageTimestampMillis = 0; // Guarda timestamp da última mensagem renderizada

        if (!snapshot.empty) {
            snapshot.forEach(doc => {
                const data = doc.data();
                renderMessage(data, currentUser.uid); // Chama renderMessage para cada mensagem
                // Atualiza o timestamp da última mensagem
                if (data.timestamp) lastMessageTimestampMillis = data.timestamp.toMillis();
            });
            // Guarda o timestamp da última mensagem como 'lida' no localStorage
            if (lastMessageTimestampMillis > 0) {
                 const currentStoredMillis = parseInt(localStorage.getItem(`lastRead_${conversationId}`) || '0');
                 // Só atualiza se o timestamp da última mensagem for maior que o guardado
                 if (lastMessageTimestampMillis > currentStoredMillis) {
                    localStorage.setItem(`lastRead_${conversationId}`, lastMessageTimestampMillis.toString());
                 }
            }
        } else {
             // Se não houver mensagens, marca a hora atual como lida
             localStorage.setItem(`lastRead_${conversationId}`, Date.now().toString());
        }

        chatBody.scrollTop = chatBody.scrollHeight; // Auto-scroll para o fim

        // Garante que o contador de não lidas para esta conversa seja 0 (caso tenha atualizado entretanto)
        if (conversationsState[userId]) {
            conversationsState[userId].unreadCount = 0;
            renderConversationList(); // Re-renderiza a lista para garantir que o contador sumiu
        }
    }, (error) => {
         console.error(`Erro no listener de mensagens para ${conversationId}:`, error);
         showToast("Erro ao carregar mensagens.", "error");
    });
}

// *** FUNÇÃO renderMessage MODIFICADA em public/js/direct.js ***
function renderMessage(data, currentUserId) {
    const messageDiv = document.createElement('div');
    const isSent = data.senderId === currentUserId;
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;

    let messageContentHTML = '';

    // Prioridade 1: Mídia carregada (imagem/vídeo) - SEM MUDANÇA AQUI
    if (data.mediaUrl) {
        messageContentHTML = data.mediaType?.startsWith('image/')
            ? `<img src="${data.mediaUrl}" alt="Imagem enviada" class="message-media">`
            : `<video controls src="${data.mediaUrl}" class="message-media"></video>`;
    }
    // Prioridade 2: Texto
    else if (data.text) {
        const text = data.text;
        // NOVA Regex: Encontra URLs que terminam em extensões de imagem comuns (incluindo GIF)
        const imageUrlRegex = /(\b(https?:\/\/|www\.)[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|](\.(gif|jpe?g|png|webp))\b)/ig;
        // Faz a correspondência com trim() para garantir que SÓ haja o URL
        const match = text.trim().match(imageUrlRegex);

        // Se o texto for APENAS um link de IMAGEM (qualquer tipo suportado)
        if (match && match[0] === text.trim()) {
            // Usa a classe message-media para consistência (ou pode criar message-image)
            messageContentHTML = `<img src="${match[0]}" alt="Imagem enviada" class="message-media">`;
        } else {
            // Se não for só uma imagem, sanitiza e aplica linkify (que já ignora imagens)
            const sanitizedText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            messageContentHTML = `<p>${linkifyText(sanitizedText)}</p>`; // linkifyText já ignora imagens
        }
    }
    // Se não houver nem mediaUrl nem text, messageContentHTML ficará vazio ''

    const timestamp = data.timestamp
        ? new Date(data.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : ''; // Hora formatada

    messageDiv.innerHTML = `
        <div class="message-content">
            ${messageContentHTML || '<p><em>Mensagem inválida ou vazia</em></p>'}
            <span class="message-time">${timestamp}</span>
        </div>`;
    chatBody.appendChild(messageDiv);
    // Auto-scroll já é feito no listener onSnapshot
}


async function sendMessage() {
    const inputMobile = document.getElementById('chat-message-input-mobile');
    const inputDesktop = document.getElementById('chat-message-input-desktop');
    let activeInput = null;

    // Determina qual input está visível (baseado no CSS display)
    if (inputMobile && window.getComputedStyle(inputMobile.parentElement).display !== 'none') {
        activeInput = inputMobile;
    } else if (inputDesktop && window.getComputedStyle(inputDesktop.parentElement).display !== 'none') {
        activeInput = inputDesktop;
    }

    if (!activeInput) {
        console.warn("Nenhum input de chat ativo encontrado.");
        return;
    }

    const text = activeInput.value.trim();
    if (text === '' || !auth.currentUser || !currentChatPartnerId) return; // Não envia msg vazia

    const conversationId = [auth.currentUser.uid, currentChatPartnerId].sort().join('_');
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');

    try {
        await addDoc(messagesRef, {
            text: text,
            senderId: auth.currentUser.uid,
            timestamp: serverTimestamp() // Usa timestamp do servidor
        });
        activeInput.value = ''; // Limpa o input
        activeInput.focus(); // Devolve o foco ao input
    } catch (error) {
        console.error("Erro ao enviar mensagem:", error);
        showToast("Houve um erro ao enviar sua mensagem.", "error");
    }
}

// --- INICIALIZAÇÃO E EVENTOS GLOBAIS ---
sendButtons.forEach(button => button.addEventListener('click', sendMessage));
chatInputs.forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { // Envia com Enter (não Shift+Enter)
            e.preventDefault(); // Evita nova linha
            sendMessage();
        }
    });
});
addMediaButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Lógica para adicionar mídia (ainda não implementada)
        showToast('Funcionalidade de upload de mídia ainda não implementada.', 'info');
        // const targetInputId = button.dataset.target;
        // const mediaInput = document.getElementById(targetInputId);
        // if (mediaInput) {
        //     mediaInput.click();
        //     mediaInput.onchange = async (event) => { /* ... Lógica de upload ... */ };
        // }
    });
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        await initializeConversations(user); // Carrega a lista de conversas
        // Verifica se há um UID na URL para abrir um chat diretamente
        const params = new URLSearchParams(window.location.search);
        const chatWithUid = params.get('uid');
        if (chatWithUid && chatWithUid !== currentChatPartnerId) {
             // Atraso pequeno para garantir que a lista de conversas renderizou
            setTimeout(() => openChatWithUser(chatWithUid), 150);
        }
        // Marca a visita ao chat ao carregar a página (para notificações)
        localStorage.setItem('lastChatVisit', new Date().toISOString());
        sessionStorage.removeItem('newChatMessage'); // Limpa notificação da sessão
    } else {
        // Limpa a UI se o user deslogar
        conversationListeners.forEach(unsubscribe => unsubscribe());
        conversationListeners = [];
        conversationsList.innerHTML = '<p class="conversation-item-placeholder">Faça login para ver suas conversas.</p>';
        chatPlaceholder.style.display = 'flex';
        chatHeader.style.display = 'none';
        document.getElementById('chat-input-box-desktop').style.display = 'none';
        document.getElementById('chat-input-box-mobile').style.display = 'none';
        currentChatPartnerId = null;
        if (unsubscribeFromMessages) unsubscribeFromMessages();
    }
});

// Guarda a hora ao sair da página (para notificações)
window.addEventListener('beforeunload', () => {
     localStorage.setItem('lastChatVisit', new Date().toISOString());
});