/**
 * Web Push subscription helpers. Pure browser code — talks to the backend
 * via /api/push and manages the SW PushManager subscription lifecycle.
 */
import { baseUrl } from "@/lib/api";

/** Convert a base64url-encoded VAPID key to the Uint8Array PushManager wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function permissionState(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  if (!reg) return null;
  return (await reg.pushManager.getSubscription()) ?? null;
}

async function fetchVapidKey(): Promise<string> {
  // Prefer build-time injection; fall back to runtime endpoint.
  const fromEnv = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (fromEnv) return fromEnv;
  const res = await fetch(baseUrl("/push/vapid-public-key"));
  if (!res.ok) throw new Error("Push not configured on server.");
  const j = (await res.json()) as { key: string };
  return j.key;
}

export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    throw new Error("Browser e push notification support nai.");
  }
  const reg = await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    throw new Error("Notification permission deni.");
  }
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const vapid = await fetchVapidKey();
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    });
  }
  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("Subscription missing keys.");
  }
  const res = await fetch(baseUrl("/push/subscribe"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: navigator.userAgent,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Subscribe failed (${res.status})`);
  }
}

export async function disablePush(): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  await fetch(baseUrl("/push/subscribe"), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
}
