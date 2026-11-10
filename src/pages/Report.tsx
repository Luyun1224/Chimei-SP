import { useMemo } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { computeStats } from '../../shared/stats';
import { fmtDate, fmtHours, rocYear, yearOf } from '../../shared/time';
import { useSnap } from '../lib/store';
import { navigate, type Route } from '../lib/router';
import { C, MonthlyBars } from '../components/charts';
import { Button } from '../components/ui';

/** 適合列印／存成 PDF 的年度成果報告（瀏覽器列印 → 另存 PDF） */
export default function Report({ route }: { route: Route }) {
  const { snap } = useSnap();
  const year = Number(route.query.get('year')) || yearOf(snap.today);
  const st = useMemo(() => computeStats(snap, { year }, snap.today), [snap, year]);
  return (
    <div className="mx-auto max-w-[900px] bg-white p-8 shadow-soft print:max-w-none print:p-0 print:shadow-none sm:p-12">
      <div className="no-print mb-6 flex justify-between">
        <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => navigate('/analytics', { year })}>返回分析</Button>
        <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>列印 / 另存 PDF</Button>
      </div>
      <header className="border-b-2 border-pine pb-6">
        <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-gold-600">Chi Mei Medical Center · Clinical Skills Center</div>
        <h1 className="display mt-2 text-[34px] font-semibold text-pine">{rocYear(year)} 年度標準化病人（SP）演出成果報告</h1>
        <p className="mt-2 text-[13px] text-ink-3">統計期間：{year}/01/01 – {year}/12/31 · 產製日期：{fmtDate(snap.today)} · 統計口徑：僅計入已完成且已核定出席之紀錄</p>
      </header>

      <section className="print-avoid mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line sm:grid-cols-4">
        {[
          ['已完成演出場次', st.sessions, '場'],
          ['SP 動用總人次', st.personTimes, '人次'],
          ['SP 核定總演出人時', fmtHours(st.minutes), '人時'],
          ['參與 SP 人數', st.activeSps, '人'],
        ].map(([l, v, u]) => (
          <div key={l as string} className="bg-white p-5">
            <div className="text-[12px] text-ink-3">{l}</div>
            <div className="num mt-1 text-[30px] font-semibold text-pine">{v}<span className="ml-1 text-[12px] text-ink-3">{u}</span></div>
          </div>
        ))}
      </section>
      <p className="mt-3 text-[12px] text-ink-3">平均每位活躍 SP 演出 {fmtHours(st.avgMinutesPerSp)} 小時；時數前 20% 之 SP 占總人時 {Math.round(st.concentration.top20Share * 100)}%。{st.pending.unverifiedAssignments + st.pending.awaitingCompletion > 0 && `另有 ${st.pending.unverifiedAssignments} 筆明細、${st.pending.awaitingCompletion} 場演出尚待核定，未列入本報告。`}</p>

      <section className="print-avoid mt-8">
        <h2 className="mb-3 text-[16px] font-semibold text-ink">一、月度演出場次與 SP 人次</h2>
        <MonthlyBars data={st.monthly} series={[{ key: 'sessions', label: '場次', color: C.gold }, { key: 'personTimes', label: 'SP 人次', color: C.pine }]} height={220} />
        <table className="tbl mt-3 text-[12px]">
          <thead><tr><th>月份</th>{st.monthly.map((m) => <th key={m.month} className="text-right">{m.month}</th>)}</tr></thead>
          <tbody>
            <tr><td>場次</td>{st.monthly.map((m) => <td key={m.month} className="num text-right">{m.sessions}</td>)}</tr>
            <tr><td>人次</td>{st.monthly.map((m) => <td key={m.month} className="num text-right">{m.personTimes}</td>)}</tr>
            <tr><td>人時</td>{st.monthly.map((m) => <td key={m.month} className="num text-right">{fmtHours(m.minutes)}</td>)}</tr>
          </tbody>
        </table>
      </section>

      <section className="print-break mt-10">
        <h2 className="mb-3 text-[16px] font-semibold text-ink">二、各 SP 年度演出統計</h2>
        <table className="tbl text-[13px]">
          <thead><tr><th>#</th><th>SP</th><th className="text-right">場次</th><th className="text-right">人次</th><th className="text-right">核定人時</th></tr></thead>
          <tbody>{st.bySp.map((r, i) => <tr key={r.key}><td className="num text-ink-3">{i + 1}</td><td>{r.label}</td><td className="num text-right">{r.sessions}</td><td className="num text-right">{r.personTimes}</td><td className="num text-right font-semibold">{fmtHours(r.minutes)}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="print-avoid mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="mb-3 text-[16px] font-semibold text-ink">三、各申請單位動用情形</h2>
          <table className="tbl text-[13px]"><thead><tr><th>單位</th><th className="text-right">場次</th><th className="text-right">人次</th><th className="text-right">人時</th></tr></thead>
            <tbody>{st.byUnit.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num text-right">{r.sessions}</td><td className="num text-right">{r.personTimes}</td><td className="num text-right">{fmtHours(r.minutes)}</td></tr>)}</tbody></table>
        </div>
        <div>
          <h2 className="mb-3 text-[16px] font-semibold text-ink">四、教案主題分布</h2>
          <table className="tbl text-[13px]"><thead><tr><th>教案</th><th className="text-right">場次</th><th className="text-right">人次</th></tr></thead>
            <tbody>{st.byTopic.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num text-right">{r.sessions}</td><td className="num text-right">{r.personTimes}</td></tr>)}</tbody></table>
        </div>
      </section>
      <footer className="mt-12 border-t border-line pt-4 text-[11px] text-ink-3">
        名詞定義：場次＝至少一名 SP 核定出席之已完成演出；人次＝SP 核定出席筆數；人時＝核定演出分鐘數加總 ÷ 60；報到準備時間、缺席及取消均不計入。資料來源：SP Performance Hub（Google Sheets）。
      </footer>
    </div>
  );
}
