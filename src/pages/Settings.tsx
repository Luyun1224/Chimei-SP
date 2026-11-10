import { useEffect, useState } from 'react';
import { Activity, CalendarCog, Copy, ExternalLink, Link2, DatabaseBackup, Download, FlaskConical, History, ListPlus, Save, X } from 'lucide-react';
import type { AuditEntry, HealthReport, Settings as S } from '../../shared/types';
import { useSnap } from '../lib/store';
import { call } from '../lib/api';
import { copyText, download } from '../lib/csv';
import { WEB_APP_URL } from '../config';
import { AuditList } from '../features/sessions';
import { useConfirm, useToast } from '../components/overlay';
import { Badge, Button, Card, CardHead, Field, PageHeader } from '../components/ui';

export default function Settings() {
  const { snap, mutate, reload } = useSnap();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<S>(snap.settings);
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => setForm(snap.settings), [snap.settings]);
  const dirty = JSON.stringify(form) !== JSON.stringify(snap.settings);
  const unsynced = snap.sessions.filter((x) => x.status !== 'cancelled' && x.syncStatus !== 'synced' && x.date >= snap.today).length;

  const save = async () => {
    setSaving(true);
    try {
      const { individualTemplate: _i, summaryTemplate: _s, ...patch } = form; // 範本於提醒中心編輯
      await mutate('settings.save', { patch });
      toast('success', '設定已儲存');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const action = async (k: string, fn: () => Promise<void>) => {
    setBusy(k);
    try {
      await fn();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const exportJson = () => download(`SP-Hub-完整匯出_${snap.today}.json`, JSON.stringify({ exportedAt: snap.serverTime, sps: snap.sps, sessions: snap.sessions, assignments: snap.assignments, notifications: snap.notifications, settings: snap.settings }, null, 2), 'application/json');

  return (
    <div>
      <PageHeader no="07" en="Settings" title="系統設定" desc="Calendar、常用選項與資料維護。管理員帳號白名單與試算表 ID 存放於 Apps Script 的 Script Properties，不在前端顯示或修改。" />
      <Card className="mb-4">
        <CardHead eyebrow="Web App" title={<span className="flex items-center gap-2"><Link2 className="size-5 text-pine" />正式系統網址</span>} />
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-[10px] bg-mist px-3 py-2 text-[13px]" title={WEB_APP_URL}>{WEB_APP_URL}</code>
          <Button size="sm" icon={<Copy className="size-3.5" />} onClick={async () => { const ok = await copyText(WEB_APP_URL); toast(ok ? 'success' : 'error', ok ? '已複製網址' : '無法複製，請手動選取'); }}>複製網址</Button>
          <a href={WEB_APP_URL} target="_top" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-pine px-3 text-[13px] font-medium text-white hover:bg-pine-700"><ExternalLink className="size-3.5" />開啟</a>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">請只分享給 ADMIN_EMAILS 名單內的管理員；非授權帳號開啟會顯示「無存取權限」。建議加入瀏覽器書籤。</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead eyebrow="Google Calendar" title={<span className="flex items-center gap-2"><CalendarCog className="size-5 text-pine" />行事曆同步</span>} />
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setForm({ ...form, calendarId: 'primary' })} className={`rounded-[14px] border p-3 text-left transition ${form.calendarId === 'primary' ? 'border-pine bg-pine-50 ring-2 ring-pine/15' : 'border-line bg-white hover:border-pine/40'}`}>
                <div className="text-[14px] font-semibold">使用我的 Google 日曆</div>
                <div className="mt-0.5 text-[12px] text-ink-3">最簡單：排程直接排入目前登入帳號的主要日曆</div>
              </button>
              <button type="button" onClick={() => form.calendarId === 'primary' && setForm({ ...form, calendarId: '' })} className={`rounded-[14px] border p-3 text-left transition ${form.calendarId && form.calendarId !== 'primary' ? 'border-pine bg-pine-50 ring-2 ring-pine/15' : 'border-line bg-white hover:border-pine/40'}`}>
                <div className="text-[14px] font-semibold">使用共用日曆</div>
                <div className="mt-0.5 text-[12px] text-ink-3">多位管理員共用時建議，填入下方日曆 ID</div>
              </button>
            </div>
            {form.calendarId !== 'primary' && (
              <Field label="共用日曆 ID" hint="在 Google 日曆 → 設定 → 整合日曆 中複製，例如 xxxx@group.calendar.google.com，並以「變更活動」權限分享給所有管理員。">
                <input className="field font-mono text-[13px]" value={form.calendarId} onChange={(e) => setForm({ ...form, calendarId: e.target.value.trim() })} placeholder="尚未設定" />
              </Field>
            )}
            <div className="flex flex-wrap items-center gap-2 rounded-[14px] bg-mist/60 p-3">
              <span className="mr-auto text-[13px] text-ink-2">今天以後、尚未排入日曆的排程：<b className="num">{unsynced}</b> 筆</span>
              <Button size="sm" variant="primary" loading={busy === 'syncAll'} disabled={!snap.settings.calendarId || !unsynced || dirty} onClick={() => action('syncAll', async () => {
                let total = 0, failed = 0;
                for (let round = 0; round < 20; round++) {
                  const r = await mutate('session.resyncAll', { limit: 30 });
                  total += r.synced;
                  failed += r.failed;
                  if (!r.remaining || r.synced + r.failed === 0) break;
                }
                toast(failed ? 'error' : 'success', `已排入 ${total} 筆${failed ? `，${failed} 筆失敗（請至排程詳情查看原因）` : ''}`);
              })}>全部排入日曆</Button>
              {dirty && <span className="w-full text-[12px] text-warn">請先儲存設定</span>}
            </div>
            <label className="flex items-start gap-3 rounded-[14px] bg-mist/60 p-3">
              <input type="checkbox" className="mt-1 size-4 accent-[#284A45]" checked={form.adminReminderEnabled} onChange={(e) => setForm({ ...form, adminReminderEnabled: e.target.checked })} />
              <span className="text-[14px]">
                在日曆事件加上管理員提醒
                <span className="block text-[12px] text-ink-3">僅提醒管理員本人（例如前一天提醒您去發 LINE），不會通知 SP，也不代替 LINE 人工通知。</span>
              </span>
            </label>
            {form.adminReminderEnabled && (
              <Field label="提前提醒（分鐘）" hint="1440 = 前一天同一時間">
                <input type="number" min={0} max={40320} className="field num w-40" value={form.adminReminderMinutes} onChange={(e) => setForm({ ...form, adminReminderMinutes: Number(e.target.value) })} />
              </Field>
            )}
          </div>
        </Card>

        <Card>
          <CardHead eyebrow="Options" title={<span className="flex items-center gap-2"><ListPlus className="size-5 text-pine" />常用選項</span>} />
          <p className="mb-3 text-[12px] text-ink-3">新增排程時輸入的新單位、教案與地點會自動加入。</p>
          <div className="space-y-4">
            <OptionList label="申請單位" items={form.units} onChange={(units) => setForm({ ...form, units })} />
            <OptionList label="教案主題" items={form.topics} onChange={(topics) => setForm({ ...form, topics })} />
            <OptionList label="演出地點" items={form.locations} onChange={(locations) => setForm({ ...form, locations })} />
            <Field label="長期未安排演出門檻（天）"><input type="number" min={7} max={730} className="field num w-32" value={form.inactiveThresholdDays} onChange={(e) => setForm({ ...form, inactiveThresholdDays: Number(e.target.value) })} /></Field>
          </div>
        </Card>
      </div>
      <div className="sticky bottom-4 z-10 my-4 flex justify-end">
        <Button variant="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty} onClick={save} className="shadow-lift">儲存設定</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHead eyebrow="Health" title={<span className="flex items-center gap-2"><Activity className="size-5 text-pine" />連線檢查</span>} />
          <Button size="sm" loading={busy === 'health'} onClick={() => action('health', async () => setHealth(await call('system.health', {})))}>執行檢查</Button>
          {health && (
            <ul className="mt-3 space-y-1 text-[13px]">
              <li>試算表：{health.spreadsheetName}</li>
              {health.sheets.map((s) => <li key={s.name} className="flex justify-between"><span>{s.name}</span>{s.ok ? <Badge tone="ok">{s.rows} 列</Badge> : <Badge tone="danger">缺少</Badge>}</li>)}
              <li className="flex justify-between pt-1"><span>行事曆</span>{health.calendarOk ? <Badge tone="ok">{health.calendarName}</Badge> : <Badge tone="danger">{health.calendarError}</Badge>}</li>
              <li className="text-ink-3">登入：{health.user} · 時區 {health.timezone}</li>
            </ul>
          )}
          {snap.mode === 'demo' && <p className="mt-2 text-[12px] text-ink-3">示範模式不支援（僅 Apps Script 環境）。</p>}
        </Card>
        <Card>
          <CardHead eyebrow="Backup" title={<span className="flex items-center gap-2"><DatabaseBackup className="size-5 text-pine" />備份與匯出</span>} />
          <div className="flex flex-col items-start gap-2">
            <Button size="sm" icon={<DatabaseBackup className="size-3.5" />} loading={busy === 'backup'} disabled={snap.mode === 'demo'} onClick={() => action('backup', async () => {
              const r = await call('system.backup', {});
              toast('success', `已建立備份：${r.name}`, { label: '開啟', onClick: () => window.open(r.url, '_blank', 'noopener') });
            })}>建立 Google 試算表備份副本</Button>
            <Button size="sm" icon={<Download className="size-3.5" />} onClick={exportJson}>下載完整 JSON</Button>
            <p className="text-[12px] text-ink-3">備份副本建立在您的 Google 雲端硬碟，請勿分享給非管理員。</p>
          </div>
        </Card>
        <Card>
          <CardHead eyebrow="Audit" title={<span className="flex items-center gap-2"><History className="size-5 text-pine" />稽核紀錄</span>} />
          <Button size="sm" loading={busy === 'audit'} onClick={() => action('audit', async () => setAudit(await call('audit.list', { limit: 80 })))}>載入最近 80 筆</Button>
          {audit && <div className="mt-2 max-h-80 overflow-auto"><AuditList items={audit} /></div>}
        </Card>
      </div>

      {snap.mode === 'demo' && <DemoTools onChanged={reload} confirm={confirm} />}
    </div>
  );
}

function OptionList({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const [v, setV] = useState('');
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-ink-2">{label}（{items.length}）</div>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
        {items.map((i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-mist py-0.5 pl-2.5 pr-1 text-[13px]">
            {i}
            <button aria-label={`移除 ${i}`} className="rounded-full p-0.5 hover:bg-line" onClick={() => onChange(items.filter((x) => x !== i))}><X className="size-3" /></button>
          </span>
        ))}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim() && !items.includes(v.trim())) onChange([...items, v.trim()]); setV(''); }}>
        <input className="field !py-1.5" value={v} onChange={(e) => setV(e.target.value)} placeholder={`新增${label}`} aria-label={`新增${label}`} />
        <Button size="sm" type="submit">加入</Button>
      </form>
    </div>
  );
}

