/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Precache assets injected at build time by vite-plugin-pwa (injectManifest).
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

interface PushPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
}

// ---- Push handler ---------------------------------------------------------
self.addEventListener("push", (event) => {
  let data: PushPayload = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() ?? "" };
  }

  const title = data.title || "EzboAI";
  const body = data.body || "Apnar reminder";
  const options: NotificationOptions = {
    body,
    tag: data.tag,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    requireInteraction: data.requireInteraction ?? false,
    data: { url: data.url, ...(data.data ?? {}) },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ---- Click → focus / open the app -----------------------------------------
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data as { url?: string } | undefined)?.url || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // If we already have a tab for the app, focus it (and navigate).
      for (const client of all) {
        if ("focus" in client) {
          await (client as WindowClient).focus();
          if ("navigate" in client && target) {
            await (client as WindowClient).navigate(target).catch(() => undefined);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
