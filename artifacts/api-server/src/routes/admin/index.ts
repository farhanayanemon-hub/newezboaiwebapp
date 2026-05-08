import { Router, type IRouter } from "express";
import auth from "./auth";
import providers from "./providers";
import routing from "./routing";
import usage from "./usage";

const router: IRouter = Router();

router.use("/", auth);
router.use("/providers", providers);
router.use("/routing-rules", routing);
router.use("/usage", usage);

export default router;
