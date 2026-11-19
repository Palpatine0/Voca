// Voca review reminders. The lock screen never displays saved vocabulary.
self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('Time for a Voca review', {
    body: 'You have words ready to practice.',
    icon: '/icons/icon-192.png',
    tag: 'voca-review'
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL('/review', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url === url) return client.focus();
    }
    return self.clients.openWindow(url);
  })());
});
