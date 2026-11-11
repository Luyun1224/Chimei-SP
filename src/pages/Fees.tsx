import { useMemo, useState } from 'react';
import { Download, Printer, Wallet } from 'lucide-react';
import { feeLine, feeRule, fmtMoney, type FeeLine } from '../../shared/fee';
import { addDays, fmtDate, fmtDateShort, fmtHours } from '../../shared/time';
import { useSnap, spName } from '../lib/store';
import { download, toCsv } from '../lib/csv';
import { useSessionUI } from '../features/sessions';
import { Button, Card, Empty, PageHeader, Segmented, cx } from '../components/ui';

type View = 'sp' | 'detail';

/** 月底日期 */
const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
};

export default function Fees() {
  const { snap, d } = useSnap();
  const ui = useSessionUI();
  const rule = feeRule(snap.settings);
  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(snap.today.slice(0, 7));
  const [from, setFrom] = useState(snap.today.slice(0, 8) + '01');
  const [to, setTo] = useState(monthEnd(snap.today.slice(0, 7)));
  const [unit, setUnit] = useState('');
  const [spId, setSpId] = useState('');
  /** 版本：estimate 預估請領（依預定時數）／final 核定請領（依核定實際時數） */
  const [version, setVersion] = useState<'estimate' | 'final'>('estimate');
  const [view, setView] = useState<View>('sp');

  const range = mode === 'month' ? [`${month}-01`, monthEnd(month)] : [from, to];
  const units = useMemo(() => [...new Set(snap.sessions.map((s) => s.unit))].sort(), [snap.sessions]);

  const lines = useMemo(() => {
    const out: FeeLine[] = [];
    for (const a of snap.assignments) {
      const s = d.sessionMap.get(a.sessionId);
      if (!s || s.date < range[0] || s.date > range[1]) continue;
      if (unit && s.unit !== unit) continue;
      if (spId && a.spId !== spId) continue;
      const l = feeLine(a, s, spName(d, a), rule, version);
      if (l) out.push(l);
    }
    return out.sort((x, y) => (x.date + x.start + x.spName).localeCompare(y.date + y.start + y.spName));
  }, [snap, d, range[0], range[1], unit, spId, version, rule.hourly, rule.half, rule.threshold]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 核定版：期間內尚未核定（未列入）的筆數 */
  const pendingCount = useMemo(() => {
    if (version !== 'final') return 0;
    let n = 0;
    for (const a of snap.assignments) {
      const s = d.sessionMap.get(a.sessionId);
      if (!s || s.date < range[0] || s.date > range[1] || (unit && s.unit !== unit) || (spId && a.spId !== spId)) continue;
      if (feeLine(a, s, '', rule, 'auto')?.basis === 'estimated') n++;
    }
    return n;
  }, [snap, d, version, range[0], range[1], unit, spId, rule.hourly, rule.half, rule.threshold]); // eslint-disable-line react-hooks/exhaustive-deps

  const bySp = useMemo(() => {
    const m = new Map<string, { spId: string; name: string; lines: FeeLine[]; minutes: number; fee: number }>();
    for (const l of lines) {
      const r = m.get(l.spId) || { spId: l.spId, name: l.spName, lines: [], minutes: 0, fee: 0 };
      r.lines.push(l);
      r.minutes += l.minutes;
      r.fee += l.fee;
      m.set(l.spId, r);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }, [lines]);

  const total = lines.reduce((n, l) => n + l.fee, 0);
  const plannedTotal = lines.reduce((n, l) => n + l.plannedFee, 0);
  const versionLabel = version === 'estimate' ? '預估' : '核定';
  const minutes = lines.reduce((n, l) => n + l.minutes, 0);
  const periodLabel = `${fmtDate(range[0])} – ${fmtDate(range[1])}`;
  const ruleText = `每滿 1 小時 ${fmtMoney(rule.hourly)} 元；未滿 1 小時的部分超過 ${rule.threshold} 分鐘加計 ${fmtMoney(rule.half)} 元`;

  const exportCsv = () => {
    const name = `SP演出費_${versionLabel}_${range[0]}_${range[1]}`;
    if (view === 'sp') {
      download(`${name}_彙總.csv`, toCsv(
        ['SP姓名', '演出人次', '演出日期', '演出時數', `金額（元，${versionLabel}）`, '簽收'],
        [...bySp.map((r) => [r.name, r.lines.length, r.lines.map((l) => fmtDateShort(l.date)).join('、'), fmtHours(r.minutes), r.fee, '']), ['合計', lines.length, '', fmtHours(minutes), total, '']],
      ));
    } else {
      download(`${name}_明細.csv`, toCsv(
        ['演出日期', 'SP姓名', '申請單位', '教案主題', '演出時間', '演出時數', '預定時數', `金額（元，${versionLabel}）`, '預估金額（元）', '差額（元）'],
        [...lines.map((l) => [l.date, l.spName, l.unit, l.topic, `${l.start}-${l.end}`, fmtHours(l.minutes), fmtHours(l.plannedMinutes), l.fee, l.plannedFee, l.fee - l.plannedFee]), ['合計', '', '', '', '', fmtHours(minutes), '', total, plannedTotal, total - plannedTotal]],
      ));
    }
  };

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          no="06"
          en="Fees"
          title="演出費用"
          desc={<>依實際演出時數計算每位 SP 應核發的演出費。計費標準：{ruleText}（可在系統設定調整）。分為「預估」與「核定」兩個請領版本。</>}
          actions={<>
            <Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={!lines.length}>匯出 Excel</Button>
            <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!lines.length}>列印請款清單</Button>
          </>}
        />

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[18px] bg-white p-3 ring-1 ring-line">
          <span className="text-[13px] font-medium text-ink-2">請領版本</span>
          <Segmented label="請領版本" value={version} onChange={setVersion} options={[{ value: 'estimate', label: '預估（依預定時數）' }, { value: 'final', label: '核定（依實際演出時數）' }]} />
          <span className="text-[12px] text-ink-3">
            {version === 'estimate' ? '排程後先依預定時間估算，供暫定請款／借支使用。' : '演出核定後，依每位 SP 實際演出時數計算最終請領金額（例如提早結束會自動減少）。'}
          </span>
        </div>
        {version === 'final' && pendingCount > 0 && (
          <div className="mb-4 rounded-[14px] bg-warn-50 px-4 py-2.5 text-[13px] text-ink">此期間還有 <b className="num">{pendingCount}</b> 筆演出尚未核定，未列入核定版。請先到「演出核定」確認實際時數。</div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Segmented label="期間" value={mode} onChange={setMode} options={[{ value: 'month', label: '月份' }, { value: 'range', label: '自訂期間' }]} />
          {mode === 'month' ? (
            <input type="month" className="field w-auto" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="月份" />
          ) : (
            <>
              <input type="date" className="field w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="開始日期" />
              <span className="text-ink-3">至</span>
              <input type="date" className="field w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="結束日期" />
            </>
          )}
          <select className="field w-auto" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="申請單位"><option value="">全部單位</option>{units.map((u) => <option key={u}>{u}</option>)}</select>
          <select className="field w-auto max-w-[10rem]" value={spId} onChange={(e) => setSpId(e.target.value)} aria-label="SP"><option value="">全部 SP</option>{snap.sps.map((p) => <option key={p.spId} value={p.spId}>{p.name}</option>)}</select>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card className="col-span-2 bg-pine !text-white md:col-span-1">
            <div className="text-[13px] text-white/70">應核發總金額（{versionLabel}）</div>
            <div className="num mt-1 text-[40px] font-semibold leading-none">{fmtMoney(total)}<span className="ml-1 text-[14px] text-white/70">元</span></div>
            {version === 'final' && plannedTotal !== total && <div className="mt-2 text-[12px] text-gold">預估 {fmtMoney(plannedTotal)} 元，差額 {fmtMoney(total - plannedTotal)} 元</div>}
          </Card>
          <Card><div className="text-[13px] text-ink-3">SP 人數</div><div className="num mt-1 text-[32px] font-semibold">{bySp.length}<span className="ml-1 text-[13px] text-ink-3">人</span></div></Card>
          <Card><div className="text-[13px] text-ink-3">演出人次</div><div className="num mt-1 text-[32px] font-semibold">{lines.length}<span className="ml-1 text-[13px] text-ink-3">人次</span></div></Card>
          <Card><div className="text-[13px] text-ink-3">演出總時數</div><div className="num mt-1 text-[32px] font-semibold">{fmtHours(minutes)}<span className="ml-1 text-[13px] text-ink-3">小時</span></div></Card>
        </div>

        <div className="mb-3">
          <Segmented label="檢視方式" value={view} onChange={setView} options={[{ value: 'sp', label: '依 SP 彙總' }, { value: 'detail', label: '逐筆明細' }]} />
        </div>
      </div>

      {/* 列印用表頭 */}
      <div className="hidden print:block">
        <div className="text-[12px] tracking-[0.2em] text-ink-3">奇美醫院臨床技能中心</div>
        <h1 className="display mt-1 text-[24px] font-semibold text-pine">標準化病人（SP）演出費請領清單（{versionLabel}）</h1>
        <p className="text-[12px] text-ink-2">{version === 'estimate' ? '依預定演出時數估算，實際金額以核定版為準。' : '依核定之實際演出時數計算。'}</p>
        <p className="mt-1 text-[12px] text-ink-2">期間：{periodLabel}{unit && `　申請單位：${unit}`}　計費標準：{ruleText}</p>
        <p className="mb-3 text-[12px] text-ink-2">合計：{bySp.length} 人、{lines.length} 人次、{fmtHours(minutes)} 小時、新臺幣 <b>{fmtMoney(total)}</b> 元{version === 'final' && plannedTotal !== total && `（預估 ${fmtMoney(plannedTotal)} 元，差額 ${fmtMoney(total - plannedTotal)} 元）`}</p>
      </div>

      {lines.length === 0 ? (
        <Empty title="此期間沒有可計費的演出" icon={<Wallet className="size-6" />}>可切換月份或期間；缺席、取消的演出不列入。</Empty>
      ) : view === 'sp' ? (
        <Card className="!p-0 overflow-hidden print:border-0 print:shadow-none">
          <table className="tbl">
            <thead>
              <tr><th className="w-10">#</th><th>SP 姓名</th><th className="text-right">人次</th><th>演出日期</th><th className="text-right">時數</th><th className="text-right">金額（元）</th><th className="hidden w-32 print:table-cell">簽收</th></tr>
            </thead>
            <tbody>
              {bySp.map((r, i) => (
                <tr key={r.spId} className="print-avoid">
                  <td className="num text-ink-3">{i + 1}</td>
                  <td className="font-medium">{r.name}</td>
                  <td className="num text-right">{r.lines.length}</td>
                  <td className="text-[13px] text-ink-2">{r.lines.map((l) => fmtDateShort(l.date)).join('、')}</td>
                  <td className="num text-right">{fmtHours(r.minutes)}</td>
                  <td className="num text-right font-semibold">
                    {fmtMoney(r.fee)}
                  </td>
                  <td className="hidden print:table-cell" />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-mist/60 font-semibold">
                <td colSpan={2} className="px-3 py-2.5">合計</td>
                <td className="num px-3 py-2.5 text-right">{lines.length}</td>
                <td />
                <td className="num px-3 py-2.5 text-right">{fmtHours(minutes)}</td>
                <td className="num px-3 py-2.5 text-right text-pine">{fmtMoney(total)}</td>
                <td className="hidden print:table-cell" />
              </tr>
            </tfoot>
          </table>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden print:border-0 print:shadow-none">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>演出日期</th><th>SP 姓名</th><th className="max-md:hidden">申請單位</th><th>教案</th><th className="max-md:hidden">演出時間</th><th className="text-right">時數</th>{version === 'final' && <th className="text-right">預定</th>}<th className="text-right">金額</th>{version === 'final' && <th className="text-right">差額</th>}</tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.assignmentId} className="cursor-pointer print-avoid" onClick={() => ui.openDetail(l.sessionId)}>
                    <td className="num whitespace-nowrap">{fmtDate(l.date)}</td>
                    <td className="font-medium">{l.spName}</td>
                    <td className="max-md:hidden">{l.unit}</td>
                    <td>{l.topic}</td>
                    <td className="num max-md:hidden whitespace-nowrap text-ink-2">{l.start}–{l.end}</td>
                    <td className="num text-right">{fmtHours(l.minutes)}</td>
                    {version === 'final' && <td className="num text-right text-ink-3">{fmtHours(l.plannedMinutes)}</td>}
                    <td className="num text-right font-semibold">{fmtMoney(l.fee)}</td>
                    {version === 'final' && <td className={cx('num text-right', l.fee - l.plannedFee < 0 ? 'text-danger' : 'text-ink-3')}>{l.fee === l.plannedFee ? '—' : fmtMoney(l.fee - l.plannedFee)}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-mist/60 font-semibold">
                  <td colSpan={5} className="px-3 py-2.5 max-md:hidden">合計 {lines.length} 人次</td>
                  <td className="num px-3 py-2.5 text-right">{fmtHours(minutes)}</td>
                  {version === 'final' && <td className="num px-3 py-2.5 text-right text-ink-3">{fmtHours(lines.reduce((n, l) => n + l.plannedMinutes, 0))}</td>}
                  <td className="num px-3 py-2.5 text-right text-pine">{fmtMoney(total)}</td>
                  {version === 'final' && <td className="num px-3 py-2.5 text-right">{total === plannedTotal ? '—' : fmtMoney(total - plannedTotal)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <p className={cx('mt-3 text-[12px] text-ink-3 print:hidden')}>點選明細可開啟該場排程。列印時會自動加上表頭與簽收欄，可直接附於請款／借支單據。</p>
    </div>
  );
}
