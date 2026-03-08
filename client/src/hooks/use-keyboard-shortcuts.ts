import { useEffect, useRef, useCallback, useState } from "react";
import { useLocation } from "wouter";
import { usePreferences } from "@/hooks/use-preferences";

interface ShortcutDef {
  keys: string;
  label: string;
  description: string;
  action: () => void;
}

function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((active as HTMLElement).isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts() {
  const [, setLocation] = useLocation();
  const { prefs } = usePreferences();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const pendingPrefix = useRef<string | null>(null);
  const prefixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled = prefs?.keyboardShortcutsEnabled !== false;

  const clearPrefix = useCallback(() => {
    pendingPrefix.current = null;
    if (prefixTimer.current) {
      clearTimeout(prefixTimer.current);
      prefixTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        return;
      }

      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        clearPrefix();
        return;
      }

      if (pendingPrefix.current === "g") {
        clearPrefix();
        e.preventDefault();
        switch (e.key) {
          case "d":
            setLocation("/dashboard");
            break;
          case "b":
            setLocation("/brief");
            break;
          case "a":
            setLocation("/actions");
            break;
          case "i":
            setLocation("/inbox");
            break;
          case "s":
            setLocation("/scorecards");
            break;
        }
        return;
      }

      if (pendingPrefix.current === "n") {
        clearPrefix();
        e.preventDefault();
        switch (e.key) {
          case "a":
            setLocation("/actions?create=1");
            break;
        }
        return;
      }

      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        pendingPrefix.current = "g";
        prefixTimer.current = setTimeout(clearPrefix, 1500);
        return;
      }

      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        pendingPrefix.current = "n";
        prefixTimer.current = setTimeout(clearPrefix, 1500);
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      clearPrefix();
    };
  }, [enabled, setLocation, clearPrefix]);

  return { showShortcuts, setShowShortcuts };
}

export const shortcutDefinitions = [
  { keys: "⌘ K", label: "Cmd+K", description: "Open command palette" },
  { keys: "?", label: "?", description: "Show keyboard shortcuts" },
  { keys: "g → d", label: "g then d", description: "Go to Dashboard" },
  { keys: "g → b", label: "g then b", description: "Go to Daily Brief" },
  { keys: "g → a", label: "g then a", description: "Go to Actions" },
  { keys: "g → i", label: "g then i", description: "Go to Inbox" },
  { keys: "g → s", label: "g then s", description: "Go to Scorecards" },
  { keys: "n → a", label: "n then a", description: "New Action" },
];
