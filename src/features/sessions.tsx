import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CalendarCheck2, CheckCheck, Clock, History, MapPin, Pencil, RefreshCw, Trash2, Users, XCircle } from 'lucide-react';
import type { AuditEntry, Session, SessionInput, Warning } from '../../shared/types';
import { AppError, validateSessionInput } from '../../shared/validate';
import { addDays, diffMinutes, fmtDate, fmtDuration, toMinutes } from '../../shared/time';
import { notifyState } from '../../shared/template';
import { useData, spName } from '../lib/store';
import { ApiCallError, call, newRequestId } from '../lib/api';
import { navigate } from '../lib/router';
import { Drawer, Modal, useConfirm, useToast } from '../components/overlay';
import { ATTENDANCE, Badge, Button, Field, NotifyBadge, SessionBadge, SyncBadge, cx } from '../components/ui';
import { Combo, SpPicker, isNewSp, NEW_SP_PREFIX } from '../components/pickers';

type View = { kind: 'new'; prefill?: Partial<SessionInput> } | { kind: 'edit'; id: string } | { kind: 'detail'; id: string } | null;

const Ctx = createContext<{ openNew: (p?: Partial<SessionInput>) => void; openDetail: (id: string) => void; openEdit: (id: string) => void }>({
  openNew: () => {},
  openDetail: () => {},
  openEdit: () => {},
});
export const useSessionUI = () => useContext(Ctx);

export function SessionUIProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>(null);
  const close = useCallback(() => setView(null), []);
  const api = useMemo(
    () => ({
      openNew: (prefill?: Partial<SessionInput>) => setView({ kind: 'new', prefill }),
      openDetail: (id: string) => setView({ kind: 'detail', id }),
      openEdit: (id: string) => setView({ kind: 'edit', id }),
    }),
    [],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      <SessionFormDrawer view={view?.kind === 'new' || view?.kind === 'edit' ? view : null} onClose={close} onSaved={(id) => setView({ kind: 'detail', id })} />
      <SessionDetailDrawer id={view?.kind === 'detail' ? view.id : null} onClose={close} onEdit={(id) => setView({ kind: 'edit', id })} />
    </Ctx.Provider>
  );
}

// ======================= 表單 =======================
const blank = (date?: string): SessionInput => ({ date: date || '', unit: '', topic: '', checkinTime: '08:00', startTime: '08:30', endTime: '12:00', location: '', note: '', spIds: [] });

