import type { SessionInput, SpInput, SpStatus, VerifyInput } from './types';
import { diffMinutes, isValidDate, isValidTime } from './time';

export class AppError extends Error {
  constructor(
    public code: import('./types').ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const MAX = { name: 40, text: 120, note: 1000 };

/** 清理字串：去頭尾空白、移除控制字元、限制長度 */
export function clean(v: unknown, max = MAX.text): string {
  if (v === null || v === undefined) return '';
  return String(v)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

type Errors = Record<string, string>;
function fail(errors: Errors) {
  if (Object.keys(errors).length) {
    throw new AppError('VALIDATION', Object.values(errors)[0], { fields: errors });
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-()#\s]{6,20}$/;
const SP_STATUS: SpStatus[] = ['active', 'paused', 'inactive'];

export function validateSpInput(raw: SpInput): Required<SpInput> {
  const v: Required<SpInput> = {
    name: clean(raw.name, MAX.name).replace(/\s+/g, ''),
    phone: clean(raw.phone, 20),
    email: clean(raw.email, 120).toLowerCase(),
    lineNote: clean(raw.lineNote, MAX.text),
    status: (raw.status || 'active') as SpStatus,
    gender: clean(raw.gender, 4),
    birthday: clean(raw.birthday, 12).replace(/[/-]/g, '.'),
    firstCertYear: clean(raw.firstCertYear, 4),
    assocCert: clean(raw.assocCert, 20),
    certNo: clean(raw.certNo, 30),
    role: clean(raw.role, 10),
    level: clean(raw.level, 10),
    certStatus: clean(raw.certStatus, 20),
    isMember: clean(raw.isMember, 4),
    note: clean(raw.note, MAX.note),
  };
  const e: Errors = {};
  if (!v.name) e.name = '請輸入 SP 姓名';
  if (v.phone && !PHONE_RE.test(v.phone)) e.phone = '電話格式不正確';
  if (v.email && !EMAIL_RE.test(v.email)) e.email = '電子郵件格式不正確';
  if (!SP_STATUS.includes(v.status)) e.status = '在職狀態不正確';
  if (v.birthday && !rocDateParts(v.birthday)) e.birthday = '生日請用民國格式，例如 43.08.04';
  if (v.firstCertYear && !/^\d{2,3}$/.test(v.firstCertYear)) e.firstCertYear = '首次認證請填民國年，例如 101';
  fail(e);
  return v;
}

/** 解析民國日期 43.08.04 → [43, 8, 4] */
export function rocDateParts(s: string): [number, number, number] | null {
  const m = /^(\d{2,3})\.(\d{1,2})\.(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? [y, mo, d] : null;
}

/** 年齡＝今年民國年－出生民國年（與原名冊計算方式相同）；無生日回傳空字串 */
export function ageOf(birthday: string, today: string): string {
  const p = rocDateParts(birthday || '');
  if (!p) return '';
  const age = Number(today.slice(0, 4)) - 1911 - p[0];
  return age >= 0 ? String(age) : '';
}

/** SP 年資＝今年民國年－首次認證年 */
export function seniorityOf(firstCertYear: string, today: string): string {
  if (!/^\d{2,3}$/.test((firstCertYear || '').trim())) return '';
  const n = Number(today.slice(0, 4)) - 1911 - Number(firstCertYear);
  return n >= 0 ? String(n) : '';
}

export interface NormalizedSession {
  date: string;
  unit: string;
  topic: string;
  checkinTime: string;
  startTime: string;
  endTime: string;
  location: string;
  note: string;
  cases: { topic: string; spIds: string[]; newSpNames: string[] }[];
  /** 所有教案的既有 SP（不重複），供衝突偵測 */
  spIds: string[];
}

const uniq = (a: string[]) => [...new Set(a)];

export function validateSessionInput(raw: SessionInput): NormalizedSession {
  const rawCases = Array.isArray(raw.cases) && raw.cases.length
    ? raw.cases
    : [{ topic: raw.topic || '', spIds: raw.spIds || [], newSpNames: raw.newSpNames || [] }];
  const cases = rawCases.map((c) => ({
    topic: clean(c.topic, MAX.text),
    spIds: uniq((Array.isArray(c.spIds) ? c.spIds : []).map((x) => clean(x, 40)).filter(Boolean)),
    newSpNames: uniq((Array.isArray(c.newSpNames) ? c.newSpNames : []).map((x) => clean(x, MAX.name)).filter(Boolean)),
  }));
  const v: NormalizedSession = {
    date: clean(raw.date, 10),
    unit: clean(raw.unit, MAX.text),
    topic: clean(uniq(cases.map((c) => c.topic).filter(Boolean)).join('、'), 300),
    checkinTime: clean(raw.checkinTime, 5),
    startTime: clean(raw.startTime, 5),
    endTime: clean(raw.endTime, 5),
    location: clean(raw.location, MAX.text),
    note: clean(raw.note, MAX.note),
    cases,
    spIds: uniq(cases.flatMap((c) => c.spIds)),
  };
  const e: Errors = {};
  if (!isValidDate(v.date)) e.date = '請選擇正確的演出日期';
  if (!v.unit) e.unit = '請輸入申請單位';
  if (!v.location) e.location = '請輸入演出地點';
  if (!isValidTime(v.checkinTime)) e.checkinTime = '請輸入報到時間';
  if (!isValidTime(v.startTime)) e.startTime = '請輸入演出開始時間';
  if (!isValidTime(v.endTime)) e.endTime = '請輸入演出結束時間';
  if (!e.startTime && !e.endTime && diffMinutes(v.startTime, v.endTime) <= 0) e.endTime = '演出結束時間必須晚於開始時間';
  if (!e.checkinTime && !e.startTime && diffMinutes(v.checkinTime, v.startTime) < 0)
    e.checkinTime = '報到時間不可晚於演出開始時間';
  if (cases.length > 30) e.cases = '單場教案數過多';
  const seen = new Set<string>();
  cases.forEach((c, i) => {
    if (!c.topic) e[`case${i}.topic`] = '請輸入教案主題';
    else if (seen.has(c.topic)) e[`case${i}.topic`] = '同一場次的教案主題重複，請合併為同一列';
    seen.add(c.topic);
    if (!c.spIds.length && !c.newSpNames.length) e[`case${i}.sps`] = '請至少選擇或輸入一位 SP';
    if (c.spIds.length + c.newSpNames.length > 50) e[`case${i}.sps`] = '單一教案 SP 人數過多';
  });
  // 舊版欄位名稱（單一教案）也提供錯誤訊息
  if (e['case0.topic'] && cases.length === 1) e.topic = e['case0.topic'];
  if (e['case0.sps'] && cases.length === 1) e.spIds = e['case0.sps'];
  fail(e);
  return v;
}

export function validateVerifyInput(raw: VerifyInput): VerifyInput & { approvedMinutes: number } {
  const attendance = raw.attendance;
  const e: Errors = {};
  if (!['present', 'absent', 'cancelled', 'pending'].includes(attendance)) e.attendance = '出席狀態不正確';
  if (attendance === 'pending') e.attendance = '請選擇出席狀態後再核定';
  const actualStart = clean(raw.actualStart, 5);
  const actualEnd = clean(raw.actualEnd, 5);
  let minutes = 0;
  if (attendance === 'present') {
    if (!isValidTime(actualStart)) e.actualStart = '請輸入實際開始時間';
    if (!isValidTime(actualEnd)) e.actualEnd = '請輸入實際結束時間';
    if (!e.actualStart && !e.actualEnd && diffMinutes(actualStart, actualEnd) <= 0) e.actualEnd = '實際結束必須晚於開始';
    const m = raw.approvedMinutes;
    if (m === null || m === undefined || !Number.isInteger(m) || m < 0 || m > 24 * 60)
      e.approvedMinutes = '核定分鐘數需為 0–1440 的整數';
    else minutes = m;
    if (!e.approvedMinutes && !e.actualEnd && !e.actualStart && minutes > diffMinutes(actualStart, actualEnd))
      e.approvedMinutes = '核定分鐘數不可超過實際演出時間';
  }
  fail(e);
  return {
    ...raw,
    actualStart: attendance === 'present' ? actualStart : '',
    actualEnd: attendance === 'present' ? actualEnd : '',
    approvedMinutes: attendance === 'present' ? minutes : 0,
    minutesNote: clean(raw.minutesNote, MAX.note),
    reason: clean(raw.reason, MAX.note),
  };
}

/** 寫入 Sheets 前防止公式注入 */
export function sheetSafe(s: string): string {
  return /^[=+@]/.test(s) ? `'${s}` : s;
}
