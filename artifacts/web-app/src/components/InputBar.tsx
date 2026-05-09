import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Camera, Monitor, Paperclip, Send, StopCircle, Mic, Globe, Plus, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MicButton } from "@/components/MicButton";
import { CameraOverlay } from "@/components/CameraOverlay";
import { ScreenShareOverlay } from "@/components/ScreenShareOverlay";
import { useCameraStore } from "@/stores/cameraStore";
import { useScreenShareStore } from "@/stores/screenShareStore";
import { useBrowserStore } from "@/stores/browserStore";
import { useChatStore } from "@/stores/chatStore";

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  autoFocus?: boolean;
  onFilesPicked?: (files: File[]) => void;
  hasAttachments?: boolean;
}

const ARIA_LABELS = {
  camera: "Camera",
  screen: "Screen share",
  file: "Attach file",
  web: "Web task (AI browser)",
  agent: "Agent mode",
};

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+$/g, "/api");

function isWebTask(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.startsWith("/web ")) return true;
  if (/\bhttps?:\/\/\S+/.test(t)) return true;
  return /\b(browse|browse to|browse the web|search (?:for|online|the web)|find .+ (?:on|at|from) [a-z0-9.-]+\.[a-z]{2,}|look up .+ (?:on|at|from) [a-z0-9.-]+\.[a-z]{2,}|go to [a-z0-9.-]+\.[a-z]{2,}|open (?:the )?(?:url|website|site|page))\b/.test(t);
}

