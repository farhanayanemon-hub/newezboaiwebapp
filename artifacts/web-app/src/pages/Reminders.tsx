import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Plus,
  Trash2,
  Clock,
  Repeat,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  createReminder,
  deleteReminder,
  listReminders,
  recurringPresets,
  reminderKeys,
  updateReminder,
  type Reminder,
} from "@/lib/reminders";

/** Format a UTC ISO timestamp in the user's local TZ (Asia/Dhaka usually). */
function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Convert a UTC ISO string to the value attribute of a datetime-local input,
 *  preserving the user's local clock display. */
function toLocalInputValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 30 * 60_000);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export default function RemindersPage() {
  const qc = useQueryClient();
  const upcoming = useQuery({
    queryKey: reminderKeys.list("upcoming"),
    queryFn: () => listReminders("upcoming"),
  });
  const past = useQuery({
    queryKey: reminderKeys.list("past"),
    queryFn: () => listReminders("past"),
  });

  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [when, setWhen] = useState(toLocalInputValue());
  const [recurring, setRecurring] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: reminderKeys.all });

  const createMut = useMutation({
    mutationFn: () =>
      createReminder({
        message: message.trim(),
        // datetime-local value is "naive" local time; new Date() reads it
        // as local, then toISOString in the API client converts to UTC.
        scheduledAt: new Date(when),
        recurring: recurring || null,
      }),
    onSuccess: () => {
      toast.success("Reminder set.");
      setMessage("");
      setWhen(toLocalInputValue());
      setRecurring("");
      setShowForm(false);
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Create failed"),
  });

  const snoozeMut = useMutation({
    mutationFn: ({ id, mins }: { id: string; mins: number }) =>
      updateReminder(id, { snoozeMinutes: mins }),
    onSuccess: invalidate,
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => updateReminder(id, { status: "cancelled" }),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteReminder(id),
    onSuccess: invalidate,
  });

  const renderRow = (r: Reminder, isPast: boolean) => (
    <div
      key={r.id}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`reminder-row-${r.id}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{r.message}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {fmt(r.scheduledAt)}
          </span>
          {r.recurring && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3 w-3" />
              {r.recurring}
            </span>
          )}
          <span
            className={
              r.status === "sent"
                ? "rounded bg-muted px-1.5 py-0.5"
                : r.status === "cancelled"
                  ? "rounded bg-muted/60 px-1.5 py-0.5 line-through"
                  : r.status === "failed"
                    ? "rounded bg-destructive/10 px-1.5 py-0.5 text-destructive"
                    : "rounded bg-primary/10 px-1.5 py-0.5 text-primary"
            }
          >
            {r.status}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {!isPast && r.status === "pending" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => snoozeMut.mutate({ id: r.id, mins: 15 })}
              data-testid={`snooze-15-${r.id}`}
            >
              +15m
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => snoozeMut.mutate({ id: r.id, mins: 60 })}
              data-testid={`snooze-1h-${r.id}`}
            >
              +1h
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => snoozeMut.mutate({ id: r.id, mins: 60 * 24 })}
              data-testid={`snooze-1d-${r.id}`}
            >
              +1d
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => cancelMut.mutate(r.id)}
              aria-label="Cancel"
              data-testid={`cancel-${r.id}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive"
          onClick={() => {
            if (confirm("Delete this reminder?")) deleteMut.mutate(r.id);
          }}
          aria-label="Delete"
          data-testid={`delete-${r.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <AppShell title="Reminders">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Reminders
              </h1>
              <p className="text-sm text-muted-foreground">
                I'll send a browser notification when it's time
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowForm((v) => !v)}
            data-testid="button-add-reminder"
          >
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
        </div>

        {showForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">New reminder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="r-msg">Message</Label>
                <Input
                  id="r-msg"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What should I remind you about?"
                  data-testid="input-reminder-message"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="r-when">When (your local time)</Label>
                  <Input
                    id="r-when"
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    data-testid="input-reminder-when"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="r-rep">Repeat</Label>
                  <select
                    id="r-rep"
                    value={recurring}
                    onChange={(e) => setRecurring(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                    data-testid="select-reminder-recurring"
                  >
                    {recurringPresets.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMut.mutate()}
                  disabled={
                    createMut.isPending || !message.trim() || !when
                  }
                  data-testid="button-save-reminder"
                >
                  {createMut.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                  )}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming
          </h2>
          {upcoming.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (upcoming.data?.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No upcoming reminders.
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.data?.map((r) => renderRow(r, false))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Past
          </h2>
          {past.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (past.data?.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Nothing here.
            </div>
          ) : (
            <div className="space-y-2">
              {past.data?.map((r) => renderRow(r, true))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
