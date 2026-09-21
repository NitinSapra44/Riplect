self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Riplek', body: event.data.text() };
  }

  const title = payload.title || 'Riplek';
  const options = {
    body: payload.body || '',
    icon: 'https://psrccktleltdthwzdtfx.supabase.co/storage/v1/object/public/public_assets/Branding/Riplect%20Logo%20Horizontal%20-%20Red.png',
    badge: 'https://psrccktleltdthwzdtfx.supabase.co/storage/v1/object/public/public_assets/Branding/Riplect%20Logo%20Horizontal%20-%20Red.png',
    tag: payload.tag || 'riplek-notification',
    data: payload.data || {},
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
