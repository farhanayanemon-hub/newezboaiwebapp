import { useQuery } from "@tanstack/react-query";
import {
  Users,
  ShieldOff,
  MailCheck,
  UserPlus,
  KeyRound,
  ListOrdered,
  Sparkles,
  MessageSquare,
  Mail,
  Loader2,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api";

interface OverviewResp {
  users: { total: number; banned: number; verified: number; newLast7Days: number };
  content: {
    providers: number;
    routingRules: number;
    ezboTiers: number;
    conversations: number;
    messages: number;
  };
  smtp: { enabled: boolean; host: string; fromAddress: string; updatedAt: string | null };
  recentAudit: {
    id: string;
    action: string;
    targetUserId: string | null;
    actorIp: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }[];
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return String(s);
  }
}

function StatCard({
  label,
  value,
  icon,
  hint,
  testid,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  hint?: string;
  testid?: string;
}) {
  return (
    <Card data-testid={testid}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold tabular-nums" data-testid={`${testid}-value`}>
            {value}
          </div>
          {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => apiClient.get<OverviewResp>("/admin/overview"),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Failed to load overview.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Users</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            testid="stat-users-total"
            label="Total users"
            value={data.users.total}
            icon={<Users className="h-5 w-5" />}
          />
          <StatCard
            testid="stat-users-new"
            label="New (7d)"
            value={data.users.newLast7Days}
            icon={<UserPlus className="h-5 w-5" />}
          />
          <StatCard
            testid="stat-users-verified"
            label="Verified"
            value={data.users.verified}
            icon={<MailCheck className="h-5 w-5" />}
          />
          <StatCard
            testid="stat-users-banned"
            label="Banned"
            value={data.users.banned}
            icon={<ShieldOff className="h-5 w-5" />}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Platform</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            testid="stat-providers"
            label="Providers"
            value={data.content.providers}
            icon={<KeyRound className="h-5 w-5" />}
          />
          <StatCard
            testid="stat-routing"
            label="Routing rules"
            value={data.content.routingRules}
            icon={<ListOrdered className="h-5 w-5" />}
          />
          <StatCard
            testid="stat-tiers"
            label="Ezbo tiers"
            value={data.content.ezboTiers}
            icon={<Sparkles className="h-5 w-5" />}
          />
          <StatCard
            testid="stat-conversations"
            label="Conversations"
            value={data.content.conversations}
            icon={<MessageSquare className="h-5 w-5" />}
          />
          <StatCard
            testid="stat-messages"
            label="Messages"
            value={data.content.messages}
            icon={<Activity className="h-5 w-5" />}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Email</h2>
        <Card data-testid="card-smtp-status">
          <CardContent className="flex flex-wrap items-center gap-4 p-4 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">SMTP</span>
            </div>
            <span
              className={
                data.smtp.enabled
                  ? "rounded-md bg-emerald-500/15 px-2 py-0.5 text-emerald-600 dark:text-emerald-400"
                  : "rounded-md bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400"
              }
            >
              {data.smtp.enabled ? "Configured" : "Not configured"}
            </span>
            {data.smtp.host ? (
              <span className="text-muted-foreground">
                {data.smtp.host}
                {data.smtp.fromAddress ? ` · from ${data.smtp.fromAddress}` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">
                Set host + credentials in the SMTP section to enable verification & password-reset
                emails.
              </span>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent admin activity</h2>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Audit log</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentAudit.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No admin actions recorded yet.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentAudit.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    data-testid={`audit-row-${row.id}`}
                  >
                    <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.action}</code>
                      {row.targetUserId ? (
                        <span className="text-muted-foreground truncate">
                          target: {row.targetUserId.slice(0, 8)}…
                        </span>
                      ) : null}
                      {row.actorIp ? (
                        <span className="text-muted-foreground">from {row.actorIp}</span>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {fmtDateTime(row.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
