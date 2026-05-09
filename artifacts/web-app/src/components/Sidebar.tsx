import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Settings,
  Brain,
  FolderOpen,
  Bell,
  Workflow,
  UserCircle2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/Logo";
import { ThreadList } from "@/components/ThreadList";
import { useTheme } from "@/lib/theme-provider";
import { Sun, Moon, Monitor } from "lucide-react";
import { ProjectsSection } from "@/components/ProjectsSection";
import { useChatStore } from "@/stores/chatStore";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface SidebarContentProps {
  onNavigate?: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof Settings;
  testId: string;
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(
    undefined,
  );
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Tools — secondary feature pages, kept together above the account group.
  const toolsNav: NavItem[] = [
    { href: "/files", label: "File Library", icon: FolderOpen, testId: "nav-files" },
    { href: "/memories", label: "Memories", icon: Brain, testId: "nav-memories" },
    { href: "/reminders", label: "Reminders", icon: Bell, testId: "nav-reminders" },
    { href: "/automations", label: "Automations", icon: Workflow, testId: "nav-automations" },
  ];

  // Bottom account/admin group — clearly separated by a divider.
  const bottomNav: NavItem[] = [];
  if (user) {
    bottomNav.push({ href: "/account", label: "Account", icon: UserCircle2, testId: "nav-account" });
  }
  bottomNav.push({ href: "/settings", label: "Settings", icon: Settings, testId: "nav-settings" });
  bottomNav.push({ href: "/onboarding", label: "Replay onboarding", icon: Sparkles, testId: "nav-onboarding" });
  if (isAdmin) {
    bottomNav.push({ href: "/admin", label: "Admin", icon: ShieldCheck, testId: "nav-admin" });
  }

  const handleNewChat = () => {
    setActiveConversation(null);
    onNavigate?.();
  };

  const renderNavLink = (item: NavItem) => {
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
            : "text-sidebar-foreground/80",
        )}
        data-testid={item.testId}
      >
        <Icon className="h-4 w-4" />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex h-16 items-center px-4 border-b border-sidebar-border">
        <Logo size="md" />
      </div>

      {/* Top: primary action + search */}
      <div className="space-y-2 p-3">
        <Button
          className="w-full justify-start gap-2 hover-elevate active-elevate-2"
          variant="default"
          onClick={handleNewChat}
          data-testid="button-new-chat"
        >
          <Plus className="h-4 w-4" />
          <span>New Chat</span>
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="h-8 pl-8 text-xs"
            data-testid="input-search-threads"
          />
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Recent chats — primary scrollable region, moved above Projects */}
      <ScrollArea className="flex-1 px-3 py-3">
        <ThreadList
          searchQuery={debouncedSearch}
          projectFilter={projectFilter}
          onThreadSelected={onNavigate}
        />
      </ScrollArea>

      <Separator className="bg-sidebar-border" />

      {/* Projects sit just under recent chats */}
      <div className="px-3 py-3">
        <ProjectsSection selected={projectFilter} onSelect={setProjectFilter} />
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Tools group */}
      <nav className="space-y-1 px-3 py-2">
        {toolsNav.map(renderNavLink)}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Theme picker — quick access from the sidebar */}
      <div className="px-3 py-2">
        <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/50">
          Theme
        </div>
        <SidebarThemePicker />
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Bottom: account / settings / admin — clearly separated */}
      <nav className="space-y-1 px-3 py-3">
        {bottomNav.map(renderNavLink)}
      </nav>
    </div>
  );
}


function SidebarThemePicker() {
  const { theme, setTheme } = useTheme();
  const opts = [
    { value: "light" as const, label: "Light", Icon: Sun },
    { value: "dark" as const, label: "Dark", Icon: Moon },
    { value: "system" as const, label: "Auto", Icon: Monitor },
  ];
  return (
    <div className="grid grid-cols-3 gap-1">
      {opts.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            data-testid={`sidebar-theme-${value}`}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md px-2 py-2 text-[10px] font-medium transition-colors hover-elevate active-elevate-2",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
