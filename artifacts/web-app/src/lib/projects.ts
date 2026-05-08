import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { conversationKeys } from "@/lib/conversations";

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
};

export function useProjects(enabled: boolean) {
  return useQuery({
    queryKey: projectKeys.list(),
    enabled,
    queryFn: async () => {
      const res = await apiClient.get<{ projects: Project[] }>("/projects");
      return res.projects;
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await apiClient.post<{ project: Project }>("/projects", {
        name,
      });
      return res.project;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list() });
    },
  });
}

export function useRenameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiClient.patch<{ project: Project }>(
        `/projects/${id}`,
        { name },
      );
      return res.project;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list() });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete<{ ok: true }>(`/projects/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list() });
      // Conversation rows now have a different projectId/none; refresh list.
      qc.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}

export function useMoveConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      projectId,
    }: {
      conversationId: string;
      projectId: string | null;
    }) => {
      await apiClient.post<{ conversation: unknown }>(
        `/conversations/${conversationId}/move`,
        { projectId },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}
