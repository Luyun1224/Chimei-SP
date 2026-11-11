import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CalendarCheck2, CalendarPlus, CheckCheck, Copy, Clock, History, MapPin, Pencil, Plus, RefreshCw, Trash2, Users, X, XCircle } from 'lucide-react';
import type { Assignment, AuditEntry, Session, SessionInput, Warning } from '../../shared/types';
import { AppError, validateSessionInput } from '../../shared/validate';
import { addDays, diffMinutes, fmtDate, fmtDateShort, fmtDuration, toMinutes } from '../../shared/time';
import { notifyState } from '../../shared/template';
import { topicOf } from '../../shared/stats';
import { feeLine, feeRule, fmtMoney, type FeeLine } from '../../shared/fee';
import { API_VERSION } from '../../shared/version';
import { useCanEdit, useData, spName } from '../lib/store';
import { ApiCallError, call, newRequestId } from '../lib/api';
import { navigate } from '../lib/router';
import { Drawer, Modal, useConfirm, useToast } from '../components/overlay';
import { ATTENDANCE, Badge, Button, Field, IconButton, NotifyBadge, SessionBadge, SyncBadge, cx } from '../components/ui';
import { Combo, SpPicker, isNewSp, NEW_SP_PREFIX } from '../components/pickers';

/** 新增排程的預填：date 預設日期；copyFrom 從既有排程複製時間、地點、教案與 SP */
export interface NewPrefill { date?: string; copyFrom?: string }
type View = { kind: 'new'; prefill?: NewPrefill } | { kind: 'edit'; id: string } | { kind: 'detail'; id: string } | null;

const Ctx = createContext<{ openNew: (p?: NewPrefill) => void; openDetail: (id: string) => void; openEdit: (id: string) => void }>({
  openNew: () => {},
  openDetail: () => {},
  openEdit: () => {},
});
export const useSessionUI = () => useContext(Ctx);

export function SessionUIProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>(null);
  const close = useCallback(() => setView(null), []);
  const canEdit = useCanEdit();
  const api = useMemo(
    () => ({
      // 公開檢視為唯讀：不開啟新增／編輯表單
      openNew: (prefill?: NewPrefill) => { if (canEdit) setView({ kind: 'new', prefill }); },
      openDetail: (id: string) => setView({ kind: 'detail', id }),
      openEdit: (id: string) => { if (canEdit) setView({ kind: 'edit', id }); },
    }),
    [canEdit],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      <SessionFormDrawer view={view?.kind === 'new' || view?.kind === 'edit' ? view : null} onClose={close} onSaved={(id) => setView({ kind: 'detail', id })} />
      <SessionDetailDrawer id={view?.kind === 'detail' ? view.id : null} onClose={close} onEdit={(id) => setView({ kind: 'edit', id })} onCopy={(id) => setView({ kind: 'new', prefill: { copyFrom: id } })} />
    </Ctx.Provider>
  );
}

// ======================= 表單 =======================
interface CaseRow { key: string; topic: string; sps: string[] }
interface FormState { date: string; extraDates: string[]; unit: string; checkinTime: string; startTime: string; endTime: string; location: string; note: string; cases: CaseRow[] }
let caseSeq = 0;
const newCase = (topic = '', sps: string[] = []): CaseRow => ({ key: `c${++caseSeq}`, topic, sps });
const blank = (date?: string): FormState => ({ date: date || '', extraDates: [], unit: '', checkinTime: '08:00', startTime: '08:30', endTime: '12:00', location: '', note: '', cases: [newCase()] });