function SessionFormDrawer({ view, onClose, onSaved }: { view: { kind: 'new'; prefill?: Partial<SessionInput> } | { kind: 'edit'; id: string } | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { snap, d, mutate } = useData();
  const toast = useToast();
  const [form, setForm] = useState<SessionInput>(blank());
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
    if (view.kind === 'edit' && editing) {
      setForm({ ...editing, spIds: (d.bySession.get(editing.sessionId) || []).map((a) => a.spId) });
    } else if (view.kind === 'new') {
      setForm({ ...blank(snap?.today ? addDays(snap.today, 1) : ''), ...view.prefill });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const set = <K extends keyof SessionInput>(k: K, v: SessionInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  /** 即時衝突提示（後端仍會再次檢查） */
  const busy = useMemo(() => {
    const m = new Map<string, string>();
    if (!snap || !form.date || !/^\d\d:\d\d$/.test(form.checkinTime) || !/^\d\d:\d\d$/.test(form.endTime)) return m;
    const s1 = toMinutes(form.checkinTime), e1 = toMinutes(form.endTime);
    for (const s of snap.sessions) {
      if (s.sessionId === editing?.sessionId || s.status === 'cancelled' || s.date !== form.date) continue;
      if (!(s1 < toMinutes(s.endTime) && toMinutes(s.checkinTime) < e1)) continue;
      for (const a of d.bySession.get(s.sessionId) || []) if (a.attendance !== 'cancelled') m.set(a.spId, `${s.checkinTime}–${s.endTime} 已排「${s.topic}」`);
    }
    return m;
  }, [snap, d, form.date, form.checkinTime, form.endTime, editing]);

  const minutes = /^\d\d:\d\d$/.test(form.startTime) && /^\d\d:\d\d$/.test(form.endTime) ? diffMinutes(form.startTime, form.endTime) : 0;

  /** 表單內的 'new:姓名' 轉為 newSpNames，其餘為既有 spIds */
  const payload = (): SessionInput => ({
    ...form,
    spIds: form.spIds.filter((x) => !isNewSp(x)),
    newSpNames: form.spIds.filter(isNewSp).map((x) => x.slice(NEW_SP_PREFIX.length)),
  });

  async function submit(confirm = false) {
    try {
      validateSessionInput(payload());
    } catch (e) {
      if (e instanceof AppError) setErrors(((e.details as { fields: Record<string, string> })?.fields) || {});
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
      });
      const s = r.sessions![0];
      setWarnings(null);
      if (s.syncStatus === 'synced') toast('success', editing ? '已更新排程，並同步更新 Google 日曆事件' : '已新增排程，並建立 Google 日曆事件');
      else if (s.syncStatus === 'failed') toast('error', '排程已儲存，但日曆同步失敗，可於詳情中重試');
      else if (s.syncStatus === 'disabled') toast('info', '排程已儲存（尚未設定 Calendar ID，未同步日曆）');
      onSaved(s.sessionId);
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
        footer={
          <>
            <span className="mr-auto text-[12px] text-ink-3">{minutes > 0 && `預定演出 ${fmtDuration(minutes)} · ${form.spIds.length} 位 SP`}</span>
            <Button onClick={onClose}>取消</Button>
            <Button variant="primary" loading={saving} onClick={() => submit(false)} icon={<CalendarCheck2 className="size-4" />}>
              儲存並同步日曆
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
          <Field label="申請單位" required error={errors.unit} className="col-span-2">
            <Combo ariaLabel="申請單位" value={form.unit} onChange={(v) => set('unit', v)} options={st.units} placeholder="例：醫學系 UGY" invalid={!!errors.unit} />
          </Field>
          <Field label="教案主題" required error={errors.topic} className="col-span-2">
            <Combo ariaLabel="教案主題" value={form.topic} onChange={(v) => set('topic', v)} options={st.topics} placeholder="例：胸痛病史詢問" invalid={!!errors.topic} />
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
          <Field label="SP 人員（可多位）" required error={errors.spIds} className="col-span-2" hint={busy.size ? '⚠ 標示者在此時段已有其他排程' : '可從名單選取，或直接輸入姓名按 Enter 新增；多位可用「、」分隔一次輸入'}>
            <SpPicker sps={snap.sps} value={form.spIds} onChange={(v) => set('spIds', v)} busy={busy} invalid={!!errors.spIds} />
          </Field>
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
function SessionDetailDrawer({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (id: string) => void }) {
  const { snap, d, mutate } = useData();
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
        s && s.status !== 'cancelled' ? (
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
            <SyncBadge status={s.syncStatus} error={s.syncError} />
            {(s.syncStatus === 'failed' || s.syncStatus === 'pending' || s.syncStatus === 'disabled') && (
              <Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={busy === 'sync'} onClick={() => run('sync', async () => {
                const r = await mutate('session.resync', { sessionId: s.sessionId });
                if (r.sessions?.[0].syncStatus !== 'synced' && r.sessions?.[0].syncStatus !== 'removed') throw new Error('仍無法同步：' + (r.sessions?.[0].syncError || ''));
              }, '日曆已同步')}>
                重試同步
              </Button>
            )}
          </div>
          {s.syncStatus === 'failed' && <p className="rounded-[12px] bg-danger-50 px-3 py-2 text-[13px] text-danger">同步失敗原因：{s.syncError}</p>}
          {s.status === 'cancelled' && <p className="rounded-[12px] bg-mist px-3 py-2 text-[13px] text-ink-2">取消原因：{s.cancelReason}</p>}

          <dl className="grid grid-cols-2 gap-3">
            <Info icon={<Clock className="size-4" />} label="報到時間" value={s.checkinTime} />
            <Info icon={<Clock className="size-4" />} label="演出時間" value={`${s.startTime}–${s.endTime}（${fmtDuration(diffMinutes(s.startTime, s.endTime))}）`} />
            <Info icon={<MapPin className="size-4" />} label="演出地點" value={s.location} className="col-span-2" />
            {s.note && <Info label="備註" value={s.note} className="col-span-2" />}
          </dl>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-ink"><Users className="size-4 text-pine" />SP 人員（{list.length}）</h3>
            <ul className="divide-y divide-line rounded-[16px] border border-line bg-white">
              {list.map((a) => (
                <li key={a.assignmentId} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <button className="font-medium text-pine underline-offset-2 hover:underline" onClick={() => { onClose(); navigate(`/sps/${a.spId}`); }}>
                    {spName(d, a)}
                  </button>
                  <Badge tone={ATTENDANCE[a.attendance].tone}>{ATTENDANCE[a.attendance].label}</Badge>
                  {a.verifyStatus === 'verified' ? <Badge tone="sage">已核定 {fmtDuration(a.approvedMinutes || 0)}</Badge> : s.status === 'completed' && <Badge tone="warn">待核定</Badge>}
                  <span className="ml-auto"><NotifyBadge state={notifyState(d.latestNotify.get(a.assignmentId), s, a)} /></span>
                </li>
              ))}
            </ul>
            {s.status === 'completed' && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => { onClose(); navigate('/verify', { session: s.sessionId }); }}>
                前往核定時數 →
              </Button>
            )}
          </section>

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

export function sessionLabel(s: Session) {
  return `${s.startTime}–${s.endTime} ${s.topic}`;
}
