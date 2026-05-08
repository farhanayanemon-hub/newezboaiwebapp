import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  checkAdminPassword,
  createAdminSession,
  destroyAdminSession,
  isAuthenticated,
  loginRateLimit,
} from "../../middleware/adminAuth";

const router: IRouter = Router();

const loginSchema = z.object({ password: z.string().min(1).max(256) });

router.post("/login", loginRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (!checkAdminPassword(parsed.data.password)) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  await createAdminSession(res);
  res.json({ ok: true });
});

router.post("/logout", async (req, res) => {
  await destroyAdminSession(req, res);
  res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  const loggedIn = await isAuthenticated(req);
  res.json({ loggedIn });
});

export default router;
