import { useState, type ReactNode } from "react";
import { Menu, Settings as SettingsIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { SidebarContent } from "@/components/Sidebar";
import { PrivacyIndicator } from "@/components/PrivacyIndicator";
import { UserMenu } from "@/components/auth/UserMenu";

interface AppShellProps {
  children: ReactNode;
  title?: string;
  headerCenter?: ReactNode;
  headerRight?: ReactNode;
  footer?: ReactNode;
  hideSettingsLink?: boolean;
  scrollContent?: boolean;
}

export function AppShell({
  children,
  title,
  headerCenter,
  headerRight,
  footer,
  hideSettingsLink,
  scrollContent = true,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="hidden lg:flex lg:w-72 lg:flex-shrink-0 border-r border-sidebar-border">
        <SidebarContent />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 flex-shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md md:px-4">
          <div className="flex flex-shrink-0 items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden hover-elevate active-elevate-2"
                  aria-label="Open menu"
                  data-testid="button-mobile-menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 border-r border-sidebar-border bg-sidebar">
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation Menu</SheetTitle>
                </SheetHeader>
                <SidebarContent onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="lg:hidden">
              <Logo size="sm" />
            </div>
            {headerCenter && (
              <div className="hidden lg:block">
                <Logo size="sm" />
              </div>
            )}
            {title && !headerCenter && (
              <h1
                className="hidden lg:block text-base font-medium text-foreground"
                data-testid="text-page-title"
              >
                {title}
              </h1>
            )}
          </div>

          <div className="flex flex-1 items-center justify-center min-w-0 px-2">
            {headerCenter ?? (title ? (
              <span className="lg:hidden text-sm text-muted-foreground truncate">{title}</span>
            ) : null)}
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            <PrivacyIndicator />
            {headerRight}
            {!hideSettingsLink && (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="hidden md:inline-flex hover-elevate active-elevate-2"
              >
                <Link href="/settings" aria-label="Settings" data-testid="link-settings">
                  <SettingsIcon className="h-[1.15rem] w-[1.15rem]" />
                </Link>
              </Button>
            )}
            <div className="hidden md:inline-flex"><ThemeToggle /></div>
            <UserMenu />
          </div>
        </header>

        {scrollContent ? (
          <main className="flex-1 overflow-y-auto" data-testid="main-content">
            {children}
          </main>
        ) : (
          <main className="flex flex-1 flex-col overflow-hidden" data-testid="main-content">
            {children}
          </main>
        )}

        {footer}
      </div>
    </div>
  );
}
