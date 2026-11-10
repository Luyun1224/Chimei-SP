import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ClipboardCopy, Info, MessageSquareText, RotateCcw, Save, UserCheck, UserX } from 'lucide-react';
import { addDays, fmtDate, fmtDateShort } from '../../shared/time';
import { DEFAULT_INDIVIDUAL_TEMPLATE, DEFAULT_SUMMARY_TEMPLATE, PLACEHOLDERS, SUMMARY_PLACEHOLDERS, notifyState, renderIndividual, renderSummary } from '../../shared/template';
import { useSnap, spName } from '../lib/store';
import { navigate, type Route } from '../lib/router';
import { copyText } from '../lib/csv';
import { useSessionUI } from '../features/sessions';
import { useConfirm, useToast } from '../components/overlay';
import { Badge, Button, Card, CardHead, Empty, NotifyBadge, PageHeader, Segmented, cx } from '../components/ui';

export default function Reminder({ route }: { route: Route }) {
  const { snap, d, mutate } = useSnap();
  const toast = useToast();
  const confirm = useConfirm();
  const ui = useSessionUI();
  const date = route.query.get('date') || addDays(snap.today, 1);
  const setDate = (v: string) => navigate('/reminder', { date: v });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string>('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setSelected(new Set()), [date]);

  const rows = useMemo(() => {
    const sessions = snap.sessions.filter((s) => s.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
    return sessions.flatMap((s) =>
      (d.bySession.get(s.sessionId) || [])
        .map((a) => ({ s, a, latest: d.latestNotify.get(a.assignmentId), state: notifyState(d.latestNotify.get(a.assignmentId), s, a) }))
        // 取消的場次只在「曾通知過」時列出，提醒管理員告知取消
        .filter((r) => (r.s.status !== 'cancelled' && r.a.attendance !== 'cancelled') || r.latest?.status === 'notified'),
    );
  }, [snap.sessions, d, date]);
  const activeSessions = useMemo(() => {
    const seen = new Map<string, { session: (typeof rows)[number]['s']; spNames: string[] }>();
    for (const r of rows) {
      if (r.s.status === 'cancelled' || r.a.attendance === 'cancelled') continue;
      const e = seen.get(r.s.sessionId) || { session: r.s, spNames: [] };
      e.spNames.push(spName(d, r.a));
      seen.set(r.s.sessionId, e);
    }
    return [...seen.values()];
  }, [rows, d]);

  const summary = renderSummary(snap.settings.summaryTemplate, date, activeSessions);
  const textFor = (r: (typeof rows)[number]) =>
    r.s.status === 'cancelled' || r.a.attendance === 'cancelled'
      ? `${spName(d, r.a)} 您好，原訂 ${fmtDate(r.s.date)} ${r.s.startTime} 的 SP 演出「${r.s.topic}」已取消，造成不便敬請見諒，謝謝您！`
      : renderIndividual(snap.settings.individualTemplate, r.s, spName(d, r.a), snap.today);

  const doCopy = async (key: string, text: string, label: string) => {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? '' : c)), 2000);
      toast('success', `已複製${label}，請貼到 LINE 傳送（系統不會自動標記已通知）`);
    } else toast('error', '無法存取剪貼簿，請手動選取文字複製');
  };

  const mark = async (ids: string[], status: 'notified' | 'not_notified') => {
    if (!ids.length) return;
    if (status === 'notified') {
      const r = await confirm({ title: `標記 ${ids.length} 位 SP 為「已通知」？`, body: '此標記僅代表您已透過 LINE 人工通知，系統不會發送訊息，也無法得知是否已讀或送達。', confirmLabel: '確認標記' });
      if (!r.ok) return;
    }
    setBusy(true);
    try {
      await mutate('notify.mark', { assignmentIds: ids, status });
      setSelected(new Set());
      toast('success', status === 'notified' ? `已標記 ${ids.length} 位為已通知` : `已改回尚未通知`);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pending = rows.filter((r) => r.state !== 'notified').length;
  const allIds = rows.map((r) => r.a.assignmentId);
  const toggleAll = () => setSelected(selected.size === allIds.length ? new Set() : new Set(allIds));

  return (
    <div>
      <PageHeader
        no="03"
        en="Reminder"
        title="LINE 提醒中心"
        desc="產生提醒文字 → 複製 → 由您自行貼到 LINE 傳送 → 回來手動標記已通知。系統不串接 LINE、不會自動發送任何訊息。"
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          label="提醒日期"
          value={date === snap.today ? 'today' : date === addDays(snap.today, 1) ? 'tomorrow' : date === addDays(snap.today, 2) ? 'after' : 'custom'}
          onChange={(v) => v !== 'custom' && setDate(v === 'today' ? snap.today : v === 'tomorrow' ? addDays(snap.today, 1) : addDays(snap.today, 2))}
          options={[{ value: 'today', label: '今日' }, { value: 'tomorrow', label: '明日' }, { value: 'after', label: '後天' }, { value: 'custom', label: '自訂' }]}
        />
        <input type="date" className="field w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="選擇日期" />
        <span className="text-[14px] text-ink-2"><b className="text-ink">{fmtDate(date)}</b> · {activeSessions.length} 場 · <span className={cx(pending ? 'text-gold-600' : 'text-ok')}>{pending} 位尚未通知或需確認</span></span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <Card className="!p-0 overflow-hidden self-start">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" className="size-4 accent-[#284A45]" checked={!!allIds.length && selected.size === allIds.length} onChange={toggleAll} disabled={!allIds.length} />
              全選
            </label>
            <span className="text-[13px] text-ink-3">已選 {selected.size}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" icon={<ClipboardCopy className="size-3.5" />} disabled={!selected.size} onClick={() => doCopy('multi', rows.filter((r) => selected.has(r.a.assignmentId)).map(textFor).join('\n\n———\n\n'), `${selected.size} 則個別通知`)}>複製選取文字</Button>
              <Button size="sm" variant="primary" icon={<UserCheck className="size-3.5" />} loading={busy} disabled={!selected.size} onClick={() => mark([...selected], 'notified')}>標記已通知</Button>
              <Button size="sm" variant="ghost" icon={<UserX className="size-3.5" />} disabled={!selected.size || busy} onClick={() => mark([...selected], 'not_notified')}>改回未通知</Button>
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="p-5"><Empty title={`${fmtDateShort(date)} 沒有需要提醒的 SP`} icon={<MessageSquareText className="size-6" />}>可切換日期，或至演出排程新增。</Empty></div>
          ) : (
            <ul className="divide-y divide-line">
              <AnimatePresence initial={false}>
                {rows.map((r) => {
                  const sel = selected.has(r.a.assignmentId);
                  const cancelled = r.s.status === 'cancelled' || r.a.attendance === 'cancelled';
                  return (
                    <motion.li key={r.a.assignmentId} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cx('grid grid-cols-[auto_1fr] gap-3 px-4 py-3 transition-colors sm:grid-cols-[auto_1fr_auto]', sel && 'bg-pine-50/60')}>
                      <input type="checkbox" className="mt-1 size-4 accent-[#284A45]" checked={sel} aria-label={`選取 ${spName(d, r.a)}`} onChange={() => { const n = new Set(selected); if (sel) n.delete(r.a.assignmentId); else n.add(r.a.assignmentId); setSelected(n); }} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <b className="text-[15px]">{spName(d, r.a)}</b>
                          {cancelled && <Badge tone="danger">場次已取消，請通知取消</Badge>}
                          <NotifyBadge state={r.state} />
                        </div>
                        <button className="mt-0.5 block text-left text-[13px] text-ink-2 hover:text-pine" onClick={() => ui.openDetail(r.s.sessionId)}>
                          <span className="num">報到 {r.s.checkinTime}｜演出 {r.s.startTime}–{r.s.endTime}</span> · {r.s.topic} · {r.s.location}
                        </button>
                        {r.latest && (
                          <div className="mt-0.5 text-[12px] text-ink-3">
                            最後標記：{r.latest.status === 'notified' ? '已通知' : '未通知'} · {r.latest.markedBy} · {r.latest.markedAt.slice(0, 16).replace('T', ' ')}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:justify-end">
                        <Button size="sm" icon={copied === r.a.assignmentId ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} onClick={() => doCopy(r.a.assignmentId, textFor(r), `${spName(d, r.a)} 的通知`)}>
                          {copied === r.a.assignmentId ? '已複製' : '複製通知'}
                        </Button>
                        {r.state === 'notified' ? (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => mark([r.a.assignmentId], 'not_notified')}>改回未通知</Button>
                        ) : (
                          <Button size="sm" variant="primary" disabled={busy} onClick={() => mark([r.a.assignmentId], 'notified')}>{r.state === 'needs_renotify' ? '已重新通知' : '標記已通知'}</Button>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
          <p className="flex items-start gap-1.5 border-t border-line bg-mist/40 px-4 py-2.5 text-[12px] text-ink-3">
            <Info className="mt-0.5 size-3.5 shrink-0" />「已通知」僅代表管理員人工確認已透過 LINE 聯繫，不代表已送達、已讀或已回覆。排程異動後會顯示「排程已異動，請確認」。
          </p>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHead eyebrow="Daily digest" title="當日排程總整理" action={<Button size="sm" variant="gold" icon={copied === 'summary' ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} disabled={!activeSessions.length} onClick={() => doCopy('summary', summary, '當日總整理')}>{copied === 'summary' ? '已複製' : '複製'}</Button>} />
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-[14px] bg-cream p-3 text-[13px] leading-relaxed text-ink">{activeSessions.length ? summary : '此日期沒有排程'}</pre>
          </Card>
          <TemplateEditor sample={rows.find((r) => r.s.status !== 'cancelled')} />
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({ sample }: { sample?: { s: import('../../shared/types').Session; a: import('../../shared/types').Assignment } }) {
  const { snap, d, mutate } = useSnap();
  const toast = useToast();
  const [tab, setTab] = useState<'individual' | 'summary'>('individual');
  const [ind, setInd] = useState(snap.settings.individualTemplate);
  const [sum, setSum] = useState(snap.settings.summaryTemplate);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setInd(snap.settings.individualTemplate); setSum(snap.settings.summaryTemplate); }, [snap.settings]);
  const dirty = ind !== snap.settings.individualTemplate || sum !== snap.settings.summaryTemplate;
  const value = tab === 'individual' ? ind : sum;
  const setValue = tab === 'individual' ? setInd : setSum;
  const demoSession = sample?.s || { sessionId: 'X', date: addDays(snap.today, 1), unit: '醫學系 UGY', topic: '胸痛病史詢問', checkinTime: '08:00', startTime: '08:30', endTime: '11:30', location: '技能中心 3F 第二考場', note: '' } as import('../../shared/types').Session;
  const preview = tab === 'individual'
    ? renderIndividual(ind, demoSession, sample ? spName(d, sample.a) : '王小明', snap.today)
    : renderSummary(sum, demoSession.date, [{ session: demoSession, spNames: ['王小明', '李美華'] }]);

  const save = async () => {
    setSaving(true);
    try {
      await mutate('settings.save', { patch: { individualTemplate: ind, summaryTemplate: sum } });
      toast('success', '通知範本已儲存');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHead eyebrow="Template" title="通知範本" action={<Segmented label="範本類型" value={tab} onChange={setTab} options={[{ value: 'individual', label: '個別' }, { value: 'summary', label: '總整理' }]} />} />
      <div className="mb-2 flex flex-wrap gap-1">
        {(tab === 'individual' ? PLACEHOLDERS : SUMMARY_PLACEHOLDERS).map((p) => (
          <button key={p} type="button" className="rounded-full border border-line px-2 py-0.5 text-[12px] text-ink-2 hover:border-pine hover:text-pine" onClick={() => setValue(value + p)}>{p}</button>
        ))}
      </div>
      <textarea className="field min-h-48 font-mono text-[13px]" value={value} onChange={(e) => setValue(e.target.value)} aria-label="範本內容" />
      <div className="mt-3 text-[12px] font-medium text-ink-3">預覽</div>
      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-[14px] bg-cream p-3 text-[13px] leading-relaxed">{preview}</pre>
      <div className="mt-3 flex justify-between gap-2">
        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setValue(tab === 'individual' ? DEFAULT_INDIVIDUAL_TEMPLATE : DEFAULT_SUMMARY_TEMPLATE)}>還原預設</Button>
        <Button size="sm" variant="primary" icon={<Save className="size-3.5" />} loading={saving} disabled={!dirty} onClick={save}>儲存範本</Button>
      </div>
    </Card>
  );
}
