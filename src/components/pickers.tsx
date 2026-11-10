import { useId, useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import type { SP } from '../../shared/types';
import { SP_STATUS, cx } from './ui';

export const NEW_SP_PREFIX = 'new:';
export const isNewSp = (v: string) => v.startsWith(NEW_SP_PREFIX);

/**
 * SP 多選：可從名單搜尋選取，也可直接輸入姓名（尚未建檔者以「新」標示，儲存排程時自動建立 SP 主檔）。
 * 可一次輸入多位，以「、」「,」或空白分隔；Enter 加入，Backspace 移除最後一位，離開欄位時自動加入未送出的文字。
 */
export function SpPicker({ sps, value, onChange, busy, invalid }: { sps: SP[]; value: string[]; onChange: (ids: string[]) => void; busy?: Map<string, string>; invalid?: boolean }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const map = useMemo(() => new Map(sps.map((p) => [p.spId, p])), [sps]);
  const k = q.trim().toLowerCase();
  const options = useMemo(() => {
    return sps
      .filter((p) => p.status !== 'inactive' || value.includes(p.spId))
      .filter((p) => !k || p.name.toLowerCase().includes(k) || p.lineNote.toLowerCase().includes(k))
      .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.name.localeCompare(b.name, 'zh-Hant'));
  }, [sps, k, value]);
  const exact = sps.find((p) => p.name === q.trim() && p.status !== 'inactive');
  const canCreate = !!q.trim() && !exact;
  // 選項列表：既有 SP + 最後一列「新增」
  const total = options.length + (canCreate ? 1 : 0);

  /** 把輸入文字（可多位）加入：同名者用既有 SP，否則標記為新 SP */
  const addTyped = (text: string) => {
    const names = text.split(/[,，、;；\s]+/).map((x) => x.trim()).filter(Boolean);
    if (!names.length) return;
    const next = [...value];
    for (const n of names) {
      const hit = sps.find((p) => p.name === n && p.status !== 'inactive');
      const token = hit ? hit.spId : NEW_SP_PREFIX + n.slice(0, 40);
      if (!next.includes(token)) next.push(token);
    }
    onChange(next);
    setQ('');
  };
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    setQ('');
    inputRef.current?.focus();
  };
  const label = (id: string) => (isNewSp(id) ? id.slice(NEW_SP_PREFIX.length) : map.get(id)?.name || id);

  return (
    <div className="relative">
      <div className={cx('field flex min-h-11 flex-wrap items-center gap-1.5 !py-1.5', invalid && 'field-error')} onClick={() => inputRef.current?.focus()}>
        {value.map((id) => (
          <span key={id} className={cx('inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-[13px]', isNewSp(id) ? 'bg-gold-50 text-gold-600 ring-1 ring-gold/50' : 'bg-pine text-white')}>
            {label(id)}
            {isNewSp(id) && <span className="rounded-full bg-gold px-1.5 text-[10px] text-ink">新</span>}
            <button type="button" aria-label={`移除 ${label(id)}`} className="rounded-full p-0.5 hover:bg-black/10" onClick={(e) => { e.stopPropagation(); toggle(id); }}>
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
            aria-label="搜尋或輸入 SP 姓名"
            className="w-full bg-transparent py-1 text-[15px] outline-none"
            placeholder={value.length ? '再加入一位 SP…' : '輸入 SP 姓名（可直接新增），Enter 加入'}
            value={q}
            onFocus={() => setOpen(true)}
            onBlur={(e) => { if (e.currentTarget.value.trim()) addTyped(e.currentTarget.value); setTimeout(() => setOpen(false), 150); }}
            onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, total - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter' || e.key === ',' || e.key === '、') {
                if (!q.trim() && e.key === 'Enter') return;
                e.preventDefault();
                if (e.key === 'Enter' && k && options[active] && active < options.length && !/[,，、\s]/.test(q.trim())) toggle(options[active].spId);
                else addTyped(q);
              }
              if (e.key === 'Backspace' && !q && value.length) onChange(value.slice(0, -1));
            }}
          />
        </div>
      </div>
      {open && (k || options.length > 0) && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-[14px] border border-line bg-white p-1 shadow-lift">
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
          {canCreate && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); addTyped(q); inputRef.current?.focus(); }}
              onMouseEnter={() => setActive(options.length)}
              className={cx('flex cursor-pointer items-center gap-2 rounded-[10px] px-3 py-2 text-[14px] text-gold-600', active === options.length && 'bg-gold-50')}
            >
              <Plus className="size-4" />新增 SP「<b>{q.trim()}</b>」<span className="text-[12px] text-ink-3">（儲存排程時自動建立人員資料）</span>
            </li>
          )}
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
