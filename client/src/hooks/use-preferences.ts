import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserPreference } from "@shared/schema";

export function usePreferences() {
  const { data: prefs, isLoading } = useQuery<UserPreference>({
    queryKey: ["/api/user/preferences"],
  });

  const mutation = useMutation({
    mutationFn: async (update: { pinnedPages?: string[]; keyboardShortcutsEnabled?: boolean }) => {
      const res = await apiRequest("PUT", "/api/user/preferences", update);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
    },
  });

  const pinnedPages = prefs?.pinnedPages ?? [];

  function isPinned(url: string): boolean {
    return pinnedPages.includes(url);
  }

  function togglePin(url: string) {
    const updated = isPinned(url)
      ? pinnedPages.filter((p) => p !== url)
      : [...pinnedPages, url];

    queryClient.setQueryData<UserPreference>(["/api/user/preferences"], (old) => {
      if (!old) return old;
      return { ...old, pinnedPages: updated };
    });

    mutation.mutate({ pinnedPages: updated });
  }

  return {
    prefs,
    isLoading,
    pinnedPages,
    isPinned,
    togglePin,
    updatePreferences: mutation.mutate,
  };
}
