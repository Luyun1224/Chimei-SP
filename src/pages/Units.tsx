import { useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Building2, Download, Search } from 'lucide-react';
import { categoryOf, topicOf } from '../../shared/stats';
import { computeUnitDetail, computeUnitRows, unitMatches, type UnitRow, type UnitScope } from '../../shared/units';
import { daysBetween, fmtDate, fmtHours, rocYear, weekdayLabel, yearOf } from '../../shared/time';
import { useSnap } from '../lib/store';
import { navigate, type Route } from '../lib/router';
import { download, toCsv } from '../lib/csv';
import { useSessionUI } from '../features/sessions';
import { C, MonthlyBars, RankBars, TrendLine } from '../components/charts';
import { Badge, Button, Card, CardHead, Empty, PageHeader, SessionBadge, Stat, cx } from '../components/ui';

type SortKey = 'requests' | 'perMonth' | 'avgIntervalDays' | 'lastDate' | 'spDemand' | 'minutes' | 'unit';

/** 年度範圍：?year=2026；?year=all 為全部年度；未指定為今年 */
function useScope(route: Route, today: string): { scope: UnitScope; yearParam: string } {
  const raw = route.query.get('year');
  if (raw === 'all') return { scope: {}, yearParam: 'all' };
  const y = Number(raw) || yearOf(today);
  return { scope: { year: y }, yearParam: String(y) };
}

const scopeLabel = (s: UnitScope) => (s.year ? `${s.year} 年（民國 ${rocYear(s.year)}）` : '全部年度');
const intervalText = (d: number | null) => (d === null ? '—' : d === 0 ? '同日' : `${d} 天`);

function useYears() {
  const { snap } = useSnap();
  return useMemo(() => [...new Set([yearOf(snap.today), ...snap.sessions.filter((s) => !s.isDeleted).map((s) => yearOf(s.date))])].sort((a, b) => b - a), [snap]);
}

export default function Units({ route }: { route: Route }) {
  return route.parts[1] ? <UnitDetailPage route={route} unit={decodeURIComponent(route.parts[1])} /> : <UnitList route={route} />;
}

