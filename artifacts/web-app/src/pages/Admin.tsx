import { useEffect, useState } from "react";
import { ShieldCheck, KeyRound, Server, BarChart3, ListOrdered, Loader2, Lock, Shield, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { ProvidersTab } from "@/components/admin/ProvidersTab";
import { ModelsTab } from "@/components/admin/ModelsTab";
import { RoutingTab } from "@/components/admin/RoutingTab";
import { UsageTab } from "@/components/admin/UsageTab";
import { CredentialsTab } from "@/components/admin/CredentialsTab";
import { AccessRulesTab } from "@/components/admin/AccessRulesTab";
import { EzboTiersTab } from "@/components/admin/EzboTiersTab";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";

export default function AdminPage() {
  const [authState, setAuthState] = useState<"checking" | "logged-out" | "logged-in">(
    "checking",
  );

  useEffect(() => {
    apiClient
      .get<{ loggedIn: boolean }>("/admin/me")
      .then((res) => setAuthState(res.loggedIn ? "logged-in" : "logged-out"))
      .catch(() => setAuthState("logged-out"));
  }, []);

  const handleLogout = async () => {
    await apiClient.post("/admin/logout").catch(() => undefined);
    setAuthState("logged-out");
  };

  if (authState === "checking") {
    return (
      <AppShell title="Admin">
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (authState === "logged-out") {
    return (
      <AppShell title="Admin">
        <AdminLogin onSuccess={() => setAuthState("logged-in")} />
      </AppShell>
    );
  }

  return (
    <AppShell
      headerCenter={
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Admin Panel
        </div>
      }
      headerRight={
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          data-testid="button-admin-logout"
        >
          Sign out
        </Button>
      }
      scrollContent
    >
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage Ezbo model behaviour, provider keys, routing, and usage.
          </p>
        </div>

        <Tabs defaultValue="ezbo" className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:grid-cols-7">
            <TabsTrigger value="ezbo" className="gap-1.5" data-testid="tab-ezbo">
              <Sparkles className="h-3.5 w-3.5" /> Ezbo Models
            </TabsTrigger>
            <TabsTrigger value="providers" className="gap-1.5" data-testid="tab-providers">
              <KeyRound className="h-3.5 w-3.5" /> Providers
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-1.5" data-testid="tab-models">
              <Server className="h-3.5 w-3.5" /> Models
            </TabsTrigger>
            <TabsTrigger value="routing" className="gap-1.5" data-testid="tab-routing">
              <ListOrdered className="h-3.5 w-3.5" /> Routing
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-1.5" data-testid="tab-usage">
              <BarChart3 className="h-3.5 w-3.5" /> Usage
            </TabsTrigger>
            <TabsTrigger value="credentials" className="gap-1.5" data-testid="tab-credentials">
              <Lock className="h-3.5 w-3.5" /> Vault
            </TabsTrigger>
            <TabsTrigger value="access" className="gap-1.5" data-testid="tab-access">
              <Shield className="h-3.5 w-3.5" /> Access
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ezbo" className="mt-6">
            <EzboTiersTab />
          </TabsContent>
          <TabsContent value="providers" className="mt-6">
            <ProvidersTab />
          </TabsContent>
          <TabsContent value="models" className="mt-6">
            <ModelsTab />
          </TabsContent>
          <TabsContent value="routing" className="mt-6">
            <RoutingTab />
          </TabsContent>
          <TabsContent value="usage" className="mt-6">
            <UsageTab />
          </TabsContent>
          <TabsContent value="credentials" className="mt-6">
            <CredentialsTab />
          </TabsContent>
          <TabsContent value="access" className="mt-6">
            <AccessRulesTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
