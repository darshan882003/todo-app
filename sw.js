self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const action = e.action;
  const data = e.notification.data || {};

  if (action && data.goalId && data.dayKey) {
    e.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        if (clients.length) {
          return clients[0].postMessage({
            type: 'notification-action',
            action,
            goalId: data.goalId,
            dayKey: data.dayKey
          }).then(() => clients[0].focus());
        } else {
          return self.clients.openWindow('./').then(client => {
            if (client) {
              return new Promise(resolve => {
                const channel = new MessageChannel();
                channel.port1.onmessage = () => resolve();
                client.postMessage({
                  type: 'notification-action',
                  action,
                  goalId: data.goalId,
                  dayKey: data.dayKey
                }, [channel.port2]);
              });
            }
          });
        }
      })
    );
    return;
  }

  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(list =>
      list.length ? list[0].focus() : self.clients.openWindow('./')
    )
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'schedule-notification') {
    const { title, body, options, delay } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, options);
    }, delay);
  }
});