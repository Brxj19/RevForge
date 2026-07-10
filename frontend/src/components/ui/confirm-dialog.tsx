import { useState } from "react";
import { Dialog, DialogActions } from "./dialog";
import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "primary";
  requireTyping?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  requireTyping,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");

  const handleConfirm = () => {
    if (requireTyping && typed !== requireTyping) return;
    onConfirm();
    setTyped("");
    onClose();
  };

  const handleClose = () => {
    setTyped("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} title={title}>
      <p className="text-sm text-text-secondary">{message}</p>
      {requireTyping && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Type <code className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-xs text-text-primary">{requireTyping}</code> to confirm:
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="h-8 w-full rounded-sm border border-border bg-surface px-2.5 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            placeholder={requireTyping}
          />
        </div>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={handleClose}>Cancel</Button>
        <Button
          variant={confirmVariant}
          onClick={handleConfirm}
          disabled={!!(requireTyping && typed !== requireTyping)}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
