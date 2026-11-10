import { useId, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { SP } from '../../shared/types';
import { SP_STATUS, cx } from './ui';

/** SP 多選：即時搜尋、鍵盤上下選取、Enter 加入、Backspace 移除 */
export function SpPicker({ sps, value, onChange, busy, invalid }: { sps: SP[]; value: string[]; onChange: (ids: string[]) => void; busy?: Map<string, string>; invalid?: boolean }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const map = useMemo(() => new Map(sps.map((p) => [p.spId, p])), [sps]);
  const options = useMemo(() => {
    const k = q.trim().toLowerCase();
    return sps
      .filter((p) => p.status !== 'inactive' || value.includes(p.spId))
      .filter((p) => !k || p.name.toLowerCase().includes(k) || p.lineNote.toLowerCase().includes(k))
      .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.name.localeCompare(b.name, 'zh-Hant'));
  }, [sps, q, value]);
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    setQ('');
    inputRef.current?.focus();
  };
  return (
    <div className="relative">
      <div className={cx('field flex min-h-11 flex-wrap items-center gap-1.5 !py-1.5', invalid && 'field-error')} onClick={() => inputRef.current?.focus()}>
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-pine py-0.5 pl-2.5 pr-1 text-[13px] text-white">
            {map.get(id)?.name || id}
            <button type="button" aria-label={`移除 ${map.get(id)?.name}`} className="rounded-full p-0.5 hover:bg-white/20" onClick={(e) => { e.stopPropagation(); toggle(id); }}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <div className="flex min-w-[8rem] flex-1 items-center gap-1">
          <Search className="size-4 text-ink-3" aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label="搜尋 SP 姓名"
            className="w-full bg-transparent py-1 text-[15px] outline-none"
            placeholder={value.length ? '加入更多 SP…' : '輸入姓名搜尋 SP'}
            value={q}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter' && open && options[active]) { e.preventDefault(); toggle(options[active].spId); }
              if (e.key === 'Backspace' && !q && value.length) onChange(value.slice(0, -1));
            }}
          />
        </div>
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-[14px] border border-line bg-white p-1 shadow-lift">
          {options.length === 0 && <li className="px-3 py-3 text-[13px] text-ink-3">找不到符合的 SP，可先到「SP 人員」新增</li>}
          {options.map((p, i) => {
            const sel = value.includes(p.spId);
            const conflict = busy?.get(p.spId);
            return (
              <li
                key={p.spId}
                role="option"
                aria-selected={sel}
                onMouseDown={(e) => { e.preventDefault(); toggle(p.spId); }}
                onMouseEnter={() => setActive(i)}
                className={cx('flex cursor-pointer items-center gap-2 rounded-[10px] px-3 py-2 text-[14px]', i === active && 'bg-mist')}
              >
                <span className={cx('flex size-4 items-center justify-center rounded border', sel ? 'border-pine bg-pine text-white' : 'border-line')}>{sel && <Check className="size-3" />}</span>
                <span className="font-medium">{p.name}</span>
                {p.status !== 'active' && <span className="text-[12px] text-warn">{SP_STATUS[p.status].label}</span>}
                {conflict && <span className="ml-auto truncate text-[12px] text-danger">⚠ {conflict}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 可輸入、可從既有選項搜尋的欄位；下方顯示常用選項快速帶入 */
export function Combo({ value, onChange, options, placeholder, invalid, quick = 5, ariaLabel }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; invalid?: boolean; quick?: number; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const filtered = useMemo(() => {
    const k = value.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(k) && o !== value).slice(0, 8);
  }, [options, value]);
  return (
    <div className="relative">
      <input
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open && filtered.length > 0}
        aria-controls={listId}
        className={cx('field', invalid && 'field-error')}
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (!open || !filtered.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); onChange(filtered[active]); setOpen(false); }
        }}
      />
      {open && filtered.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-[14px] border border-line bg-white p-1 shadow-lift">
          {filtered.map((o, i) => (
            <li key={o} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }} className={cx('cursor-pointer rounded-[10px] px-3 py-2 text-[14px]', i === active && 'bg-mist')}>
              {o}
            </li>
          ))}
        </ul>
      )}
      {quick > 0 && options.length > 0 && !value && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {options.slice(-quick).reverse().map((o) => (
            <button type="button" key={o} onClick={() => onChange(o)} className="rounded-full border border-line bg-white px-2.5 py-0.5 text-[12px] text-ink-2 transition hover:border-pine hover:text-pine">
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
