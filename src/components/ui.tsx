import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, CircleDashed, CloudOff, Loader2, RefreshCw, XCircle } from 'lucide-react';
import type { Attendance, SessionStatus, SpStatus, SyncStatus } from '../../shared/types';
import type { NotifyState } from '../../shared/template';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
const variants: Record<Variant, string> = {
  primary: 'bg-pine text-white hover:bg-pine-700 shadow-[0_6px_16px_-8px_rgb(40_74_69/0.7)]',
  secondary: 'bg-white text-ink border border-line hover:border-pine/40 hover:bg-mist/40',
  ghost: 'text-ink-2 hover:bg-mist hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-95',
  gold: 'bg-gold text-ink hover:bg-[#bd9c6c]',
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all duration-200 active:scale-[0.97]',
        'disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-[14px]',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx('inline-flex size-9 items-center justify-center rounded-full text-ink-2 transition hover:bg-mist hover:text-ink active:scale-95', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'pine' | 'gold' | 'ok' | 'warn' | 'danger' | 'sage'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-mist text-ink-2',
    pine: 'bg-pine text-white',
    gold: 'bg-gold-50 text-gold-600 ring-1 ring-gold/40',
    ok: 'bg-ok-50 text-ok',
    warn: 'bg-warn-50 text-warn',
    danger: 'bg-danger-50 text-danger',
    sage: 'bg-sage-200/60 text-pine',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export const SESSION_STATUS: Record<SessionStatus, { label: string; tone: 'pine' | 'ok' | 'neutral' }> = {
  scheduled: { label: '預定', tone: 'pine' },
  completed: { label: '已完成', tone: 'ok' },
  cancelled: { label: '已取消', tone: 'neutral' },
};
export function SessionBadge({ status }: { status: SessionStatus }) {
  const s = SESSION_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export const SP_STATUS: Record<SpStatus, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  active: { label: '在職', tone: 'ok' },
  paused: { label: '暫停', tone: 'warn' },
  inactive: { label: '停用', tone: 'neutral' },
};

export const ATTENDANCE: Record<Attendance, { label: string; tone: 'neutral' | 'ok' | 'danger' | 'warn' }> = {
  pending: { label: '待確認', tone: 'warn' },
  present: { label: '已出席', tone: 'ok' },
  absent: { label: '缺席', tone: 'danger' },
  cancelled: { label: '取消', tone: 'neutral' },
};

export function SyncBadge({ status, error }: { status: SyncStatus; error?: string }) {
  const map = {
    pending: { icon: <CircleDashed className="size-3.5" />, label: '同步中', tone: 'neutral' as const },
    synced: { icon: <CheckCircle2 className="size-3.5" />, label: '已同步日曆', tone: 'ok' as const },
    failed: { icon: <XCircle className="size-3.5" />, label: '同步失敗', tone: 'danger' as const },
    removed: { icon: <CheckCircle2 className="size-3.5" />, label: '已自日曆移除', tone: 'neutral' as const },
    disabled: { icon: <CloudOff className="size-3.5" />, label: '未設定日曆', tone: 'warn' as const },
  }[status];
  return (
    <span title={error || map.label}>
      <Badge tone={map.tone}>
        {map.icon}
        {map.label}
      </Badge>
    </span>
  );
}

export function NotifyBadge({ state }: { state: NotifyState }) {
  if (state === 'notified') return <Badge tone="ok"><CheckCircle2 className="size-3.5" />已通知（人工標記）</Badge>;
  if (state === 'needs_renotify') return <Badge tone="warn"><RefreshCw className="size-3.5" />排程已異動，請確認</Badge>;
  return <Badge tone="neutral"><CircleDashed className="size-3.5" />尚未通知</Badge>;
}

export function Field({ label, error, hint, children, className, required }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className="text-[13px] font-medium text-ink-2">
        {label}
        {required && <span className="ml-0.5 text-gold-600">*</span>}
      </span>
      {children}
      {error ? (
        <span role="alert" className="flex items-center gap-1 text-[12px] text-danger">
          <AlertTriangle className="size-3.5" />
          {error}
        </span>
      ) : hint ? (
        <span className="text-[12px] text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-flex rounded-full bg-mist p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx('relative z-10 h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors', on ? 'text-white' : 'text-ink-2 hover:text-ink')}
          >
            {on && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 -z-10 rounded-full bg-pine" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={cx('rounded-[22px] border border-line bg-card p-5 shadow-soft', className)}>{children}</As>;
}

export function CardHead({ eyebrow, title, action }: { eyebrow?: string; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-line bg-cream/50 px-6 py-10 text-center">
      {icon && <div className="mb-1 text-sage">{icon}</div>}
      <div className="text-[15px] font-medium text-ink">{title}</div>
      {children && <div className="max-w-sm text-[13px] leading-relaxed text-ink-3">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-[14px] bg-mist', className)} />;
}

export function PageHeader({ no, title, en, desc, actions }: { no: string; title: string; en: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div>
        <div className="eyebrow mb-2 flex items-center gap-2">
          <span className="text-gold-600">{no}</span>
          <span className="h-px w-6 bg-line" />
          {en}
        </div>
        <h1 className="display text-[34px] font-semibold leading-tight text-pine md:text-[40px]">{title}</h1>
        {desc && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">{desc}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, unit, foot, tone = 'ink', big }: { label: string; value: ReactNode; unit?: string; foot?: ReactNode; tone?: 'ink' | 'pine' | 'gold' | 'white'; big?: boolean }) {
  const color = { ink: 'text-ink', pine: 'text-pine', gold: 'text-gold-600', white: 'text-white' }[tone];
  return (
    <div>
      <div className={cx('text-[13px] font-medium', tone === 'white' ? 'text-white/70' : 'text-ink-3')}>{label}</div>
      <div className={cx('num mt-1 flex items-baseline gap-1 font-semibold leading-none tracking-tight', big ? 'text-[52px]' : 'text-[34px]', color)}>
        {value}
        {unit && <span className={cx('text-[14px] font-medium', tone === 'white' ? 'text-white/70' : 'text-ink-3')}>{unit}</span>}
      </div>
      {foot && <div className={cx('mt-2 text-[12px]', tone === 'white' ? 'text-white/65' : 'text-ink-3')}>{foot}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[18px] border border-danger/30 bg-danger-50 px-6 py-8 text-center">
      <XCircle className="size-7 text-danger" />
      <div className="text-[14px] text-ink">{message}</div>
      {onRetry && (
        <Button size="sm" onClick={onRetry} icon={<RefreshCw className="size-3.5" />}>
          重試
        </Button>
      )}
    </div>
  );
}
