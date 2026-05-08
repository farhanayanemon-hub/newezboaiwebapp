import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import authRouter from "./auth";
import chatRouter from "./chat";
import conversationsRouter from "./conversations";
import memoriesRouter from "./memories";
import quickActionsRouter from "./quickActions";
import filesRouter from "./files";
import voiceRouter from "./voice";
import visionRouter from "./vision";
import remindersRouter from "./reminders";
import pushRouter from "./push";
import browserRouter from "./browser";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/admin", adminRouter);
router.use("/chat", chatRouter);
router.use("/conversations", conversationsRouter);
router.use("/memories", memoriesRouter);
router.use("/quick-actions", quickActionsRouter);
router.use("/files", filesRouter);
router.use("/voice", voiceRouter);
router.use("/vision", visionRouter);
router.use("/reminders", remindersRouter);
router.use("/push", pushRouter);
router.use("/browser", browserRouter);

export default router;
