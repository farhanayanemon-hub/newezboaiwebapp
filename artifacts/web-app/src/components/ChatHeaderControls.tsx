import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Volume2, VolumeX, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChatStore, useActiveThread } from "@/stores/chatStore";
import { cn } from "@/lib/utils";

const MODELS = [
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI", badge: "Default" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI", badge: "Fast" },
  { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "gemini-2-0-flash", label: "Gemini 2.0 Flash", provider: "Google" },
  { id: "grok-2", label: "Grok 2", provider: "xAI" },
];

export function ChatTitleSlot() {
  const activeThread = useActiveThread();
  const renameThread = useChatStore((s) => s.renameThread);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const start = () => {
    if (!activeThread) return;
    setDraft(activeThread.title);
    setEditing(true);
  };
  const commit = () => {
    if (activeThread && draft.trim() && draft !== activeThread.title) {
      renameThread(activeThread.id, draft);
    }
    setEditing(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") setEditing(false);
  };

  if (!activeThread) {
    return <span className="text-sm text-muted-foreground">EzboAI Chat</span>;
  }
  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        className="h-8 max-w-md text-center text-sm"
        data-testid="input-edit-title"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      className="group max-w-md truncate rounded-md px-2 py-1 text-sm font-medium text-foreground hover-elevate active-elevate-2"
      aria-label="Chat title rename"
      data-testid="button-edit-title"
    >
      <span className="truncate">{activeThread.title}</span>
    </button>
  );
}

export function ChatHeaderRight() {
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const voiceEnabled = useChatStore((s) => s.voiceOutputEnabled);
  const toggleVoice = useChatStore((s) => s.toggleVoiceOutput);
  const selectedModel = MODELS.find((m) => m.id === selectedModelId) ?? MODELS[0];

  return (
    <>
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

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("hover-elevate active-elevate-2", voiceEnabled && "text-primary")}
            onClick={toggleVoice}
            aria-label={voiceEnabled ? "Voice output off" : "Voice output on"}
            data-testid="button-voice-toggle"
          >
            {voiceEnabled ? (
              <Volume2 className="h-[1.15rem] w-[1.15rem]" />
            ) : (
              <VolumeX className="h-[1.15rem] w-[1.15rem]" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Voice output {voiceEnabled ? "on" : "off"} (Phase 7)
        </TooltipContent>
      </Tooltip>
    </>
  );
}
