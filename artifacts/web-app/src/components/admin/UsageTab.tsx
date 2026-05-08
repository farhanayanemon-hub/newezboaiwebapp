import { useEffect, useMemo, useState } from "react";
import { Loader2, BarChart3 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api";
import { PROVIDER_LABELS, type ProviderSlug } from "./types";

interface UsageRow {
  id: number;
  provider: string;
  model: string;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  error: string | null;
  createdAt: string;
}

interface ByDayRow {
  day: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

interface UsageResponse {
  recent: UsageRow[];
  byDay: ByDayRow[];
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10a37f",
  anthropic: "#cc785c",
  gemini: "#4285f4",
  openrouter: "#a855f7",
  xai: "#000000",
  replicate: "#e5484d",
};

export function UsageTab() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<UsageResponse>("/admin/usage")
      .then(setData)
      .catch(() => setData({ recent: [], byDay: [] }))
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    if (!data) return [];
    const byDay = new Map<string, Record<string, number | string>>();
    const providers = new Set<string>();
    for (const row of data.byDay) {
      providers.add(row.provider);
      const entry = byDay.get(row.day) ?? { day: row.day };
      entry[row.provider] = (entry[row.provider] as number ?? 0) + row.inputTokens + row.outputTokens;
      byDay.set(row.day, entry);
    }
    return Array.from(byDay.values()).sort((a, b) =>
      String(a.day).localeCompare(String(b.day)),
    );
  }, [data]);

  const providerKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.byDay ?? []) set.add(r.provider);
    return Array.from(set);
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || (data.byDay.length === 0 && data.recent.length === 0)) {
    return (
      <Card className="border-dashed py-16 text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">No usage data yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Send a chat message to start tracking usage.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="mb-4 text-sm font-semibold">Tokens per day</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {providerKeys.map((p) => (
                <Bar
                  key={p}
                  dataKey={p}
                  stackId="a"
                  fill={PROVIDER_COLORS[p] ?? "#94a3b8"}
                  name={PROVIDER_LABELS[p as ProviderSlug] ?? p}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-semibold">Recent calls</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Model</th>
                <th className="px-4 py-2 font-medium">Task</th>
                <th className="px-4 py-2 font-medium text-right">In</th>
                <th className="px-4 py-2 font-medium text-right">Out</th>
                <th className="px-4 py-2 font-medium text-right">Latency</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.recent.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-xs capitalize">{row.provider}</td>
                  <td className="px-4 py-2 font-mono text-xs">{row.model}</td>
                  <td className="px-4 py-2 text-xs">{row.taskType}</td>
                  <td className="px-4 py-2 text-right text-xs">{row.inputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-xs">{row.outputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-xs">{row.latencyMs}ms</td>
                  <td className="px-4 py-2 text-xs">
                    {row.error ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive" title={row.error}>
                        Error
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
