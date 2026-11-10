import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCheck, ClipboardCheck, Search, ShieldCheck, Undo2 } from 'lucide-react';
import type { Assignment, Attendance, Session } from '../../shared/types';
import { needsVerification, topicOf } from '../../shared/stats';
import { diffMinutes, fmtDate, fmtDuration, isValidTime } from '../../shared/time';
import { useSnap, spName } from '../lib/store';
import { navigate, type Route } from '../lib/router';
import { useSessionUI } from '../features/sessions';
import { useConfirm, useToast } from '../components/overlay';
import { ATTENDANCE, Badge, Button, Card, Empty, PageHeader, SessionBadge, Segmented, cx } from '../components/ui';

type Tab = 'pending' | 'verified' | 'all';

export default function Verification({ route }: { route: Route }) {
  const { snap, d } = useSnap();
  const focus = route.query.get('session') || '';
  const [tab, setTab] = useState<Tab>('pending');
  const [q, setQ] = useState('');
  const focusRef = useRef<HTMLDivElement>(null);

  const isPending = (s: Session) => s.status === 'scheduled' || (d.bySession.get(s.sessionId) || []).some((a) => needsVerification(a, s));
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return snap.sessions
      .filter((s) => s.status !== 'cancelled' && s.date <= snap.today)
      .filter((s) => (tab === 'all' ? true : tab === 'pending' ? isPending(s) : !isPending(s)))
      .filter((s) => !k || [s.topic, s.unit, ...(d.bySession.get(s.sessionId) || []).map((a) => spName(d, a))].join(' ').toLowerCase().includes(k))
      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, d, tab, q]);

  useEffect(() => {
    if (focus) {
      const s = d.sessionMap.get(focus);
      if (s && !isPending(s)) setTab('all');
      setTimeout(() => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const pendingCount = snap.sessions.filter((s) => s.status !== 'cancelled' && s.date <= snap.today && isPending(s)).length;

  return (
    <div>
      <PageHeader
        no="05"
        en="Verification"
        title="演出核定"
        desc="排程本身不會計入實績。演出結束後先「確認已完成」，再逐一確認每位 SP 的出席與實際演出時間並核定分鐘數。缺席與取消不計入；報到準備時間不計入。"
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented label="核定狀態" value={tab} onChange={setTab} options={[{ value: 'pending', label: `待處理 ${pendingCount}` }, { value: 'verified', label: '已核定' }, { value: 'all', label: '全部' }]} />
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder="搜尋教案、單位、SP" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜尋" />
        </div>
      </div>
      {list.length === 0 ? (
        <Empty title={tab === 'pending' ? '目前沒有待核定的演出' : '沒有符合的紀錄'} icon={<ClipboardCheck className="size-6" />}>只會列出今天以前（含今天）且未取消的演出。</Empty>
      ) : (
        <div className="space-y-4">
          {list.map((s) => (
            <div key={s.sessionId} ref={s.sessionId === focus ? focusRef : undefined}>
              <SessionVerifyCard s={s} highlight={s.sessionId === focus} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SessionVerifyCard({ s, highlight }: { s: Session; highlight: boolean }) {
  const { d, mutate } = useSnap();
  const toast = useToast();
  const confirm = useConfirm();
  const ui = useSessionUI();
  const [busy, setBusy] = useState('');
  const list = d.bySession.get(s.sessionId) || [];
  const verified = list.filter((a) => a.verifyStatus === 'verified').length;

  const run = async (k: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(k);
    try {
      await fn();
      toast('success', msg);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <Card className={cx('transition-shadow', highlight && 'ring-2 ring-gold')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow normal-case tracking-[0.08em]">{fmtDate(s.date)} · {s.unit}</div>
          <button className="mt-1 text-left text-[18px] font-semibold text-ink hover:text-pine" onClick={() => ui.openDetail(s.sessionId)}>{s.topic}</button>
          <div className="num mt-1 text-[13px] text-ink-2">報到 {s.checkinTime}｜預定演出 {s.startTime}–{s.endTime}（{fmtDuration(diffMinutes(s.startTime, s.endTime))}）· {s.location}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SessionBadge status={s.status} />
          {s.status === 'completed' && <Badge tone={verified === list.length ? 'ok' : 'warn'}>核定 {verified}/{list.length}</Badge>}
        </div>
      </div>

      {s.status === 'scheduled' ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[16px] bg-warn-50 px-4 py-3">
          <span className="mr-auto text-[14px] text-ink">此演出尚未確認完成。</span>
          <Button size="sm" loading={busy === 'complete'} icon={<CheckCheck className="size-3.5" />} onClick={() => run('complete', () => mutate('session.complete', { sessionId: s.sessionId, expectedVersion: s.version }), '已確認完成，請逐一核定時數')}>確認已完成</Button>
          <Button size="sm" variant="primary" loading={busy === 'all'} icon={<ShieldCheck className="size-3.5" />} onClick={async () => {
            const r = await confirm({ title: '依預定時間全數核定？', body: `將確認演出完成，並將 ${list.filter((a) => a.attendance !== 'cancelled').length} 位 SP 核定為「已出席」，各 ${fmtDuration(diffMinutes(s.startTime, s.endTime))}。如有缺席或時間不同，請改為逐一核定。`, confirmLabel: '全數核定' });
            if (r.ok) run('all', () => mutate('session.verifyAllAsScheduled', { sessionId: s.sessionId }), '已完成核定');
          }}>全員依預定時間核定</Button>
        </div>
      ) : (
        <>
          {list.some((a) => a.verifyStatus !== 'verified' && a.attendance !== 'cancelled') && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="ghost" loading={busy === 'all'} icon={<ShieldCheck className="size-3.5" />} onClick={async () => {
                const r = await confirm({ title: '未核定者依預定時間核定？', body: '尚未核定的 SP 將以「已出席」及預定演出時間核定；已核定者不受影響。', confirmLabel: '核定' });
                if (r.ok) run('all', () => mutate('session.verifyAllAsScheduled', { sessionId: s.sessionId }), '已完成核定');
              }}>其餘依預定時間核定</Button>
            </div>
          )}
          <div className="mt-3 divide-y divide-line rounded-[16px] border border-line">
            {list.map((a) => <AssignmentRow key={a.assignmentId + a.version} a={a} s={s} />)}
          </div>
        </>
      )}
    </Card>
  );
}

function AssignmentRow({ a, s }: { a: Assignment; s: Session }) {
  const { d, mutate } = useSnap();
  const toast = useToast();
  const confirm = useConfirm();
  const isVerified = a.verifyStatus === 'verified';
  const [editing, setEditing] = useState(!isVerified);
  const [att, setAtt] = useState<Attendance>(a.attendance === 'pending' ? 'present' : a.attendance);
  const [start, setStart] = useState(a.actualStart || s.startTime);
  const [end, setEnd] = useState(a.actualEnd || s.endTime);
  const auto = isValidTime(start) && isValidTime(end) ? Math.max(0, diffMinutes(start, end)) : 0;
  const [minutes, setMinutes] = useState<string>(a.approvedMinutes != null && isVerified ? String(a.approvedMinutes) : String(auto));
  const [touchedMin, setTouchedMin] = useState(false);
  const [note, setNote] = useState(a.minutesNote);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!touchedMin) setMinutes(String(auto)); }, [auto, touchedMin]);

  const submit = async () => {
    let reason = '';
    if (isVerified) {
      const r = await confirm({ title: '更正已核定紀錄', body: '更正後個人履歷與年度統計會同步更新，並保留異動歷程。', reason: { label: '更正原因', placeholder: '例：依簽到表更正結束時間' }, confirmLabel: '確認更正' });
      if (!r.ok) return;
      reason = r.reason;
    }
    setBusy(true);
    try {
      await mutate('assignment.verify', {
        assignmentId: a.assignmentId, attendance: att, actualStart: start, actualEnd: end,
        approvedMinutes: att === 'present' ? Number(minutes) : 0, minutesNote: note, expectedVersion: a.version, reason,
      });
      toast('success', `${spName(d, a)} 已${isVerified ? '更正' : '核定'}`);
      setEditing(false);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unverify = async () => {
    const r = await confirm({ title: `取消 ${spName(d, a)} 的核定？`, tone: 'warn', body: '取消後此筆時數將不計入年度成果，直到重新核定。', reason: { label: '取消核定原因' }, confirmLabel: '取消核定' });
    if (!r.ok) return;
    setBusy(true);
    try {
      await mutate('assignment.unverify', { assignmentId: a.assignmentId, reason: r.reason, expectedVersion: a.version });
      toast('success', '已取消核定');
      setEditing(true);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (a.attendance === 'cancelled' && !isVerified) {
    return <div className="flex items-center gap-2 px-4 py-3 text-[14px] text-ink-3"><b className="text-ink-2">{spName(d, a)}</b><Badge>取消</Badge>不計入時數</div>;
  }

  return (
    <motion.div layout className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="text-[15px] font-semibold text-pine hover:underline" onClick={() => navigate(`/sps/${a.spId}`)}>{spName(d, a)}</button>
        <span className="text-[13px] text-ink-2">· {topicOf(a, s)}</span>
        {isVerified ? (
          <>
            <Badge tone={ATTENDANCE[a.attendance].tone}>{ATTENDANCE[a.attendance].label}</Badge>
            {a.attendance === 'present' && <Badge tone="sage">核定 {fmtDuration(a.approvedMinutes || 0)}（{a.actualStart}–{a.actualEnd}）</Badge>}
            <span className="text-[12px] text-ink-3">{a.verifiedBy} · {a.verifiedAt.slice(0, 16).replace('T', ' ')}</span>
            {!editing && (
              <span className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>更正</Button>
                <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} disabled={busy} onClick={unverify}>取消核定</Button>
              </span>
            )}
          </>
        ) : (
          <Badge tone="warn">待核定</Badge>
        )}
      </div>
      {editing && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
          <div>
            <div className="mb-1 text-[12px] text-ink-3">出席狀態</div>
            <div className="inline-flex rounded-full bg-mist p-1" role="radiogroup" aria-label={`${spName(d, a)} 出席狀態`}>
              {(['present', 'absent', 'cancelled'] as Attendance[]).map((v) => (
                <button key={v} role="radio" aria-checked={att === v} onClick={() => setAtt(v)} className={cx('h-8 rounded-full px-3 text-[13px] font-medium transition', att === v ? (v === 'present' ? 'bg-pine text-white' : 'bg-white text-danger shadow-soft') : 'text-ink-2')}>{ATTENDANCE[v].label}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[140px_140px_110px_1fr_auto]">
            <label className="text-[12px] text-ink-3">實際開始<input type="time" disabled={att !== 'present'} className="field mt-1" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="text-[12px] text-ink-3">實際結束<input type="time" disabled={att !== 'present'} className="field mt-1" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            <label className="text-[12px] text-ink-3">核定分鐘<input type="number" min={0} max={1440} step={1} disabled={att !== 'present'} className="field num mt-1" value={att === 'present' ? minutes : '0'} onChange={(e) => { setTouchedMin(true); setMinutes(e.target.value); }} /></label>
            <label className="col-span-2 text-[12px] text-ink-3 sm:col-span-1">時數備註<input className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" /></label>
            <div className="col-span-2 flex items-end gap-1 sm:col-span-1">
              {isVerified && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>取消</Button>}
              <Button size="sm" variant="primary" loading={busy} onClick={submit} icon={<ShieldCheck className="size-3.5" />}>{isVerified ? '更正' : '核定'}</Button>
            </div>
          </div>
          {att === 'present' && <div className="text-[12px] text-ink-3 sm:col-span-2">= {(Number(minutes) / 60 || 0).toFixed(2)} 小時（以分鐘儲存，報到準備時間不計入）</div>}
        </div>
      )}
    </motion.div>
  );
}
