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
    name: clean(raw.name, MAX.name),
    phone: clean(raw.phone, 20),
    email: clean(raw.email, 120).toLowerCase(),
    lineNote: clean(raw.lineNote, MAX.text),
    status: (raw.status || 'active') as SpStatus,
    joinDate: clean(raw.joinDate, 10),
    certification: clean(raw.certification, MAX.text),
    note: clean(raw.note, MAX.note),
  };
  const e: Errors = {};
  if (!v.name) e.name = '請輸入 SP 姓名';
  if (v.phone && !PHONE_RE.test(v.phone)) e.phone = '電話格式不正確';
  if (v.email && !EMAIL_RE.test(v.email)) e.email = '電子郵件格式不正確';
  if (!SP_STATUS.includes(v.status)) e.status = '身分狀態不正確';
  if (v.joinDate && !isValidDate(v.joinDate)) e.joinDate = '加入日期格式不正確';
  fail(e);
  return v;
}

export function validateSessionInput(raw: SessionInput): SessionInput & { note: string; newSpNames: string[] } {
  const v = {
    date: clean(raw.date, 10),
    unit: clean(raw.unit, MAX.text),
    topic: clean(raw.topic, MAX.text),
    checkinTime: clean(raw.checkinTime, 5),
    startTime: clean(raw.startTime, 5),
    endTime: clean(raw.endTime, 5),
    location: clean(raw.location, MAX.text),
    note: clean(raw.note, MAX.note),
    spIds: Array.isArray(raw.spIds) ? [...new Set(raw.spIds.map((s) => clean(s, 40)).filter(Boolean))] : [],
    newSpNames: Array.isArray(raw.newSpNames) ? [...new Set(raw.newSpNames.map((s) => clean(s, MAX.name)).filter(Boolean))] : [],
  };
  const e: Errors = {};
  if (!isValidDate(v.date)) e.date = '請選擇正確的演出日期';
  if (!v.unit) e.unit = '請輸入申請單位';
  if (!v.topic) e.topic = '請輸入教案主題';
  if (!v.location) e.location = '請輸入演出地點';
  if (!isValidTime(v.checkinTime)) e.checkinTime = '請輸入報到時間';
  if (!isValidTime(v.startTime)) e.startTime = '請輸入演出開始時間';
  if (!isValidTime(v.endTime)) e.endTime = '請輸入演出結束時間';
  if (!e.startTime && !e.endTime && diffMinutes(v.startTime, v.endTime) <= 0) e.endTime = '演出結束時間必須晚於開始時間';
  if (!e.checkinTime && !e.startTime && diffMinutes(v.checkinTime, v.startTime) < 0)
    e.checkinTime = '報到時間不可晚於演出開始時間';
  if (!v.spIds.length && !v.newSpNames.length) e.spIds = '請至少選擇或輸入一位 SP';
  if (v.spIds.length + v.newSpNames.length > 50) e.spIds = '單場 SP 人數過多';
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
