import { auth, db, storage } from './firebase-config.js';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, query, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { isNicknameTaken, getUserProfile } from './auth.js';
import { containsForbiddenWords } from './profanity-filter.js';

// --- Função linkifyText Adicionada ---
/**
 * Converte URLs encontradas em um texto para links HTML clicáveis.
 * @param {string} inputText - O texto a ser processado.
 * @returns {string} O texto com URLs convertidas em tags <a>.
 */
function linkifyText(inputText) {
  if (!inputText) return '';
  const urlRegex = /(\b(https?:\/\/|www\.)[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
  return inputText.replace(urlRegex, function(url) {
    let href = url;
    if (!href.match(/^https?:\/\//i)) {
      href = 'http://' + href;
    }
    return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
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

const profileForm = document.getElementById('profile-form');
const nicknameInput = document.getElementById('nickname');
const bioTextarea = document.getElementById('bio');
const platformCheckboxes = document.querySelectorAll('input[id^="platform-"]');
const gamesCheckboxesContainer = document.getElementById('games-checkboxes');
const profileImagePreview = document.getElementById('profile-image-preview');
const profileImageInput = document.getElementById('profile-image-input');
const saveProfileButton = document.getElementById('save-profile-button');
const imageUploadLabel = document.querySelector('label[for="profile-image-input"]');
const nicknameError = document.getElementById('nickname-error');
const profileContentEdit = document.getElementById('profile-content-edit');
const profileDetailsEdit = document.getElementById('profile-details-edit');
const messageIconContainer = document.getElementById('message-icon-container');
const avatarContainer = document.querySelector('.profile-avatar-edit');
const avatarModal = document.getElementById('avatar-modal');
const closeAvatarModalBtn = document.getElementById('close-avatar-modal');
const avatarSelectionGrid = document.getElementById('avatar-selection-grid');
const followingStatDiv = document.getElementById('following-stat'); // Mantido para adicionar listener
const followersStatDiv = document.getElementById('followers-stat'); // Mantido para adicionar listener
// REMOVIDO: const followingCountSpan = document.getElementById('following-count');
// REMOVIDO: const followersCountSpan = document.getElementById('followers-count');
const followListModal = document.getElementById('follow-list-modal');
const closeFollowListModalBtn = document.getElementById('close-follow-list-modal');
const followListTitle = document.getElementById('follow-list-title');
const followListContainer = document.getElementById('follow-list-container');

// --- FUNÇÃO CORRIGIDA ---
async function loadFollowerStats(userId) {
    if (!userId) return;

    // *** INÍCIO DA CORREÇÃO ***
    // Seleciona os spans AQUI DENTRO, garantindo que pegamos os elementos corretos
    const followingCountSpan = document.getElementById('following-count');
    const followersCountSpan = document.getElementById('followers-count');

    // Verifica se os elementos foram encontrados antes de tentar usá-los
    if (!followingCountSpan || !followersCountSpan) {
        console.error("Elementos de contagem de seguidores/seguindo não encontrados no DOM.");
        return; // Sai da função se não encontrar os elementos
    }
    // *** FIM DA CORREÇÃO ***

    try {
        // Query para quem o usuário SEGUE (ele está no campo 'from')
        const followingQuery = query(collection(db, "pedidosAmizade"), where("from", "==", userId), where("status", "==", "aceito"));
        const followingSnapshot = await getDocs(followingQuery);
        // Atualiza o texto do span de 'seguindo'
        followingCountSpan.textContent = followingSnapshot.size; // Usa .size para obter a contagem

        // Query para quem SEGUE o usuário (ele está no campo 'to')
        const followersQuery = query(collection(db, "pedidosAmizade"), where("to", "==", userId), where("status", "==", "aceito"));
        const followersSnapshot = await getDocs(followersQuery);
        // Atualiza o texto do span de 'seguidores'
        followersCountSpan.textContent = followersSnapshot.size; // Usa .size para obter a contagem

    } catch (error) {
        console.error("Erro ao carregar estatísticas de seguidores:", error);
        // Pode ser útil resetar os contadores ou mostrar 'Erro' em caso de falha
        followingCountSpan.textContent = '-';
        followersCountSpan.textContent = '-';
    }
}
// --- FIM DA FUNÇÃO CORRIGIDA ---


async function openFollowListModal(type, userId) {
    followListTitle.textContent = type === 'following' ? 'Seguindo' : 'Seguidores';
    followListContainer.innerHTML = '<p>A carregar...</p>';
    followListModal.style.display = 'flex';
    try {
        const fieldToQuery = type === 'following' ? 'from' : 'to';
        const fieldToGet = type === 'following' ? 'to' : 'from';
        const q = query(collection(db, "pedidosAmizade"), where(fieldToQuery, "==", userId), where("status", "==", "aceito"));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            followListContainer.innerHTML = `<p>Nenhum utilizador encontrado.</p>`;
            return;
        }
        followListContainer.innerHTML = '';
        const userProfilesPromises = snapshot.docs.map(doc => getUserProfile(doc.data()[fieldToGet]));
        const userProfiles = await Promise.all(userProfilesPromises);
        userProfiles.forEach(profile => {
            if (profile) {
                const itemLink = document.createElement('a');
                itemLink.href = `profile.html?uid=${profile.uid}`;
                itemLink.className = 'follow-list-item';
                itemLink.innerHTML = `
                    <div class="follow-user-info">
                        <img src="${profile.photoURL || '/imagens/avatar_padrao.png'}" alt="Avatar de ${profile.nickname}">
                        <span>${profile.nickname}</span>
                    </div>
                `;
                followListContainer.appendChild(itemLink);
            }
        });
    } catch (error) {
        console.error(`Erro ao carregar lista de ${type}:`, error);
        followListContainer.innerHTML = '<p>Ocorreu um erro ao carregar a lista.</p>';
    }
}

async function loadGamesForSelection() {
    try {
        const gamesCollection = collection(db, 'games');
        const snapshot = await getDocs(gamesCollection);
        gamesCheckboxesContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const game = doc.data();
            const gameId = doc.id;
            const checkboxDiv = document.createElement('div');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `game-${gameId}`;
            checkbox.value = gameId;
            const label = document.createElement('label');
            label.htmlFor = `game-${gameId}`;
            label.textContent = game.nome;
            checkboxDiv.appendChild(checkbox);
            checkboxDiv.appendChild(label);
            gamesCheckboxesContainer.appendChild(checkboxDiv);
        });
    } catch (error) {
        console.error("Erro ao carregar jogos:", error);
        gamesCheckboxesContainer.innerHTML = '<p>Erro ao carregar jogos.</p>';
    }
}

async function loadProfileData(userId, currentUserId) {
    if (!userId) return;
    const isOwnProfile = userId === currentUserId;
    try {
        const docRef = doc(db, 'users', userId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            nicknameInput.value = data.nickname || data.displayName || '';
            bioTextarea.value = data.bio || '';
            profileImagePreview.src = data.photoURL || '/imagens/avatar_padrao.png';
            await loadFollowerStats(userId); // Chama a função corrigida
            if (data.plataformas) {
                platformCheckboxes.forEach(cb => {
                    cb.checked = data.plataformas.includes(cb.value);
                });
            }
            if (data.jogosFavoritos) {
                const gameCheckboxes = gamesCheckboxesContainer.querySelectorAll('input[type="checkbox"]');
                gameCheckboxes.forEach(cb => {
                    cb.checked = data.jogosFavoritos.includes(cb.value);
                });
            }
            if (!isOwnProfile) {
                profileForm.classList.add('view-only');
                Array.from(profileForm.elements).forEach(element => element.disabled = true);
                if (profileDetailsEdit) profileDetailsEdit.style.display = 'none';
                if (profileContentEdit) profileContentEdit.style.display = 'none';
                if (saveProfileButton) saveProfileButton.style.display = 'none';
                if (imageUploadLabel) imageUploadLabel.style.display = 'none';
                if (messageIconContainer) {
                    messageIconContainer.innerHTML = `<button id="send-message-btn" title="Enviar Mensagem"><i class="fas fa-envelope"></i></button>`;
                    document.getElementById('send-message-btn').addEventListener('click', () => {
                        window.location.href = `direct.html?uid=${userId}`;
                    });
                }
                const profileViewContainer = document.createElement('div');
                profileViewContainer.className = 'profile-view-container';
                // --- Alteração para linkify ---
                const bioText = data.bio || 'Sem biografia.';
                const sanitizedBio = bioText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const linkifiedBio = linkifyText(sanitizedBio).replace(/\n/g, '<br>');
                profileViewContainer.innerHTML = `<h2 class="friend-nickname">${data.nickname || data.displayName || 'Nome não definido'}</h2><p class="friend-bio">${linkifiedBio}</p>`;
                // --- Fim da alteração ---
                const profileHeaderEdit = document.querySelector('.profile-header-edit');
                // Evita adicionar o container de visualização múltiplas vezes
                if (profileHeaderEdit && !profileHeaderEdit.querySelector('.profile-view-container')) {
                    profileHeaderEdit.appendChild(profileViewContainer);
                }
                document.title = `${data.nickname || data.displayName || 'Usuário'} - Perfil`;
            } else {
                 // Garante que o modo view-only seja removido se for o próprio perfil
                 profileForm.classList.remove('view-only');
                 if (profileDetailsEdit) profileDetailsEdit.style.display = 'flex';
                 if (profileContentEdit) profileContentEdit.style.display = 'block';
                 if (saveProfileButton) saveProfileButton.style.display = 'block';
                 if (imageUploadLabel) imageUploadLabel.style.display = 'inline-block';
                 if (messageIconContainer) messageIconContainer.innerHTML = '';
                 const existingViewContainer = document.querySelector('.profile-view-container');
                 if(existingViewContainer) existingViewContainer.remove();
                 document.title = "Meu Perfil - Level Up";
            }
        } else {
            if (userId !== currentUserId) {
                showToast("Perfil não encontrado.", "error");
                window.location.href = 'home.html';
            }
        }
    } catch (error) {
        console.error("Erro ao carregar dados do perfil:", error);
    }
}


async function loadAvatarsForSelection() {
    avatarSelectionGrid.innerHTML = '<p>Carregando avatares...</p>';
    try {
        const avatarCollection = collection(db, 'avatar');
        const snapshot = await getDocs(avatarCollection);
        avatarSelectionGrid.innerHTML = '';
        if (snapshot.empty) {
            avatarSelectionGrid.innerHTML = '<p>Nenhum avatar encontrado.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const avatarData = doc.data();
            const imageUrl = avatarData.urlDoAvatar;
            if (imageUrl) {
                const img = document.createElement('img');
                img.src = imageUrl;
                img.dataset.url = imageUrl;
                img.alt = avatarData.Nome || 'Avatar';
                img.title = avatarData.Nome || 'Avatar';
                avatarSelectionGrid.appendChild(img);
            }
        });
    } catch (error) {
        console.error("Erro ao carregar avatares:", error);
        avatarSelectionGrid.innerHTML = '<p>Erro ao carregar avatares.</p>';
    }
}

async function handleAvatarSelection(event) {
    if (event.target.tagName !== 'IMG') return;
    const newImageUrl = event.target.dataset.url;
    const user = auth.currentUser;
    if (!user || !newImageUrl) return;
    try {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, { photoURL: newImageUrl }, { merge: true });
        profileImagePreview.src = newImageUrl;
        avatarModal.style.display = 'none';
        showToast("Ícone de perfil atualizado com sucesso!", "success");
    } catch (error) {
        console.error("Erro ao atualizar o ícone:", error);
        showToast("Ocorreu um erro ao atualizar seu ícone.", "error");
    }
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    const user = auth.currentUser;
    if (!user || !file) return;
    const storageRef = ref(storage, `profile-pictures/${user.uid}`);
    try {
        showToast("Enviando imagem...", "info");
        profileImagePreview.classList.add("loading");
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { photoURL: downloadURL });
        profileImagePreview.src = downloadURL;
        profileImagePreview.classList.remove("loading");
        showToast("Foto de perfil atualizada com sucesso!", "success");
    } catch (error) {
        console.error("Erro no upload da imagem:", error);
        showToast("Ocorreu um erro ao enviar a imagem.", "error");
        profileImagePreview.classList.remove("loading");
    }
}

profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    const newNickname = nicknameInput.value;
    const newBio = bioTextarea.value;
    if (containsForbiddenWords(newNickname) || containsForbiddenWords(newBio)) {
        showToast("Seu perfil contém palavras não permitidas. Por favor, remova-as.", "error");
        return;
    }
    nicknameError.style.display = 'none';
    showLoading(saveProfileButton);
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        const currentNickname = userDocSnap.exists() ? (userDocSnap.data().nickname || userDocSnap.data().displayName || '') : '';
        if (newNickname.toLowerCase() !== currentNickname.toLowerCase()) {
            const nicknameTaken = await isNicknameTaken(newNickname);
            if (nicknameTaken) {
                nicknameError.textContent = 'Este nome já está em uso.';
                nicknameError.style.display = 'block';
                hideLoading(saveProfileButton);
                return;
            }
            if (currentNickname) {
                 try {
                     await deleteDoc(doc(db, "nicknames", currentNickname.toLowerCase()));
                 } catch (nickError) {
                      console.warn("Could not delete old nickname reference:", nickError);
                 }
            }
            await setDoc(doc(db, "nicknames", newNickname.toLowerCase()), { uid: user.uid });
        }
        const selectedPlatforms = Array.from(platformCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        const selectedGames = Array.from(gamesCheckboxesContainer.querySelectorAll('input:checked')).map(cb => cb.value);
        const profileData = {
            displayName: newNickname,
            nickname: newNickname,
            bio: newBio,
            plataformas: selectedPlatforms,
            jogosFavoritos: selectedGames
        };
        await setDoc(userDocRef, profileData, { merge: true });
        hideLoading(saveProfileButton);
        showToast("Perfil salvo com sucesso!", "success");
    } catch (error) {
        console.error("Erro ao salvar perfil:", error);
        showToast("Erro ao salvar o perfil.", "error");
        hideLoading(saveProfileButton);
    }
});