function UnitList({ route }: { route: Route }) {
  const { snap } = useSnap();
  const { scope, yearParam } = useScope(route, snap.today);
  const years = useYears();
  const [q, setQ] = useState(() => route.query.get('q') || '');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'requests', dir: -1 });

  const all = useMemo(() => computeUnitRows(snap, scope, snap.today), [snap, scope.year]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const cmp = (a: UnitRow, b: UnitRow): number => {
      switch (sort.key) {
        case 'unit': return a.unit.localeCompare(b.unit, 'zh-Hant');
        case 'lastDate': return a.lastDate.localeCompare(b.lastDate);
        case 'avgIntervalDays': return (a.avgIntervalDays ?? 0) - (b.avgIntervalDays ?? 0);
        default: return a[sort.key] - b[sort.key];
      }
    };
    return all
      .filter((r) => unitMatches(r.unit, q))
      .sort((a, b) => {
        // 平均間隔無法計算（只有一次申請）的科部一律排在最後
        if (sort.key === 'avgIntervalDays' && (a.avgIntervalDays === null) !== (b.avgIntervalDays === null)) return a.avgIntervalDays === null ? 1 : -1;
        return sort.dir * cmp(a, b) || b.requests - a.requests;
      });
  }, [all, q, sort]);

  const total = rows.reduce((n, r) => n + r.requests, 0);
  const exportCsv = () =>
    download(
      `科部申請統計_${scope.year ?? '全部年度'}.csv`,
      toCsv(
        ['科部', '申請件數', '已完成', '預定', '已取消', 'SP 需求人次', '核定人時', '有申請月數', '平均每月件數', '平均間隔天數', '首次演出日', '最近演出日', '下次預定'],
        rows.map((r) => [r.unit, r.requests, r.completed, r.scheduled, r.cancelled, r.spDemand, fmtHours(r.minutes), r.activeMonths, r.perMonth, r.avgIntervalDays ?? '', r.firstDate, r.lastDate, r.nextDate]),
      ),
    );

  const th = (k: SortKey, label: string, right = true) => (
    <th className={right ? 'text-right' : ''}>
      <button className="hover:text-pine" onClick={() => setSort({ key: k, dir: sort.key === k ? (-sort.dir as 1 | -1) : k === 'unit' || k === 'avgIntervalDays' ? 1 : -1 })}>
        {label}{sort.key === k ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  return (
    <div>
      <PageHeader
        no="08"
        en="Departments"
        title="科部申請查詢"
        desc="搜尋申請單位（科部），查看申請件數與申請頻率。申請件數＝該科部的排程筆數（含預定、已完成、已取消），依演出日期歸屬年度；平均每月件數以統計月數換算（當年度算到本月）；平均間隔＝不重複演出日期之間的平均天數。"
        actions={<Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={!rows.length}>匯出 CSV</Button>}
      />

      <div className="sticky top-[60px] z-20 -mx-1 mb-5 flex flex-wrap items-center gap-2 rounded-[18px] bg-cream/90 px-1 py-2 backdrop-blur lg:top-0">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder="搜尋科部，例如：護理、急診、UGY…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜尋科部" />
        </div>
        <select className="field w-auto" value={yearParam} onChange={(e) => navigate('/units', { year: e.target.value, q: q.trim() || undefined })} aria-label="年度">
          <option value="all">全部年度</option>
          {years.map((y) => <option key={y} value={y}>{y}（民國 {rocYear(y)}）</option>)}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><Stat label={q ? '符合搜尋的科部' : '有申請的科部'} value={rows.length} unit="個" foot={scopeLabel(scope)} /></Card>
        <Card><Stat label="申請件數合計" value={total} unit="件" /></Card>
        <Card><Stat label="已完成" value={rows.reduce((n, r) => n + r.completed, 0)} unit="件" /></Card>
        <Card><Stat label="已取消" value={rows.reduce((n, r) => n + r.cancelled, 0)} unit="件" /></Card>
      </div>

      {rows.length > 1 && (
        <Card className="mb-4">
          <CardHead eyebrow="Ranking" title="各科部申請件數" action={<span className="text-[12px] text-ink-3">點擊科部可查看詳情</span>} />
          <RankBars rows={rows.map((r) => ({ key: r.unit, label: r.unit, requests: r.requests }))} valueKey="requests" unit="件" onSelect={(k) => navigate(`/units/${encodeURIComponent(k)}`, { year: yearParam })} max={12} color={C.gold} />
        </Card>
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 pt-5"><CardHead eyebrow="Departments" title={`科部申請統計表（${rows.length}）`} /></div>
        {rows.length === 0 ? (
          <div className="p-5 pt-0"><Empty icon={<Building2 className="size-6" />} title={q ? `找不到符合「${q}」的科部` : '此範圍尚無申請紀錄'} /></div>
        ) : (
          <div className="max-h-[560px] overflow-auto border-t border-line">
            <table className="tbl">
              <thead><tr>
                {th('unit', '科部', false)}
                {th('requests', '申請件數')}
                <th className="text-right max-md:hidden">完成／預定／取消</th>
                {th('perMonth', '平均每月')}
                {th('avgIntervalDays', '平均間隔')}
                {th('lastDate', '最近演出')}
                <th className="text-right max-lg:hidden">下次預定</th>
                {th('spDemand', 'SP 需求人次')}
                {th('minutes', '核定人時')}
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.unit} className="cursor-pointer" onClick={() => navigate(`/units/${encodeURIComponent(r.unit)}`, { year: yearParam })}>
                    <td><span className="font-medium text-pine hover:underline">{r.unit}</span></td>
                    <td className="num text-right text-[15px] font-semibold">{r.requests}</td>
                    <td className="num text-right text-ink-2 max-md:hidden">{r.completed} / {r.scheduled} / {r.cancelled}</td>
                    <td className="num text-right">{r.perMonth} 件</td>
                    <td className="num text-right">{intervalText(r.avgIntervalDays)}</td>
                    <td className="num whitespace-nowrap text-right">{r.lastDate ? fmtDate(r.lastDate).slice(0, 10) : '—'}</td>
                    <td className="num whitespace-nowrap text-right max-lg:hidden">{r.nextDate ? fmtDate(r.nextDate).slice(0, 10) : '—'}</td>
                    <td className="num text-right">{r.spDemand}</td>
                    <td className="num text-right">{fmtHours(r.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function UnitDetailPage({ route, unit }: { route: Route; unit: string }) {
  const { snap, d } = useSnap();
  const ui = useSessionUI();
  const { scope, yearParam } = useScope(route, snap.today);
  const years = useYears();
  const det = useMemo(() => computeUnitDetail(snap, unit, scope, snap.today), [snap, unit, scope.year]); // eslint-disable-line react-hooks/exhaustive-deps
  const everRequested = det.yearly.length > 0;

  if (!everRequested) {
    return <Empty title={`找不到科部「${unit}」的申請紀錄`} action={<Button onClick={() => navigate('/units')}>返回科部列表</Button>} />;
  }

  const spCount = (sid: string) => (d.bySession.get(sid) || []).filter((a) => a.attendance !== 'cancelled').length;
  const topicsOf = (sid: string) => {
    const s = d.sessionMap.get(sid)!;
    const ts = [...new Set((d.bySession.get(sid) || []).map((a) => topicOf(a, s)).filter(Boolean))];
    return ts.length ? ts.join('、') : s.topic;
  };

  const exportCsv = () =>
    download(
      `科部申請明細_${unit}_${scope.year ?? '全部年度'}.csv`,
      toCsv(
        ['演出日期', '星期', '演出時間', '演出類型', '教案', '地點', 'SP 人數', '排程狀態', '取消原因', '建立時間'],
        det.sessions.map((s) => [s.date, weekdayLabel(s.date), `${s.startTime}-${s.endTime}`, categoryOf(s), topicsOf(s.sessionId), s.location, spCount(s.sessionId), s.status === 'completed' ? '已完成' : s.status === 'cancelled' ? '已取消' : '預定', s.cancelReason, s.createdAt.slice(0, 16).replace('T', ' ')]),
      ),
    );

  return (
    <div>
      <button onClick={() => navigate('/units', { year: yearParam })} className="no-print mb-4 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-pine"><ArrowLeft className="size-4" />科部列表</button>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-7">
        <div className="flex items-start gap-5">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-[22px] bg-pine text-white shadow-lift"><Building2 className="size-7" /></div>
          <div>
            <div className="eyebrow mb-1">Department · {scopeLabel(scope)}</div>
            <h1 className="display text-[32px] font-semibold leading-tight text-pine">{unit}</h1>
            <div className="mt-2 text-[13px] text-ink-2">
              首次演出 {det.firstDate ? fmtDate(det.firstDate).slice(0, 10) : '—'}
              {det.nextDate && <> · 下次預定 <b className="num">{fmtDate(det.nextDate)}</b></>}
            </div>
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <select className="field w-auto" value={yearParam} onChange={(e) => navigate(`/units/${encodeURIComponent(unit)}`, { year: e.target.value })} aria-label="年度">
            <option value="all">全部年度</option>
            {years.map((y) => <option key={y} value={y}>{y}（民國 {rocYear(y)}）</option>)}
          </select>
          <Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={!det.sessions.length}>匯出明細 CSV</Button>
          {scope.year && <Button icon={<BarChart3 className="size-4" />} onClick={() => navigate('/analytics', { year: scope.year, unit })}>成果分析</Button>}
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card className="col-span-2 bg-pine !text-white md:col-span-1 xl:col-span-2">
          <Stat tone="white" big label="申請件數" value={det.requests} unit="件" foot={`已完成 ${det.completed} · 預定 ${det.scheduled} · 已取消 ${det.cancelled}`} />
        </Card>
        <Card><Stat label="平均每月" value={det.perMonth} unit="件" foot={`${det.activeMonths} 個月有申請`} /></Card>
        <Card><Stat label="平均間隔" value={det.avgIntervalDays ?? '—'} unit={det.avgIntervalDays !== null ? '天' : undefined} foot="不重複演出日期之間" /></Card>
        <Card><Stat label="最近演出" value={<span className="text-[22px]">{det.lastDate ? fmtDate(det.lastDate).slice(0, 10) : '—'}</span>} foot={det.lastDate ? `距今 ${daysBetween(det.lastDate, snap.today)} 天` : undefined} /></Card>
        <Card><Stat label="SP 需求人次" value={det.spDemand} unit="人次" foot={`核定 ${fmtHours(det.minutes)} 人時`} /></Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          {scope.year ? (
            <>
              <CardHead eyebrow="Monthly" title={`${scope.year} 年各月申請件數`} />
              {det.requests ? <MonthlyBars data={det.monthly} series={[{ key: 'requests', label: '申請件數', color: C.gold }, { key: 'completed', label: '已完成', color: C.pine }]} /> : <Empty title="本年度沒有申請" />}
            </>
          ) : (
            <>
              <CardHead eyebrow="Yearly" title="歷年申請件數" />
              <TrendLine data={det.yearly} xKey="year" yKey="requests" label="申請件數" />
            </>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHead eyebrow="Yearly" title="歷年申請趨勢" />
          <table className="tbl text-[13px]">
            <thead><tr><th>年度</th><th className="text-right">申請件數</th><th className="text-right">已完成</th></tr></thead>
            <tbody>
              {[...det.yearly].reverse().map((y) => (
                <tr key={y.year} className={cx('cursor-pointer', scope.year === y.year && 'bg-gold-50')} onClick={() => navigate(`/units/${encodeURIComponent(unit)}`, { year: y.year })}>
                  <td className="num">{y.year}（{rocYear(y.year)}）</td>
                  <td className="num text-right font-semibold">{y.requests}</td>
                  <td className="num text-right">{y.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHead eyebrow="By case" title="申請教案（場次，不含取消）" />{det.byTopic.length ? <RankBars rows={det.byTopic} valueKey="sessions" unit="場" max={10} /> : <Empty title="尚無資料" />}</Card>
        <Card><CardHead eyebrow="By category" title="演出類型（場次，不含取消）" />{det.byCategory.length ? <RankBars rows={det.byCategory} valueKey="sessions" unit="場" max={10} color={C.gold} /> : <Empty title="尚無資料" />}</Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="px-5 pt-5"><CardHead eyebrow="Records" title={`申請紀錄（${det.sessions.length}）`} /></div>
        {det.sessions.length === 0 ? <div className="p-5 pt-0"><Empty title="此範圍沒有申請紀錄" /></div> : (
          <div className="max-h-[520px] overflow-auto border-t border-line">
            <table className="tbl">
              <thead><tr><th>演出日期</th><th className="max-sm:hidden">時間</th><th className="max-md:hidden">類型</th><th>教案</th><th className="text-right">SP</th><th>狀態</th></tr></thead>
              <tbody>
                {det.sessions.map((s) => (
                  <tr key={s.sessionId} className={cx('cursor-pointer', s.status === 'cancelled' && 'text-ink-3')} onClick={() => ui.openDetail(s.sessionId)}>
                    <td className="num whitespace-nowrap">{fmtDate(s.date)}</td>
                    <td className="num whitespace-nowrap max-sm:hidden">{s.startTime}–{s.endTime}</td>
                    <td className="whitespace-nowrap max-md:hidden">{categoryOf(s)}</td>
                    <td>{topicsOf(s.sessionId)}</td>
                    <td className="num text-right">{spCount(s.sessionId)}</td>
                    <td><span className="flex flex-wrap gap-1"><SessionBadge status={s.status} />{s.status === 'scheduled' && s.date < snap.today && <Badge tone="warn">待確認完成</Badge>}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
