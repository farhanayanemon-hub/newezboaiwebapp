import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Volume2, VolumeX, ChevronDown, Check, Sparkles, Square } from "lucide-react";
import { Link } from "wouter";
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
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

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

interface AvailableModel {
  id: string;
  provider: string;
  model: string;
  label: string;
}

interface ProvidersResponse {
  providers: Array<{
    id: number;
    provider: string;
    label: string;
    enabled: boolean;
    enabledModels: string[];
  }>;
}

export function ChatHeaderRight() {
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const voiceEnabled = useChatStore((s) => s.voiceOutputEnabled);
  const toggleVoice = useChatStore((s) => s.toggleVoiceOutput);
  const isSpeaking = useVoiceStore((s) => s.isSpeaking);
  const setAutoSpeak = useVoiceStore((s) => s.setAutoSpeak);
  const handleToggleVoice = () => {
    toggleVoice();
    // Mirror the UI toggle into the voice prefs so settings stay coherent.
    setAutoSpeak(!voiceEnabled);
    if (voiceEnabled) stopActiveSpeech();
  };
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let aborted = false;
    apiClient
      .get<ProvidersResponse>("/admin/providers")
      .then((res) => {
        if (aborted) return;
        const list: AvailableModel[] = [];
        for (const p of res.providers) {
          if (!p.enabled) continue;
          for (const m of p.enabledModels) {
            list.push({
              id: `${p.provider}:${m}`,
              provider: p.provider,
              model: m,
              label: m,
            });
          }
        }
        setModels(list);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
    return () => {
      aborted = true;
    };
  }, []);

  const selected = models.find((m) => m.id === selectedModelId);
  const buttonLabel = selected ? selected.label : "Auto (router)";

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
        <DropdownMenuContent align="end" className="min-w-[16rem] max-h-[60vh] overflow-y-auto">
          <DropdownMenuLabel className="text-xs">Model</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setSelectedModel(null)}
            data-testid="model-auto"
          >
            <div className="flex flex-1 items-center justify-between">
              <div>
                <div className="text-sm font-medium">Auto (router)</div>
                <div className="text-[10px] text-muted-foreground">
                  Use routing rules with fallback
                </div>
              </div>
              {!selected && <Check className="h-3.5 w-3.5 text-primary" />}
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {!loaded && (
            <DropdownMenuItem disabled>
              <span className="text-xs text-muted-foreground">Loading…</span>
            </DropdownMenuItem>
          )}
          {loaded && models.length === 0 && (
            <DropdownMenuItem disabled>
              <span className="text-xs text-muted-foreground">
                No enabled models. Configure in Admin.
              </span>
            </DropdownMenuItem>
          )}
          {models.map((m) => (
            <DropdownMenuItem
              key={m.id}
              onClick={() => setSelectedModel(m.id)}
              data-testid={`model-${m.id}`}
            >
              <div className="flex flex-1 items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">
                    {m.provider}
                  </div>
                </div>
                {m.id === selectedModelId && <Check className="h-3.5 w-3.5 text-primary" />}
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/admin" className="text-xs text-muted-foreground">
              Manage providers →
            </Link>
          </DropdownMenuItem>
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
