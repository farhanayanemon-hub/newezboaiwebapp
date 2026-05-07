import { Sparkles, CloudSun, FileText, Mail, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const EXAMPLES = [
  { icon: CloudSun, title: "Aajker abhawa", bangla: "আজকের আবহাওয়া কেমন?", template: "আজকের আবহাওয়া কেমন? Bangladesh er Dhaka shohorer." },
  { icon: FileText, title: "Document summary", bangla: "এই PDF টা summarize করো", template: "Ei document ta summarize koren:\n\n" },
  { icon: Mail, title: "Email draft", bangla: "একটা email draft করো", template: "Boss ke ekta professional leave application email draft koren — 3 din chuti er jonno" },
  { icon: Lightbulb, title: "Concept explain", bangla: "Quantum computing ki?", template: "Quantum computing ki? Simple Bangla bhashay bujhiye den" },
];

interface EmptyStateProps {
  onPromptSelect: (template: string) => void;
}

export function EmptyState({ onPromptSelect }: EmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
          <Sparkles className="h-3 w-3 text-accent" />
          <span>Phase 2 — Chat UI Ready</span>
        </div>
        <h1 className="bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
          EzboAI
        </h1>
        <p
          className="mt-3 text-base text-muted-foreground sm:text-lg"
          lang="bn"
        >
          আপনার Bangla AI সহকারী
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground/70">
          Niche je kono example e click korun, ba ekhon nije likhe shuru korun
        </p>

        <div className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {EXAMPLES.map((ex) => {
            const Icon = ex.icon;
            return (
              <Card
                key={ex.title}
                role="button"
                tabIndex={0}
                onClick={() => onPromptSelect(ex.template)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPromptSelect(ex.template);
                  }
                }}
                className="cursor-pointer text-left hover-elevate active-elevate-2 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`example-${ex.title.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground" lang="bn">
                        {ex.bangla}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{ex.title}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
