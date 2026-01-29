// Open sw.js and change the top line:
const CACHE_NAME = 'attendance-app-v65'; // <--- Increment this number (e.g., 64 -> 65)

// Keep the rest of the file exactly the same
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './calendar_style.css',
    './app.js?v=65', // <--- Update this query parameter too
    './manifest.json',
    './Attendance.png',
    'https://unpkg.com/lucide@0.469.0',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );

});
