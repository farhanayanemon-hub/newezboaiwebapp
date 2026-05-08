import { useEffect, useState } from "react";
import { Plus, Search, Settings, Brain, FolderOpen, Bell, Workflow } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/Logo";
import { ThreadList } from "@/components/ThreadList";
import { ProjectsSection } from "@/components/ProjectsSection";
import { useChatStore } from "@/stores/chatStore";
import { cn } from "@/lib/utils";

interface SidebarContentProps {
  onNavigate?: () => void;
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(
    undefined,
  );
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const navItems = [
    { href: "/files", label: "File Library", icon: FolderOpen, testId: "nav-files" },
    { href: "/memories", label: "Memories", icon: Brain, testId: "nav-memories" },
    { href: "/reminders", label: "Reminders", icon: Bell, testId: "nav-reminders" },
    { href: "/automations", label: "Automations", icon: Workflow, testId: "nav-automations" },
    { href: "/settings", label: "Settings", icon: Settings, testId: "nav-settings" },
  ];

  const handleNewChat = () => {
    setActiveConversation(null);
    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center px-4 border-b border-sidebar-border">
        <Logo size="md" />
      </div>

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

      <div className="px-3 py-3">
        <ProjectsSection selected={projectFilter} onSelect={setProjectFilter} />
      </div>

      <Separator className="bg-sidebar-border" />

      <ScrollArea className="flex-1 px-3 py-3">
        <ThreadList
          searchQuery={debouncedSearch}
          projectFilter={projectFilter}
          onThreadSelected={onNavigate}
        />
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
                  : "text-sidebar-foreground/80",
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
