import { memo, useState } from "react";
import {
  Copy,
  Check,
  Sparkles,
  User as UserIcon,
  FileText,
  FileSpreadsheet,
  FileCode2,
  File as FileIcon,
  Download,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion } from "framer-motion";
import type { Message, MessageAttachment } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme-provider";
import { toast } from "sonner";
import { fileServingUrl, formatFileSize, type FileKind } from "@/lib/files";

interface MessageBubbleProps {
  message: Message;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className"]],
    span: [...(defaultSchema.attributes?.span ?? []), ["className"]],
  },
};

function formatLatency(ms?: number): string | null {
  if (!ms || ms <= 0) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function iconFor(mime: string | undefined): typeof FileIcon {
  if (!mime) return FileIcon;
  if (mime.includes("spreadsheet") || mime === "text/csv" || mime === "application/vnd.ms-excel")
    return FileSpreadsheet;
  if (
    mime === "application/json" ||
    mime.startsWith("text/x-") ||
    mime === "text/javascript" ||
    mime === "application/javascript"
  )
    return FileCode2;
  if (mime.startsWith("text/") || mime === "application/pdf" || mime.includes("word"))
    return FileText;
  return FileIcon;
}

function inferKind(att: MessageAttachment): FileKind {
  if (att.kind === "image" || att.mimeType?.startsWith("image/")) return "image";
  if (att.mimeType === "application/pdf") return "pdf";
  if (att.mimeType?.includes("word")) return "word";
  if (
    att.mimeType?.includes("spreadsheet") ||
    att.mimeType === "text/csv" ||
    att.mimeType === "application/vnd.ms-excel"
  )
    return "spreadsheet";
  return "other";
}

function AttachmentCard({ att }: { att: MessageAttachment }) {
  const kind = inferKind(att);
  const url = att.url || (att.id ? fileServingUrl(att.id) : "#");
  const downloadUrl = att.id ? fileServingUrl(att.id, true) : url;

  if (kind === "image") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-lg border border-border/40 bg-muted/30 hover:opacity-90"
      >
        <img
          src={url}
          alt={att.name}
          className="max-h-64 w-auto max-w-full object-contain"
          loading="lazy"
        />
        <div className="flex items-center justify-between gap-2 px-2 py-1 text-[10px] text-muted-foreground">
          <span className="truncate">{att.name}</span>
          <span>{formatFileSize(att.size)}</span>
        </div>
      </a>
    );
  }

  const Icon = iconFor(att.mimeType);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-2 py-1.5 text-xs text-foreground hover:bg-card"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="max-w-[200px] truncate font-medium leading-tight">{att.name}</span>
        <span className="text-[10px] leading-tight text-muted-foreground">
          {formatFileSize(att.size)}
        </span>
      </div>
      <a
        href={downloadUrl}
        onClick={(e) => e.stopPropagation()}
        className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        aria-label="Download"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </a>
  );
}

// Strip provider/model names from error strings so users only ever see Ezbo AI branding.
function sanitizeProviderError(raw: string): string {
  if (!raw) return "Something went wrong. Please try again.";
  const providerPattern = /\b(openai|anthropic|claude|gpt[-\s]?\d[\w.-]*|gpt|chatgpt|google|gemini|mistral|llama|deepseek|xai|grok|cohere|together(ai)?|groq|perplexity|azure[-\s]?openai|bedrock|vertex(ai)?|huggingface|ollama|replicate|fireworks|elevenlabs)\b/gi;
  const cleaned = raw.replace(providerPattern, "Ezbo AI");
  // Collapse repeated brand mentions and tidy whitespace.
  return cleaned.replace(/(Ezbo AI[\s:.-]*)+/g, "Ezbo AI ").replace(/\s+/g, " ").trim() || "Something went wrong. Please try again.";
}


function MessageBubbleImpl({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const { resolvedTheme } = useTheme();
  const isUser = message.role === "user";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success("Copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy");
    }
  };

  const meta = message.meta;
  const totalTokens = (meta?.inputTokens ?? 0) + (meta?.outputTokens ?? 0);
  const latency = formatLatency(meta?.latencyMs);
  const attachments = message.attachments ?? [];

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

        {attachments.length > 0 && (
          <div
            className={cn(
              "mb-2 flex flex-wrap gap-1.5",
              isUser ? "[&_a]:bg-primary-foreground/10 [&_a]:text-primary-foreground" : "",
            )}
            data-testid={`attachments-${message.id}`}
          >
            {attachments.map((a) => (
              <AttachmentCard key={a.id ?? a.name} att={a} />
            ))}
          </div>
        )}

        {message.content && (
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
              rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const lang = match?.[1];
                  const inline = (props as { inline?: boolean }).inline;
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
                    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                      {children}
                    </a>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {!isUser && meta?.sources && meta.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="message-sources">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Sources</span>
            {meta.sources.map((s, i) => (
              <a
                key={`${s.url}-${i}`}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                title={s.snippet || s.title}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
              >
                <span className="font-medium">[{i + 1}]</span>
                <span className="truncate">{s.domain || s.title}</span>
              </a>
            ))}
          </div>
        )}
        {!isUser && meta && (meta.provider || meta.error) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/80">
            {meta.error ? (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
                {sanitizeProviderError(meta.error)}
              </span>
            ) : (
              <>
                {/* Brand pill removed per user request — was redundant under every message. */}
                {latency && <span>{latency}</span>}
                {totalTokens > 0 && <span>· {totalTokens.toLocaleString()} tokens</span>}
              </>
            )}
          </div>
        )}

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
