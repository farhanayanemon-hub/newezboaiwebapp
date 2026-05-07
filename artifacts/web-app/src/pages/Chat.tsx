import { Sparkles, FileText, CloudSun, Mic, Camera, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";

const examplePrompts = [
  {
    icon: CloudSun,
    title: "Aajker abhawa",
    bangla: "আজকের আবহাওয়া কেমন?",
    hint: "Real-time information",
  },
  {
    icon: FileText,
    title: "PDF summarize",
    bangla: "এই PDF টা summarize করো",
    hint: "Document analysis",
  },
];

const upcomingFeatures = [
  { icon: Mic, label: "Voice chat" },
  { icon: Camera, label: "Live camera" },
  { icon: Paperclip, label: "File upload" },
];

export default function ChatPage() {
  return (
    <AppShell title="EzboAI Chat">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-4 py-10 sm:py-16">
        {/* Hero */}
        <div className="text-center">
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            <Sparkles className="h-3 w-3 text-accent" />
            <span>Phase 1 — Foundation Ready</span>
          </div>
          <h1 className="bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
            EzboAI
          </h1>
          <p
            className="mt-4 text-lg text-muted-foreground sm:text-xl"
            lang="bn"
            data-testid="text-tagline"
          >
            আপনার Bangla AI সহকারী
          </p>
          <p className="mt-2 text-sm text-muted-foreground/80">
            Bangla, Banglish, ar English — jeta apnar comfortable
          </p>
        </div>

        {/* Example prompt cards */}
        <div className="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {examplePrompts.map((prompt) => {
            const Icon = prompt.icon;
            return (
              <Card
                key={prompt.title}
                className="group cursor-pointer hover-elevate active-elevate-2 transition-shadow"
                data-testid={`card-example-${prompt.title.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-foreground" lang="bn">
                        {prompt.bangla}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{prompt.hint}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-8">
          <Button
            size="lg"
            className="gap-2 px-6 hover-elevate active-elevate-2 shadow-md shadow-primary/20"
            data-testid="button-start-chat"
          >
            <Sparkles className="h-4 w-4" />
            <span lang="bn">নতুন Chat শুরু করুন</span>
          </Button>
        </div>

        {/* Upcoming features hint */}
        <div className="mt-12 w-full">
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-5 py-4">
            <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Coming in next phases
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {upcomingFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.label}
                    className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs text-muted-foreground border border-border"
                  >
                    <Icon className="h-3 w-3" />
                    <span>{feature.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
