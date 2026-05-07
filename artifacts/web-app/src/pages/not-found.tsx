import { Home, Compass } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";

export default function NotFound() {
  return (
    <AppShell>
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Compass className="h-8 w-8" />
        </div>
        <p className="mt-6 text-7xl font-bold tracking-tight text-foreground">404</p>
        <h1 className="mt-2 text-xl font-semibold text-foreground" lang="bn">
          Page khuje pawa jay nai
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Apni je page khujchen seta exist kore na, ba sorano hoyeche
        </p>
        <Button
          asChild
          variant="default"
          className="mt-6 gap-2 hover-elevate active-elevate-2"
        >
          <Link href="/" data-testid="button-go-home">
            <Home className="h-4 w-4" />
            <span>Home e firen</span>
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}
