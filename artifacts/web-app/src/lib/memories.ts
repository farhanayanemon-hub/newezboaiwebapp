import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { Memory } from "@/types/chat";

export const memoryKeys = {
  all: ["memories"] as const,
  list: () => [...memoryKeys.all, "list"] as const,
};

export function useMemories() {
  return useQuery({
    queryKey: memoryKeys.list(),
    queryFn: async () => {
      const res = await apiClient.get<{ memories: Memory[] }>("/memories");
      return res.memories;
    },
  });
}

export function useCreateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; value: string }) => {
      const res = await apiClient.post<{ memory: Memory }>("/memories", {
        ...input,
        source: "manual",
      });
      return res.memory;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memoryKeys.list() });
    },
  });
}

export function useUpdateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; key?: string; value?: string }) => {
      const { id, ...rest } = input;
      const res = await apiClient.patch<{ memory: Memory }>(
        `/memories/${id}`,
        rest,
      );
      return res.memory;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memoryKeys.list() });
    },
  });
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete<{ ok: true }>(`/memories/${id}`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memoryKeys.list() });
    },
  });
}
