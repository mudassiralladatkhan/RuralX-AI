const CACHE_NAME = 'ruralx-cache-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/app',
    '/auth',
    '/scanning',
    '/static/style.css',
    '/static/main.js',
    '/static/auth.css',
    '/static/scanning.css',
    '/static/scanning.js',
    '/static/supabase-client.js',
    '/static/manifest.json',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'
];

// Install event: cache all static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).catch(err => console.warn('Cache add error:', err))
    );
});

// Fetch event: Network first, fallback to cache for offline capabilities
self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Return dynamic network response but also silently update the cache
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                }
                return response;
            })
            .catch(() => {
                // If network fails (offline), serve from cache
                return caches.match(event.request);
            })
    );
});

// Activate event: clear old caches if versions change
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
