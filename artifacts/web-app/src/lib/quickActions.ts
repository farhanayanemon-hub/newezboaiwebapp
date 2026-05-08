import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  FileText,
  Languages,
  Lightbulb,
  Edit3,
  Code2,
  Calculator,
  Mail,
  Wand2,
  Sparkles,
  Brain,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { apiClient } from "@/lib/api";

export type QuickActionTaskType =
  | "chat-smart"
  | "chat-fast"
  | "code"
  | "vision"
  | "long-context";

export type QuickActionInputForm =
  | "text"
  | "languagePicker"
  | "tonePicker"
  | "emailForm";

export interface BuiltInQuickAction {
  id: string;
  label: string;
  iconName: string;
  icon: LucideIcon;
  taskType: QuickActionTaskType;
  promptTemplate: string;
  inputForm: QuickActionInputForm;
  builtIn: true;
}

export interface CustomQuickAction {
  id: string;
  label: string;
  iconName: string;
  icon: LucideIcon;
  taskType: QuickActionTaskType;
  promptTemplate: string;
  inputForm: "text";
  builtIn: false;
  sortOrder: number;
}

export type QuickActionDef = BuiltInQuickAction | CustomQuickAction;

/**
 * Lucide icon registry for both built-ins and user-picked icons in custom
 * actions. Limited to a curated set so the picker stays small.
 */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  FileText,
  Languages,
  Lightbulb,
  Edit3,
  Code2,
  Calculator,
  Mail,
  Wand2,
  Sparkles,
  Brain,
  Zap,
};

export function resolveIcon(name: string | undefined | null): LucideIcon {
  if (!name) return Wand2;
  return ICON_REGISTRY[name] ?? Wand2;
}

export const BUILT_IN_ACTIONS: BuiltInQuickAction[] = [
  {
    id: "summarize",
    label: "Summarize",
    iconName: "FileText",
    icon: FileText,
    taskType: "chat-smart",
    promptTemplate:
      "নিচের text এর ৩-৫ লাইনের সংক্ষিপ্ত সারমর্ম Bangla তে দাও:\n\n{input}",
    inputForm: "text",
    builtIn: true,
  },
  {
    id: "translate",
    label: "Translate",
    iconName: "Languages",
    icon: Languages,
    taskType: "chat-fast",
    promptTemplate:
      "নিচের text কে {targetLang} ভাষায় translate করো। শুধু translation দাও, ব্যাখ্যা দরকার নেই।\n\n{input}",
    inputForm: "languagePicker",
    builtIn: true,
  },
  {
    id: "explain",
    label: "Explain",
    iconName: "Lightbulb",
    icon: Lightbulb,
    taskType: "chat-smart",
    promptTemplate:
      "নিচের বিষয়টা একদম সহজ ভাষায় (যেন একটা বাচ্চা বুঝে) Bangla তে বুঝিয়ে দাও:\n\n{input}",
    inputForm: "text",
    builtIn: true,
  },
  {
    id: "rewrite",
    label: "Rewrite",
    iconName: "Edit3",
    icon: Edit3,
    taskType: "chat-smart",
    promptTemplate: "নিচের text কে {tone} tone এ আবার লেখো:\n\n{input}",
    inputForm: "tonePicker",
    builtIn: true,
  },
  {
    id: "code",
    label: "Code Help",
    iconName: "Code2",
    icon: Code2,
    taskType: "code",
    promptTemplate:
      "Analyze this code. Find bugs, suggest improvements, and explain in Bangla. Use code blocks for any code:\n\n```\n{input}\n```",
    inputForm: "text",
    builtIn: true,
  },
  {
    id: "math",
    label: "Math",
    iconName: "Calculator",
    icon: Calculator,
    taskType: "chat-smart",
    promptTemplate:
      "এই অঙ্কটা step by step Bangla তে solve করো। প্রয়োজনে LaTeX বা markdown ব্যবহার করো:\n\n{input}",
    inputForm: "text",
    builtIn: true,
  },
  {
    id: "email",
    label: "Email",
    iconName: "Mail",
    icon: Mail,
    taskType: "chat-smart",
    promptTemplate:
      "Write a {tone} email in {lang}. To: {to}. Subject: {subject}. Intent: {intent}. Return only the email body and subject — no extra commentary.",
    inputForm: "emailForm",
    builtIn: true,
  },
];

/**
 * Safely substitute placeholders in a prompt template. User-supplied content
 * is wrapped in clear delimiters so a template like "{input}" cannot be
 * weaponized to break out of the system prompt or inject new instructions.
 */
export function fillTemplate(
  template: string,
  vars: Record<string, string>,
  options: { wrapInput?: boolean } = {},
): string {
  const { wrapInput = true } = options;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const raw = vars[key];
    if (raw === undefined) return `{${key}}`;
    if (key === "input" && wrapInput) {
      return `<<<USER_CONTENT_START>>>\n${raw}\n<<<USER_CONTENT_END>>>`;
    }
    return raw;
  });
}

/* ---------- API hooks ---------- */

interface ApiQuickAction {
  id: string;
  name: string;
  icon: string;
  promptTemplate: string;
  taskType: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const quickActionKeys = {
  all: ["quickActions"] as const,
  list: () => [...quickActionKeys.all, "list"] as const,
  stats: () => [...quickActionKeys.all, "stats"] as const,
};

export function useCustomQuickActions() {
  return useQuery({
    queryKey: quickActionKeys.list(),
    queryFn: async () => {
      const res = await apiClient.get<{ quickActions: ApiQuickAction[] }>(
        "/quick-actions",
      );
      return res.quickActions.map<CustomQuickAction>((q) => ({
        id: q.id,
        label: q.name,
        iconName: q.icon,
        icon: resolveIcon(q.icon),
        taskType: (q.taskType as QuickActionTaskType) ?? "chat-smart",
        promptTemplate: q.promptTemplate,
        inputForm: "text",
        builtIn: false,
        sortOrder: q.sortOrder,
      }));
    },
  });
}

export interface QuickActionFormValues {
  name: string;
  icon: string;
  promptTemplate: string;
  taskType: QuickActionTaskType;
}

export function useCreateQuickAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: QuickActionFormValues) => {
      const res = await apiClient.post<{ quickAction: ApiQuickAction }>(
        "/quick-actions",
        {
          name: values.name,
          icon: values.icon,
          promptTemplate: values.promptTemplate,
          taskType: values.taskType,
        },
      );
      return res.quickAction;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: quickActionKeys.list() }),
  });
}

export function useUpdateQuickAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Partial<QuickActionFormValues>;
    }) => {
      const res = await apiClient.patch<{ quickAction: ApiQuickAction }>(
        `/quick-actions/${id}`,
        {
          ...(values.name !== undefined && { name: values.name }),
          ...(values.icon !== undefined && { icon: values.icon }),
          ...(values.promptTemplate !== undefined && {
            promptTemplate: values.promptTemplate,
          }),
          ...(values.taskType !== undefined && { taskType: values.taskType }),
        },
      );
      return res.quickAction;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: quickActionKeys.list() }),
  });
}

export function useDeleteQuickAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete<{ ok: true }>(`/quick-actions/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: quickActionKeys.list() }),
  });
}

export function useReorderQuickActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await apiClient.post("/quick-actions/reorder", { ids });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: quickActionKeys.list() }),
  });
}

export function recordQuickActionUse(actionId: string): void {
  // Fire-and-forget; failures should not block the chat.
  apiClient
    .post("/quick-actions/uses", { actionId })
    .catch(() => undefined);
}
