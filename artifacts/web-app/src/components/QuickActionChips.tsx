import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  BUILT_IN_ACTIONS,
  useCustomQuickActions,
  type QuickActionDef,
} from "@/lib/quickActions";

interface QuickActionChipsProps {
  onSelect: (action: QuickActionDef) => void;
}

export function QuickActionChips({ onSelect }: QuickActionChipsProps) {
  const { data: customActions = [] } = useCustomQuickActions();
  const actions: QuickActionDef[] = [...BUILT_IN_ACTIONS, ...customActions];

  return (
    <div className="border-t border-border/50 bg-background/60">
      <ScrollArea className="w-full">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5 sm:px-6">
          <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Quick:
          </span>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                onClick={() => onSelect(action)}
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
