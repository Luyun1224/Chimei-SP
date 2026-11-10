import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Printer, X } from 'lucide-react';
import type { SessionStatus } from '../../shared/types';
import { computeStats, inactiveSps, isCountable, topicOf, type Row } from '../../shared/stats';
import { fmtDate, fmtHours, minutesToHours, monthOf, rocYear, yearOf } from '../../shared/time';
import { useSnap, spName } from '../lib/store';
import { navigate, type Route } from '../lib/router';
import { download, toCsv } from '../lib/csv';
import { C, MonthlyBars, RankBars } from '../components/charts';
import { Badge, Button, Card, CardHead, Empty, PageHeader, SESSION_STATUS, Segmented, cx } from '../components/ui';

export function useAnalyticsFilters(route: Route) {
  const { snap } = useSnap();
  const q = route.query;
  return {
    year: Number(q.get('year')) || yearOf(snap.today),
    month: Number(q.get('month')) || undefined,
    spId: q.get('sp') || undefined,
    unit: q.get('unit') || undefined,
    topic: q.get('topic') || undefined,
    status: (q.get('status') as SessionStatus) || undefined,
  };
}

export default function Analytics({ route }: { route: Route }) {
  const { snap, d } = useSnap();
  const f = useAnalyticsFilters(route);
  const setF = (patch: Record<string, string | number | undefined>) =>
    navigate('/analytics', { year: f.year, month: f.month, sp: f.spId, unit: f.unit, topic: f.topic, status: f.status, ...patch });
  const st = useMemo(() => computeStats(snap, f, snap.today), [snap, f.year, f.month, f.spId, f.unit, f.topic]); // eslint-disable-line react-hooks/exhaustive-deps
  const [threshold, setThreshold] = useState(snap.settings.inactiveThresholdDays);
  const idle = useMemo(() => inactiveSps(snap, snap.today, threshold), [snap, threshold]);
  const [metric, setMetric] = useState<'minutes' | 'personTimes'>('minutes');
  const [tableQ, setTableQ] = useState('');
  const [sort, setSort] = useState<{ key: 'minutes' | 'personTimes' | 'sessions' | 'label'; dir: 1 | -1 }>({ key: 'minutes', dir: -1 });

  const years = useMemo(() => [...new Set([yearOf(snap.today), ...snap.sessions.map((s) => yearOf(s.date))])].sort((a, b) => b - a), [snap]);
  const units = [...new Set(snap.sessions.map((s) => s.unit))].sort();
  const topics = [...new Set(snap.assignments.filter((a) => !a.isDeleted).map((a) => topicOf(a, d.sessionMap.get(a.sessionId))).filter(Boolean))].sort();

  // 明細（採用與 KPI 相同的篩選；可另外以排程狀態篩選）
  const detail = useMemo(() => snap.assignments
    .filter((a) => !a.isDeleted)
    .map((a) => ({ a, s: d.sessionMap.get(a.sessionId)! }))
    .filter(({ a, s }) => s && yearOf(s.date) === f.year && (!f.month || monthOf(s.date) === f.month) && (!f.spId || a.spId === f.spId) && (!f.unit || s.unit === f.unit) && (!f.topic || topicOf(a, s) === f.topic) && (!f.status || s.status === f.status))
    .sort((x, y) => (y.s.date + y.s.startTime).localeCompare(x.s.date + x.s.startTime)), [snap, d, f]);

  const spRows = useMemo(() => {
    const k = tableQ.trim().toLowerCase();
    return st.bySp.filter((r) => !k || r.label.toLowerCase().includes(k)).sort((a, b) => sort.dir * (sort.key === 'label' ? a.label.localeCompare(b.label, 'zh-Hant') : (a[sort.key] as number) - (b[sort.key] as number)));
  }, [st.bySp, tableQ, sort]);

  const monthData = st.monthly.map((m) => ({ ...m, hours: minutesToHours(m.minutes) }));
  const hasFilter = f.month || f.spId || f.unit || f.topic || f.status;
  const H = (r: Row) => ({ ...r, hours: minutesToHours(r.minutes) });

  const exportAll = () => {
    download(`SP年度成果_${f.year}_SP統計.csv`, toCsv(['SP', '場次', '人次', '核定分鐘', '核定人時'], st.bySp.map((r) => [r.label, r.sessions, r.personTimes, r.minutes, minutesToHours(r.minutes)])));
  };
  const exportDetail = () => {
    download(`SP年度成果_${f.year}_明細.csv`, toCsv(
      ['演出日期', '申請單位', '教案主題', 'SP', '排程狀態', '出席', '核定狀態', '核定分鐘', '計入實績'],
      detail.map(({ a, s }) => [s.date, s.unit, topicOf(a, s), spName(d, a), SESSION_STATUS[s.status].label, a.attendance, a.verifyStatus, a.approvedMinutes ?? '', isCountable(a, s) ? '是' : '否']),
    ));
  };

  return (
    <div>
      <PageHeader
        no="06"
        en="Analytics"
        title="年度成果分析"
        desc="所有成果數字只採計「已完成」且「已核定出席」的紀錄。場次＝至少一位 SP 核定出席的演出；人次＝SP 出席筆數；人時＝核定時數加總；SP 人數＝不重複 SP。"
        actions={<>
          <Button icon={<Download className="size-4" />} onClick={exportAll}>匯出 SP 統計</Button>
          <Button icon={<Printer className="size-4" />} variant="primary" onClick={() => navigate('/report', { year: f.year })}>年度成果報告</Button>
        </>}
      />

      {/* 篩選列：單列、置於所有圖表之上，作用於整頁 */}
      <div className="sticky top-[60px] z-20 -mx-1 mb-5 flex flex-wrap items-center gap-2 rounded-[18px] bg-cream/90 px-1 py-2 backdrop-blur lg:top-0">
        <select className="field w-auto" value={f.year} onChange={(e) => setF({ year: e.target.value })} aria-label="年度">{years.map((y) => <option key={y} value={y}>{y}（民國 {rocYear(y)}）</option>)}</select>
        <select className="field w-auto" value={f.month || ''} onChange={(e) => setF({ month: e.target.value })} aria-label="月份"><option value="">全年</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1} 月</option>)}</select>
        <select className="field w-auto max-w-[10rem]" value={f.spId || ''} onChange={(e) => setF({ sp: e.target.value })} aria-label="SP"><option value="">全部 SP</option>{snap.sps.map((p) => <option key={p.spId} value={p.spId}>{p.name}</option>)}</select>
        <select className="field w-auto max-w-[10rem]" value={f.unit || ''} onChange={(e) => setF({ unit: e.target.value })} aria-label="申請單位"><option value="">全部單位</option>{units.map((u) => <option key={u}>{u}</option>)}</select>
        <select className="field w-auto max-w-[11rem]" value={f.topic || ''} onChange={(e) => setF({ topic: e.target.value })} aria-label="教案主題"><option value="">全部教案</option>{topics.map((u) => <option key={u}>{u}</option>)}</select>
        <select className="field w-auto" value={f.status || ''} onChange={(e) => setF({ status: e.target.value })} aria-label="演出狀態（明細）"><option value="">全部狀態</option><option value="scheduled">預定</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select>
        {hasFilter && <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => navigate('/analytics', { year: f.year })}>清除篩選</Button>}
      </div>

      {(st.pending.unverifiedAssignments > 0 || st.pending.awaitingCompletion > 0) && (
        <button onClick={() => navigate('/verify')} className="mb-4 flex w-full items-center gap-2 rounded-[16px] border border-warn/30 bg-warn-50 px-4 py-3 text-left text-[14px] text-ink">
          <AlertTriangle className="size-4 shrink-0 text-warn" />
          目前範圍內有 <b className="num">{st.pending.unverifiedAssignments}</b> 筆待核定明細、<b className="num">{st.pending.awaitingCompletion}</b> 場待確認完成的演出，<b>尚未計入</b>下列成果。<span className="ml-auto text-pine underline">前往核定 →</span>
        </button>
      )}

      {/* KPI Bento */}
      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        <Card className="col-span-2 bg-pine !text-white xl:row-span-2">
          <div className="text-[13px] text-white/70">SP 實際核定總演出人時</div>
          <div className="num mt-2 text-[64px] font-semibold leading-none tracking-tight">{fmtHours(st.minutes)}<span className="ml-2 text-[16px] text-white/70">人時</span></div>
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 text-[13px]">
            <div><div className="text-white/60">平均每位活躍 SP</div><div className="num text-[22px] font-semibold">{fmtHours(st.avgMinutesPerSp)}<span className="ml-1 text-[12px] text-white/60">小時</span></div></div>
            <div><div className="text-white/60">前 20% SP 人時占比</div><div className="num text-[22px] font-semibold text-gold">{Math.round(st.concentration.top20Share * 100)}%</div></div>
          </div>
          <div className="mt-6 hidden xl:block" aria-hidden>
            <div className="mb-2 text-[12px] text-white/60">各月核定人時</div>
            <div className="flex h-24 items-end gap-1.5">
              {st.monthly.map((m) => {
                const max = Math.max(1, ...st.monthly.map((x) => x.minutes));
                return <div key={m.month} className="flex-1 rounded-t-[3px] bg-white/25 transition-all duration-500" style={{ height: `${Math.max(2, (m.minutes / max) * 100)}%`, background: f.month === m.month ? '#C6A77A' : undefined }} title={`${m.month} 月`} />;
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-white/45"><span>1月</span><span>6月</span><span>12月</span></div>
          </div>
        </Card>
        <Kpi label="已完成演出場次" value={st.sessions} unit="場" />
        <Kpi label="SP 動用總人次" value={st.personTimes} unit="人次" />
        <Kpi label="有演出紀錄的 SP" value={st.activeSps} unit="人" />
        <Kpi label="排程狀態" value={<span className="flex gap-3 text-[15px]">{(['scheduled', 'completed', 'cancelled'] as SessionStatus[]).map((k) => <button key={k} onClick={() => setF({ status: f.status === k ? undefined : k })} className={cx('flex flex-col items-start', f.status === k && 'text-pine underline')}><span className="text-[11px] font-normal text-ink-3">{SESSION_STATUS[k].label}</span><span className="num text-[22px]">{st.statusCounts[k]}</span></button>)}</span>} />
        <Card className="col-span-2 md:col-span-4 xl:col-span-4">
          <CardHead eyebrow="A · Monthly" title="月度演出場次與 SP 人次" action={<span className="text-[12px] text-ink-3">點擊月份可篩選</span>} />
          <MonthlyBars data={st.monthly} series={[{ key: 'sessions', label: '場次', color: C.gold }, { key: 'personTimes', label: 'SP 人次', color: C.pine }]} onSelect={(m) => setF({ month: f.month === m ? undefined : m })} selected={f.month} height={220} />
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead eyebrow="F · Compare" title="各月核定人時" action={<span className="text-[12px] text-ink-3">與上圖人次分開呈現（不同單位）</span>} />
          <MonthlyBars data={monthData} series={[{ key: 'hours', label: '核定人時', color: C.pine }]} fmt={(_, v) => `${v}`} onSelect={(m) => setF({ month: f.month === m ? undefined : m })} selected={f.month} height={220} />
        </Card>
        <Card>
          <CardHead eyebrow="B / C · Ranking" title="各 SP 年度排行" action={<Segmented label="排行指標" value={metric} onChange={setMetric} options={[{ value: 'minutes', label: '核定時數' }, { value: 'personTimes', label: '人次' }]} />} />
          {st.bySp.length ? (
            <RankBars rows={st.bySp.map(H)} valueKey={metric === 'minutes' ? 'hours' : 'personTimes'} unit={metric === 'minutes' ? '小時' : '人次'} onSelect={(k) => setF({ sp: f.spId === k ? undefined : k })} selected={f.spId} max={10} color={metric === 'minutes' ? C.pine : C.gold} />
          ) : <Empty title="此範圍尚無核定紀錄" />}
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHead eyebrow="D · Units" title="各申請單位 SP 動用（人次）" />
          {st.byUnit.length ? <RankBars rows={st.byUnit} valueKey="personTimes" unit="人次" onSelect={(k) => setF({ unit: f.unit === k ? undefined : k })} selected={f.unit} max={8} /> : <Empty title="尚無資料" />}
        </Card>
        <Card>
          <CardHead eyebrow="E · Cases" title="教案主題分布（場次）" />
          {st.byTopic.length ? <RankBars rows={st.byTopic} valueKey="sessions" unit="場" onSelect={(k) => setF({ topic: f.topic === k ? undefined : k })} selected={f.topic} max={8} color={C.gold} /> : <Empty title="尚無資料" />}
        </Card>
        <Card>
          <CardHead eyebrow="H · Distribution" title="SP 動用集中度" />
          {st.activeSps ? (
            <>
              <p className="mb-3 text-[13px] leading-relaxed text-ink-2">時數最高的 <b className="num">{st.concentration.topCount}</b> 位 SP（前 20%）承擔了 <b className="num text-pine">{Math.round(st.concentration.top20Share * 100)}%</b> 的核定人時。</p>
              <div className="space-y-2">
                {st.concentration.buckets.map((b) => (
                  <div key={b.label} className="grid grid-cols-[84px_1fr_32px] items-center gap-2 text-[13px]">
                    <span className="text-ink-2">{b.label}</span>
                    <span className="h-3 rounded-r-[4px] bg-sage" style={{ width: `${(b.count / Math.max(1, st.activeSps)) * 100}%`, minWidth: b.count ? 6 : 0 }} />
                    <span className="num text-right font-semibold">{b.count}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-ink-3">各時數區間的 SP 人數</p>
            </>
          ) : <Empty title="尚無資料" />}
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3 !p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-5 pt-5">
            <h2 className="mr-auto text-[17px] font-semibold">SP 年度統計表</h2>
            <input className="field w-48" placeholder="搜尋 SP" value={tableQ} onChange={(e) => setTableQ(e.target.value)} aria-label="搜尋 SP" />
          </div>
          <div className="mt-3 max-h-[420px] overflow-auto">
            <table className="tbl">
              <thead><tr>
                {([['label', 'SP'], ['sessions', '場次'], ['personTimes', '人次'], ['minutes', '核定人時']] as const).map(([k, l]) => (
                  <th key={k} className={k !== 'label' ? 'text-right' : ''}><button className="hover:text-pine" onClick={() => setSort({ key: k, dir: sort.key === k ? (-sort.dir as 1 | -1) : -1 })}>{l}{sort.key === k ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</button></th>
                ))}
              </tr></thead>
              <tbody>
                {spRows.map((r) => (
                  <tr key={r.key}><td><button className="font-medium text-pine hover:underline" onClick={() => navigate(`/sps/${r.key}`, { year: f.year })}>{r.label}</button></td><td className="num text-right">{r.sessions}</td><td className="num text-right">{r.personTimes}</td><td className="num text-right font-semibold">{fmtHours(r.minutes)}</td></tr>
                ))}
                {!spRows.length && <tr><td colSpan={4} className="py-6 text-center text-ink-3">無資料</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHead eyebrow="G · Idle" title="長期未安排演出的 SP" action={<label className="flex items-center gap-1 text-[12px] text-ink-3">門檻<input type="number" min={7} max={730} className="field num w-20 !py-1" value={threshold} onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 90))} />天</label>} />
          {idle.length === 0 ? <Empty title="所有在職 SP 都在門檻內有排程" /> : (
            <ul className="max-h-[360px] divide-y divide-line overflow-auto">
              {idle.map(({ sp, lastDate, days }) => (
                <li key={sp.spId} className="flex items-center justify-between py-2 text-[14px]">
                  <button className="font-medium text-pine hover:underline" onClick={() => navigate(`/sps/${sp.spId}`)}>{sp.name}</button>
                  <span className="text-[12px] text-ink-3">{lastDate ? <>最近 {fmtDate(lastDate)} · <b className="num text-warn">{days}</b> 天</> : <Badge tone="warn">從未安排</Badge>}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-5 pt-5">
          <h2 className="mr-auto text-[17px] font-semibold">演出明細（{detail.length}）</h2>
          <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportDetail} disabled={!detail.length}>匯出明細 CSV</Button>
        </div>
        <div className="mt-3 max-h-[420px] overflow-auto">
          <table className="tbl">
            <thead><tr><th>日期</th><th>教案</th><th className="max-md:hidden">單位</th><th>SP</th><th>狀態</th><th className="text-right">核定</th></tr></thead>
            <tbody>
              {detail.slice(0, 500).map(({ a, s }) => (
                <tr key={a.assignmentId} className={cx(!isCountable(a, s) && 'text-ink-3')}>
                  <td className="num whitespace-nowrap">{fmtDate(s.date)}</td><td>{topicOf(a, s)}</td><td className="max-md:hidden">{s.unit}</td><td>{spName(d, a)}</td>
                  <td><span className="flex flex-wrap gap-1"><Badge tone={SESSION_STATUS[s.status].tone}>{SESSION_STATUS[s.status].label}</Badge>{a.attendance === 'absent' && <Badge tone="danger">缺席</Badge>}</span></td>
                  <td className="num text-right">{isCountable(a, s) ? `${fmtHours(a.approvedMinutes!)} 小時` : a.verifyStatus === 'verified' ? '不計入' : '未核定'}</td>
                </tr>
              ))}
              {!detail.length && <tr><td colSpan={6} className="py-6 text-center text-ink-3">無資料</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <Card>
      <div className="text-[13px] text-ink-3">{label}</div>
      <div className="num mt-2 text-[34px] font-semibold leading-none text-ink">{value}{unit && <span className="ml-1 text-[13px] font-medium text-ink-3">{unit}</span>}</div>
    </Card>
  );
}
