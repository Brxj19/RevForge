import { createSignal, Show, type JSX } from "solid-js";
import { Button } from "../Button";
import { Dialog } from "../Dialog";
import { Field, Input } from "../Field";
import styles from "./ConfirmDialog.module.css";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: JSX.Element;
  /** State the consequence, what is kept and whether it is reversible (DESIGN.md §10). */
  body: JSX.Element;
  confirmLabel: string;
  tone?: "primary" | "danger";
  /** Typed confirmation for repo/org deletion, making public, user suspension. */
  typedConfirmation?: string;
  /** May return a promise; the button shows a spinner and the dialog stays open if it rejects. */
  onConfirm: () => void | Promise<void>;
  /** Shown under the body for high-severity actions ("Recorded as a high-severity audit event."). */
  auditNote?: JSX.Element;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const [typed, setTyped] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const ready = () =>
    !props.typedConfirmation || typed() === props.typedConfirmation;
  const close = (open: boolean) => {
    if (!open) setTyped("");
    props.onOpenChange(open);
  };
  const confirm = async () => {
    if (!ready() || busy()) return;
    setBusy(true);
    try {
      await props.onConfirm();
      close(false);
    } catch {
      // The caller reports the failure (toast); keep the dialog open so the user can retry.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={props.open}
      onOpenChange={close}
      title={props.title}
      role="alertdialog"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            variant={props.tone === "danger" ? "danger-solid" : "primary"}
            disabled={!ready()}
            loading={busy()}
            onClick={() => void confirm()}
          >
            {props.confirmLabel}
          </Button>
        </>
      }
    >
      <p class={styles.body}>{props.body}</p>
      <Show when={props.auditNote}>
        <p class={styles.audit}>{props.auditNote}</p>
      </Show>
      <Show when={props.typedConfirmation}>
        {(phrase) => (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            <Field
              label={
                <>
                  Type <code>{phrase()}</code> to confirm
                </>
              }
            >
              <Input
                value={typed()}
                onInput={(e) => setTyped(e.currentTarget.value)}
                autocomplete="off"
                spellcheck={false}
                autocapitalize="off"
                mono
              />
            </Field>
          </form>
        )}
      </Show>
    </Dialog>
  );
}