export function InputBar({
  value,
  onChange,
  onSend,
  disabled,
  isStreaming,
  onStop,
  autoFocus,
  onFilesPicked,
  hasAttachments,
}: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [composing, setComposing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dragDepth = useRef(0);
  const openCamera = useCameraStore((s) => s.open);
  const openScreenShare = useScreenShareStore((s) => s.open);
  const browser = useBrowserStore();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const agentMode = useChatStore((s) => s.agentMode);
  const setAgentMode = useChatStore((s) => s.setAgentMode);
  const [launchingWeb, setLaunchingWeb] = useState(false);
  const [micArmed, setMicArmed] = useState(false);

  const launchWebTask = async (promptText: string) => {
    if (launchingWeb) return;
    setLaunchingWeb(true);
    try {
      browser.reset();
      browser.open();
      const sessionRes = await fetch(`${API_BASE}/browser/sessions`, { method: "POST" });
      if (!sessionRes.ok) {
        const body = await sessionRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Server returned ${sessionRes.status}`);
      }
      const session = await sessionRes.json();
      browser.setSession(session.sessionId);
      const runRes = await fetch(`${API_BASE}/browser/sessions/${session.sessionId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, conversationId: activeConversationId ?? undefined }),
      });
      if (!runRes.ok) {
        const body = await runRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Run failed: ${runRes.status}`);
      }
      onChange("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      browser.setError(msg);
      toast.error(`Couldn't start web task: ${msg}`);
    } finally {
      setLaunchingWeb(false);
    }
  };

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const trimmed = value.trim();
  const canSend = !disabled && !isStreaming && (trimmed.length > 0 || !!hasAttachments);
  const showCounter = value.length > 500;

  const handleSendOrWebTask = () => {
    if (isWebTask(value)) { void launchWebTask(value); return; }
    onSend();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !composing) {
      e.preventDefault();
      if (canSend) handleSendOrWebTask();
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false); dragDepth.current = 0;
    if (!onFilesPicked) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) onFilesPicked(files);
  };
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!onFilesPicked) return;
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault(); dragDepth.current += 1; setDragOver(true);
    }
  };
  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (onFilesPicked && e.dataTransfer?.types?.includes("Files")) e.preventDefault();
  };

  function triggerWebTask() {
    const text = value.trim();
    if (!text) {
      toast.info("Type a web task first (e.g. 'Find iPhone 15 on daraz.com.bd' or '/web go to amazon.com').");
      return;
    }
    void launchWebTask(text);
  }

  function toggleAgentMode() {
    const next = !agentMode;
    setAgentMode(next);
    toast.success(next ? "Agent mode ON — Ezbo will research and ask follow-ups" : "Agent mode OFF");
  }

  // Inline icon-button (for desktop row).
  const iconBtn = (label: string, testid: string, onClick: () => void, Icon: React.ElementType, tooltip: string, disabledFlag = false, extraCls = "") => (
    <Tooltip key={testid}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 rounded-lg text-muted-foreground hover-elevate active-elevate-2", extraCls)}
          aria-label={label}
          onClick={onClick}
          disabled={disabledFlag}
          data-testid={testid}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );

  // Mobile popover menu row item.
  const menuRow = (label: string, Icon: React.ElementType, onClick: () => void, testid: string, active = false) => (
    <button
      key={testid}
      type="button"
      onClick={() => { setMobileMenuOpen(false); onClick(); }}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-left hover:bg-accent",
        active && "bg-primary/10 text-primary",
      )}
      data-testid={testid}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );

  return (
    <div
      className="border-t border-border bg-background/95 backdrop-blur-sm"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mx-auto max-w-3xl px-3 py-2.5 sm:px-6 sm:py-4">
        {agentMode && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
            <div className="flex items-center gap-2 text-primary">
              <Bot className="h-3.5 w-3.5" />
              <span className="font-medium">Agent mode active</span>
              <span className="hidden sm:inline text-muted-foreground">— Ezbo will search and ask follow-ups as needed</span>
            </div>
            <button
              type="button"
              onClick={() => setAgentMode(false)}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-agent-off-banner"
            >
              Turn off
            </button>
          </div>
        )}

        <div
          className={cn(
            "flex items-end gap-2 rounded-2xl border border-input bg-card px-2 py-2 shadow-sm transition-all",
            "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 focus-within:shadow-md",
            dragOver && "border-primary ring-2 ring-primary/40 bg-primary/5",
          )}
        >
          <div className="flex items-center gap-0.5 pb-0.5 pl-0.5">
            {/* Mobile: collapsed Plus menu. */}
            <div className="md:hidden">
              <Popover open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg text-muted-foreground hover-elevate active-elevate-2"
                    aria-label="Open actions"
                    data-testid="button-mobile-menu"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-56 p-1">
                  {menuRow("Voice (mic)", Mic, () => setMicArmed((v) => !v), "menu-voice", micArmed)}
                  {menuRow("Camera", Camera, () => openCamera(), "menu-camera")}
                  {menuRow("Screen share", Monitor, () => openScreenShare(), "menu-screen")}
                  {menuRow("Attach files", Paperclip, () => fileInputRef.current?.click(), "menu-files")}
                  {menuRow("Upload image", Camera, () => fileInputRef.current?.click(), "menu-image")}
                  {menuRow(`Agent mode${agentMode ? " (on)" : ""}`, Bot, toggleAgentMode, "menu-agent", agentMode)}
                  {menuRow("Web task", Globe, triggerWebTask, "menu-web")}
                </PopoverContent>
              </Popover>
            </div>

            {/* Mobile: a small dedicated mic-tap area — appears only when armed via menu OR always (compact). Keeps voice instantly accessible. */}
            <div className="md:hidden">
              <MicButton
                disabled={disabled}
                onInterim={(text) => onChange(text)}
                onFinal={(text) => onChange(text)}
                onAutoSend={() => {
                  setTimeout(() => { if (canSend || trimmed.length === 0) onSend(); }, 50);
                }}
              />
            </div>

            {/* Desktop: full action row. */}
            <div className="hidden md:flex items-center gap-0.5">
              <MicButton
                disabled={disabled}
                onInterim={(text) => onChange(text)}
                onFinal={(text) => onChange(text)}
                onAutoSend={() => {
                  setTimeout(() => { if (canSend || trimmed.length === 0) onSend(); }, 50);
                }}
              />
              {iconBtn(ARIA_LABELS.camera, "button-action-camera", () => openCamera(), Camera, "Camera (Snap or Live Vision)")}
              {iconBtn(ARIA_LABELS.screen, "button-action-screen", () => openScreenShare(), Monitor, "Screen share (Ask or Proactive)")}
              {iconBtn(ARIA_LABELS.file, "button-action-file", () => fileInputRef.current?.click(), Paperclip, "Attach file (max 25 MB, 10 per message)")}
              {iconBtn(ARIA_LABELS.agent, "button-action-agent", toggleAgentMode, Bot,
                agentMode ? "Agent mode ON — click to turn off" : "Agent mode (autonomous research + follow-ups)",
                false, agentMode ? "text-primary bg-primary/10" : "")}
              {iconBtn(ARIA_LABELS.web, "button-action-web", triggerWebTask, Globe, "Web task — let AI control a browser", launchingWeb || disabled)}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              data-testid="input-file"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                if (list.length && onFilesPicked) onFilesPicked(list);
                if (e.target) e.target.value = "";
              }}
            />
          </div>

          <div className="relative flex-1 py-1.5">
            <TextareaAutosize
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              placeholder={dragOver ? "Drop files to attach…" : agentMode ? "Tell Ezbo what to research…" : "Message EzboAI..."}
              maxRows={8}
              minRows={1}
              disabled={disabled}
              data-testid="input-message"
              className={cn(
                "block w-full resize-none border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0",
                "leading-6",
              )}
            />
            {showCounter && (
              <div className="pointer-events-none absolute -bottom-0.5 right-1 text-[10px] text-muted-foreground/70">
                {value.length}
              </div>
            )}
          </div>

          <div className="pb-0.5 pr-0.5">
            {isStreaming ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="icon"
                    className="h-9 w-9 rounded-xl bg-destructive hover:bg-destructive/90 hover-elevate active-elevate-2"
                    onClick={onStop}
                    aria-label="Stop"
                    data-testid="button-stop"
                  >
                    <StopCircle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Stop</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    disabled={!canSend}
                    onClick={handleSendOrWebTask}
                    aria-label="Send"
                    className="h-9 w-9 rounded-xl shadow-sm shadow-primary/20 hover-elevate active-elevate-2"
                    data-testid="button-send"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Send (Enter)</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/60 hidden sm:block">
          Press Enter to send, Shift+Enter for a new line. AI can make mistakes — please verify.
        </p>
      </div>

      <CameraOverlay
        onSnap={(file) => {
          if (onFilesPicked) onFilesPicked([file]);
          else toast.error("Attachment system not ready.");
        }}
      />
      <ScreenShareOverlay />
    </div>
  );
}
