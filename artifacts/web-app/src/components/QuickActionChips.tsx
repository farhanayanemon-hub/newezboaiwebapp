import {
  FileText,
  Languages,
  Lightbulb,
  Edit3,
  Code2,
  Calculator,
  Mail,
  Wand2,
} from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface QuickAction {
  id: string;
  label: string;
  icon: typeof FileText;
  template: string;
}

const ACTIONS: QuickAction[] = [
  { id: "summarize", label: "Summarize", icon: FileText, template: "Ei text tar ekta short summary diyen:\n\n" },
  { id: "translate", label: "Translate", icon: Languages, template: "Ei text ta Bangla theke English e translate koren:\n\n" },
  { id: "explain", label: "Explain", icon: Lightbulb, template: "Ei concept ta simple Bangla bhashay bujhiye den:\n\n" },
  { id: "rewrite", label: "Rewrite", icon: Edit3, template: "Ei text tare professional tone e rewrite koren:\n\n" },
  { id: "code", label: "Code Help", icon: Code2, template: "Ei code er bug khuje den ar fix suggest koren:\n\n```\n\n```" },
  { id: "math", label: "Math", icon: Calculator, template: "Ei math problem ta step-by-step solve koren:\n\n" },
  { id: "email", label: "Email", icon: Mail, template: "Ei topic er upor ekta professional email draft koren:\n\n" },
  { id: "custom", label: "Custom", icon: Wand2, template: "" },
];

interface QuickActionChipsProps {
  onSelect: (template: string) => void;
}

export function QuickActionChips({ onSelect }: QuickActionChipsProps) {
  return (
    <div className="border-t border-border/50 bg-background/60">
      <ScrollArea className="w-full">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5 sm:px-6">
          <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Quick:
          </span>
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                onClick={() => onSelect(action.template)}
                className="h-7 flex-shrink-0 gap-1.5 rounded-full px-3 text-xs hover-elevate active-elevate-2"
                data-testid={`chip-${action.id}`}
              >
                <Icon className="h-3 w-3" />
                <span>{action.label}</span>
              </Button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