function DemoTools({ onChanged, confirm }: { onChanged: () => Promise<void>; confirm: ReturnType<typeof useConfirm> }) {
  const toast = useToast();
  const [n, setN] = useState(0);
  const withDemo = async (fn: (m: typeof import('../lib/demo')) => void, msg: string) => {
    const m = await import('../lib/demo');
    fn(m);
    await onChanged();
    setN(n + 1);
    toast('info', msg);
  };
  return (
    <Card className="mt-4 border-gold/50 bg-gold-50/50">
      <CardHead eyebrow="Demo only" title={<span className="flex items-center gap-2"><FlaskConical className="size-5 text-gold-600" />示範模式工具</span>} />
      <p className="mb-3 text-[13px] text-ink-2">以下工具僅在本機示範模式出現，用於體驗與驗收流程；正式環境不會顯示。示範資料皆為虛構，不代表實際成果。</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="gold" onClick={async () => { if ((await confirm({ title: '載入示範資料？', body: '會清除目前示範模式中的所有資料。', confirmLabel: '載入' })).ok) withDemo((m) => m.demoControls.seed(), '已載入示範資料'); }}>載入示範資料</Button>
        <Button size="sm" onClick={() => withDemo((m) => m.demoControls.failNextCalendarCall(), '下一次日曆同步將模擬失敗')}>模擬下一次日曆同步失敗</Button>
        <Button size="sm" variant="ghost" onClick={async () => { if ((await confirm({ title: '清空示範資料？', tone: 'danger', confirmLabel: '清空' })).ok) withDemo((m) => m.demoControls.reset(), '已清空'); }}>清空示範資料</Button>
      </div>
      <DemoCalendar key={n} />
    </Card>
  );
}

function DemoCalendar() {
  const [events, setEvents] = useState<{ eventId: string; title: string; startIso: string }[]>([]);
  useEffect(() => { import('../lib/demo').then((m) => setEvents([...m.demoControls.events])); }, []);
  return (
    <details className="mt-3 text-[13px]">
      <summary className="cursor-pointer text-ink-2">模擬日曆中的事件（{events.length}）</summary>
      <ul className="mt-2 max-h-48 overflow-auto">
        {events.slice(-30).map((e) => <li key={e.eventId} className="num text-ink-3">{e.startIso.slice(0, 16).replace('T', ' ')} {e.title}</li>)}
      </ul>
    </details>
  );
}
