import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Loader2, XCircle, MailCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, ApiError } from "@/lib/api";

type State = "verifying" | "success" | "error" | "missing";

export default function VerifyEmailPage() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<State>("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState("missing");
      return;
    }
    apiClient
      .post("/auth/verify-email/confirm", { token })
      .then(() => setState("success"))
      .catch((err) => {
        setState("error");
        if (err instanceof ApiError && err.status === 400) {
          setErrorMsg("This verification link is invalid or expired.");
        } else {
          setErrorMsg("Something went wrong. Please try again.");
        }
      });
  }, []);

  return (
    <AppShell title="Verify email" hideSettingsLink>
      <div className="flex h-full items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              {state === "success" ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : state === "error" || state === "missing" ? (
                <XCircle className="h-6 w-6 text-destructive" />
              ) : (
                <MailCheck className="h-6 w-6" />
              )}
            </div>
            <CardTitle className="mt-3">
              {state === "verifying" ? "Verifying…" : state === "success" ? "Email verified" : "Couldn't verify"}
            </CardTitle>
            <CardDescription>
              {state === "verifying" && "Just a moment."}
              {state === "success" && "Thanks! Your email is confirmed."}
              {state === "error" && errorMsg}
              {state === "missing" && "No verification token in the URL."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            {state === "verifying" ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <Button onClick={() => navigate("/")} data-testid="button-verify-done">Go to chat</Button>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
