/* Zenko Plads — Web Push only. No fetch cache. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Zenko Plads", body: "", url: "/", tag: "zenko" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try {
      data.body = event.data ? event.data.text() : "";
    } catch {
      /* */
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Zenko Plads", {
      body: data.body || "",
      data: { url: data.url || "/" },
      tag: data.tag || data.kind || "zenko",
      icon: "/icons/icon-512.png",
      badge: "/icons/apple-touch-icon.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate?.(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
