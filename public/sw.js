// Service Worker for Push Notifications — DulceSur

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    // Decode as UTF-8 explicitly to preserve accented characters
    const raw = new TextDecoder("utf-8").decode(event.data.arrayBuffer());
    data = JSON.parse(raw);
  } catch {
    try { data = event.data.json(); } catch { data = { title: "DulceSur", body: event.data.text() }; }
  }

  const options = {
    body: data.body || "Nueva notificacion",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "notif-" + Date.now(),
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(data.title || "DulceSur", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab/window if open
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});
