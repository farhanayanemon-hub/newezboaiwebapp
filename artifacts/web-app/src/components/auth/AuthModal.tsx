import { useState, type FormEvent } from "react";
import { Loader2, Mail, Lock, User as UserIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient, ApiError } from "@/lib/api";
import { useAuth, type AuthUser } from "@/lib/auth";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: "login" | "signup";
}

export function AuthModal({ open, onOpenChange, defaultMode = "login" }: AuthModalProps) {
  const { setUser } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setLoading(false);
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(() => {
      setEmail("");
      setPassword("");
      setName("");
      setError(null);
    }, 200);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    reset();
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const body: Record<string, string> =
        mode === "login" ? { email, password } : { email, password, name };
      const res = await apiClient.post<{ user: AuthUser }>(path, body);
      setUser(res.user);
      close();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError("Invalid email or password.");
        else if (err.status === 409) setError("Email already registered.");
        else if (err.status === 429) setError("Too many attempts. Please wait and try again.");
        else if (err.status === 400) setError("Please check your input. Password must be at least 8 characters.");
        else setError("Something went wrong. Please try again.");
      } else {
        setError("Network error. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "login" ? "Welcome back" : "Create your account"}</DialogTitle>
          <DialogDescription>
            {mode === "login"
              ? "Log in to access your chats and account."
              : "Sign up to save your chats and personalize EzboAI."}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => { setMode(v as "login" | "signup"); reset(); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
            <TabsTrigger value="signup" data-testid="tab-signup">Sign Up</TabsTrigger>
          </TabsList>
          <TabsContent value={mode} className="mt-4">
            <form onSubmit={submit} className="space-y-3">
              {mode === "signup" && (
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Your name (optional)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-9"
                    maxLength={80}
                    data-testid="input-auth-name"
                  />
                </div>
              )}
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  autoFocus
                  required
                  autoComplete={mode === "login" ? "email" : "email"}
                  data-testid="input-auth-email"
                />
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder={mode === "login" ? "Password" : "Password (min 8 chars)"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  required
                  minLength={mode === "signup" ? 8 : 1}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  data-testid="input-auth-password"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" data-testid="text-auth-error">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-auth-submit">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "login" ? "Log in" : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
