import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Loader2, Lock, KeyRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, ApiError } from "@/lib/api";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await apiClient.post("/auth/reset-password", { token, newPassword: password });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("This reset link is invalid or expired. Request a new one.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title="Reset password" hideSettingsLink>
      <div className="flex h-full items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound className="h-6 w-6" />
            </div>
            <CardTitle className="mt-3">Set a new password</CardTitle>
            <CardDescription>
              {done ? "All set! You can sign in now." : "Choose a new password for your account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <Button className="w-full" onClick={() => navigate("/")} data-testid="button-reset-done">
                Go to chat
              </Button>
            ) : !token ? (
              <p className="text-sm text-destructive">Missing reset token. Please use the link from your email.</p>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="New password (min 8)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="pl-9"
                    autoFocus
                    data-testid="input-reset-password"
                  />
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    className="pl-9"
                    data-testid="input-reset-confirm"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading} data-testid="button-reset-submit">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Reset password
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
