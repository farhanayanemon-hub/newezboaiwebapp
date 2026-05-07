import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
}

const PHASE_HINTS = {
  mic: "ভয়েস ইনপুট — Phase 7 এ আসবে",
  camera: "ক্যামেরা — Phase 8 এ আসবে",
  screen: "স্ক্রিন শেয়ার — Phase 9 এ আসবে",
  file: "ফাইল আপলোড — Phase 6 এ আসবে",
};

const ARIA_LABELS = {
  mic: "ভয়েস ইনপুট",
  camera: "ক্যামেরা",
  screen: "স্ক্রিন শেয়ার",
  file: "ফাইল যোগ করুন",
};

export function InputBar({
  value,
  onChange,
  onSend,
  disabled,
  isStreaming,
  onStop,
  autoFocus,
}: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const trimmed = value.trim();
  const canSend = !disabled && !isStreaming && trimmed.length > 0;
  const showCounter = value.length > 500;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !composing) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  const iconButtons: Array<{
    key: keyof typeof PHASE_HINTS;
    icon: typeof Mic;
  }> = [
    { key: "mic", icon: Mic },
    { key: "camera", icon: Camera },
    { key: "screen", icon: Monitor },
    { key: "file", icon: Paperclip },
  ];

  return (
    <div className="border-t border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6 sm:py-4">
        <div
          className={cn(
            "flex items-end gap-2 rounded-2xl border border-input bg-card px-2 py-2 shadow-sm transition-shadow",
            "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 focus-within:shadow-md",
          )}
        >
          {/* Left action buttons */}
          <div className="flex items-center gap-0.5 pb-0.5 pl-0.5">
            {iconButtons.map(({ key, icon: Icon }) => (
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
                <TooltipContent side="top" lang="bn">
                  {PHASE_HINTS[key]}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Textarea */}
          <div className="relative flex-1 py-1.5">
            <TextareaAutosize
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              placeholder="Bangla, Banglish, ba English e likhun..."
              maxRows={8}
              minRows={1}
              disabled={disabled}
              data-testid="input-message"
              className={cn(
                "block w-full resize-none border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0",
                "leading-6",
              )}
              style={{ fontFamily: "var(--app-font-bengali)" }}
            />
            {showCounter && (
              <div className="pointer-events-none absolute -bottom-0.5 right-1 text-[10px] text-muted-foreground/70">
                {value.length}
              </div>
            )}
          </div>

          {/* Send / Stop button */}
          <div className="pb-0.5 pr-0.5">
            {isStreaming ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="icon"
                    className="h-9 w-9 rounded-xl bg-destructive hover:bg-destructive/90 hover-elevate active-elevate-2"
                    onClick={onStop}
                    aria-label="থামান"
                    data-testid="button-stop"
                  >
                    <StopCircle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" lang="bn">থামান</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    disabled={!canSend}
                    onClick={onSend}
                    aria-label="পাঠান"
                    className="h-9 w-9 rounded-xl shadow-sm shadow-primary/20 hover-elevate active-elevate-2"
                    data-testid="button-send"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" lang="bn">পাঠান (Enter)</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <p className="mt-2 text-center text-[10px] text-muted-foreground/60">
          Enter pathate, Shift+Enter notun line. AI sometimes mistakes kore — verify korben.
        </p>
      </div>
    </div>
  );
}
