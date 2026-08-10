import { useEffect, useRef } from 'react';
interface Props { open: boolean; title: string; description: string; pending: boolean; onCancel: () => void; onConfirm: () => void }
export default function ConfirmCommandDialog({ open, title, description, pending, onCancel, onConfirm }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog ref={ref} className="confirm-dialog" onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}>
    <form method="dialog" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}><span>Review impact</span><h2>{title}</h2><p>{description}</p><div><button type="button" onClick={onCancel} disabled={pending}>Go back</button><button type="submit" className="danger-action" disabled={pending}>{pending ? 'Working…' : 'Run this change'}</button></div></form>
  </dialog>;
}
