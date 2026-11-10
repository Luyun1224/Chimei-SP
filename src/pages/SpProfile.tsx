import { Fragment, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, Download, Pencil } from 'lucide-react';
import { computeProfile, isCountable } from '../../shared/stats';
import { fmtDate, fmtDuration, fmtHours, yearOf } from '../../shared/time';
import { useSnap } from '../lib/store';
import { navigate, type Route } from '../lib/router';
import { download, toCsv } from '../lib/csv';
import { useSessionUI } from '../features/sessions';
import { SpFormDrawer } from './Directory';
import { MonthlyBars, RankBars, TrendLine, C } from '../components/charts';
import { ATTENDANCE, Badge, Button, Card, CardHead, Empty, SP_STATUS, SessionBadge, Stat, cx } from '../components/ui';

export default function SpProfile({ route }: { route: Route }) {
  const { snap, d } = useSnap();
  const ui = useSessionUI();
  const spId = route.parts[1];
  const sp = d.spMap.get(spId);
  const years = useMemo(() => {
    const ys = new Set<number>([yearOf(snap.today)]);
    for (const a of snap.assignments) if (a.spId === spId) { const s = d.sessionMap.get(a.sessionId); if (s) ys.add(yearOf(s.date)); }
    return [...ys].sort((a, b) => b - a);
  }, [snap, d, spId]);
  const year = Number(route.query.get('year')) || years[0];
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const p = useMemo(() => computeProfile(snap, spId, year), [snap, spId, year]);

  const records = useMemo(
    () =>
      snap.assignments
        .filter((a) => a.spId === spId && !a.isDeleted)
        .map((a) => ({ a, s: d.sessionMap.get(a.sessionId)! }))
        .filter((r) => r.s && yearOf(r.s.date) === year)
        .sort((x, y) => (y.s.date + y.s.startTime).localeCompare(x.s.date + x.s.startTime)),
    [snap.assignments, d, spId, year],
  );

  if (!sp) return <Empty title="找不到這位 SP" action={<Button onClick={() => navigate('/sps')}>返回名單</Button>} />;

  const exportCsv = () =>
    download(
      `SP演出履歷_${sp.name}_${year}.csv`,
      toCsv(
        ['SP_ID', '姓名', '演出日期', '申請單位', '教案主題', '演出地點', '報到時間', '預定演出', '排程狀態', '出席狀態', '實際開始', '實際結束', '核定分鐘', '核定時數', '核定狀態', '核定人員', '核定時間', '時數備註', '計入實績'],
        records.map(({ a, s }) => [
          sp.spId, sp.name, s.date, s.unit, s.topic, s.location, s.checkinTime, `${s.startTime}-${s.endTime}`, s.status, ATTENDANCE[a.attendance].label,
          a.actualStart, a.actualEnd, a.approvedMinutes ?? '', a.approvedMinutes != null ? (a.approvedMinutes / 60).toFixed(2) : '', a.verifyStatus === 'verified' ? '已核定' : '未核定', a.verifiedBy, a.verifiedAt, a.minutesNote, isCountable(a, s) ? '是' : '否',
        ]),
      ),
    );

  return (
    <div>
      <button onClick={() => navigate('/sps')} className="no-print mb-4 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-pine"><ArrowLeft className="size-4" />SP 人員</button>
      <header className="mb-7 grid gap-6 border-b border-line pb-7 lg:grid-cols-[1fr_auto]">
        <div className="flex items-start gap-5">
          <div className="display flex size-20 shrink-0 items-center justify-center rounded-[26px] bg-pine text-[34px] text-white shadow-lift">{sp.name.slice(0, 1)}</div>
          <div>
            <div className="eyebrow mb-1">SP Profile · {sp.spId}</div>
            <h1 className="display text-[36px] font-semibold leading-tight text-pine">{sp.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              <Badge tone={SP_STATUS[sp.status].tone}>{SP_STATUS[sp.status].label}</Badge>
              {sp.certification && <Badge tone="gold">{sp.certification}</Badge>}
              {sp.joinDate && <span>加入 {fmtDate(sp.joinDate)}</span>}
              {sp.phone && <span>· {sp.phone}</span>}
              {sp.email && <span>· {sp.email}</span>}
              {sp.lineNote && <span>· LINE：{sp.lineNote}</span>}
            </div>
            {sp.note && <p className="mt-2 max-w-xl text-[13px] text-ink-3">{sp.note}</p>}
          </div>
        </div>
        <div className="no-print flex flex-wrap items-start gap-2">
          <select className="field w-auto" value={year} onChange={(e) => navigate(`/sps/${spId}`, { year: e.target.value })} aria-label="年度">
            {years.map((y) => <option key={y} value={y}>{y} 年</option>)}
          </select>
          <Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={!records.length}>匯出履歷 CSV</Button>
          <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>編輯資料</Button>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card className="col-span-2 bg-pine !text-white md:col-span-1 xl:col-span-2"><Stat tone="white" big label={`${year} 年核定演出時數`} value={fmtHours(p.yearMinutes)} unit="小時" foot={`${p.yearPersonTimes} 人次 · ${p.yearSessions} 場`} /></Card>
        <Card><Stat label="本年度演出次數" value={p.yearPersonTimes} unit="次" /></Card>
        <Card><Stat label="歷年累積時數" value={fmtHours(p.lifetimeMinutes)} unit="小時" foot={`累計 ${p.lifetimePersonTimes} 次`} /></Card>
        <Card><Stat label="參與教案數" value={p.topicCount} unit="個" foot="歷年不重複教案" /></Card>
        <Card><Stat label="最近一次演出" value={<span className="text-[22px]">{p.lastDate ? fmtDate(p.lastDate).slice(0, 10) : '—'}</span>} /></Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHead eyebrow="Monthly" title="月度核定演出時數" />
          {p.yearMinutes ? <MonthlyBars data={p.monthly.map((m) => ({ ...m, hours: +(m.minutes / 60).toFixed(2) }))} series={[{ key: 'hours', label: '核定時數', color: C.pine }]} fmt={(_, v) => `${v}`} /> : <Empty title="本年度尚無核定紀錄" />}
        </Card>
        <Card className="lg:col-span-2">
          <CardHead eyebrow="Yearly" title="歷年演出趨勢（小時）" />
          {p.yearly.length ? <TrendLine data={p.yearly.map((y) => ({ ...y, hours: +(y.minutes / 60).toFixed(2) }))} xKey="year" yKey="hours" label="核定時數" /> : <Empty title="尚無歷年資料" />}
        </Card>
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHead eyebrow="By case" title="各教案參與（小時）" />{p.byTopic.length ? <RankBars rows={p.byTopic.map((r) => ({ ...r, hours: +(r.minutes / 60).toFixed(2) }))} valueKey="hours" unit="小時" /> : <Empty title="尚無資料" />}</Card>
        <Card><CardHead eyebrow="By unit" title="各申請單位動用（人次）" />{p.byUnit.length ? <RankBars rows={p.byUnit} valueKey="personTimes" unit="人次" color={C.gold} /> : <Empty title="尚無資料" />}</Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 pt-5"><CardHead eyebrow="Records" title={`${year} 年完整演出明細（${records.length}）`} /></div>
        {records.length === 0 ? <div className="p-5 pt-0"><Empty title="本年度沒有演出紀錄" /></div> : (
          <ul className="divide-y divide-line border-t border-line">
            {records.map(({ a, s }) => {
              const isOpen = open === a.assignmentId;
              return (
                <li key={a.assignmentId}>
                  <button className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 text-left hover:bg-mist/40 sm:grid-cols-[120px_1fr_auto_auto]" onClick={() => setOpen(isOpen ? null : a.assignmentId)} aria-expanded={isOpen}>
                    <span className="num text-[13px] text-ink-2">{fmtDate(s.date)}</span>
                    <span className="min-w-0 truncate text-[14px]"><b>{s.topic}</b> <span className="text-ink-3">· {s.unit}</span></span>
                    <span className="flex items-center gap-1.5 max-sm:col-span-2">
                      <SessionBadge status={s.status} />
                      <Badge tone={ATTENDANCE[a.attendance].tone}>{ATTENDANCE[a.attendance].label}</Badge>
                      {isCountable(a, s) ? <Badge tone="sage">{fmtDuration(a.approvedMinutes!)}</Badge> : a.verifyStatus === 'verified' ? <Badge>不計入</Badge> : <Badge tone="warn">未核定</Badge>}
                    </span>
                    <ChevronDown className={cx('size-4 text-ink-3 transition-transform max-sm:hidden', isOpen && 'rotate-180')} />
                  </button>
                  {isOpen && (
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 bg-cream/60 px-5 py-4 text-[13px] sm:grid-cols-4">
                      <Fragment><dt className="text-ink-3">報到時間</dt><dd>{s.checkinTime}</dd></Fragment>
                      <Fragment><dt className="text-ink-3">預定演出</dt><dd>{s.startTime}–{s.endTime}</dd></Fragment>
                      <Fragment><dt className="text-ink-3">實際演出</dt><dd>{a.actualStart ? `${a.actualStart}–${a.actualEnd}` : '—'}</dd></Fragment>
                      <Fragment><dt className="text-ink-3">核定分鐘</dt><dd>{a.approvedMinutes ?? '—'}</dd></Fragment>
                      <Fragment><dt className="text-ink-3">演出地點</dt><dd>{s.location}</dd></Fragment>
                      <Fragment><dt className="text-ink-3">核定人員</dt><dd>{a.verifiedBy || '—'}</dd></Fragment>
                      <Fragment><dt className="text-ink-3">核定時間</dt><dd>{a.verifiedAt ? a.verifiedAt.slice(0, 16).replace('T', ' ') : '—'}</dd></Fragment>
                      <Fragment><dt className="text-ink-3">時數備註</dt><dd>{a.minutesNote || '—'}</dd></Fragment>
                      <dd className="col-span-full"><Button size="sm" variant="ghost" onClick={() => ui.openDetail(s.sessionId)}>開啟排程詳情 →</Button></dd>
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <SpFormDrawer target={editing ? sp : null} onClose={() => setEditing(false)} />
    </div>
  );
}
