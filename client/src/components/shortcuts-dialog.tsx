import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { shortcutDefinitions } from "@/hooks/use-keyboard-shortcuts";
import { usePreferences } from "@/hooks/use-preferences";
import { Keyboard } from "lucide-react";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  const { prefs, updatePreferences } = usePreferences();

  const shortcutsEnabled = prefs?.keyboardShortcutsEnabled !== false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-shortcuts">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4 py-3 border-b">
          <Label htmlFor="shortcuts-toggle" className="text-sm font-medium">
            Enable keyboard shortcuts
          </Label>
          <Switch
            id="shortcuts-toggle"
            checked={shortcutsEnabled}
            onCheckedChange={(checked) =>
              updatePreferences({ keyboardShortcutsEnabled: checked })
            }
            data-testid="switch-shortcuts-toggle"
          />
        </div>

        <div className="space-y-1 py-2">
          {shortcutDefinitions.map((shortcut) => (
            <div
              key={shortcut.keys}
              className="flex items-center justify-between gap-4 py-1.5"
              data-testid={`shortcut-row-${shortcut.description.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <span className="text-sm text-muted-foreground">
                {shortcut.description}
              </span>
              <div className="flex items-center gap-1">
                {shortcut.keys.split(" ").map((part, i) => {
                  if (part === "→") {
                    return (
                      <span key={i} className="text-xs text-muted-foreground/60">
                        then
                      </span>
                    );
                  }
                  return (
                    <kbd
                      key={i}
                      className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground"
                    >
                      {part}
                    </kbd>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
