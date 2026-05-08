import { Router, type IRouter } from "express";
import auth from "./auth";
import providers from "./providers";
import routing from "./routing";
import usage from "./usage";
import credentials from "./credentials";
import automations from "./automations";
import accessRules from "./accessRules";
import ezboTiers from "./ezboTiers";
import users from "./users";
import smtp from "./smtp";
import overview from "./overview";

const router: IRouter = Router();

router.use("/", auth);
router.use("/providers", providers);
router.use("/routing-rules", routing);
router.use("/usage", usage);
router.use("/credentials", credentials);
router.use("/automations", automations);
router.use("/access-rules", accessRules);
router.use("/ezbo-tiers", ezboTiers);
router.use("/users", users);
router.use("/smtp", smtp);
router.use("/overview", overview);

export default router;