profileImageInput.addEventListener('change', handleImageUpload);

if (avatarContainer) {
    avatarContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'LABEL' || e.target.tagName === 'INPUT') { return; }
        if (!profileForm.classList.contains('view-only')) {
            loadAvatarsForSelection();
            avatarModal.style.display = 'flex';
        }
    });
}
if (closeAvatarModalBtn) { closeAvatarModalBtn.addEventListener('click', () => avatarModal.style.display = 'none'); }
if (avatarModal) { avatarModal.addEventListener('click', (e) => { if (e.target === avatarModal) avatarModal.style.display = 'none'; }); }
if (avatarSelectionGrid) { avatarSelectionGrid.addEventListener('click', handleAvatarSelection); }
if (closeFollowListModalBtn) { closeFollowListModalBtn.addEventListener('click', () => followListModal.style.display = 'none'); }
if (followListModal) { followListModal.addEventListener('click', (e) => { if (e.target === followListModal) followListModal.style.display = 'none'; }); }

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const params = new URLSearchParams(window.location.search);
        const profileUid = params.get('uid');
        const userIdToLoad = profileUid || user.uid;

        // Limpa listeners antigos antes de adicionar novos
        followingStatDiv.replaceWith(followingStatDiv.cloneNode(true));
        followersStatDiv.replaceWith(followersStatDiv.cloneNode(true));
        // Re-seleciona os elementos após clonar
        const newFollowingStatDiv = document.getElementById('following-stat');
        const newFollowersStatDiv = document.getElementById('followers-stat');
        if(newFollowingStatDiv) newFollowingStatDiv.addEventListener('click', (event) => { event.stopPropagation(); openFollowListModal('following', userIdToLoad) });
        if(newFollowersStatDiv) newFollowersStatDiv.addEventListener('click', (event) => { event.stopPropagation(); openFollowListModal('followers', userIdToLoad) });

        await loadGamesForSelection();
        await loadProfileData(userIdToLoad, user.uid);
    } else {
        showToast("Você precisa estar logado para ver perfis.", "error");
        window.location.href = 'auth.html';
    }
});

function showLoading(button) {
    button.disabled = true;
    button.dataset.originalText = button.textContent; // Salva o texto original
    const loader = document.createElement('div');
    loader.className = 'loader';
    button.textContent = 'Salvando '; // Texto enquanto carrega
    button.appendChild(loader);
}

function hideLoading(button) {
    button.disabled = false;
    const loader = button.querySelector('.loader');
    if (loader) loader.remove();
    button.textContent = button.dataset.originalText || 'Salvar Perfil'; // Restaura o texto original
}