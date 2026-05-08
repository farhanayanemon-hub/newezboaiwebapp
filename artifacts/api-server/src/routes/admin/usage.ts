import { Router, type IRouter } from "express";
import { db, providerUsageTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { requireAdmin } from "../../middleware/adminAuth";

const router: IRouter = Router();
router.use(requireAdmin());

router.get("/", async (_req, res) => {
  const recent = await db
    .select()
    .from(providerUsageTable)
    .orderBy(desc(providerUsageTable.createdAt))
    .limit(100);

  const byDay = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${providerUsageTable.createdAt}), 'YYYY-MM-DD')`.as("day"),
      provider: providerUsageTable.provider,
      inputTokens: sql<number>`coalesce(sum(${providerUsageTable.inputTokens}), 0)::int`.as("input_tokens"),
      outputTokens: sql<number>`coalesce(sum(${providerUsageTable.outputTokens}), 0)::int`.as("output_tokens"),
      calls: sql<number>`count(*)::int`.as("calls"),
    })
    .from(providerUsageTable)
    .groupBy(
      sql`date_trunc('day', ${providerUsageTable.createdAt})`,
      providerUsageTable.provider,
    )
    .orderBy(sql`date_trunc('day', ${providerUsageTable.createdAt}) desc`)
    .limit(60);

  res.json({ recent, byDay });
});

export default router;
