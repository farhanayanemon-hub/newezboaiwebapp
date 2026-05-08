import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Mic, Camera, Monitor, Paperclip, Send, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  autoFocus?: boolean;
  /** When provided, the paperclip + drag-drop are wired to this handler. */
  onFilesPicked?: (files: File[]) => void;
  /** True when at least one file has been attached but not yet sent. */
  hasAttachments?: boolean;
}

const PHASE_HINTS = {
  mic: "Voice input — coming soon",
  camera: "Camera — coming soon",
  screen: "Screen share — coming soon",
};

const ARIA_LABELS = {
  mic: "Voice input",
  camera: "Camera",
  screen: "Screen share",
  file: "Attach file",
};

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
  const dragDepth = useRef(0);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const trimmed = value.trim();
  const canSend =
    !disabled && !isStreaming && (trimmed.length > 0 || !!hasAttachments);
  const showCounter = value.length > 500;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !composing) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  const placeholderHints: Array<{
    key: keyof typeof PHASE_HINTS;
    icon: typeof Mic;
  }> = [
    { key: "mic", icon: Mic },
    { key: "camera", icon: Camera },
    { key: "screen", icon: Monitor },
  ];

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    dragDepth.current = 0;
    if (!onFilesPicked) return;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) onFilesPicked(files);
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!onFilesPicked) return;
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      dragDepth.current += 1;
      setDragOver(true);
    }
  };
  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (onFilesPicked && e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
    }
  };

  return (
    <div
      className="border-t border-border bg-background/95 backdrop-blur-sm"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6 sm:py-4">
        <div
          className={cn(
            "flex items-end gap-2 rounded-2xl border border-input bg-card px-2 py-2 shadow-sm transition-all",
            "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 focus-within:shadow-md",
            dragOver && "border-primary ring-2 ring-primary/40 bg-primary/5",
          )}
        >
          <div className="flex items-center gap-0.5 pb-0.5 pl-0.5">
            {placeholderHints.map(({ key, icon: Icon }) => (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover-elevate active-elevate-2"
                    aria-label={ARIA_LABELS[key]}
                    onClick={() => toast.info(PHASE_HINTS[key])}
                    data-testid={`button-action-${key}`}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{PHASE_HINTS[key]}</TooltipContent>
              </Tooltip>
            ))}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover-elevate active-elevate-2"
                  aria-label={ARIA_LABELS.file}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-action-file"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Attach file (max 25 MB, 10 per message)</TooltipContent>
            </Tooltip>
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
              placeholder={dragOver ? "Drop files to attach…" : "Message EzboAI..."}
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
                    onClick={onSend}
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

        <p className="mt-2 text-center text-[10px] text-muted-foreground/60">
          Press Enter to send, Shift+Enter for a new line. AI can make mistakes — please verify.
        </p>
      </div>
    </div>
  );
}
