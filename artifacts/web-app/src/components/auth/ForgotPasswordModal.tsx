import { useState, type FormEvent } from "react";
import { Loader2, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient, ApiError } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail?: string;
}

export function ForgotPasswordModal({ open, onOpenChange, defaultEmail = "" }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiClient.post("/auth/forgot-password", { email });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError("Password reset email is not configured yet. Please contact support.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setTimeout(() => {
            setDone(false);
            setError(null);
          }, 200);
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset your password</DialogTitle>
          <DialogDescription>
            We&apos;ll email you a link to set a new password.
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <p className="text-sm text-muted-foreground">
            If an account exists for that email, a reset link is on its way. Check
            your inbox (and spam folder).
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-9"
                autoFocus
                data-testid="input-forgot-email"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !email} data-testid="button-forgot-submit">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send reset link
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
