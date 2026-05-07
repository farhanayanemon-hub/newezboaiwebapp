import { ShieldCheck, KeyRound, Server, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";

const plannedFeatures = [
  {
    icon: KeyRound,
    title: "AI Provider Keys",
    description: "OpenAI, Anthropic, Gemini, OpenRouter, xAI Grok, Replicate — encrypted storage",
  },
  {
    icon: Server,
    title: "Multi-Provider Router",
    description: "Choose default model, fallback chain, per-feature provider override",
  },
  {
    icon: Lock,
    title: "Password Protected",
    description: "ADMIN_PASSWORD env var, session-based auth, rate-limited login",
  },
];

export default function AdminPage() {
  return (
    <AppShell title="Admin Panel">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        <div className="mb-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Admin Panel
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Phase 3 e build hobe — multi-provider AI keys, encrypted storage, password-protected
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-1">
          {plannedFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} data-testid={`card-feature-${feature.title.replace(/\s+/g, "-").toLowerCase()}`}>
                <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                    <CardDescription className="mt-1.5 text-sm">{feature.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        <div className="mt-10 rounded-xl border border-dashed border-border bg-muted/40 px-5 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Build kora hobe Phase 3 e — AI router, encryption, admin authentication
          </p>
        </div>
      </div>
    </AppShell>
  );
}
