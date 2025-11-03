// O nome do cache foi alterado para v9 para forçar a atualização
const CACHE_NAME = 'levelup-cache-v19';
const urlsToCache = [
  // Páginas HTML
  '/',
  '/index.html',
  '/auth.html',
  '/friends.html',
  '/home.html',
  '/profile.html',
  '/search.html',
  '/notifications.html',
  '/admin.html',
  '/trocar-conta.html',
  '/comunidade.html', 
  '/game-posts.html',
  '/settings.html', // Nova página adicionada

  // Folhas de Estilo (CSS)
  '/css/style.css',
  '/css/background-video.css',
  '/css/friends.css',
  '/css/home.css',
  '/css/profile.css',
  '/css/post.css',
  '/css/trocar-conta.css',
  '/css/comunidade.css',
  '/css/settings.css', // Novo CSS adicionado

  // Scripts (JS)
  '/js/main.js',
  '/js/auth.js',
  '/js/auth-ui.js',
  '/js/friends.js',
  '/js/home.js',
  '/js/profile.js',
  '/js/search.js',
  '/js/notifications.js',
  '/js/admin.js',
  '/js/firebase-config.js',
  '/js/post.js',
  '/js/trocar-conta.js',
  '/js/comunidade.js', 
  '/js/game-posts.js',
  '/js/settings.js', // Novo script adicionado

  // --- IMAGENS PARA CACHE ---
  '/imagens/capa.jpg',
  '/imagens/avatar_padrao.png',
  '/imagens/carrossel/jogo1.jpg',
  '/imagens/carrossel/jogo2.jpg',
  '/imagens/carrossel/jogo3.jpg'
];

// ... (o resto do ficheiro permanece igual)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aberto, salvando arquivos essenciais.');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});