function SessionFormDrawer({ view, onClose, onSaved }: { view: { kind: 'new'; prefill?: NewPrefill } | { kind: 'edit'; id: string } | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { snap, d, mutate } = useData();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(blank());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<Warning[] | null>(null);
  const reqId = useRef('');
  const editing = view?.kind === 'edit' ? d.sessionMap.get(view.id) : undefined;

  useEffect(() => {
    if (!view) return;
    reqId.current = newRequestId(); // 每次開啟表單一個新的請求 ID，重送時沿用 → 後端冪等
    setErrors({});
    setWarnings(null);
    const fromSession = (src: Session, date: string): FormState => {
      // 依教案分組既有 SP
      const groups = new Map<string, string[]>();
      for (const a of d.bySession.get(src.sessionId) || []) {
        if (a.attendance === 'cancelled' && src.status !== 'cancelled') continue;
        const t = topicOf(a, src);
        groups.set(t, [...(groups.get(t) || []), a.spId]);
      }
      const cases = [...groups.entries()].map(([t, ids]) => newCase(t, ids));
      return { date, extraDates: [], unit: src.unit, checkinTime: src.checkinTime, startTime: src.startTime, endTime: src.endTime, location: src.location, note: src.note, cases: cases.length ? cases : [newCase(src.topic)] };
    };
    const copySrc = view.kind === 'new' && view.prefill?.copyFrom ? d.sessionMap.get(view.prefill.copyFrom) : undefined;
    if (view.kind === 'edit' && editing) {
      setForm(fromSession(editing, editing.date));
    } else if (copySrc) {
      setForm(fromSession(copySrc, view.kind === 'new' && view.prefill?.date ? view.prefill.date : addDays(copySrc.date, 7)));
    } else if (view.kind === 'new') {
      setForm({ ...blank(view.prefill?.date || (snap?.today ? addDays(snap.today, 1) : '')) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  const setCase = (i: number, patch: Partial<CaseRow>) => {
    setForm((f) => ({ ...f, cases: f.cases.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
    setErrors((e) => ({ ...e, [`case${i}.topic`]: '', [`case${i}.sps`]: '', topic: '', spIds: '' }));
  };
  const addCase = () => setForm((f) => ({ ...f, cases: [...f.cases, newCase()] }));
  const removeCase = (i: number) => setForm((f) => ({ ...f, cases: f.cases.filter((_, j) => j !== i) }));

  /** 即時衝突提示（後端仍會再次檢查） */
  const busy = useMemo(() => {
    const m = new Map<string, string>();
    if (!snap || !form.date || !/^\d\d:\d\d$/.test(form.checkinTime) || !/^\d\d:\d\d$/.test(form.endTime)) return m;
    const s1 = toMinutes(form.checkinTime), e1 = toMinutes(form.endTime);
    for (const s of snap.sessions) {
      if (s.sessionId === editing?.sessionId || s.status === 'cancelled' || s.date !== form.date) continue;
      if (!(s1 < toMinutes(s.endTime) && toMinutes(s.checkinTime) < e1)) continue;
      for (const a of d.bySession.get(s.sessionId) || []) if (a.attendance !== 'cancelled') m.set(a.spId, `${s.checkinTime}–${s.endTime} 已排「${topicOf(a, s)}」`);
    }
    return m;
  }, [snap, d, form.date, form.checkinTime, form.endTime, editing]);

  const minutes = /^\d\d:\d\d$/.test(form.startTime) && /^\d\d:\d\d$/.test(form.endTime) ? diffMinutes(form.startTime, form.endTime) : 0;
  const personTimes = form.cases.reduce((n, c) => n + c.sps.length, 0);

  /** 表單 → API：'new:姓名' 轉為 newSpNames */
  const payload = (): SessionInput => ({
    date: form.date, unit: form.unit, checkinTime: form.checkinTime, startTime: form.startTime, endTime: form.endTime, location: form.location, note: form.note,
    cases: form.cases.map((c) => ({
      topic: c.topic,
      spIds: c.sps.filter((x) => !isNewSp(x)),
      newSpNames: c.sps.filter(isNewSp).map((x) => x.slice(NEW_SP_PREFIX.length)),
    })),
  });

  /** 存檔後在背景逐筆同步日曆，按鈕不必等待 Google 日曆回應 */
  async function syncInBackground(ids: string[]) {
    let failed = 0;
    for (const sid of ids) {
      try {
        const r = await mutate('session.resync', { sessionId: sid });
        if (r.sessions?.[0].syncStatus === 'failed') failed++;
      } catch {
        failed++;
      }
    }
    if (failed) toast('error', `${failed} 筆排程排入日曆失敗，可在排程詳情按「排入 Google 日曆」重試`);
    else toast('success', ids.length > 1 ? `${ids.length} 筆排程已排入 Google 日曆` : '已排入 Google 日曆');
  }

  async function submit(confirm = false) {
    try {
      validateSessionInput(payload());
    } catch (e) {
      if (e instanceof AppError) setErrors(((e.details as { fields: Record<string, string> })?.fields) || {});
      return;
    }
    if (snap?.mode === 'gas' && (snap.apiVersion || 0) < API_VERSION) {
      toast('error', '後端 Code.gs 版本較舊，無法儲存多教案排程。請更新 Code.gs 並部署「新版本」後再試');
      return;
    }
    setSaving(true);
    try {
      const r = await mutate('session.save', {
        sessionId: editing?.sessionId,
        input: payload(),
        expectedVersion: editing?.version,
        requestId: reqId.current,
        confirm,
        extraDates: editing ? undefined : form.extraDates,
        deferSync: true,
      });
      const list = r.sessions || [];
      const s = list[0];
      setWarnings(null);
      const what = editing ? '已更新排程' : list.length > 1 ? `已新增 ${list.length} 個日期的排程` : '已新增排程';
      const pending = list.filter((x) => x.syncStatus === 'pending');
      if (pending.length) toast('success', `${what}，正在背景排入 Google 日曆…`);
      else if (s.syncStatus === 'disabled') toast('info', `${what}。尚未設定 Google 日曆，請到「系統設定」啟用後即可排入日曆`);
      else toast('success', what);
      onSaved(s.sessionId);
      if (pending.length) void syncInBackground(pending.map((x) => x.sessionId));
        } catch (e) {
      if (e instanceof ApiCallError && e.code === 'NEEDS_CONFIRMATION') {
        setWarnings(((e.error.details as { warnings: Warning[] })?.warnings) || []);
      } else if (e instanceof ApiCallError && e.code === 'VALIDATION') {
        setErrors(((e.error.details as { fields?: Record<string, string> })?.fields) || {});
        toast('error', e.message);
      } else {
        toast('error', (e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!snap) return null;
  const st = snap.settings;
  return (
    <>
      <Drawer
        open={!!view}
        onClose={onClose}
        eyebrow={editing ? `編輯排程 · ${editing.sessionId}` : 'New Performance'}
        title={editing ? '修改演出排程' : '新增演出排程'}
        width={640}
        footer={
          <>
            <span className="mr-auto text-[12px] text-ink-3">{minutes > 0 && `預定演出 ${fmtDuration(minutes)} · ${form.cases.length} 個教案 · ${personTimes} 人次`}</span>
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" loading={saving} onClick={() => submit(false)} icon={<CalendarCheck2 className="size-4" />}>
              {!editing && form.extraDates.length ? `儲存 ${form.extraDates.length + 1} 個日期` : st.calendarId ? '儲存並排入日曆' : '儲存'}
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
          <Field label="演出日期" required error={errors.date} className="col-span-2 sm:col-span-1">
            <input data-autofocus type="date" className={cx('field', errors.date && 'field-error')} value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="演出地點" required error={errors.location} className="col-span-2 sm:col-span-1">
            <Combo ariaLabel="演出地點" value={form.location} onChange={(v) => set('location', v)} options={st.locations} placeholder="例：技能中心 3F 第二考場" invalid={!!errors.location} quick={3} />
          </Field>
          {!editing && <ExtraDates form={form} setForm={setForm} error={errors.extraDates} />}
          <Field label="申請單位" required error={errors.unit} className="col-span-2">
            <Combo ariaLabel="申請單位" value={form.unit} onChange={(v) => set('unit', v)} options={st.units} placeholder="例：醫學系 UGY" invalid={!!errors.unit} />
          </Field>
          <div className="col-span-2 grid grid-cols-3 gap-3 rounded-[16px] bg-mist/60 p-3">
            <Field label="報到時間" required error={errors.checkinTime}>
              <input type="time" className={cx('field', errors.checkinTime && 'field-error')} value={form.checkinTime} onChange={(e) => set('checkinTime', e.target.value)} />
            </Field>
            <Field label="演出開始" required error={errors.startTime}>
              <input type="time" className={cx('field', errors.startTime && 'field-error')} value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </Field>
            <Field label="演出結束" required error={errors.endTime}>
              <input type="time" className={cx('field', errors.endTime && 'field-error')} value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </Field>
            <p className="col-span-3 text-[12px] text-ink-3">報到時間與演出時間分開記錄；報到後準備時間不計入核定演出時數。</p>
          </div>

          <section className="col-span-2">
            <div className="mb-2 flex items-end justify-between">
              <div>
                <div className="text-[13px] font-medium text-ink-2">教案與 SP<span className="ml-0.5 text-gold-600">*</span></div>
                <div className="text-[12px] text-ink-3">同一場次可有多個教案，每個教案各自安排 SP；姓名可直接輸入新增</div>
              </div>
            </div>
            <ol className="space-y-3">
              {form.cases.map((c, i) => (
                <motion.li key={c.key} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-[16px] border border-line bg-white p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-pine text-[12px] font-semibold text-white">{i + 1}</span>
                    <div className="flex-1">
                      <Combo ariaLabel={`第 ${i + 1} 個教案主題`} value={c.topic} onChange={(v) => setCase(i, { topic: v })} options={st.topics} placeholder="教案主題，例：胸痛病史詢問" invalid={!!errors[`case${i}.topic`]} quick={i === 0 ? 4 : 0} />
                    </div>
                    {form.cases.length > 1 && (
                      <IconButton label={`移除第 ${i + 1} 個教案`} onClick={() => removeCase(i)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    )}
                  </div>
                  {errors[`case${i}.topic`] && <p className="mb-1 text-[12px] text-danger">{errors[`case${i}.topic`]}</p>}
                  <SpPicker sps={snap.sps} value={c.sps} onChange={(v) => setCase(i, { sps: v })} busy={busy} invalid={!!errors[`case${i}.sps`]} />
                  {errors[`case${i}.sps`] && <p className="mt-1 text-[12px] text-danger">{errors[`case${i}.sps`]}</p>}
                </motion.li>
              ))}
            </ol>
            <Button type="button" size="sm" variant="ghost" className="mt-2" icon={<Plus className="size-4" />} onClick={addCase}>
              新增教案
            </Button>
            {busy.size > 0 && <p className="mt-1 text-[12px] text-warn">⚠ 名單中標示的 SP 在此時段已有其他排程</p>}
          </section>

          <Field label="備註" className="col-span-2">
            <textarea className="field min-h-20" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="選填：服裝、考站資訊、聯絡事項…" />
          </Field>
          <button type="submit" hidden />
        </form>
      </Drawer>

      <Modal
        open={!!warnings}
        onClose={() => setWarnings(null)}
        tone="warn"
        title="請確認以下提醒"
        footer={
          <>
            <Button onClick={() => setWarnings(null)}>返回修改</Button>
            <Button variant="primary" loading={saving} onClick={() => submit(true)}>
              仍要儲存
            </Button>
          </>
        }
      >
        <ul className="space-y-2">
          {warnings?.map((w, i) => (
            <li key={i} className="flex gap-2 rounded-[12px] bg-warn-50 px-3 py-2 text-[14px] text-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
              <span>
                <b className="mr-1">{{ conflict: '時段衝突', duplicate: '可能重複', sp_inactive: 'SP 狀態' }[w.type]}</b>
                {w.message}
              </span>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

// ======================= 詳情 =======================
function SessionDetailDrawer({ id, onClose, onEdit, onCopy }: { id: string | null; onClose: () => void; onEdit: (id: string) => void; onCopy: (id: string) => void }) {
  const { snap, d, mutate } = useData();
  const canEdit = useCanEdit();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState('');
  const [history, setHistory] = useState<AuditEntry[] | null>(null);
  const s = id ? d.sessionMap.get(id) : undefined;
  useEffect(() => setHistory(null), [id]);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast('success', ok);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (!snap) return null;
  const list = s ? d.bySession.get(s.sessionId) || [] : [];
  const canComplete = s && s.status === 'scheduled' && s.date <= snap.today;

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      eyebrow={s ? `${fmtDate(s.date)} · ${s.unit}` : ''}
      title={s?.topic || '排程不存在'}
      footer={
        s && s.status !== 'cancelled' && canEdit ? (
          <>
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              icon={<Trash2 className="size-4" />}
              loading={busy === 'delete'}
              onClick={async () => {
                const r = await confirm({ title: '刪除這筆排程？', tone: 'danger', confirmLabel: '刪除', body: '僅用於誤建或重複登錄。資料會軟刪除並保留稽核歷程，同時移除 Google 日曆事件。', reason: { label: '刪除原因', placeholder: '例：重複登錄' } });
                if (r.ok) run('delete', async () => { await mutate('session.delete', { sessionId: s.sessionId, reason: r.reason, expectedVersion: s.version }); onClose(); }, '已刪除排程');
              }}
            >
              刪除
            </Button>
            {s.status === 'scheduled' && (
              <Button
                icon={<XCircle className="size-4" />}
                loading={busy === 'cancel'}
                onClick={async () => {
                  const r = await confirm({ title: '取消這場演出？', tone: 'warn', confirmLabel: '確認取消', body: '系統會保留取消紀錄，並從 Google 日曆移除事件。已通知的 SP 會出現「需重新通知」提示。', reason: { label: '取消原因' } });
                  if (r.ok) run('cancel', () => mutate('session.cancel', { sessionId: s.sessionId, reason: r.reason, expectedVersion: s.version }), '已取消排程');
                }}
              >
                取消演出
              </Button>
            )}
            {canComplete && (
              <Button icon={<CheckCheck className="size-4" />} loading={busy === 'complete'} onClick={() => run('complete', () => mutate('session.complete', { sessionId: s.sessionId, expectedVersion: s.version }), '已標記完成，請至「演出核定」確認時數')}>
                標記已完成
              </Button>
            )}
            <Button icon={<Copy className="size-4" />} onClick={() => onCopy(s.sessionId)} title="相同時間、地點、教案與 SP，排到其他日期">
              複製到其他日期
            </Button>
            <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => onEdit(s.sessionId)}>
              編輯
            </Button>
          </>
        ) : undefined
      }
    >
      {!s ? (
        <p className="text-ink-3">此排程可能已被刪除。</p>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <SessionBadge status={s.status} />
          </div>
          {canEdit && <CalendarPanel s={s} busy={busy === 'sync'} onSync={() => run('sync', async () => {
            const r = await mutate('session.resync', { sessionId: s.sessionId });
            const st = r.sessions?.[0].syncStatus;
            if (st === 'disabled') throw new Error('尚未設定 Google 日曆，請到「系統設定」啟用');
            if (st !== 'synced' && st !== 'removed') throw new Error('仍無法同步：' + (r.sessions?.[0].syncError || ''));
          }, '已排入 Google 日曆')} onSettings={() => { onClose(); navigate('/settings'); }} calendarConfigured={!!snap.settings.calendarId} />}
          {s.status === 'cancelled' && <p className="rounded-[12px] bg-mist px-3 py-2 text-[13px] text-ink-2">取消原因：{s.cancelReason}</p>}

          <dl className="grid grid-cols-2 gap-3">
            <Info icon={<Clock className="size-4" />} label="報到時間" value={s.checkinTime} />
            <Info icon={<Clock className="size-4" />} label="演出時間" value={`${s.startTime}–${s.endTime}（${fmtDuration(diffMinutes(s.startTime, s.endTime))}）`} />
            <Info icon={<MapPin className="size-4" />} label="演出地點" value={s.location} className="col-span-2" />
            {s.note && <Info label="備註" value={s.note} className="col-span-2" />}
          </dl>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-ink"><Users className="size-4 text-pine" />SP 人員（{list.length}）</h3>
            <div className="space-y-3">
              {groupByTopic(list, s).map(([topic, items]) => (
                <div key={topic} className="overflow-hidden rounded-[16px] border border-line bg-white">
                  <div className="flex items-center justify-between bg-mist/60 px-4 py-2 text-[13px]"><b className="text-ink">{topic}</b><span className="text-ink-3">{items.length} 位</span></div>
                  <ul className="divide-y divide-line">
                    {items.map((a) => (
                      <li key={a.assignmentId} className="flex flex-wrap items-center gap-2 px-4 py-3">
                        <button className="font-medium text-pine underline-offset-2 hover:underline" onClick={() => { onClose(); navigate(`/sps/${a.spId}`); }}>
                          {spName(d, a)}
                        </button>
                        <Badge tone={ATTENDANCE[a.attendance].tone}>{ATTENDANCE[a.attendance].label}</Badge>
                        {a.verifyStatus === 'verified' ? <Badge tone="sage">已核定 {fmtDuration(a.approvedMinutes || 0)}</Badge> : s.status === 'completed' && <Badge tone="warn">待核定</Badge>}
                        {canEdit && (() => {
                          const f = feeLine(a, s, '', feeRule(snap.settings));
                          return f ? <span className="num text-[13px] text-ink-2">演出費 <b className="text-ink">{fmtMoney(f.fee)}</b> 元{f.basis === 'estimated' && <span className="text-[11px] text-warn">（預估）</span>}</span> : null;
                        })()}
                        <span className="ml-auto"><NotifyBadge state={notifyState(d.latestNotify.get(a.assignmentId), s, a)} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {canEdit && (() => {
              const fees = list.map((a) => feeLine(a, s, '', feeRule(snap.settings))).filter(Boolean) as FeeLine[];
              if (!fees.length) return null;
              const total = fees.reduce((n, f) => n + f.fee, 0);
              const est = fees.some((f) => f.basis === 'estimated');
              return (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[14px] bg-gold-50 px-4 py-3 text-[14px] ring-1 ring-gold/40">
                  <span className="text-ink-2">本場演出費合計</span>
                  <b className="num text-[18px] text-ink">{fmtMoney(total)}</b> 元
                  {est && <span className="text-[12px] text-warn">（含預估，核定後依實際時數）</span>}
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { onClose(); navigate('/fees'); }}>查看費用明細 →</Button>
                </div>
              );
            })()}
            {s.status === 'completed' && canEdit && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => { onClose(); navigate('/verify', { session: s.sessionId }); }}>
                前往核定時數 →
              </Button>
            )}
          </section>

          {canEdit && (
          <section>
            <button
              className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-pine"
              onClick={async () => {
                if (history) return setHistory(null);
                try {
                  setHistory(await call('audit.list', { entityId: s.sessionId, limit: 100 }));
                } catch (e) {
                  toast('error', (e as Error).message);
                }
              }}
            >
              <History className="size-4" />
              {history ? '收合異動歷程' : '查看異動歷程'}
            </button>
            {history && <AuditList items={history} />}
          </section>
          )}
          <p className="text-[11px] text-ink-3">
            排程 ID：{s.sessionId} · 建立 {s.createdBy} {s.createdAt.slice(0, 16).replace('T', ' ')} · 最後修改 {s.updatedBy} {s.updatedAt.slice(0, 16).replace('T', ' ')}
          </p>
        </motion.div>
      )}
    </Drawer>
  );
}

function Info({ icon, label, value, className }: { icon?: ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={cx('rounded-[14px] bg-white px-4 py-3 ring-1 ring-line', className)}>
      <dt className="flex items-center gap-1 text-[12px] text-ink-3">{icon}{label}</dt>
      <dd className="mt-0.5 text-[15px] font-medium text-ink">{value}</dd>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  create: '建立', update: '修改', cancel: '取消', soft_delete: '刪除', complete: '標記完成', verify: '核定', correct: '更正核定', unverify: '取消核定',
  calendar_sync_failed: '日曆同步失敗', 'mark:notified': '標記已通知', 'mark:not_notified': '標記未通知',
};

export function AuditList({ items }: { items: AuditEntry[] }) {
  if (!items.length) return <p className="mt-2 text-[13px] text-ink-3">尚無歷程</p>;
  return (
    <ol className="mt-3 space-y-2 border-l border-line pl-4">
      {items.map((a) => (
        <li key={a.auditId} className="relative text-[13px]">
          <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-sage" />
          <div className="text-ink"><b>{ACTION_LABEL[a.action] || a.action}</b> · {a.actor}</div>
          <div className="text-ink-3">{a.at.slice(0, 16).replace('T', ' ')}{a.note && ` · ${a.note}`}</div>
        </li>
      ))}
    </ol>
  );
}

/** 新增時「也排在這些日期」：相同時間、地點、教案與 SP，一次建立多個日期 */
function ExtraDates({ form, setForm, error }: { form: FormState; setForm: (f: (x: FormState) => FormState) => void; error?: string }) {
  const [pick, setPick] = useState('');
  const all = [form.date, ...form.extraDates].filter(Boolean).sort();
  const add = (d: string) => {
    if (!d || d === form.date || form.extraDates.includes(d)) return;
    setForm((f) => ({ ...f, extraDates: [...f.extraDates, d].sort() }));
  };
  const last = all[all.length - 1];
  return (
    <div className="col-span-2 rounded-[16px] border border-dashed border-line bg-white/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-ink-2">也排在這些日期</span>
        <span className="text-[12px] text-ink-3">（相同時間、地點、教案與 SP，只有日期不同）</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {form.date && <span className="inline-flex items-center rounded-full bg-pine px-2.5 py-0.5 text-[13px] text-white">{fmtDateShort(form.date)}</span>}
        {form.extraDates.map((d) => (
          <span key={d} className="inline-flex items-center gap-1 rounded-full bg-sage-200 py-0.5 pl-2.5 pr-1 text-[13px] text-pine">
            {fmtDateShort(d)}
            <button type="button" aria-label={`移除 ${d}`} className="rounded-full p-0.5 hover:bg-black/10" onClick={() => setForm((f) => ({ ...f, extraDates: f.extraDates.filter((x) => x !== d) }))}><X className="size-3" /></button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input type="date" className="field !w-auto !py-1.5" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="加入其他日期" />
        <Button type="button" size="sm" onClick={() => { add(pick); setPick(''); }} disabled={!pick}>加入日期</Button>
        {last && (
          <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => add(addDays(last, 7))}>
            下週同一天（{fmtDateShort(addDays(last, 7))}）
          </Button>
        )}
      </div>
      {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
    </div>
  );
}

export function groupByTopic(list: Assignment[], s: Session): [string, Assignment[]][] {
  const m = new Map<string, Assignment[]>();
  for (const a of list) {
    const t = topicOf(a, s);
    m.set(t, [...(m.get(t) || []), a]);
  }
  return [...m.entries()];
}

/** 個人 Google 日曆「新增活動」連結（不需任何設定；開啟後由使用者自行儲存） */
export function personalCalendarLink(s: Session, cases: [string, string[]][]): string {
  const d = s.date.replace(/-/g, '');
  const t = (x: string) => x.replace(':', '') + '00';
  const details = [
    `報到時間：${s.checkinTime}`, `演出時間：${s.startTime}–${s.endTime}`, `申請單位：${s.unit}`,
    ...cases.map(([topic, names]) => `${topic}：${names.join('、')}`), s.note ? `備註：${s.note}` : '',
  ].filter(Boolean).join('\n');
  const q = new URLSearchParams({ action: 'TEMPLATE', text: `【SP演出】${s.topic}｜${s.unit}`, dates: `${d}T${t(s.startTime)}/${d}T${t(s.endTime)}`, ctz: 'Asia/Taipei', details, location: s.location });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

function CalendarPanel({ s, busy, onSync, onSettings, calendarConfigured }: { s: Session; busy: boolean; onSync: () => void; onSettings: () => void; calendarConfigured: boolean }) {
  const { d } = useData();
  const cases = groupByTopic((d.bySession.get(s.sessionId) || []).filter((a) => a.attendance !== 'cancelled'), s).map(([t, l]) => [t, l.map((a) => spName(d, a))] as [string, string[]]);
  const cancelled = s.status === 'cancelled';
  return (
    <section className="rounded-[16px] border border-line bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CalendarCheck2 className="size-4 text-pine" />
        <b className="text-[14px]">Google 日曆</b>
        <SyncBadge status={s.syncStatus} error={s.syncError} />
      </div>
      {!calendarConfigured ? (
        <p className="mb-3 text-[13px] text-ink-2">尚未設定系統日曆，所以還沒自動排入。到「系統設定」選擇「使用我的 Google 日曆」或填入共用日曆 ID 後，按下方按鈕即可排入。</p>
      ) : s.syncStatus === 'synced' ? (
        <p className="mb-3 text-[13px] text-ink-2">已排入系統日曆{s.syncedAt && `（${s.syncedAt.slice(0, 16).replace('T', ' ')}）`}；修改排程會自動更新同一個事件。</p>
      ) : s.syncStatus === 'failed' ? (
        <p className="mb-3 rounded-[10px] bg-danger-50 px-3 py-2 text-[13px] text-danger">同步失敗：{s.syncError}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!cancelled && (calendarConfigured ? (
          <Button size="sm" variant={s.syncStatus === 'synced' ? 'secondary' : 'primary'} loading={busy} icon={<RefreshCw className="size-3.5" />} onClick={onSync}>
            {s.syncStatus === 'synced' ? '重新同步' : '排入 Google 日曆'}
          </Button>
        ) : (
          <Button size="sm" variant="primary" icon={<CalendarCheck2 className="size-3.5" />} onClick={onSettings}>前往設定日曆</Button>
        ))}
        {!cancelled && (
          <a href={personalCalendarLink(s, cases)} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[13px] font-medium text-ink hover:border-pine/40">
            <CalendarPlus className="size-3.5" />加入我的 Google 日曆
          </a>
        )}
      </div>
    </section>
  );
}

export function sessionLabel(s: Session) {
  return `${s.startTime}–${s.endTime} ${s.topic}`;
}
