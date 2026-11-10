import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, UserRound, Users } from 'lucide-react';
import type { SP, SpInput, SpStatus } from '../../shared/types';
import { AppError, validateSpInput } from '../../shared/validate';
import { fmtDate, fmtHours, yearOf } from '../../shared/time';
import { isCountable } from '../../shared/stats';
import { useSnap } from '../lib/store';
import { navigate } from '../lib/router';
import { Drawer, useToast } from '../components/overlay';
import { Badge, Button, Card, Empty, Field, PageHeader, SP_STATUS, cx } from '../components/ui';

export default function Directory() {
  const { snap } = useSnap();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | SpStatus>('');
  const [editing, setEditing] = useState<SP | 'new' | null>(null);
  const year = yearOf(snap.today);

  const stats = useMemo(() => {
    const sm = new Map(snap.sessions.map((s) => [s.sessionId, s]));
    const m = new Map<string, { minutes: number; times: number; last: string }>();
    for (const a of snap.assignments) {
      const s = sm.get(a.sessionId);
      if (!s) continue;
      const r = m.get(a.spId) || { minutes: 0, times: 0, last: '' };
      if (isCountable(a, s) && yearOf(s.date) === year) {
        r.minutes += a.approvedMinutes || 0;
        r.times++;
      }
      if (!a.isDeleted && s.status !== 'cancelled' && a.attendance !== 'cancelled' && s.date <= snap.today && s.date > r.last) r.last = s.date;
      m.set(a.spId, r);
    }
    return m;
  }, [snap, year]);

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return snap.sps
      .filter((p) => !status || p.status === status)
      .filter((p) => !k || [p.name, p.lineNote, p.phone, p.note].join(' ').toLowerCase().includes(k))
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name, 'zh-Hant') : ['active', 'paused', 'inactive'].indexOf(a.status) - ['active', 'paused', 'inactive'].indexOf(b.status)));
  }, [snap.sps, q, status]);

  const counts = { active: 0, paused: 0, inactive: 0 } as Record<SpStatus, number>;
  snap.sps.forEach((p) => counts[p.status]++);

  return (
    <div>
      <PageHeader
        no="04"
        en="SP Directory"
        title="SP 人員"
        desc="SP_ID 為系統唯一識別碼，改名不影響歷史演出紀錄。停用的 SP 不會出現在排程選單，但保留完整履歷。"
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>新增 SP</Button>}
      />
      <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-lg">
        {(['active', 'paused', 'inactive'] as SpStatus[]).map((s) => (
          <button key={s} onClick={() => setStatus(status === s ? '' : s)} className={cx('rounded-[18px] border bg-white px-4 py-3 text-left transition', status === s ? 'border-pine ring-2 ring-pine/15' : 'border-line hover:border-pine/40')}>
            <div className="text-[12px] text-ink-3">{SP_STATUS[s].label}</div>
            <div className="num text-[26px] font-semibold text-ink">{counts[s]}</div>
          </button>
        ))}
      </div>
      <Card className="!p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input className="field pl-9" placeholder="搜尋姓名、LINE 名稱、電話…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜尋 SP" />
          </div>
          <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value as SpStatus | '')} aria-label="狀態篩選">
            <option value="">全部狀態</option>
            <option value="active">在職</option>
            <option value="paused">暫停</option>
            <option value="inactive">停用</option>
          </select>
        </div>
        {snap.sps.length === 0 ? (
          <Empty title="尚未建立 SP 人員" icon={<Users className="size-6" />} action={<Button variant="primary" size="sm" onClick={() => setEditing('new')}>新增第一位 SP</Button>}>建立 SP 主檔後即可在排程中快速選取。</Empty>
        ) : rows.length === 0 ? (
          <Empty title="沒有符合條件的 SP" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>姓名</th><th>狀態</th><th className="text-right">{year} 核定時數</th><th className="text-right">人次</th><th className="max-md:hidden">最近演出</th><th className="max-lg:hidden">聯絡</th><th className="max-lg:hidden">認證</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const s = stats.get(p.spId);
                  return (
                    <tr key={p.spId}>
                      <td>
                        <button className="flex items-center gap-2 font-medium text-pine hover:underline" onClick={() => navigate(`/sps/${p.spId}`)}>
                          <span className="flex size-8 items-center justify-center rounded-full bg-sage-200 text-[13px] text-pine">{p.name.slice(0, 1)}</span>
                          {p.name}
                        </button>
                        {p.lineNote && <div className="ml-10 text-[12px] text-ink-3">LINE：{p.lineNote}</div>}
                      </td>
                      <td><Badge tone={SP_STATUS[p.status].tone}>{SP_STATUS[p.status].label}</Badge></td>
                      <td className="num text-right font-semibold">{fmtHours(s?.minutes || 0)}</td>
                      <td className="num text-right">{s?.times || 0}</td>
                      <td className="num max-md:hidden whitespace-nowrap text-ink-2">{s?.last ? fmtDate(s.last) : '—'}</td>
                      <td className="max-lg:hidden text-ink-2">{p.phone || '—'}</td>
                      <td className="max-lg:hidden text-ink-2">{p.certification || '—'}</td>
                      <td className="text-right"><Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(p)}>編輯</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <SpFormDrawer target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

const blank: SpInput = { name: '', phone: '', email: '', lineNote: '', status: 'active', joinDate: '', certification: '', note: '' };

export function SpFormDrawer({ target, onClose }: { target: SP | 'new' | null; onClose: () => void }) {
  const { mutate } = useSnap();
  const toast = useToast();
  const [form, setForm] = useState<SpInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const sp = target && target !== 'new' ? target : null;
  useEffect(() => {
    if (!target) return;
    setErrors({});
    setForm(sp ? { name: sp.name, phone: sp.phone, email: sp.email, lineNote: sp.lineNote, status: sp.status, joinDate: sp.joinDate, certification: sp.certification, note: sp.note } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  const set = (k: keyof SpInput, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const save = async () => {
    try {
      validateSpInput(form);
    } catch (e) {
      if (e instanceof AppError) return setErrors((e.details as { fields: Record<string, string> }).fields);
    }
    setSaving(true);
    try {
      await mutate('sp.save', { spId: sp?.spId, input: form, expectedVersion: sp?.version });
      toast('success', sp ? '已更新 SP 資料' : '已新增 SP');
      onClose();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={!!target} onClose={onClose} eyebrow={sp ? sp.spId : 'New SP'} title={sp ? `編輯 ${sp.name}` : '新增 SP'} width={500} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" loading={saving} onClick={save} icon={<UserRound className="size-4" />}>儲存</Button></>}>
      <form className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="姓名" required error={errors.name} className="col-span-2"><input data-autofocus className={cx('field', errors.name && 'field-error')} value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="身分狀態" className="col-span-2">
          <div className="flex gap-2">
            {(['active', 'paused', 'inactive'] as SpStatus[]).map((s) => (
              <button type="button" key={s} onClick={() => set('status', s)} className={cx('flex-1 rounded-[12px] border px-3 py-2 text-[14px] transition', form.status === s ? 'border-pine bg-pine text-white' : 'border-line bg-white hover:border-pine/40')}>{SP_STATUS[s].label}</button>
            ))}
          </div>
        </Field>
        <Field label="聯絡電話（選填）" error={errors.phone}><input className={cx('field', errors.phone && 'field-error')} inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="電子郵件（選填）" error={errors.email}><input className={cx('field', errors.email && 'field-error')} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="LINE 顯示名稱 / 備註（選填）" className="col-span-2" hint="僅供辨識聯絡對象，請勿記錄私人聊天內容"><input className="field" value={form.lineNote} onChange={(e) => set('lineNote', e.target.value)} /></Field>
        <Field label="加入日期（選填）" error={errors.joinDate}><input type="date" className="field" value={form.joinDate} onChange={(e) => set('joinDate', e.target.value)} /></Field>
        <Field label="認證狀態（選填）"><input className="field" value={form.certification} onChange={(e) => set('certification', e.target.value)} placeholder="例：進階認證" /></Field>
        <Field label="備註" className="col-span-2"><textarea className="field min-h-20" value={form.note} onChange={(e) => set('note', e.target.value)} /></Field>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
