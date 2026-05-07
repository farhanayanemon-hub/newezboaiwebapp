import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "full" | "mark";
}

export function Logo({ className, size = "md", variant = "full" }: LogoProps) {
  const dimensions = {
    sm: { mark: "h-7 w-7", text: "text-base", gap: "gap-2" },
    md: { mark: "h-9 w-9", text: "text-lg", gap: "gap-2.5" },
    lg: { mark: "h-12 w-12", text: "text-2xl", gap: "gap-3" },
  }[size];

  return (
    <div className={cn("flex items-center", dimensions.gap, className)} data-testid="logo">
      <div
        className={cn(
          "relative flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm overflow-hidden",
          dimensions.mark,
        )}
      >
        <span className="font-bold tracking-tight" style={{ fontSize: size === "sm" ? "0.85rem" : size === "md" ? "1rem" : "1.4rem" }}>
          Ez
        </span>
        <div
          className="absolute -right-1 -bottom-1 h-3 w-3 rounded-full bg-accent"
          aria-hidden="true"
        />
      </div>
      {variant === "full" && (
        <span className={cn("font-semibold tracking-tight text-foreground", dimensions.text)}>
          EzboAI
        </span>
      )}
    </div>
  );
}
