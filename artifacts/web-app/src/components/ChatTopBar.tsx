import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Menu, Settings as SettingsIcon, Volume2, VolumeX, ChevronDown, Check } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { SidebarContent } from "@/components/Sidebar";
import { useChatStore, useActiveThread } from "@/stores/chatStore";
import { cn } from "@/lib/utils";

const MODELS = [
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI", badge: "Default" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI", badge: "Fast" },
  { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "gemini-2-0-flash", label: "Gemini 2.0 Flash", provider: "Google" },
  { id: "grok-2", label: "Grok 2", provider: "xAI" },
];

export function ChatTopBar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const activeThread = useActiveThread();
  const renameThread = useChatStore((s) => s.renameThread);
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const voiceEnabled = useChatStore((s) => s.voiceOutputEnabled);
  const toggleVoice = useChatStore((s) => s.toggleVoiceOutput);

  const selectedModel = MODELS.find((m) => m.id === selectedModelId) ?? MODELS[0];

  useEffect(() => {
    if (editingTitle) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingTitle]);

  const startEditing = () => {
    if (!activeThread) return;
    setTitleDraft(activeThread.title);
    setEditingTitle(true);
  };

  const commitTitle = () => {
    if (activeThread && titleDraft.trim() && titleDraft !== activeThread.title) {
      renameThread(activeThread.id, titleDraft);
    }
    setEditingTitle(false);
  };

  const handleTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commitTitle();
    else if (e.key === "Escape") setEditingTitle(false);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 flex-shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md md:px-4">
      <div className="flex flex-shrink-0 items-center gap-2">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden hover-elevate active-elevate-2"
              aria-label="Menu open"
              data-testid="button-mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 p-0 border-r border-sidebar-border bg-sidebar"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="lg:hidden">
          <Logo size="sm" />
        </div>
      </div>

      {/* Center: editable title */}
      <div className="flex flex-1 items-center justify-center min-w-0 px-2">
        {activeThread ? (
          editingTitle ? (
            <Input
              ref={inputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={handleTitleKey}
              className="h-8 max-w-md text-center text-sm"
              data-testid="input-edit-title"
            />
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="group max-w-md truncate rounded-md px-2 py-1 text-sm font-medium text-foreground hover-elevate active-elevate-2"
              aria-label="Chat title rename"
              data-testid="button-edit-title"
            >
              <span className="truncate">{activeThread.title}</span>
            </button>
          )
        ) : (
          <span className="text-sm text-muted-foreground">EzboAI Chat</span>
        )}
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        {/* Model picker */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="hidden h-8 gap-1 rounded-full px-3 text-xs hover-elevate active-elevate-2 sm:flex"
              data-testid="button-model-picker"
            >
              <span className="font-medium">{selectedModel.label}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[14rem]">
            <DropdownMenuLabel className="text-xs">AI Model</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {MODELS.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                data-testid={`model-${m.id}`}
              >
                <div className="flex flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{m.label}</span>
                    {m.id === selectedModel.id && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{m.provider}</span>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <span className="text-[10px] text-muted-foreground">
                Phase 3 e real wired hobe
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Voice toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "hover-elevate active-elevate-2",
                voiceEnabled && "text-primary",
              )}
              onClick={toggleVoice}
              aria-label={voiceEnabled ? "Voice output off" : "Voice output on"}
              data-testid="button-voice-toggle"
            >
              {voiceEnabled ? <Volume2 className="h-[1.15rem] w-[1.15rem]" /> : <VolumeX className="h-[1.15rem] w-[1.15rem]" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Voice output {voiceEnabled ? "on" : "off"} (Phase 7)
          </TooltipContent>
        </Tooltip>

        {/* Settings link */}
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex hover-elevate active-elevate-2"
        >
          <Link href="/settings" aria-label="Settings" data-testid="link-settings">
            <SettingsIcon className="h-[1.15rem] w-[1.15rem]" />
          </Link>
        </Button>

        <ThemeToggle />
      </div>
    </header>
  );
}
