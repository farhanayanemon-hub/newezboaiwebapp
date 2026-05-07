import { Settings as SettingsIcon, Languages, Sun, Moon, Monitor, Bell, User } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AppShell } from "@/components/AppShell";
import { useTheme } from "@/lib/theme-provider";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const themeOptions = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
  ];

  const languageOptions = [
    { value: "bn", label: "বাংলা", hint: "Bangla" },
    { value: "banglish", label: "Banglish", hint: "Mixed" },
    { value: "en", label: "English", hint: "English" },
  ];

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Apnar EzboAI experience customize korun</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Theme */}
          <Card data-testid="card-theme-settings">
            <CardHeader>
              <CardTitle className="text-base">Theme</CardTitle>
              <CardDescription>Light, Dark, ba System auto-switch</CardDescription>
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

          {/* Language */}
          <Card data-testid="card-language-settings">
            <CardHeader>
              <div className="flex items-start gap-3">
                <Languages className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <CardTitle className="text-base">Language</CardTitle>
                  <CardDescription>Apnar pochonder bhasha</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {languageOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={opt.value === "bn" ? "default" : "outline"}
                    disabled={opt.value !== "bn"}
                    className="flex h-auto flex-col gap-1 py-3 hover-elevate active-elevate-2"
                    data-testid={`language-button-${opt.value}`}
                  >
                    <span className="text-sm font-medium" lang={opt.value === "bn" ? "bn" : undefined}>
                      {opt.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{opt.hint}</span>
                  </Button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Banglish + English support Phase 3 e ashbe
              </p>
            </CardContent>
          </Card>

          <Separator />

          {/* Coming soon sections */}
          <Card className="opacity-70" data-testid="card-notifications-coming">
            <CardHeader>
              <div className="flex items-start gap-3">
                <Bell className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    Notifications
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Phase 8
                    </span>
                  </CardTitle>
                  <CardDescription>Reminder push notifications, browser alerts</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className="opacity-70" data-testid="card-account-coming">
            <CardHeader>
              <div className="flex items-start gap-3">
                <User className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    Account
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Phase 4
                    </span>
                  </CardTitle>
                  <CardDescription>Profile, preferences, conversation history sync</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
