import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Download, Plus, Search } from 'lucide-react';
import type { Session, SessionStatus } from '../../shared/types';
import { addDays, fmtDate, fmtDateShort, startOfWeek, toMinutes, weekdayLabel } from '../../shared/time';
import { useCanEdit, useSnap, spName } from '../lib/store';
import { navigate, type Route } from '../lib/router';
import { download, toCsv } from '../lib/csv';
import { useSessionUI } from '../features/sessions';
import { Button, Empty, IconButton, PageHeader, SESSION_STATUS, Segmented, SessionBadge, SyncBadge, cx } from '../components/ui';

type ViewKind = 'month' | 'week' | 'list';
const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日'];

export default function Schedule({ route }: { route: Route }) {
  const { snap } = useSnap();
  const view = (route.query.get('view') as ViewKind) || 'month';
  const anchor = route.query.get('date') || snap.today;
  const setView = (v: ViewKind) => navigate('/schedule', { view: v, date: anchor });
  const setAnchor = (dt: string) => navigate('/schedule', { view, date: dt });
  const ui = useSessionUI();
  const canEdit = useCanEdit();

  const shift = (dir: number) => {
    if (view === 'week') return setAnchor(addDays(anchor, dir * 7));
    const [y, m] = anchor.split('-').map(Number);
    const nm = new Date(Date.UTC(y, m - 1 + dir, 1));
    setAnchor(nm.toISOString().slice(0, 10));
  };
  const title =
    view === 'week'
      ? `${fmtDateShort(startOfWeek(anchor))} – ${fmtDateShort(addDays(startOfWeek(anchor), 6))}`
      : `${anchor.slice(0, 4)} 年 ${Number(anchor.slice(5, 7))} 月`;

  return (
    <div>
      <PageHeader
        no="02"
        en="Schedule"
        title="演出排程"
        desc="點擊日期即可新增排程；點擊演出卡片於側邊開啟詳情。儲存後自動同步至管理員指定的 Google 日曆，不會邀請或通知 SP。"
        actions={canEdit ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => ui.openNew()}>新增演出</Button> : undefined}
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented label="檢視" value={view} onChange={setView} options={[{ value: 'month', label: '月' }, { value: 'week', label: '週' }, { value: 'list', label: '清單' }]} />
        {view !== 'list' && (
          <div className="flex items-center gap-1">
            <IconButton label="上一頁" onClick={() => shift(-1)}><ChevronLeft className="size-5" /></IconButton>
            <IconButton label="下一頁" onClick={() => shift(1)}><ChevronRight className="size-5" /></IconButton>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(snap.today)}>今天</Button>
            <h2 className="display ml-2 text-[22px] font-semibold text-pine">{title}</h2>
          </div>
        )}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={view + (view === 'list' ? '' : view === 'week' ? startOfWeek(anchor) : anchor.slice(0, 7))} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
          {view === 'month' && <MonthView anchor={anchor} />}
          {view === 'week' && <WeekView anchor={anchor} />}
          {view === 'list' && <ListView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function useSessionsByDate() {
  const { snap } = useSnap();
  return useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of snap.sessions) {
      const l = m.get(s.date) || [];
      l.push(s);
      m.set(s.date, l);
    }
    for (const l of m.values()) l.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return m;
  }, [snap.sessions]);
}

const chipTone: Record<SessionStatus, string> = {
  scheduled: 'bg-pine text-white hover:bg-pine-700',
  completed: 'bg-sage-200 text-pine hover:bg-sage/60',
  cancelled: 'bg-mist text-ink-3 line-through hover:bg-line',
};

/** 演出卡片：懸停／聚焦顯示預覽；點擊開啟 Drawer（手機版直接點擊，不依賴 hover） */
function SessionChip({ s, compact }: { s: Session; compact?: boolean }) {
  const { d } = useSnap();
  const ui = useSessionUI();
  const names = (d.bySession.get(s.sessionId) || []).map((a) => spName(d, a));
  return (
    <div className="group/chip relative">
      <button
        onClick={(e) => { e.stopPropagation(); ui.openDetail(s.sessionId); }}
        className={cx('w-full truncate rounded-[8px] px-1.5 py-0.5 text-left text-[12px] transition', chipTone[s.status], s.syncStatus === 'failed' && 'ring-2 ring-danger/60')}
        aria-label={`${s.startTime} ${s.topic}，${SESSION_STATUS[s.status].label}`}
      >
        <span className="num font-semibold">{s.startTime}</span> {compact ? '' : s.topic}
      </button>
      <div role="tooltip" className="pointer-events-none invisible absolute left-0 top-full z-20 mt-1 w-64 translate-y-1 rounded-[14px] border border-line bg-white p-3 text-[12px] opacity-0 shadow-lift transition-all duration-150 group-hover/chip:visible group-hover/chip:translate-y-0 group-hover/chip:opacity-100 group-focus-within/chip:visible group-focus-within/chip:opacity-100 max-md:hidden">
        <div className="mb-1 flex items-center justify-between gap-2"><b className="text-[13px] text-ink">{s.topic}</b><SessionBadge status={s.status} /></div>
        <div className="text-ink-2">{s.unit}</div>
        <div className="num text-ink-2">報到 {s.checkinTime}｜演出 {s.startTime}–{s.endTime}</div>
        <div className="text-ink-2">{s.location}</div>
        <div className="mt-1 text-ink">SP：{names.join('、') || '—'}</div>
        <div className="mt-2"><SyncBadge status={s.syncStatus} /></div>
      </div>
    </div>
  );
}

