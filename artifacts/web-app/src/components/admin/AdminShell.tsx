import { useState, type ReactNode } from "react";
import { Menu, ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

export interface AdminNavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

interface AdminShellProps {
  items: AdminNavItem[];
  active: string;
  onChange: (id: string) => void;
  onLogout: () => void;
  children: ReactNode;
}

/**
 * Standalone shell for the admin panel. Intentionally does NOT use the
 * regular AppShell — admins should not see the user-facing chat sidebar
 * or user menu while operating the platform.
 */
export function AdminShell({ items, active, onChange, onLogout, children }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const renderNav = (close?: () => void) => (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <div className="mb-3 flex items-center gap-2 px-2 py-2">
        <Logo size="sm" />
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Admin
        </span>
      </div>
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onChange(item.id);
              close?.();
            }}
            data-testid={`admin-nav-${item.id}`}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
              "hover-elevate active-elevate-2",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground",
            )}
          >
            <span className="flex h-4 w-4 items-center justify-center">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
      <div className="mt-auto border-t border-sidebar-border pt-2">
        <button
          type="button"
          onClick={() => {
            onLogout();
            close?.();
          }}
          data-testid="button-admin-logout"
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-sidebar-foreground hover-elevate active-elevate-2"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="hidden lg:flex lg:w-64 lg:flex-shrink-0 border-r border-sidebar-border bg-sidebar">
        {renderNav()}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 flex-shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md md:px-4">
          <div className="flex flex-shrink-0 items-center gap-2 lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover-elevate active-elevate-2"
                  aria-label="Open admin menu"
                  data-testid="button-admin-mobile-menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 border-r border-sidebar-border bg-sidebar">
                <SheetHeader className="sr-only">
                  <SheetTitle>Admin Navigation</SheetTitle>
                </SheetHeader>
                {renderNav(() => setMobileOpen(false))}
              </SheetContent>
            </Sheet>
            <Logo size="sm" />
          </div>

          <div className="flex flex-1 items-center gap-2">
            <span className="hidden text-sm font-medium text-foreground lg:inline">
              {items.find((i) => i.id === active)?.label ?? "Admin"}
            </span>
            <span className="text-sm text-muted-foreground lg:hidden">
              {items.find((i) => i.id === active)?.label ?? "Admin"}
            </span>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto" data-testid="admin-main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
