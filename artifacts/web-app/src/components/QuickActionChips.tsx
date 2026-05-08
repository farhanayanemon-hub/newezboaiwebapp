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
  { id: "summarize", label: "Summarize", icon: FileText, template: "Give me a short summary of the following:\n\n" },
  { id: "translate", label: "Translate", icon: Languages, template: "Translate the following text:\n\n" },
  { id: "explain", label: "Explain", icon: Lightbulb, template: "Explain this concept in simple terms:\n\n" },
  { id: "rewrite", label: "Rewrite", icon: Edit3, template: "Rewrite the following text in a professional tone:\n\n" },
  { id: "code", label: "Code Help", icon: Code2, template: "Find bugs and suggest fixes for this code:\n\n```\n\n```" },
  { id: "math", label: "Math", icon: Calculator, template: "Solve this math problem step by step:\n\n" },
  { id: "email", label: "Email", icon: Mail, template: "Draft a professional email about:\n\n" },
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
