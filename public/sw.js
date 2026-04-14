// Service Worker for Push Notifications — DulceSur

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const showNotif = async () => {
    let data;
    try {
      data = event.data.json();
    } catch {
      try {
        const buf = await event.data.arrayBuffer();
        const raw = new TextDecoder("utf-8").decode(buf);
        data = JSON.parse(raw);
      } catch {
        data = { title: "DulceSur", body: event.data.text() };
      }
    }

    const options = {
      body: data.body || "Nueva notificacion",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "notif-" + Date.now(),
      vibrate: [200, 100, 200],
      data: {
        url: data.url || "/",
      },
    };

    await self.registration.showNotification(data.title || "DulceSur", options);
  };

  event.waitUntil(showNotif());
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
