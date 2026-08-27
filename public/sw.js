// Service worker de Nospi: recibe las notificaciones push en la version web.
//
// A diferencia de la app, en el navegador el aviso lo entrega este archivo, que
// el navegador mantiene vivo aunque la pestana este cerrada. Por eso la
// notificacion llega igual que en el telefono.
//
// Importante: en iPhone esto SOLO funciona si la persona agrego Nospi a la
// pantalla de inicio ("Compartir -> Agregar a inicio"). Safari no permite
// notificaciones web de otra forma.

self.addEventListener('install', () => {
  // Empieza a funcionar de inmediato, sin esperar a que se cierren las
  // pestanas viejas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Nospi', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Nospi';
  const options = {
    body: payload.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    // Agrupa por conversacion: un chat que recibe varios mensajes seguidos
    // reemplaza su propio aviso en vez de apilar diez.
    tag: (payload.data && payload.data.conversation_id) || 'nospi',
    renotify: true,
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const target = data.conversation_id ? `/chat/${data.conversation_id}` : '/chats';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si Nospi ya esta abierto, se reutiliza esa ventana en vez de abrir otra.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
