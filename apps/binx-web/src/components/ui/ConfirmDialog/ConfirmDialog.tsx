/**
 * ConfirmDialog.tsx
 *
 * The app's replacement for the browser's native `window.confirm()` and
 * `window.alert()` popups — same hairline/mono look as the rest of the
 * dialogs, and built on Base UI's AlertDialog so it's announced as an
 * `alertdialog` and can't be dismissed by a stray click on the backdrop
 * (Escape still cancels).
 *
 * Two ways to use it:
 *
 * - `useConfirmDialog()` — the drop-in for the native calls. Render the
 *   returned `dialog` once, then `await confirm({...})` (resolves true/false)
 *   or `await alert({...})` (resolves once acknowledged) from any handler.
 * - `<ConfirmDialog>` — the controlled component, for callers that already
 *   own the open state.
 *
 * `tone="danger"` is for destructive actions (delete, remove); the default
 * neutral tone is for reversible ones (archive) and plain notices.
 *
 * @module apps/binx-web/src/components/ui/ConfirmDialog/ConfirmDialog.tsx
 * @author Binx Portal
 */
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { AlertTriangle, Info } from "lucide-react";

import styles from "./ConfirmDialog.module.scss";

export type ConfirmDialogTone = "default" | "danger";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
}

export type AlertOptions = Omit<ConfirmOptions, "cancelLabel">;

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Alert mode: a single acknowledge button, no Cancel. */
  hideCancel?: boolean;
}

const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  hideCancel = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const Icon = tone === "danger" ? AlertTriangle : Info;

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={styles.backdrop} />
        <AlertDialog.Popup className={styles.dialog} data-tone={tone}>
          <div className={styles.body}>
            <span className={styles.iconWrap} aria-hidden="true">
              <Icon className={styles.icon} />
            </span>
            <div className={styles.text}>
              <AlertDialog.Title className={styles.title}>
                {title}
              </AlertDialog.Title>
              {description && (
                <AlertDialog.Description className={styles.description}>
                  {description}
                </AlertDialog.Description>
              )}
            </div>
          </div>
          <div className={styles.actions}>
            {!hideCancel && (
              <button
                type="button"
                className={styles.cancel}
                onClick={onCancel}
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              className={styles.confirm}
              onClick={onConfirm}
            >
              {confirmLabel ?? (hideCancel ? "OK" : "Confirm")}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};

type Request = ConfirmOptions & { hideCancel: boolean };

/**
 * Promise-based confirm/alert, so a handler reads the same as it did with
 * the native calls: `if (!(await confirm({ title }))) return;`.
 */
export function useConfirmDialog() {
  // The last request stays in state after closing so the copy doesn't vanish
  // mid exit-transition.
  const [request, setRequest] = useState<Request | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setOpen(false);
  }, []);

  const ask = useCallback((next: Request) => {
    return new Promise<boolean>((resolve) => {
      // A second request while one is open cancels the first.
      resolver.current?.(false);
      resolver.current = resolve;
      setRequest(next);
      setOpen(true);
    });
  }, []);

  // Never leave a caller awaiting a dialog that unmounted.
  useEffect(
    () => () => {
      resolver.current?.(false);
      resolver.current = null;
    },
    [],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => ask({ ...options, hideCancel: false }),
    [ask],
  );
  const alert = useCallback(
    async (options: AlertOptions) => {
      await ask({ ...options, hideCancel: true });
    },
    [ask],
  );

  const dialog = request ? (
    <ConfirmDialog
      {...request}
      open={open}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, alert, dialog };
}

export default ConfirmDialog;
