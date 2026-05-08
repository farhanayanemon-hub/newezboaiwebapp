import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import chatRouter from "./chat";
import conversationsRouter from "./conversations";
import memoriesRouter from "./memories";
import quickActionsRouter from "./quickActions";
import filesRouter from "./files";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminRouter);
router.use("/chat", chatRouter);
router.use("/conversations", conversationsRouter);
router.use("/memories", memoriesRouter);
router.use("/quick-actions", quickActionsRouter);
router.use("/files", filesRouter);

export default router;
