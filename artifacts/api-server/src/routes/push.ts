import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { publicVapidKey } from "../services/pushService";

const router: IRouter = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

router.get("/vapid-public-key", (_req, res) => {
  const key = publicVapidKey();
  if (!key) {
    res.status(503).json({ error: "Push not configured." });
    return;
  }
  res.json({ key });
});

router.post("/subscribe", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { endpoint, keys, userAgent } = parsed.data;
  try {
    // Upsert by endpoint — same browser re-subscribing should not duplicate.
    await db
      .insert(pushSubscriptionsTable)
      .values({
        endpoint,
        keys,
        userAgent: userAgent?.slice(0, 500) || "",
      })
      .onConflictDoUpdate({
        target: pushSubscriptionsTable.endpoint,
        set: { keys, userAgent: userAgent?.slice(0, 500) || "", lastSeenAt: sql`now()` },
      });
    res.status(201).json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "push subscribe failed");
    res.status(500).json({ error: "Subscribe failed" });
  }
});

router.delete("/subscribe", async (req, res) => {
  const endpoint =
    typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
  if (!endpoint) {
    res.status(400).json({ error: "endpoint required" });
    return;
  }
  try {
    await db
      .delete(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, endpoint));
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "push unsubscribe failed");
    res.status(500).json({ error: "Unsubscribe failed" });
  }
});

export default router;
