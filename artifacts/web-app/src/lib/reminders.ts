import { baseUrl } from "@/lib/api";

export interface Reminder {
  id: string;
  message: string;
  scheduledAt: string;
  recurring: string | null;
  status: "pending" | "sent" | "cancelled" | "failed";
  conversationId: string | null;
  createdAt: string;
  lastSentAt: string | null;
}

export type ReminderScope = "upcoming" | "past" | "all";

export const reminderKeys = {
  all: ["reminders"] as const,
  list: (scope: ReminderScope) => ["reminders", scope] as const,
};

export async function listReminders(scope: ReminderScope): Promise<Reminder[]> {
  const res = await fetch(baseUrl(`/reminders?scope=${scope}`));
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  const j = (await res.json()) as { reminders: Reminder[] };
  return j.reminders;
}

export interface CreateReminderInput {
  message: string;
  /** Local datetime-string; we convert to UTC ISO before sending. */
  scheduledAt: Date;
  recurring?: string | null;
  conversationId?: string | null;
}

export async function createReminder(
  input: CreateReminderInput,
): Promise<Reminder> {
  const res = await fetch(baseUrl("/reminders"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: input.message,
      scheduledAt: input.scheduledAt.toISOString(),
      recurring: input.recurring ?? null,
      conversationId: input.conversationId ?? null,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Create failed (${res.status})`);
  }
  const j = (await res.json()) as { reminder: Reminder };
  return j.reminder;
}

export interface UpdateReminderInput {
  message?: string;
  scheduledAt?: Date;
  recurring?: string | null;
  status?: Reminder["status"];
  snoozeMinutes?: number;
}

export async function updateReminder(
  id: string,
  input: UpdateReminderInput,
): Promise<Reminder> {
  const body: Record<string, unknown> = {};
  if (input.message !== undefined) body.message = input.message;
  if (input.scheduledAt !== undefined)
    body.scheduledAt = input.scheduledAt.toISOString();
  if (input.recurring !== undefined) body.recurring = input.recurring;
  if (input.status !== undefined) body.status = input.status;
  if (input.snoozeMinutes !== undefined) body.snoozeMinutes = input.snoozeMinutes;
  const res = await fetch(baseUrl(`/reminders/${id}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(b.error || `Update failed (${res.status})`);
  }
  const j = (await res.json()) as { reminder: Reminder };
  return j.reminder;
}

export async function deleteReminder(id: string): Promise<void> {
  const res = await fetch(baseUrl(`/reminders/${id}`), { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

/** Common RRULE presets for the dropdown. */
export const recurringPresets: Array<{ value: string; label: string }> = [
  { value: "", label: "Ekbar (no repeat)" },
  { value: "FREQ=DAILY", label: "Protidin (daily)" },
  { value: "FREQ=WEEKLY", label: "Sapthik (weekly)" },
  { value: "FREQ=MONTHLY", label: "Mashik (monthly)" },
  { value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "Weekday only" },
];
