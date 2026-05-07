import { Plus, MessageSquare, Settings, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

interface SidebarProps {
  onNavigate?: () => void;
}

export function SidebarContent({ onNavigate }: SidebarProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Chat", icon: MessageSquare, testId: "nav-chat" },
    { href: "/settings", label: "Settings", icon: Settings, testId: "nav-settings" },
    { href: "/admin", label: "Admin Panel", icon: ShieldCheck, testId: "nav-admin" },
  ];

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center px-4 border-b border-sidebar-border">
        <Logo size="md" />
      </div>

      <div className="p-3">
        <Button
          className="w-full justify-start gap-2 hover-elevate active-elevate-2"
          variant="default"
          onClick={onNavigate}
          data-testid="button-new-chat"
        >
          <Plus className="h-4 w-4" />
          <span>Notun Chat</span>
        </Button>
      </div>

      <Separator className="bg-sidebar-border" />

      <ScrollArea className="flex-1 px-3 py-3">
        <div className="space-y-1">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Recent
          </p>
          <div className="rounded-lg border border-dashed border-sidebar-border bg-sidebar-accent/30 px-3 py-6 text-center">
            <MessageSquare className="mx-auto h-6 w-6 text-muted-foreground/60" />
            <p className="mt-2 text-xs text-muted-foreground" lang="bn">
              Chat history coming soon
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground/70">Phase 2 e ashbe</p>
          </div>
        </div>
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      <nav className="p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover-elevate active-elevate-2",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground",
              )}
              data-testid={item.testId}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
