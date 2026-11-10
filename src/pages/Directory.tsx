import { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, Plus, Search, UserRound, Users, X } from 'lucide-react';
import type { SP, SpInput, SpStatus } from '../../shared/types';
import { AppError, ageOf, certExpiryYear, expiryBucket, isCertified, seniorityOf, validateSpInput, type ExpiryBucket } from '../../shared/validate';
import { download, toCsv } from '../lib/csv';
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
  const [f, setF] = useState<Filters>(NO_FILTER);
  const setOne = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((x) => ({ ...x, [k]: v }));
  const rocNow = Number(snap.today.slice(0, 4)) - 1911;
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
      .filter((p) => matches(p, f, snap.today))
      .filter((p) => !k || [p.name, p.lineNote, p.phone, p.note, p.certNo].join(' ').toLowerCase().includes(k))
      .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name, 'zh-Hant') : ['active', 'paused', 'inactive'].indexOf(a.status) - ['active', 'paused', 'inactive'].indexOf(b.status)));
  }, [snap.sps, snap.today, q, status, f]);

  const counts = { active: 0, paused: 0, inactive: 0 } as Record<SpStatus, number>;
  snap.sps.forEach((p) => counts[p.status]++);

  return (
    <div>
      <PageHeader
        no="04"
        en="SP Directory"
        title="SP 人員"
        desc="SP_ID 為系統唯一識別碼，改名不影響歷史演出紀錄。停用的 SP 不會出現在排程選單，但保留完整履歷。"
        actions={<>
          <Button icon={<Download className="size-4" />} onClick={() => exportRoster(rows, snap.today)} disabled={!rows.length}>匯出名冊</Button>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>新增 SP</Button>
        </>}
      />
      <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-lg">
        {(['active', 'paused', 'inactive'] as SpStatus[]).map((s) => (
          <button key={s} onClick={() => setStatus(status === s ? '' : s)} className={cx('rounded-[18px] border bg-white px-4 py-3 text-left transition', status === s ? 'border-pine ring-2 ring-pine/15' : 'border-line hover:border-pine/40')}>
            <div className="text-[12px] text-ink-3">{SP_STATUS[s].label}</div>
            <div className="num text-[26px] font-semibold text-ink">{counts[s]}</div>
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {EXPIRY_CHIPS.map(({ key, label, tone }) => {
          const n = snap.sps.filter((p) => p.status !== 'inactive' && expiryBucket(p.assocCert, snap.today) === key).length;
          const on = f.expiry === key;
          return (
            <button key={key} onClick={() => setOne('expiry', on ? '' : key)} className={cx('flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] transition', on ? 'border-pine bg-pine text-white' : 'border-line bg-white hover:border-pine/40')}>
              <span className={cx('size-2 rounded-full', !on && tone)} style={on ? { background: '#fff' } : undefined} />
              {typeof label === 'function' ? label(rocNow) : label}
              <b className="num">{n}</b>
            </button>
          );
        })}
        <span className="self-center text-[12px] text-ink-3">（在職與暫停者；依「學會認證」期間的結束年判斷）</span>
      </div>
      <Card className="!p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input className="field pl-9" placeholder="搜尋姓名、LINE 名稱、電話…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜尋 SP" />
          </div>
          <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value as SpStatus | '')} aria-label="在職狀態">
            <option value="">全部在職狀態</option>
            <option value="active">在職</option>
            <option value="paused">暫停</option>
            <option value="inactive">停用</option>
          </select>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className="field w-auto" value={f.cert} onChange={(e) => setOne('cert', e.target.value as Filters['cert'])} aria-label="是否認證">
            <option value="">認證：全部</option>
            <option value="yes">已認證</option>
            <option value="no">未認證</option>
          </select>
          <select className="field w-auto" value={f.expiry} onChange={(e) => setOne('expiry', e.target.value as Filters['expiry'])} aria-label="到期">
            <option value="">到期：全部</option>
            <option value="expired">已過期</option>
            <option value="thisYear">今年（{rocNow} 年）到期</option>
            <option value="nextYear">明年（{rocNow + 1} 年）到期</option>
            <option value="later">{rocNow + 2} 年以後到期</option>
            <option value="none">無認證期間</option>
            {expiryYears(snap.sps).map((y) => <option key={y} value={`y${y}`}>{y} 年到期</option>)}
          </select>
          <select className="field w-auto" value={f.certStatus} onChange={(e) => setOne('certStatus', e.target.value)} aria-label="證書狀態">
            <option value="">證書狀態：全部</option>
            {distinct(snap.sps.map((p) => p.certStatus)).map((v) => <option key={v}>{v}</option>)}
          </select>
          <select className="field w-auto" value={f.level} onChange={(e) => setOne('level', e.target.value)} aria-label="級數">
            <option value="">級數：全部</option>
            {distinct(snap.sps.map((p) => p.level)).map((v) => <option key={v}>{v}</option>)}
          </select>
          <select className="field w-auto" value={f.role} onChange={(e) => setOne('role', e.target.value)} aria-label="身分">
            <option value="">身分：全部</option>
            {distinct(snap.sps.map((p) => p.role)).map((v) => <option key={v}>{v}</option>)}
          </select>
          <select className="field w-auto" value={f.member} onChange={(e) => setOne('member', e.target.value)} aria-label="協會會員">
            <option value="">協會會員：全部</option>
            <option value="是">是</option>
            <option value="否">否</option>
          </select>
          <select className="field w-auto" value={f.gender} onChange={(e) => setOne('gender', e.target.value)} aria-label="性別">
            <option value="">性別：全部</option>
            <option value="女">女</option>
            <option value="男">男</option>
          </select>
          {(JSON.stringify(f) !== JSON.stringify(NO_FILTER) || status || q) && (
            <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => { setF(NO_FILTER); setStatus(''); setQ(''); }}>清除篩選</Button>
          )}
          <span className="ml-auto text-[13px] text-ink-3">共 <b className="num text-ink">{rows.length}</b> 位</span>
        </div>
        {snap.sps.length === 0 ? (
          <Empty title="尚未建立 SP 人員" icon={<Users className="size-6" />} action={<Button variant="primary" size="sm" onClick={() => setEditing('new')}>新增第一位 SP</Button>}>建立 SP 主檔後即可在排程中快速選取。</Empty>
        ) : rows.length === 0 ? (
          <Empty title="沒有符合條件的 SP" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>姓名</th><th className="max-md:hidden">性別</th><th className="text-right max-md:hidden">年齡</th><th className="max-lg:hidden">身分</th><th>級數</th><th className="max-lg:hidden">學會認證</th><th>到期</th><th className="max-md:hidden">證書狀態</th><th className="text-right">{year} 核定時數</th><th className="text-right max-md:hidden">人次</th><th className="max-xl:hidden">最近演出</th><th>在職</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const s = stats.get(p.spId);
                  return (
                    <tr key={p.spId}>
                      <td>
                        <button className="flex items-center gap-2 whitespace-nowrap font-medium text-pine hover:underline" onClick={() => navigate(`/sps/${p.spId}`)}>
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sage-200 text-[13px] text-pine">{p.name.slice(0, 1)}</span>
                          {p.name}
                        </button>
                        {p.lineNote && <div className="ml-10 text-[12px] text-ink-3">LINE：{p.lineNote}</div>}
                      </td>
                      <td className="max-md:hidden text-ink-2">{p.gender || '—'}</td>
                      <td className="num text-right max-md:hidden text-ink-2">{ageOf(p.birthday, snap.today) || '—'}</td>
                      <td className="max-lg:hidden text-ink-2">{p.role || '—'}</td>
                      <td>{p.level ? <Badge tone="gold">{p.level}</Badge> : <span className="text-ink-3">—</span>}</td>
                      <td className="num max-lg:hidden whitespace-nowrap text-ink-2">{p.assocCert || '—'}</td>
                      <td><ExpiryBadge p={p} today={snap.today} /></td>
                      <td className="max-md:hidden">{p.certStatus ? <Badge tone={p.certStatus === '符合' ? 'ok' : p.certStatus === '尚未認證' ? 'neutral' : 'warn'}>{p.certStatus}</Badge> : <span className="text-ink-3">—</span>}</td>
                      <td className="num text-right font-semibold">{fmtHours(s?.minutes || 0)}</td>
                      <td className="num text-right max-md:hidden">{s?.times || 0}</td>
                      <td className="num max-xl:hidden whitespace-nowrap text-ink-2">{s?.last ? fmtDate(s.last) : '—'}</td>
                      <td><Badge tone={SP_STATUS[p.status].tone}>{SP_STATUS[p.status].label}</Badge></td>
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

const blank: SpInput = { name: '', phone: '', email: '', lineNote: '', status: 'active', gender: '', birthday: '', firstCertYear: '', assocCert: '', certNo: '', role: 'SP', level: '', certStatus: '', isMember: '', note: '' };

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
    setForm(sp ? { name: sp.name, phone: sp.phone, email: sp.email, lineNote: sp.lineNote, status: sp.status, gender: sp.gender, birthday: sp.birthday, firstCertYear: sp.firstCertYear, assocCert: sp.assocCert, certNo: sp.certNo, role: sp.role, level: sp.level, certStatus: sp.certStatus, isMember: sp.isMember, note: sp.note } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  const set = (k: keyof SpInput, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const today = useSnap().snap.today;

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
    <Drawer open={!!target} onClose={onClose} eyebrow={sp ? sp.spId : 'New SP'} title={sp ? `編輯 ${sp.name}` : '新增 SP'} width={560} footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" loading={saving} onClick={save} icon={<UserRound className="size-4" />}>儲存</Button></>}>
      <form className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="姓名" required error={errors.name} className="col-span-2"><input data-autofocus className={cx('field', errors.name && 'field-error')} value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="性別"><Choice value={form.gender || ''} options={['女', '男']} onChange={(v) => set('gender', v)} /></Field>
        <Field label="生日（民國）" error={errors.birthday} hint={form.birthday && ageOf(form.birthday, today) ? `年齡 ${ageOf(form.birthday, today)} 歲` : '例：43.08.04'}>
          <input className={cx('field num', errors.birthday && 'field-error')} value={form.birthday} onChange={(e) => set('birthday', e.target.value)} placeholder="43.08.04" />
        </Field>
        <Field label="首次認證（民國年）" error={errors.firstCertYear} hint={form.firstCertYear && seniorityOf(form.firstCertYear, today) ? `SP 年資 ${seniorityOf(form.firstCertYear, today)} 年` : '例：101'}>
          <input className={cx('field num', errors.firstCertYear && 'field-error')} inputMode="numeric" value={form.firstCertYear} onChange={(e) => set('firstCertYear', e.target.value)} placeholder="101" />
        </Field>
        <Field label="學會認證"><input className="field num" value={form.assocCert} onChange={(e) => set('assocCert', e.target.value)} placeholder="例：113-115" /></Field>
        <Field label="證書字號"><input className="field num" value={form.certNo} onChange={(e) => set('certNo', e.target.value)} placeholder="例：(113)0377" /></Field>
        <Field label="身分"><Choice value={form.role || ''} options={['SP', 'SPT']} onChange={(v) => set('role', v)} /></Field>
        <Field label="級數"><Choice value={form.level || ''} options={['SP0', 'SP1', 'SP2', 'SP3']} onChange={(v) => set('level', v)} /></Field>
        <Field label="證書狀態"><Choice value={form.certStatus || ''} options={['符合', '尚未認證', '未符合', '已過效期', '待展延']} onChange={(v) => set('certStatus', v)} /></Field>
        <Field label="是否協會會員"><Choice value={form.isMember || ''} options={['是', '否']} onChange={(v) => set('isMember', v)} /></Field>
        <div className="col-span-2 mt-2 border-t border-line pt-4 text-[12px] font-semibold tracking-wide text-ink-3">系統資料</div>
        <Field label="在職狀態" className="col-span-2">
          <div className="flex gap-2">
            {(['active', 'paused', 'inactive'] as SpStatus[]).map((s) => (
              <button type="button" key={s} onClick={() => set('status', s)} className={cx('flex-1 rounded-[12px] border px-3 py-2 text-[14px] transition', form.status === s ? 'border-pine bg-pine text-white' : 'border-line bg-white hover:border-pine/40')}>{SP_STATUS[s].label}</button>
            ))}
          </div>
        </Field>
        <Field label="聯絡電話（選填）" error={errors.phone}><input className={cx('field', errors.phone && 'field-error')} inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="電子郵件（選填）" error={errors.email}><input className={cx('field', errors.email && 'field-error')} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="LINE 顯示名稱 / 備註（選填）" className="col-span-2" hint="僅供辨識聯絡對象，請勿記錄私人聊天內容"><input className="field" value={form.lineNote} onChange={(e) => set('lineNote', e.target.value)} /></Field>
        <Field label="備註" className="col-span-2"><textarea className="field min-h-20" value={form.note} onChange={(e) => set('note', e.target.value)} /></Field>
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

/** 名冊選項：點選帶入，也可再點一次清除 */
function Choice({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button type="button" key={o} onClick={() => onChange(value === o ? '' : o)} className={cx('rounded-full border px-3 py-1 text-[13px] transition', value === o ? 'border-pine bg-pine text-white' : 'border-line bg-white text-ink-2 hover:border-pine/40')}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** 依原名冊格式匯出 */
export function exportRoster(sps: SP[], today: string) {
  download(`標準化病人名冊_${today}.csv`, toCsv(
    ['姓名', '性別', '年齡', '生日', '首次認證', 'SP年資', '學會認證', '證書字號', '身分', '級數', '證書狀態', '是否協會會員', '在職狀態', '聯絡電話', '電子郵件', '備註'],
    sps.map((p) => [p.name, p.gender, ageOf(p.birthday, today), p.birthday, p.firstCertYear, seniorityOf(p.firstCertYear, today), p.assocCert, p.certNo, p.role, p.level, p.certStatus, p.isMember, SP_STATUS[p.status].label, p.phone, p.email, p.note]),
  ));
}

interface Filters { cert: '' | 'yes' | 'no'; expiry: '' | ExpiryBucket | `y${number}`; certStatus: string; level: string; role: string; member: string; gender: string }
const NO_FILTER: Filters = { cert: '', expiry: '', certStatus: '', level: '', role: '', member: '', gender: '' };
const distinct = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();
const expiryYears = (sps: SP[]) => [...new Set(sps.map((p) => certExpiryYear(p.assocCert)).filter((y): y is number => !!y))].sort((a, b) => a - b);

function matches(p: SP, f: Filters, today: string): boolean {
  if (f.cert === 'yes' && !isCertified(p)) return false;
  if (f.cert === 'no' && isCertified(p)) return false;
  if (f.expiry) {
    if (f.expiry.startsWith('y')) {
      if (certExpiryYear(p.assocCert) !== Number(f.expiry.slice(1))) return false;
    } else if (expiryBucket(p.assocCert, today) !== f.expiry) return false;
  }
  if (f.certStatus && p.certStatus !== f.certStatus) return false;
  if (f.level && p.level !== f.level) return false;
  if (f.role && p.role !== f.role) return false;
  if (f.member && p.isMember !== f.member) return false;
  if (f.gender && p.gender !== f.gender) return false;
  return true;
}

const EXPIRY_CHIPS: { key: ExpiryBucket; label: string | ((y: number) => string); tone: string }[] = [
  { key: 'expired', label: '已過期', tone: 'bg-danger' },
  { key: 'thisYear', label: (y) => `今年（${y}）到期`, tone: 'bg-warn' },
  { key: 'nextYear', label: (y) => `明年（${y + 1}）到期`, tone: 'bg-gold' },
  { key: 'none', label: '尚無認證期間', tone: 'bg-line' },
];

function ExpiryBadge({ p, today }: { p: SP; today: string }) {
  const y = certExpiryYear(p.assocCert);
  if (!y) return <span className="text-ink-3">—</span>;
  const b = expiryBucket(p.assocCert, today);
  const tone = b === 'expired' ? 'danger' : b === 'thisYear' ? 'warn' : b === 'nextYear' ? 'gold' : 'neutral';
  const text = b === 'expired' ? `${y} 已過期` : b === 'thisYear' ? `${y} 今年到期` : b === 'nextYear' ? `${y} 明年到期` : `${y}`;
  return <Badge tone={tone}>{text}</Badge>;
}
