import { useEffect, useRef, type ReactNode } from 'react';
import { X, Download, AlertTriangle } from 'lucide-react';
import { dateState, formatDate, type Transaction, download, notesText } from './model';
export function DateFlag({ value, label, compact = false }: { value: string; label?: string; compact?: boolean }) {
  const state = dateState(value);
  return <div className={`date-flag ${state.kind}`}>{label && <span className="date-label">{label}</span>}<strong>{formatDate(value)}</strong>{!compact && <span className="date-state">{state.label}</span>}</div>;
}
export function Status({ value }: { value: string }) { return <span className={`status status-${value.toLowerCase().replaceAll(' ', '-')}`}>{value}</span>; }
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current!; el.showModal(); return () => el.close(); }, []);
  return <dialog ref={ref} className={wide ? 'dialog wide' : 'dialog'} onCancel={e => { e.preventDefault(); onClose(); }} aria-label={title}><div className="dialog-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={21}/></button></div>{children}</dialog>;
}
export function ExportNotes({ transaction, label = 'Export notes' }: { transaction: Transaction; label?: string }) {
  return <button type="button" className="button secondary" onClick={() => download(`${transaction.iata}-notes.txt`, notesText(transaction))}><Download size={16}/>{label}</button>;
}
export function ErrorList({ errors }: { errors: string[] }) { return errors.length ? <div className="error-box" role="alert"><AlertTriangle size={18}/><ul>{errors.map(e => <li key={e}>{e}</li>)}</ul></div> : null; }
