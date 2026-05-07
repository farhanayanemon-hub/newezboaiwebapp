import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="flex w-full gap-3 justify-start"
      data-testid="typing-indicator"
    >
      <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="rounded-2xl rounded-bl-sm border border-card-border bg-card px-4 py-3.5 shadow-sm">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
              animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
