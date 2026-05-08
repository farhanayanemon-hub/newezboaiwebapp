import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import { Volume2, VolumeX, ChevronDown, Check, Sparkles, Square } from "lucide-react";
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
import { useChatStore } from "@/stores/chatStore";
import { useVoiceStore } from "@/stores/voiceStore";
import { stopActiveSpeech } from "@/lib/speech/speechQueue";
import {
  useConversations,
  useRenameConversation,
} from "@/lib/conversations";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const EZBO_MODELS = [
  {
    id: "ezbo:standard",
    label: "Ezbo 1.0",
    description: "Balanced everyday assistant",
  },
  {
    id: "ezbo:mini",
    label: "Ezbo 1.0 Mini",
    description: "Fast, concise replies",
  },
  {
    id: "ezbo:pro",
    label: "Ezbo 1.0 Pro (Beta)",
    description: "Deeper reasoning, longer answers",
  },
] as const;

const DEFAULT_EZBO_ID = "ezbo:standard";

export function ChatTitleSlot() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const { data: threads = [] } = useConversations();
  const renameMutation = useRenameConversation();
  const activeThread = threads.find((t) => t.id === activeConversationId) ?? null;

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
    if (
      activeThread &&
      draft.trim() &&
      draft.trim() !== activeThread.title
    ) {
      renameMutation.mutate(
        { id: activeThread.id, title: draft.trim() },
        { onSuccess: () => toast.success("Renamed") },
      );
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
      aria-label="Rename chat"
      data-testid="button-edit-title"
    >
      <span className="truncate">{activeThread.title}</span>
    </button>
  );
}

export function ChatHeaderRight() {
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  // Single source of truth: voiceStore.autoSpeak. The header button is just a
  // shortcut for the same pref shown under Settings → Voice.
  const voiceEnabled = useVoiceStore((s) => s.autoSpeak);
  const setAutoSpeak = useVoiceStore((s) => s.setAutoSpeak);
  const isSpeaking = useVoiceStore((s) => s.isSpeaking);
  const handleToggleVoice = () => {
    const next = !voiceEnabled;
    setAutoSpeak(next);
    if (!next) stopActiveSpeech();
  };
  // Migrate any legacy `provider:model` selection to the default Ezbo tier so
  // users always see a known Ezbo label in the picker.
  useEffect(() => {
    if (
      selectedModelId &&
      !EZBO_MODELS.some((m) => m.id === selectedModelId)
    ) {
      setSelectedModel(DEFAULT_EZBO_ID);
    }
  }, [selectedModelId, setSelectedModel]);

  const activeId = selectedModelId ?? DEFAULT_EZBO_ID;
  const selected =
    EZBO_MODELS.find((m) => m.id === activeId) ?? EZBO_MODELS[0];
  const buttonLabel = selected.label;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="hidden h-8 max-w-[14rem] gap-1 truncate rounded-full px-3 text-xs hover-elevate active-elevate-2 sm:flex"
            data-testid="button-model-picker"
          >
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="truncate font-medium">{buttonLabel}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[18rem] max-h-[60vh] overflow-y-auto">
          <DropdownMenuLabel className="text-xs">Model</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {EZBO_MODELS.map((m) => (
            <DropdownMenuItem
              key={m.id}
              onClick={() => setSelectedModel(m.id)}
              data-testid={`model-${m.id.replace(":", "-")}`}
            >
              <div className="flex flex-1 items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {m.description}
                  </div>
                </div>
                {m.id === activeId && (
                  <Check className="h-3.5 w-3.5 text-primary" />
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {isSpeaking && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover-elevate active-elevate-2"
              onClick={() => stopActiveSpeech()}
              aria-label="Stop speaking"
              data-testid="button-stop-speaking"
            >
              <Square className="h-[1.05rem] w-[1.05rem] fill-current" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Stop speaking</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("hover-elevate active-elevate-2", voiceEnabled && "text-primary")}
            onClick={handleToggleVoice}
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
          Voice output {voiceEnabled ? "on" : "off"}
        </TooltipContent>
      </Tooltip>
    </>
  );
}
