import { useEffect, useState } from "react";
import {
  KeyRound,
  Server,
  BarChart3,
  ListOrdered,
  Loader2,
  Lock,
  Shield,
  Sparkles,
  Users,
  Mail,
  Mic,
  Globe,
  LayoutDashboard,
} from "lucide-react";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell, type AdminNavItem } from "@/components/admin/AdminShell";
import { DashboardTab } from "@/components/admin/DashboardTab";
import { ProvidersTab } from "@/components/admin/ProvidersTab";
import { ModelsTab } from "@/components/admin/ModelsTab";
import { RoutingTab } from "@/components/admin/RoutingTab";
import { UsageTab } from "@/components/admin/UsageTab";
import { CredentialsTab } from "@/components/admin/CredentialsTab";
import { AccessRulesTab } from "@/components/admin/AccessRulesTab";
import { EzboTiersTab } from "@/components/admin/EzboTiersTab";
import { UsersTab } from "@/components/admin/UsersTab";
import { SmtpTab } from "@/components/admin/SmtpTab";
import { ElevenLabsTab } from "@/components/admin/ElevenLabsTab";
import { WebSearchTab } from "@/components/admin/WebSearchTab";
import { apiClient } from "@/lib/api";

const NAV_ITEMS: AdminNavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "users", label: "Users", icon: <Users className="h-4 w-4" /> },
  { id: "ezbo", label: "Ezbo Models", icon: <Sparkles className="h-4 w-4" /> },
  { id: "providers", label: "Providers", icon: <KeyRound className="h-4 w-4" /> },
  { id: "models", label: "Models", icon: <Server className="h-4 w-4" /> },
  { id: "routing", label: "Routing", icon: <ListOrdered className="h-4 w-4" /> },
  { id: "usage", label: "Usage", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "credentials", label: "Vault", icon: <Lock className="h-4 w-4" /> },
  { id: "access", label: "Access", icon: <Shield className="h-4 w-4" /> },
  { id: "smtp", label: "SMTP", icon: <Mail className="h-4 w-4" /> },
  { id: "elevenlabs", label: "ElevenLabs", icon: <Mic className="h-4 w-4" /> },
  { id: "web-search", label: "Web Search", icon: <Globe className="h-4 w-4" /> },
];

const STORAGE_KEY = "ezboai-admin-active-section";

function renderSection(id: string) {
  switch (id) {
    case "dashboard":
      return <DashboardTab />;
    case "users":
      return <UsersTab />;
    case "ezbo":
      return <EzboTiersTab />;
    case "providers":
      return <ProvidersTab />;
    case "models":
      return <ModelsTab />;
    case "routing":
      return <RoutingTab />;
    case "usage":
      return <UsageTab />;
    case "credentials":
      return <CredentialsTab />;
    case "access":
      return <AccessRulesTab />;
    case "smtp":
      return <SmtpTab />;
    case "elevenlabs":
      return <ElevenLabsTab />;
    case "web-search":
      return <WebSearchTab />;
    default:
      return <DashboardTab />;
  }
}

export default function AdminPage() {
  const [authState, setAuthState] = useState<"checking" | "logged-out" | "logged-in">(
    "checking",
  );
  const [active, setActive] = useState<string>(() => {
    if (typeof window === "undefined") return "dashboard";
    return window.localStorage.getItem(STORAGE_KEY) ?? "dashboard";
  });

  useEffect(() => {
    apiClient
      .get<{ loggedIn: boolean }>("/admin/me")
      .then((res) => setAuthState(res.loggedIn ? "logged-in" : "logged-out"))
      .catch(() => setAuthState("logged-out"));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, active);
    }
  }, [active]);

  const handleLogout = async () => {
    await apiClient.post("/admin/logout").catch(() => undefined);
    setAuthState("logged-out");
  };

  if (authState === "checking") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (authState === "logged-out") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <AdminLogin onSuccess={() => setAuthState("logged-in")} />
        </div>
      </div>
    );
  }

  return (
    <AdminShell
      items={NAV_ITEMS}
      active={active}
      onChange={setActive}
      onLogout={handleLogout}
    >
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{renderSection(active)}</div>
    </AdminShell>
  );
}
