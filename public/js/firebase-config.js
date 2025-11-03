// Importa as funções que você precisa dos SDKs que você precisa
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

// A configuração do Firebase do seu aplicativo da web
// Esta configuração aponta DIRETAMENTE para o seu projeto na nuvem.
const firebaseConfig = {
  apiKey: "AIzaSyDANITBccGRC5VOmklrxgQBejX1VwQKrDY",
  authDomain: "levelup-squad-app.firebaseapp.com",
  projectId: "levelup-squad-app",
  storageBucket: "levelup-squad-app.firebasestorage.app",
  messagingSenderId: "202795334727",
  appId: "1:202795334727:web:f1dc02e3b48211e2a90562",
  measurementId: "G-0H63VWYMC8"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
// Inicializa o Analytics
const analytics = getAnalytics(app);

// Pega as instâncias dos serviços que vamos usar
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Exporta as instâncias para serem usadas em outros arquivos do projeto
export { auth, db, storage };