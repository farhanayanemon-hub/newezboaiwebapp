import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2, Search, Shield, ShieldOff, LogIn, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient, ApiError } from "@/lib/api";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  bannedAt: string | null;
  banReason: string | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  projectCount: number;
  conversationCount: number;
}

interface UsersListResp {
  users: UserRow[];
  page: number;
  pageSize: number;
  total: number;
}

interface UserDetailResp {
  user: UserRow;
  stats: { projectCount: number; conversationCount: number; messageCount: number };
  recentConversations: { id: string; title: string; updatedAt: string }[];
  projects: { id: string; name: string; createdAt: string }[];
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return "—";
  }
}

export function UsersTab() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [confirmBan, setConfirmBan] = useState<UserRow | null>(null);
  const [banReason, setBanReason] = useState("");
  const pageSize = 25;

  const list = useQuery({
    queryKey: ["admin", "users", search, page],
    queryFn: () =>
      apiClient.get<UsersListResp>("/admin/users", {
        searchParams: { search: search || undefined, page, pageSize },
      }),
  });

  const detail = useQuery({
    queryKey: ["admin", "user", detailId],
    queryFn: () => apiClient.get<UserDetailResp>(`/admin/users/${detailId}`),
    enabled: !!detailId,
  });

  const banMut = useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      apiClient.post(`/admin/users/${input.id}/ban`, { reason: input.reason || undefined }),
    onSuccess: () => {
      toast.success("User banned");
      setConfirmBan(null);
      setBanReason("");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "user"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ban failed"),
  });

  const unbanMut = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/users/${id}/unban`),
    onSuccess: () => {
      toast.success("User unbanned");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "user"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Unban failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/users/${id}`),
    onSuccess: () => {
      toast.success("User deleted");
      setConfirmDelete(null);
      setDetailId(null);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const impersonateMut = useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/users/${id}/impersonate`),
    onSuccess: () => {
      toast.success("Impersonating user — opening chat");
      navigate("/");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 400) {
        toast.error("Cannot impersonate a banned user.");
      } else {
        toast.error(e instanceof Error ? e.message : "Impersonate failed");
      }
    },
  });

  const submitSearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / pageSize)) : 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2">
            <Input
              placeholder="Search by email or name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSearch()}
              data-testid="input-user-search"
            />
            <Button onClick={submitSearch} data-testid="button-user-search">
              Search
            </Button>
          </div>
          {list.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : list.data && list.data.users.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Joined</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-right">Projects</th>
                      <th className="px-3 py-2 text-right">Chats</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.users.map((u) => (
                      <tr
                        key={u.id}
                        className="border-t border-border hover:bg-muted/30"
                        data-testid={`row-user-${u.email}`}
                      >
                        <td className="px-3 py-2">
                          <button
                            className="text-left font-medium hover:underline"
                            onClick={() => setDetailId(u.id)}
                          >
                            {u.email}
                          </button>
                          {u.role === "admin" && (
                            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                              admin
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{u.name || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtDate(u.createdAt)}</td>
                        <td className="px-3 py-2">
                          {u.bannedAt ? (
                            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                              banned
                            </span>
                          ) : u.emailVerifiedAt ? (
                            <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-700 dark:text-green-400">
                              verified
                            </span>
                          ) : (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              unverified
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{u.projectCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{u.conversationCount}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            {u.bannedAt ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Unban"
                                onClick={() => unbanMut.mutate(u.id)}
                                disabled={unbanMut.isPending}
                                data-testid={`button-unban-${u.email}`}
                              >
                                <ShieldOff className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Ban"
                                onClick={() => {
                                  setConfirmBan(u);
                                  setBanReason("");
                                }}
                                data-testid={`button-ban-${u.email}`}
                              >
                                <Shield className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Impersonate"
                              onClick={() => impersonateMut.mutate(u.id)}
                              disabled={impersonateMut.isPending || !!u.bannedAt}
                              data-testid={`button-impersonate-${u.email}`}
                            >
                              <LogIn className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Delete"
                              onClick={() => setConfirmDelete(u)}
                              data-testid={`button-delete-${u.email}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {list.data.page} of {totalPages} · {list.data.total} users
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No users match.</p>
          )}
        </CardContent>
      </Card>

      {/* Detail modal */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>User details</DialogTitle>
          </DialogHeader>
          {detail.isLoading || !detail.data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-base font-medium">{detail.data.user.email}</div>
                <div className="text-muted-foreground">{detail.data.user.name || "(no name)"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 text-xs">
                <div><span className="text-muted-foreground">Joined: </span>{fmtDate(detail.data.user.createdAt)}</div>
                <div><span className="text-muted-foreground">Last login: </span>{fmtDate(detail.data.user.lastLoginAt)}</div>
                <div><span className="text-muted-foreground">Verified: </span>{fmtDate(detail.data.user.emailVerifiedAt)}</div>
                <div><span className="text-muted-foreground">Status: </span>{detail.data.user.bannedAt ? `Banned${detail.data.user.banReason ? ` (${detail.data.user.banReason})` : ""}` : "Active"}</div>
                <div><span className="text-muted-foreground">Projects: </span>{detail.data.stats.projectCount}</div>
                <div><span className="text-muted-foreground">Conversations: </span>{detail.data.stats.conversationCount}</div>
                <div><span className="text-muted-foreground">Messages: </span>{detail.data.stats.messageCount}</div>
              </div>
              {detail.data.projects.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Projects</div>
                  <ul className="space-y-1 text-xs">
                    {detail.data.projects.map((p) => (
                      <li key={p.id} className="rounded border border-border px-2 py-1">{p.name}</li>
                    ))}
                  </ul>
                </div>
              )}
              {detail.data.recentConversations.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Recent conversations</div>
                  <ul className="space-y-1 text-xs">
                    {detail.data.recentConversations.map((c) => (
                      <li key={c.id} className="rounded border border-border px-2 py-1">
                        {c.title} <span className="text-muted-foreground">· {fmtDate(c.updatedAt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm ban modal */}
      <Dialog open={!!confirmBan} onOpenChange={(o) => !o && setConfirmBan(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ban user</DialogTitle>
            <DialogDescription>
              {confirmBan ? `${confirmBan.email} will lose access immediately.` : ""}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Reason (optional)"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            maxLength={500}
            data-testid="input-ban-reason"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmBan(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmBan && banMut.mutate({ id: confirmBan.id, reason: banReason })}
              disabled={banMut.isPending}
              data-testid="button-confirm-ban"
            >
              {banMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Ban
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete modal */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? `This will permanently delete ${confirmDelete.email} and all their data. This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
              disabled={deleteMut.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMut.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
