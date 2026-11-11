import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Button, Field, IconButton, cx } from './ui';

// ---------------- Focus trap ----------------
function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      [...(node?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') || [])].filter((el) => !el.hasAttribute('disabled'));
    setTimeout(() => (node?.querySelector<HTMLElement>('[data-autofocus]') || focusables()[0])?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      // 只有最上層的對話框回應鍵盤
      const layers = document.querySelectorAll('[aria-modal="true"]');
      if (layers[layers.length - 1] !== node) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

// ---------------- Drawer ----------------
/** 編輯面板：置中顯示（手機為全螢幕），避免視線一直移到畫面右側 */
export function Drawer({ open, onClose, title, eyebrow, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; eyebrow?: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useFocusTrap(open, onClose);
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-stretch justify-center sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            className="relative flex h-full w-full flex-col bg-cream shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-[28px]"
            style={{ maxWidth: Math.max(width, 640) }}
            initial={reduce ? { opacity: 0 } : { y: 24, scale: 0.98, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { y: 0, scale: 1, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 16, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-6 pb-4 pt-6">
              <div className="min-w-0">
                {eyebrow && <div className="eyebrow mb-1 normal-case tracking-[0.08em]">{eyebrow}</div>}
                <h2 className="display truncate text-[24px] font-semibold text-pine">{title}</h2>
              </div>
              <IconButton label="關閉" onClick={onClose}>
                <X className="size-5" />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-white/60 px-6 py-4 sm:rounded-b-[28px]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ---------------- Modal ----------------
export function Modal({ open, onClose, title, children, footer, tone = 'default' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; tone?: 'default' | 'danger' | 'warn' }) {
  const ref = useFocusTrap(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-ink/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="relative w-full max-w-lg rounded-t-[26px] bg-white p-6 shadow-2xl sm:rounded-[26px]"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-3 flex items-center gap-2">
              {tone === 'danger' && <XCircle className="size-5 text-danger" />}
              {tone === 'warn' && <AlertTriangle className="size-5 text-warn" />}
              <h2 className="text-[18px] font-semibold text-ink">{title}</h2>
            </div>
            <div className="text-[14px] leading-relaxed text-ink-2">{children}</div>
            {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ---------------- Confirm (Promise-based) ----------------
interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: 'default' | 'danger' | 'warn';
  /** 需要輸入原因（取消、刪除、更正） */
  reason?: { label: string; placeholder?: string };
}
type ConfirmResult = { ok: boolean; reason: string };

const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<ConfirmResult>>(() => Promise.resolve({ ok: false, reason: '' }));

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (r: ConfirmResult) => void }) | null>(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const ask = useCallback((o: ConfirmOpts) => new Promise<ConfirmResult>((resolve) => {
    setReason('');
    setErr('');
    setState({ ...o, resolve });
  }), []);
  const close = (ok: boolean) => {
    if (ok && state?.reason && !reason.trim()) {
      setErr('此欄位必填');
      return;
    }
    state?.resolve({ ok, reason: reason.trim() });
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title || ''}
        tone={state?.tone}
        footer={
          <>
            <Button onClick={() => close(false)}>返回</Button>
            <Button variant={state?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>
              {state?.confirmLabel || '確認'}
            </Button>
          </>
        }
      >
        {state?.body}
        {state?.reason && (
          <Field label={state.reason.label} error={err} className="mt-4" required>
            <textarea data-autofocus className={cx('field min-h-20', err && 'field-error')} value={reason} placeholder={state.reason.placeholder} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ---------------- Toast ----------------
type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
  action?: { label: string; onClick: () => void };
}
const ToastCtx = createContext<(tone: ToastTone, text: string, action?: ToastItem['action']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastTone, text: string, action?: ToastItem['action']) => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-3), { id, tone, text, action }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 3200);
  }, []);
  const icon = { success: <CheckCircle2 className="size-4 text-sage" />, error: <XCircle className="size-4 text-[#f0a79c]" />, info: <Info className="size-4 text-gold" /> };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ y: 20, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 10, opacity: 0, scale: 0.96 }}
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-[14px] text-white shadow-lift"
              role={t.tone === 'error' ? 'alert' : 'status'}
            >
              {icon[t.tone]}
              <span>{t.text}</span>
              {t.action && (
                <button className="rounded-full px-2 py-0.5 text-gold underline-offset-2 hover:underline" onClick={t.action.onClick}>
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
