import { Sparkles, CloudSun, FileText, Mail, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const EXAMPLES = [
  {
    icon: CloudSun,
    title: "Today's weather",
    prompt: "What's the weather like in Dhaka, Bangladesh today?",
  },
  {
    icon: FileText,
    title: "Document summary",
    prompt: "Summarize the following document for me:\n\n",
  },
  {
    icon: Mail,
    title: "Email draft",
    prompt: "Draft a professional 3-day leave application email to my manager.",
  },
  {
    icon: Lightbulb,
    title: "Concept explainer",
    prompt: "Explain quantum computing in simple terms.",
  },
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
          <span>Multi-Provider AI Router</span>
        </div>
        <h1 className="bg-gradient-to-br from-foreground via-foreground to-primary bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
          EzboAI
        </h1>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">
          Your personal AI assistant
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground/70">
          Pick an example below or start typing your own prompt
        </p>

        <div className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {EXAMPLES.map((ex) => {
            const Icon = ex.icon;
            return (
              <Card
                key={ex.title}
                role="button"
                tabIndex={0}
                onClick={() => onPromptSelect(ex.prompt)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPromptSelect(ex.prompt);
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
                      <p className="text-sm font-medium text-foreground">
                        {ex.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {ex.prompt}
                      </p>
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
