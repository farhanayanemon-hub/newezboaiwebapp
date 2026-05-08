import { Router, type IRouter } from "express";
import auth from "./auth";
import providers from "./providers";
import routing from "./routing";
import usage from "./usage";
import credentials from "./credentials";
import automations from "./automations";
import accessRules from "./accessRules";
import ezboTiers from "./ezboTiers";

const router: IRouter = Router();

router.use("/", auth);
router.use("/providers", providers);
router.use("/routing-rules", routing);
router.use("/usage", usage);
router.use("/credentials", credentials);
router.use("/automations", automations);
router.use("/access-rules", accessRules);
router.use("/ezbo-tiers", ezboTiers);

export default router;
