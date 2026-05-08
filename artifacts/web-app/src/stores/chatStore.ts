import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * UI-only state for the chat. All persistent state (conversations, messages)
 * lives in the database and is fetched via TanStack Query hooks
 * (`@/lib/conversations`).
 */
interface ChatUIState {
  activeConversationId: string | null;
  selectedModelId: string | null;
  voiceOutputEnabled: boolean;

  setActiveConversation: (id: string | null) => void;
  setSelectedModel: (id: string | null) => void;
  toggleVoiceOutput: () => void;
}

export const useChatStore = create<ChatUIState>()(
  persist(
    (set) => ({
      activeConversationId: null,
      selectedModelId: null,
      voiceOutputEnabled: false,
      setActiveConversation: (id) => set({ activeConversationId: id }),
      setSelectedModel: (id) => set({ selectedModelId: id }),
      toggleVoiceOutput: () =>
        set((s) => ({ voiceOutputEnabled: !s.voiceOutputEnabled })),
    }),
    {
      name: "ezboai-chat-ui",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        selectedModelId: s.selectedModelId,
        voiceOutputEnabled: s.voiceOutputEnabled,
      }),
    },
  ),
);
