import { useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, BarChart3, BellRing, CalendarDays, ClipboardCheck, Copy, Plus, Sparkles } from 'lucide-react';
import { useSnap, spName } from '../lib/store';
import { computeOverview, needsVerification } from '../../shared/stats';
import { addDays, fmtDate, fmtDateShort, fmtHours, weekdayLabel } from '../../shared/time';
import { notifyState, renderSummary } from '../../shared/template';
import { copyText } from '../lib/csv';
import { navigate } from '../lib/router';
import { useSessionUI } from '../features/sessions';
import { useToast } from '../components/overlay';
import { Badge, Button, Empty, SessionBadge, cx } from '../components/ui';

const tile = 'rounded-[24px] border border-line bg-card p-5 shadow-soft transition-shadow duration-300 hover:shadow-lift';
const enter = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.04, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } });

export default function Overview() {
  const { snap, d } = useSnap();
  const ui = useSessionUI();
  const toast = useToast();
  const today = snap.today;
  const tomorrow = addDays(today, 1);
  const ov = useMemo(() => computeOverview(snap, today), [snap, today]);

  const tomorrowItems = useMemo(
    () => snap.sessions.filter((s) => s.date === tomorrow && s.status === 'scheduled').sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [snap.sessions, tomorrow],
  );
  const tomorrowAssign = tomorrowItems.flatMap((s) => (d.bySession.get(s.sessionId) || []).filter((a) => a.attendance !== 'cancelled').map((a) => ({ s, a })));
  const notNotified = tomorrowAssign.filter(({ s, a }) => notifyState(d.latestNotify.get(a.assignmentId), s, a) !== 'notified');

  const pendingVerify = useMemo(() => {
    const list = snap.sessions.filter((s) => s.status !== 'cancelled' && s.date <= today && (s.status === 'scheduled' || (d.bySession.get(s.sessionId) || []).some((a) => needsVerification(a, s))));
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [snap.sessions, d, today]);

  const copyTomorrow = async () => {
    if (!tomorrowItems.length) return toast('info', '明日沒有排程');
    const text = renderSummary(snap.settings.summaryTemplate, tomorrow, tomorrowItems.map((s) => ({ session: s, spNames: (d.bySession.get(s.sessionId) || []).filter((a) => a.attendance !== 'cancelled').map((a) => spName(d, a)) })));
    (await copyText(text)) ? toast('success', '已複製明日總整理（尚未標記為已通知）') : toast('error', '無法存取剪貼簿，請至提醒中心手動複製');
  };

  const week = Array.from({ length: 7 }, (_, i) => addDays(ov.weekRange[0], i));
  const yearHours = fmtHours(ov.yearMinutes);

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2 flex items-center gap-2"><span className="text-gold-600">01</span><span className="h-px w-6 bg-line" />Overview · {fmtDate(today)}</div>
          <h1 className="display text-[38px] font-semibold leading-[1.1] text-pine md:text-[48px]">
            今日的 SP 工作，<br className="hidden sm:block" />
            <span className="text-gold-600">一頁掌握。</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => ui.openNew()}>新增演出</Button>
          <Button icon={<CalendarDays className="size-4" />} onClick={() => navigate('/schedule', { view: 'week' })}>本週行程</Button>
          <Button icon={<Copy className="size-4" />} onClick={copyTomorrow}>複製明日提醒</Button>
          <Button icon={<ClipboardCheck className="size-4" />} onClick={() => navigate('/verify')}>確認已完成演出</Button>
          <Button icon={<BarChart3 className="size-4" />} onClick={() => navigate('/analytics')}>年度成果</Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
        {/* Hero：年度核定人時 */}
        <motion.section {...enter(0)} className="relative overflow-hidden rounded-[28px] bg-pine p-7 text-white shadow-lift md:col-span-6 xl:col-span-7 xl:row-span-2">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-sage/20 blur-2xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 right-24 size-64 rounded-full bg-gold/25 blur-3xl" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-gold"><Sparkles className="size-4" />{today.slice(0, 4)} 年度核定成果</div>
            <div>
              <div className="text-[14px] text-white/70">SP 實際核定總演出人時</div>
              <div className="num mt-1 flex items-baseline gap-2 text-[72px] font-semibold leading-none tracking-tight md:text-[92px]">
                {yearHours}
                <span className="text-[18px] font-medium text-white/70">人時</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 border-t border-white/15 pt-5">
              <MiniStat label="已完成場次" value={ov.yearSessions} unit="場" />
              <MiniStat label="SP 動用人次" value={ov.yearPersonTimes} unit="人次" />
              <MiniStat label="待核定明細" value={ov.pending.unverifiedAssignments} unit="筆" highlight={ov.pending.unverifiedAssignments > 0} />
            </div>
            <button onClick={() => navigate('/analytics')} className="group inline-flex w-fit items-center gap-1 text-[13px] text-white/80 hover:text-white">
              查看年度成果分析 <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </div>
        </motion.section>

        {/* 今日 */}
        <motion.section {...enter(1)} className={cx(tile, 'md:col-span-3 xl:col-span-5')}>
          <div className="flex items-baseline justify-between">
            <div><div className="eyebrow">Today</div><h2 className="mt-1 text-[16px] font-semibold">今日演出</h2></div>
            <div className="num text-[44px] font-semibold leading-none text-pine">{ov.todaySessions.length}<span className="ml-1 text-[13px] text-ink-3">場</span></div>
          </div>
          <ul className="mt-4 space-y-2">
            {ov.todaySessions.length === 0 && <li className="text-[13px] text-ink-3">今天沒有排定的演出。</li>}
            {ov.todaySessions.slice(0, 4).map((s) => (
              <li key={s.sessionId}>
                <button onClick={() => ui.openDetail(s.sessionId)} className="flex w-full items-center gap-3 rounded-[14px] bg-mist/60 px-3 py-2 text-left transition hover:bg-mist">
                  <span className="num text-[13px] font-semibold text-pine">{s.startTime}</span>
                  <span className="truncate text-[14px]">{s.topic}</span>
                  <span className="ml-auto text-[12px] text-ink-3">{(d.bySession.get(s.sessionId) || []).length} 位</span>
                </button>
              </li>
            ))}
          </ul>
        </motion.section>

        {/* 本週 */}
        <motion.section {...enter(2)} className={cx(tile, 'md:col-span-3 xl:col-span-3')}>
          <div className="eyebrow">This week</div>
          <div className="mt-1 flex items-baseline justify-between">
            <h2 className="text-[16px] font-semibold">本週演出</h2>
            <span className="num text-[34px] font-semibold text-ink">{ov.weekSessions.length}<span className="ml-1 text-[13px] text-ink-3">場</span></span>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1">
            {week.map((day) => {
              const n = ov.weekSessions.filter((s) => s.date === day).length;
              return (
                <button key={day} onClick={() => navigate('/schedule', { view: 'week', date: day })} className={cx('flex flex-col items-center gap-1 rounded-[10px] py-1.5 transition hover:bg-mist', day === today && 'bg-pine-50')} title={`${fmtDateShort(day)}：${n} 場`}>
                  <span className="text-[11px] text-ink-3">{weekdayLabel(day)}</span>
                  <span className={cx('num flex size-7 items-center justify-center rounded-full text-[12px] font-semibold', n ? 'bg-pine text-white' : 'text-ink-3')}>{n || '·'}</span>
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* 本月人次 */}
        <motion.section {...enter(3)} className={cx(tile, 'bg-mist/70 md:col-span-3 xl:col-span-2')}>
          <div className="eyebrow">This month</div>
          <h2 className="mt-1 text-[14px] font-semibold">本月 SP 動用人次</h2>
          <div className="num mt-3 text-[40px] font-semibold leading-none text-pine">{ov.monthPersonTimes}</div>
          <p className="mt-2 text-[11px] leading-snug text-ink-3">含預定與已完成，不含取消、缺席</p>
        </motion.section>

        {/* 明日提醒 */}
        <motion.section {...enter(4)} className={cx(tile, 'border-gold/50 bg-gold-50/60 md:col-span-6 xl:col-span-5')}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow flex items-center gap-1 !text-gold-600"><BellRing className="size-3.5" />Tomorrow · {fmtDateShort(tomorrow)}</div>
              <h2 className="mt-1 text-[16px] font-semibold">明日需要 LINE 提醒的 SP</h2>
            </div>
            <div className="text-right">
              <div className="num text-[40px] font-semibold leading-none text-gold-600">{notNotified.length}</div>
              <div className="text-[12px] text-ink-3">/ {tomorrowAssign.length} 人次尚未通知</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tomorrowAssign.length === 0 && <span className="text-[13px] text-ink-3">明日沒有 SP 演出。</span>}
            {tomorrowAssign.map(({ s, a }) => {
              const st = notifyState(d.latestNotify.get(a.assignmentId), s, a);
              return (
                <span key={a.assignmentId} className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px]', st === 'notified' ? 'bg-white text-ink-3 line-through decoration-sage' : st === 'needs_renotify' ? 'bg-warn-50 text-warn' : 'bg-white text-ink ring-1 ring-gold/40')}>
                  {spName(d, a)}<span className="num text-[11px] text-ink-3">{s.checkinTime}</span>
                </span>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="gold" onClick={() => navigate('/reminder', { date: tomorrow })}>前往提醒中心</Button>
            <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={copyTomorrow}>複製總整理</Button>
          </div>
        </motion.section>

        {/* 近期排程 */}
        <motion.section {...enter(5)} className={cx(tile, 'md:col-span-6 xl:col-span-7 xl:row-span-2')}>
          <div className="mb-3 flex items-center justify-between">
            <div><div className="eyebrow">Upcoming</div><h2 className="mt-1 text-[16px] font-semibold">近期演出排程</h2></div>
            <Button size="sm" variant="ghost" onClick={() => navigate('/schedule', { view: 'list' })}>全部排程 →</Button>
          </div>
          {ov.upcoming.length === 0 ? (
            <Empty title="尚無近期排程" icon={<CalendarDays className="size-6" />} action={<Button size="sm" variant="primary" onClick={() => ui.openNew()}>新增演出</Button>}>建立第一筆排程後，這裡會顯示接下來的演出。</Empty>
          ) : (
            <ul className="space-y-2">
              {ov.upcoming.slice(0, 6).map((s) => (
                <li key={s.sessionId}>
                  <button onClick={() => ui.openDetail(s.sessionId)} className="group grid w-full grid-cols-[84px_1fr_auto] items-center gap-3 rounded-[16px] px-3 py-2.5 text-left ring-1 ring-transparent transition hover:bg-mist/50 hover:ring-line">
                    <span className="num text-[13px]"><b className="text-pine">{fmtDateShort(s.date)}</b><br /><span className="text-ink-3">{s.startTime}–{s.endTime}</span></span>
                    <span className="min-w-0"><span className="block truncate text-[14px] font-medium">{s.topic}</span><span className="block truncate text-[12px] text-ink-3">{s.unit} · {s.location}</span></span>
                    <span className="flex flex-col items-end gap-1">
                      <SessionBadge status={s.status} />
                      <span className="text-[12px] text-ink-3">{(d.bySession.get(s.sessionId) || []).map((a) => spName(d, a)).join('、')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
        {/* 尚未核定 */}
        <motion.section {...enter(6)} className={cx(tile, 'md:col-span-6 xl:col-span-5')}>
          <div className="mb-3 flex items-center justify-between">
            <div><div className="eyebrow">Verification</div><h2 className="mt-1 text-[16px] font-semibold">尚未核定的演出紀錄</h2></div>
            <Badge tone={pendingVerify.length ? 'warn' : 'ok'}>{pendingVerify.length} 場</Badge>
          </div>
          {pendingVerify.length === 0 ? (
            <Empty title="全部核定完成" icon={<ClipboardCheck className="size-6" />}>過去的演出都已確認出席與時數。</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {pendingVerify.slice(0, 5).map((s) => (
                <li key={s.sessionId}>
                  <button onClick={() => navigate('/verify', { session: s.sessionId })} className="flex w-full items-center gap-3 py-2.5 text-left hover:text-pine">
                    <span className="num w-[72px] text-[13px] text-ink-3">{fmtDateShort(s.date)}</span>
                    <span className="truncate text-[14px]">{s.topic}</span>
                    <span className="ml-auto">{s.status === 'scheduled' ? <Badge tone="warn">待確認完成</Badge> : <Badge tone="warn">待核定時數</Badge>}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pendingVerify.length > 5 && <Button size="sm" variant="ghost" className="mt-2" onClick={() => navigate('/verify')}>查看全部 {pendingVerify.length} 場 →</Button>}
        </motion.section>

      </div>
    </div>
  );
}

function MiniStat({ label, value, unit, highlight }: { label: string; value: number; unit: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[12px] text-white/60">{label}</div>
      <div className={cx('num mt-1 text-[26px] font-semibold', highlight ? 'text-gold' : 'text-white')}>
        {value}<span className="ml-1 text-[12px] font-normal text-white/60">{unit}</span>
      </div>
    </div>
  );
}
