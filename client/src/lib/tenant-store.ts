import { useSyncExternalStore, useCallback } from "react";

let activeTenantId: number | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return activeTenantId;
}

export function useTenantStore() {
  const currentId = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setActiveTenantId = useCallback((id: number) => {
    activeTenantId = id;
    listeners.forEach((fn) => fn());
  }, []);

  return {
    activeTenantId: currentId,
    setActiveTenantId,
  };
}
