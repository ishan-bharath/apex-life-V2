/**
 * sw.js - Apex Life V2 Service Worker
 */

const CACHE_NAME = 'apex-v2-public-v1';
const ASSETS = [
    './',
    './index.html',
    './app.js',
    './db.js',
    './integrations.js',
    './manifest.json',
    'https://unpkg.com/dexie/dist/dexie.js',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@500&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

// Notifications Logic
self.addEventListener('push', (event) => {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
        body: data.body,
        icon: 'https://raw.githubusercontent.com/ishan-bharath/apex-life/main/public/icon-192.png'
    });
});