function MonthView({ anchor }: { anchor: string }) {
  const { snap } = useSnap();
  const ui = useSessionUI();
  const byDate = useSessionsByDate();
  const first = anchor.slice(0, 8) + '01';
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const month = anchor.slice(0, 7);
  const rows = days[35].slice(0, 7) === month ? 6 : 5;
  return (
    <div className="overflow-hidden rounded-[24px] border border-line bg-white shadow-soft">
      <div className="grid grid-cols-7 border-b border-line bg-mist/50">
        {WEEK_HEAD.map((w) => <div key={w} className="py-2 text-center text-[12px] font-semibold text-ink-3">{w}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.slice(0, rows * 7).map((day) => {
          const list = byDate.get(day) || [];
          const inMonth = day.startsWith(month);
          const isToday = day === snap.today;
          return (
            <div
              key={day}
              role="button"
              tabIndex={0}
              aria-label={`${fmtDate(day)}，${list.length} 場，按 Enter 新增排程`}
              onClick={() => ui.openNew({ date: day })}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) ui.openNew({ date: day }); }}
              className={cx('group min-h-[92px] cursor-pointer border-b border-r border-line/70 p-1.5 transition-colors hover:bg-cream sm:min-h-[118px]', !inMonth && 'bg-mist/30')}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={cx('num inline-flex size-6 items-center justify-center rounded-full text-[12px]', isToday ? 'bg-gold text-ink font-semibold' : inMonth ? 'text-ink' : 'text-ink-3/60')}>{Number(day.slice(8))}</span>
                {snap.access !== 'public' && <Plus className="size-3.5 text-ink-3 opacity-0 transition group-hover:opacity-100" aria-hidden />}
              </div>
              <div className="space-y-1">
                {list.slice(0, 3).map((s) => <SessionChip key={s.sessionId} s={s} />)}
                {list.length > 3 && <button onClick={(e) => { e.stopPropagation(); navigate('/schedule', { view: 'week', date: day }); }} className="text-[11px] text-ink-3 hover:text-pine">+{list.length - 3} 場</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const H0 = 7, H1 = 20, PX = 44;
function WeekView({ anchor }: { anchor: string }) {
  const { snap, d } = useSnap();
  const ui = useSessionUI();
  const byDate = useSessionsByDate();
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <>
      {/* 桌機／平板：時間軸 */}
      <div className="hidden overflow-x-auto rounded-[24px] border border-line bg-white shadow-soft md:block">
        <div className="grid min-w-[760px] grid-cols-[52px_repeat(7,1fr)]">
          <div className="border-b border-line" />
          {days.map((day) => (
            <button key={day} onClick={() => ui.openNew({ date: day })} className={cx('border-b border-l border-line py-2 text-center transition hover:bg-cream', day === snap.today && 'bg-gold-50')}>
              <div className="text-[12px] text-ink-3">週{weekdayLabel(day)}</div>
              <div className="num text-[18px] font-semibold text-ink">{Number(day.slice(8))}</div>
            </button>
          ))}
          <div className="relative" style={{ height: (H1 - H0) * PX }}>
            {Array.from({ length: H1 - H0 }, (_, i) => <div key={i} className="num absolute right-2 text-[11px] text-ink-3" style={{ top: i * PX - 6 }}>{String(H0 + i).padStart(2, '0')}:00</div>)}
          </div>
          {days.map((day) => (
            <div key={day} className="relative border-l border-line" style={{ height: (H1 - H0) * PX }} onClick={() => ui.openNew({ date: day })}>
              {Array.from({ length: H1 - H0 }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * PX }} />)}
              {(byDate.get(day) || []).map((s) => {
                const top = ((toMinutes(s.startTime) - H0 * 60) / 60) * PX;
                const h = Math.max(26, ((toMinutes(s.endTime) - toMinutes(s.startTime)) / 60) * PX - 2);
                const ck = ((toMinutes(s.checkinTime) - H0 * 60) / 60) * PX;
                return (
                  <div key={s.sessionId}>
                    {s.checkinTime < s.startTime && <div className="absolute left-1 right-1 rounded-t-[8px] border border-dashed border-sage bg-sage-200/30" style={{ top: Math.max(0, ck), height: Math.max(0, top - ck) }} title={`報到 ${s.checkinTime}`} />}
                    <button
                      onClick={(e) => { e.stopPropagation(); ui.openDetail(s.sessionId); }}
                      className={cx('absolute left-1 right-1 overflow-hidden rounded-[10px] p-1.5 text-left text-[12px] leading-tight shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift', chipTone[s.status])}
                      style={{ top: Math.max(0, top), height: h }}
                    >
                      <div className="num font-semibold">{s.startTime}–{s.endTime}</div>
                      <div className="truncate">{s.topic}</div>
                      <div className="truncate opacity-75">{(d.bySession.get(s.sessionId) || []).map((a) => spName(d, a)).join('、')}</div>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="px-4 py-2 text-[12px] text-ink-3">虛線區塊為報到至演出開始的準備時間（不計入演出時數）。</p>
      </div>
      {/* 手機：逐日清單 */}
      <div className="space-y-3 md:hidden">
        {days.map((day) => (
          <div key={day} className="rounded-[18px] border border-line bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <b className={cx('text-[14px]', day === snap.today && 'text-gold-600')}>{fmtDate(day)}</b>
              {snap.access !== 'public' && <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => ui.openNew({ date: day })}>新增</Button>}
            </div>
            <div className="space-y-1.5">
              {(byDate.get(day) || []).map((s) => <SessionChip key={s.sessionId} s={s} />)}
              {!(byDate.get(day) || []).length && <div className="text-[12px] text-ink-3">無排程</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ListView() {
  const { snap, d } = useSnap();
  const ui = useSessionUI();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | SessionStatus>('');
  const [range, setRange] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return snap.sessions
      .filter((s) => (range === 'all' ? true : range === 'upcoming' ? s.date >= snap.today : s.date < snap.today))
      .filter((s) => !status || s.status === status)
      .filter((s) => !k || [s.topic, s.unit, s.location, s.note, ...(d.bySession.get(s.sessionId) || []).map((a) => spName(d, a))].join(' ').toLowerCase().includes(k))
      .sort((a, b) => (range === 'past' ? -1 : 1) * (a.date + a.startTime).localeCompare(b.date + b.startTime));
  }, [snap, d, q, status, range]);

  const exportCsv = () => {
    download(`SP排程_${snap.today}.csv`, toCsv(
      ['排程ID', '演出日期', '申請單位', '教案主題', '報到時間', '演出開始', '演出結束', '演出地點', 'SP', '狀態', '日曆同步', '備註'],
      rows.map((s) => [s.sessionId, s.date, s.unit, s.topic, s.checkinTime, s.startTime, s.endTime, s.location, (d.bySession.get(s.sessionId) || []).map((a) => spName(d, a)).join('、'), SESSION_STATUS[s.status].label, s.syncStatus, s.note]),
    ));
  };

  return (
    <div className="rounded-[24px] border border-line bg-white p-4 shadow-soft">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder="搜尋教案、單位、地點、SP…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜尋排程" />
        </div>
        <select className="field w-auto" value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="日期範圍">
          <option value="upcoming">今天起</option>
          <option value="past">過去</option>
          <option value="all">全部</option>
        </select>
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value as SessionStatus | '')} aria-label="狀態">
          <option value="">全部狀態</option>
          <option value="scheduled">預定</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
        <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv} disabled={!rows.length}>匯出 CSV</Button>
      </div>
      {rows.length === 0 ? (
        <Empty title="沒有符合條件的排程" />
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="tbl">
            <thead>
              <tr><th>日期</th><th>時間</th><th>教案主題</th><th className="max-md:hidden">申請單位</th><th className="max-lg:hidden">地點</th><th>SP</th><th>狀態</th><th className="max-md:hidden">日曆</th></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.sessionId} className="cursor-pointer" onClick={() => ui.openDetail(s.sessionId)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && ui.openDetail(s.sessionId)}>
                  <td className="num whitespace-nowrap">{fmtDate(s.date)}</td>
                  <td className="num whitespace-nowrap text-ink-2">報到 {s.checkinTime}<br />{s.startTime}–{s.endTime}</td>
                  <td className="font-medium">{s.topic}</td>
                  <td className="max-md:hidden">{s.unit}</td>
                  <td className="max-lg:hidden text-ink-2">{s.location}</td>
                  <td>{(d.bySession.get(s.sessionId) || []).map((a) => spName(d, a)).join('、')}</td>
                  <td><SessionBadge status={s.status} /></td>
                  <td className="max-md:hidden"><SyncBadge status={s.syncStatus} error={s.syncError} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
