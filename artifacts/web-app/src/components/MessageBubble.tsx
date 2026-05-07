import { memo, useState } from "react";
import { Copy, Check, Sparkles, User as UserIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion } from "framer-motion";
import type { Message } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme-provider";
import { toast } from "sonner";

interface MessageBubbleProps {
  message: Message;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageBubbleImpl({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const { resolvedTheme } = useTheme();
  const isUser = message.role === "user";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success("Copy hoye geche");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Copy korte parlam na");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "group/bubble flex w-full gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
      data-testid={`message-${message.role}-${message.id}`}
    >
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
      )}

      <div
        className={cn(
          "relative max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-card text-card-foreground border border-card-border rounded-bl-sm",
        )}
      >
        {/* Copy button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCopy}
              aria-label="Copy message"
              data-testid={`button-copy-${message.id}`}
              className={cn(
                "absolute -top-2 right-2 h-6 w-6 rounded-md opacity-0 transition-opacity group-hover/bubble:opacity-100 hover-elevate active-elevate-2 backdrop-blur-sm",
                isUser
                  ? "bg-primary/80 text-primary-foreground"
                  : "bg-card border border-card-border",
              )}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{copied ? "Copied" : "Copy"}</TooltipContent>
        </Tooltip>

        {/* Content */}
        <div
          className={cn(
            "prose prose-sm max-w-none break-words",
            isUser
              ? "prose-invert prose-p:text-primary-foreground prose-strong:text-primary-foreground prose-li:text-primary-foreground prose-headings:text-primary-foreground prose-a:text-primary-foreground prose-a:underline"
              : "dark:prose-invert prose-p:text-card-foreground",
            "prose-p:my-1.5 prose-pre:my-2 prose-pre:p-0 prose-pre:bg-transparent prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none",
          )}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || "");
                const lang = match?.[1];
                if (!inline && lang) {
                  return (
                    <SyntaxHighlighter
                      style={resolvedTheme === "dark" ? oneDark : oneLight}
                      language={lang}
                      PreTag="div"
                      customStyle={{
                        margin: 0,
                        padding: "0.75rem",
                        borderRadius: "0.5rem",
                        fontSize: "0.85em",
                      }}
                    >
                      {String(children).replace(/\n$/, "")}
                    </SyntaxHighlighter>
                  );
                }
                return (
                  <code
                    className={cn(
                      "rounded px-1 py-0.5 font-mono text-[0.85em]",
                      isUser
                        ? "bg-primary-foreground/20"
                        : "bg-muted text-foreground",
                    )}
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              a({ href, children, ...props }) {
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Timestamp */}
        <div
          className={cn(
            "mt-1 text-[10px] opacity-0 transition-opacity group-hover/bubble:opacity-70",
            isUser ? "text-right text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {formatTime(message.createdAt)}
        </div>
      </div>

      {isUser && (
        <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
          <UserIcon className="h-4 w-4" />
        </div>
      )}
    </motion.div>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
