import { signupUser, loginUser } from './auth.js';
import { auth } from './firebase-config.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return; // Adicionado verificação
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


document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const showSignup = document.getElementById('show-signup');
    const showLogin = document.getElementById('show-login');
    const authTitle = document.getElementById('auth-title');
    const loginEmailInput = document.getElementById('login-email');
    const forgotPasswordLink = document.querySelector('.forgot-password a');
    const forgotPasswordModal = document.getElementById('forgot-password-modal');
    const closeModal = forgotPasswordModal ? forgotPasswordModal.querySelector('.close-button') : null; // Verifica se modal existe
    const resetPasswordButton = document.getElementById('reset-password-button');
    const resetEmailInput = document.getElementById('reset-email');
    const resetError = document.getElementById('reset-error');
    const togglePasswordElements = document.querySelectorAll('.toggle-password');

    // Pré-preenche e-mail se veio da troca de conta
    const prefillEmail = sessionStorage.getItem('loginEmail');
    if (prefillEmail && loginEmailInput) {
        loginEmailInput.value = prefillEmail;
        sessionStorage.removeItem('loginEmail');
    }

    // --- Lógica Toggle Password ---
    togglePasswordElements.forEach(toggleElement => {
        toggleElement.addEventListener('click', () => {
            const passwordInput = toggleElement.previousElementSibling;
            if (passwordInput && passwordInput.type === 'password') {
                passwordInput.type = 'text';
                toggleElement.innerHTML = '&#x1F441;'; // Olho aberto
            } else if (passwordInput) {
                passwordInput.type = 'password';
                toggleElement.innerHTML = '&#x1F576;'; // Olho fechado/espião
            }
        });
    });

    // --- Lógica Show/Hide Forms ---
     if (showSignup && showLogin && authTitle && loginForm && signupForm) {
        showSignup.addEventListener('click', (e) => {
            e.preventDefault();
            authTitle.textContent = 'Crie sua conta';
            loginForm.classList.add('form-hidden');
            setTimeout(() => {
                loginForm.style.display = 'none';
                signupForm.style.display = 'flex'; // Usar 'flex' se for o display padrão
                setTimeout(() => { signupForm.classList.remove('form-hidden'); }, 10);
            }, 500); // Tempo da transição CSS
        });

        showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            authTitle.textContent = 'Bem-vindo de volta!';
            signupForm.classList.add('form-hidden');
            setTimeout(() => {
                signupForm.style.display = 'none';
                loginForm.style.display = 'flex'; // Usar 'flex' se for o display padrão
                setTimeout(() => { loginForm.classList.remove('form-hidden'); }, 10);
            }, 500); // Tempo da transição CSS
        });
     } else {
         console.warn("Elementos de troca de formulário não encontrados.");
     }

    // --- Lógica Forgot Password Modal ---
     if (forgotPasswordLink && forgotPasswordModal && closeModal && resetPasswordButton && resetEmailInput && resetError) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            resetEmailInput.value = loginEmailInput?.value || ''; // Pré-preenche se possível
            resetError.textContent = ''; // Limpa erros antigos
            forgotPasswordModal.style.display = 'flex';
        });

        closeModal.addEventListener('click', () => {
            forgotPasswordModal.style.display = 'none';
        });

        window.addEventListener('click', (e) => {
            if (e.target == forgotPasswordModal) {
                forgotPasswordModal.style.display = 'none';
            }
        });

        resetPasswordButton.addEventListener('click', () => {
            const email = resetEmailInput.value;
            resetError.textContent = ''; // Limpa erro anterior
            if (email) {
                showLoading(resetPasswordButton, 'Enviando...');
                sendPasswordResetEmail(auth, email)
                    .then(() => {
                        resetError.textContent = 'E-mail de redefinição enviado!';
                        resetError.style.color = 'green';
                        resetEmailInput.value = '';
                        setTimeout(() => { forgotPasswordModal.style.display = 'none'; resetError.textContent = ''; }, 3500); // Fecha após sucesso
                    })
                    .catch((error) => {
                        switch (error.code) {
                            case 'auth/invalid-email': resetError.textContent = 'Formato de e-mail inválido.'; break;
                            case 'auth/user-not-found': resetError.textContent = 'Não existe conta com este e-mail.'; break;
                            default: resetError.textContent = 'Erro ao enviar. Tente novamente.';
                        }
                        console.error("Password reset error:", error);
                        resetError.style.color = 'var(--cor-erro)';
                    })
                    .finally(() => {
                         hideLoading(resetPasswordButton, 'Enviar');
                    });
            } else {
                resetError.textContent = 'Por favor, insira seu e-mail.';
                resetError.style.color = 'var(--cor-erro)';
            }
        });
     } else {
          console.warn("Elementos do modal 'Esqueci senha' não encontrados.");
     }

    // --- ATUALIZAÇÃO: Login Form Submit Handler ---
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const loginError = document.getElementById('login-error');
            const loginButton = loginForm.querySelector('button');

            loginError.textContent = '';
            showLoading(loginButton, 'Entrando...');

            loginUser(email, password)
                .then(userCredential => {
                    console.log('Usuário logado!', userCredential.user);
                    const params = new URLSearchParams(window.location.search);
                    const redirectUrl = params.get('redirect');
                    if (redirectUrl) {
                        try {
                            const decodedUrl = decodeURIComponent(redirectUrl);
                            console.log("Redirecting to:", decodedUrl);
                            window.location.href = decodedUrl;
                        } catch (e) { console.error("Error decoding URL:", e); window.location.href = 'home.html'; }
                    } else {
                        console.log("No redirect, going home.");
                        window.location.href = 'home.html';
                    }
                })
                .catch(error => {
                    switch (error.code) {
                        case 'auth/user-not-found':
                        case 'auth/wrong-password':
                        case 'auth/invalid-credential':
                            loginError.textContent = 'E-mail ou senha inválidos.'; break;
                        case 'auth/invalid-email': loginError.textContent = 'Formato de e-mail inválido.'; break;
                        default: loginError.textContent = 'Erro ao fazer login.';
                    }
                    console.error("Login failed:", error);
                })
                .finally(() => {
                    hideLoading(loginButton, 'Entrar');
                });
        });
    } else {
         console.warn("Formulário de login não encontrado.");
    }

    // --- ATUALIZAÇÃO: Signup Form Submit Handler ---
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            const nickname = document.getElementById('signup-nickname').value;
            const signupError = document.getElementById('signup-error');
            const signupButton = signupForm.querySelector('button');

            signupError.textContent = '';
            showLoading(signupButton, 'Cadastrando...');

            signupUser(email, password, nickname)
                .then(userCredential => {
                    console.log('Usuário cadastrado!', userCredential.user);
                    const params = new URLSearchParams(window.location.search);
                    const redirectUrl = params.get('redirect');
                    if (redirectUrl) {
                        try {
                            const decodedUrl = decodeURIComponent(redirectUrl);
                            console.log("Redirecting after signup to:", decodedUrl);
                            window.location.href = decodedUrl;
                        } catch (e) { console.error("Error decoding URL:", e); window.location.href = 'home.html'; }
                    } else {
                        console.log("No redirect after signup, going home.");
                        window.location.href = 'home.html';
                    }
                })
                .catch(error => {
                     switch (error.code) {
                         case 'auth/email-already-in-use': signupError.textContent = 'Este e-mail já está em uso.'; break;
                         case 'auth/invalid-email': signupError.textContent = 'Formato de e-mail inválido.'; break;
                         case 'auth/weak-password': signupError.textContent = 'Senha deve ter pelo menos 6 caracteres.'; break;
                         default: signupError.textContent = error.message || 'Erro ao cadastrar.'; // Usa msg do auth.js se houver
                     }
                    console.error("Signup failed:", error);
                })
                .finally(() => {
                    hideLoading(signupButton, 'Cadastrar');
                });
        });
    } else {
         console.warn("Formulário de cadastro não encontrado.");
    }

    // --- Funções showLoading/hideLoading ---
    function showLoading(button, loadingText = 'Aguarde...') {
        if (!button) return;
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.innerHTML = '';
        const loader = document.createElement('div');
        loader.className = 'loader';
        const textSpan = document.createElement('span');
        textSpan.textContent = loadingText;
        textSpan.style.marginLeft = '8px';
        button.appendChild(loader);
        button.appendChild(textSpan);
    }

    function hideLoading(button, originalText = null) {
        if (!button) return;
        button.disabled = false;
        const loader = button.querySelector('.loader');
        const textSpan = button.querySelector('span');
        if (loader) loader.remove();
        if (textSpan) textSpan.remove();
        button.textContent = originalText || button.dataset.originalText || 'Submit';
    }
});