import { useEffect, useState, type FormEvent } from "react";
import { Loader2, User as UserIcon, Mail, KeyRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiClient, ApiError } from "@/lib/api";
import { useAuth, type AuthUser } from "@/lib/auth";
import { toast } from "sonner";

export default function AccountPage() {
  const { user, loading, refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  if (loading) {
    return (
      <AppShell title="Account">
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell title="Account">
        <div className="flex h-full items-center justify-center px-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Not signed in</CardTitle>
              <CardDescription>Please log in to view your account.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppShell>
    );
  }

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await apiClient.patch<{ user: AuthUser }>("/auth/account", { name, email });
      await refresh();
      toast.success("Profile updated");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("That email is already in use.");
      } else {
        toast.error("Failed to save profile");
      }
    } finally {
      setProfileSaving(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setPwSaving(true);
    try {
      await apiClient.post("/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error("Current password is incorrect");
      } else {
        toast.error("Failed to change password");
      }
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <AppShell title="Account">
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserIcon className="h-5 w-5" /> Profile</CardTitle>
            <CardDescription>Update your name and email address.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  data-testid="input-account-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                    data-testid="input-account-email"
                  />
                </div>
              </div>
              <Button type="submit" disabled={profileSaving} data-testid="button-save-profile">
                {profileSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Change password</CardTitle>
            <CardDescription>Use a strong password of at least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={changePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cur-pw">Current password</Label>
                <Input
                  id="cur-pw"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  data-testid="input-current-password"
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="new-pw">New password</Label>
                <Input
                  id="new-pw"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-pw">Confirm new password</Label>
                <Input
                  id="confirm-pw"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  data-testid="input-confirm-password"
                />
              </div>
              <Button type="submit" disabled={pwSaving} data-testid="button-change-password">
                {pwSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <div>User ID: <span className="font-mono text-xs text-foreground">{user.id}</span></div>
            <div>Role: <span className="text-foreground">{user.role}</span></div>
            <div>Joined: <span className="text-foreground">{new Date(user.createdAt).toLocaleDateString()}</span></div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
