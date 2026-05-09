import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth";
import { BrowserPreviewPanel } from "@/components/BrowserPreviewPanel";
import ChatPage from "@/pages/Chat";
import AdminPage from "@/pages/Admin";
import SettingsPage from "@/pages/Settings";
import MemoriesPage from "@/pages/Memories";
import FilesPage from "@/pages/Files";
import RemindersPage from "@/pages/Reminders";
import AutomationsPage from "@/pages/Automations";
import AccountPage from "@/pages/Account";
import OnboardingPage, { ONBOARDING_FLAG } from "@/pages/Onboarding";
import ResetPasswordPage from "@/pages/ResetPassword";
import VerifyEmailPage from "@/pages/VerifyEmail";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30 * 1000,
    },
  },
});

/** Redirect first-time visitors to the onboarding screen exactly once.
 * Skips for /admin, /onboarding itself, and links carrying tokens. */
function FirstVisitGate() {
  const [location, setLocation] = useLocation();
  const { loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    if (location !== "/") return;
    let seen = false;
    try {
      seen = !!window.localStorage.getItem(ONBOARDING_FLAG);
    } catch {
      seen = true; // localStorage blocked => skip onboarding
    }
    if (!seen) setLocation("/onboarding");
  }, [loading, location, setLocation]);

  return null;
}

function AppRoutes() {
  return (
    <>
      <FirstVisitGate />
      <Switch>
        <Route path="/" component={ChatPage} />
        <Route path="/onboarding" component={OnboardingPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/memories" component={MemoriesPage} />
        <Route path="/files" component={FilesPage} />
        <Route path="/reminders" component={RemindersPage} />
        <Route path="/automations" component={AutomationsPage} />
        <Route path="/account" component={AccountPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={150}>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppRoutes />
            </WouterRouter>
            <BrowserPreviewPanel />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
