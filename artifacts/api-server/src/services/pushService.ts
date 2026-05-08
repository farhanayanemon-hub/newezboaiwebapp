import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, pushSubscriptionsTable, type PushSub } from "@workspace/db";
import { logger } from "../lib/logger";

let configured = false;

/** Lazily configure web-push with the env-supplied VAPID keys. We keep this
 *  cold so unit tests / boot can survive without keys; a missing key just
 *  means push notifications no-op (logged once). */
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@ezboai.com";
  if (!pub || !priv) {
    logger.warn("Push disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing");
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Stable tag for de-duping repeats of the same reminder. */
  tag?: string;
  /** URL to open on notification click. */
  url?: string;
  /** Arbitrary data echoed to the SW. */
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
}

export interface PushSendResult {
  total: number;
  delivered: number;
  removedStale: number;
  errors: number;
}

/** Sends `payload` to every stored subscription. Stale subscriptions
 *  (404/410) are removed atomically as we discover them. */
export async function sendPushToAll(payload: PushPayload): Promise<PushSendResult> {
  if (!ensureConfigured()) {
    return { total: 0, delivered: 0, removedStale: 0, errors: 0 };
  }
  const subs = await db.select().from(pushSubscriptionsTable);
  let delivered = 0;
  let removedStale = 0;
  let errors = 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    url: payload.url,
    requireInteraction: payload.requireInteraction ?? false,
    data: payload.data ?? {},
  });

  await Promise.all(
    subs.map(async (sub: PushSub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          body,
          { TTL: 60 * 60 * 24 },
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await db
            .delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.id, sub.id))
            .catch(() => undefined);
          removedStale++;
        } else {
          errors++;
          logger.warn(
            { err, endpoint: sub.endpoint.slice(0, 60) },
            "push send failed",
          );
        }
      }
    }),
  );

  return { total: subs.length, delivered, removedStale, errors };
}

export function publicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}
