import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation built on the native dialog element for focus trapping and Escape handling. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      {open && (
        <div className="dialog-body">
          <h2 id="confirm-title">{title}</h2>
          <div className="dialog-text">{children}</div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
              {busy ? 'Deleting…' : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
