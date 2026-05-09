import { Settings as SettingsIcon, Sun, Moon, Monitor, Bell, User, Zap, Mic, Globe, ArrowLeft, ShieldCheck, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AppShell } from "@/components/AppShell";
import { useTheme } from "@/lib/theme-provider";
import { QuickActionsManager } from "@/components/QuickActionsManager";
import { VoiceSettings } from "@/components/VoiceSettings";
import { WebSearchSettings } from "@/components/WebSearchSettings";
import { NotificationSettings } from "@/components/NotificationSettings";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "1.0.0";

  const themeOptions = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
  ];

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <div className="mb-4">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 hover-elevate active-elevate-2"
            data-testid="button-back-to-chat"
          >
            <Link href="/" aria-label="Back to chat">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to chat
            </Link>
          </Button>
        </div>

        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Customize your EzboAI experience</p>
          </div>
        </div>

        <div className="space-y-4">
          <Card data-testid="card-theme-settings">
            <CardHeader>
              <CardTitle className="text-base">Theme</CardTitle>
              <CardDescription>Light, dark, or follow the system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {themeOptions.map((opt) => {
                  const Icon = opt.icon;
                  const active = theme === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      variant={active ? "default" : "outline"}
                      onClick={() => setTheme(opt.value)}
                      className="flex h-auto flex-col gap-1.5 py-3 hover-elevate active-elevate-2"
                      data-testid={`theme-button-${opt.value}`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs">{opt.label}</span>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Separator />

          <Card data-testid="card-web-search-settings">
            <CardHeader>
              <div className="flex items-start gap-3">
                <Globe className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <CardTitle className="text-base">Web Search</CardTitle>
                  <CardDescription>
                    Let Ezbo fetch live results when you ask about current events
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <WebSearchSettings />
            </CardContent>
          </Card>

          <Separator />

          <Card data-testid="card-voice-settings">
            <CardHeader>
              <div className="flex items-start gap-3">
                <Mic className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <CardTitle className="text-base">Voice</CardTitle>
                  <CardDescription>
                    Speech-to-text, text-to-speech, and hands-free settings
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <VoiceSettings />
            </CardContent>
          </Card>

          <Separator />

          <Card data-testid="card-quick-actions">
            <CardHeader>
              <div className="flex items-start gap-3">
                <Zap className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <CardTitle className="text-base">Quick Actions</CardTitle>
                  <CardDescription>
                    Manage your custom one-click prompt templates
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <QuickActionsManager />
            </CardContent>
          </Card>

          <Separator />

          <Card data-testid="card-notifications">
            <CardHeader>
              <div className="flex items-start gap-3">
                <Bell className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <CardTitle className="text-base">Notifications</CardTitle>
                  <CardDescription>
                    Reminders and browser push notifications
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <NotificationSettings />
            </CardContent>
          </Card>

          <Card data-testid="card-account">
            <CardHeader>
              <div className="flex items-start gap-3">
                <User className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <CardTitle className="text-base">Account</CardTitle>
                  <CardDescription>
                    EzboAI runs as a single-tenant app on your own domain — no
                    sign-in required.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-muted-foreground">Domain</span>
                <span className="font-medium" data-testid="text-account-domain">
                  {typeof window !== "undefined" ? window.location.hostname : "ezboai.com"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <span className="text-muted-foreground">Version</span>
                <span className="font-medium" data-testid="text-account-version">
                  {appVersion}
                </span>
              </div>
              <Button
                asChild
                variant="outline"
                className="w-full justify-start hover-elevate active-elevate-2"
                data-testid="button-open-admin"
              >
                <Link href="/admin" aria-label="Open admin">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Admin — AI keys, vault &amp; access rules
                  <ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
