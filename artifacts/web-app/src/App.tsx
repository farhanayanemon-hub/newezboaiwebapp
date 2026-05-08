import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import ChatPage from "@/pages/Chat";
import AdminPage from "@/pages/Admin";
import SettingsPage from "@/pages/Settings";
import MemoriesPage from "@/pages/Memories";
import FilesPage from "@/pages/Files";
import RemindersPage from "@/pages/Reminders";
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

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={ChatPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/memories" component={MemoriesPage} />
      <Route path="/files" component={FilesPage} />
      <Route path="/reminders" component={RemindersPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={150}>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
