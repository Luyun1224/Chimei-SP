/**
 * SP 演出費計算
 * 規則（可在系統設定調整）：每滿 1 小時 500 元；未滿 1 小時的部分「超過 15 分鐘」加計 250 元，15 分鐘（含）以內不計。
 * 例：2 小時 30 分 → 2×500 + 250 = 1,250；1 小時 15 分 → 500；1 小時 16 分 → 750。
 * 依據：已核定者用「核定分鐘數」；尚未核定者以「預定演出時間」預估，並標示為預估。缺席、取消不列入。
 */
import type { Assignment, Session, Settings } from './types';
import { diffMinutes } from './time';
import { isCountable, topicOf } from './stats';

export interface FeeRule {
  hourly: number;
  half: number;
  threshold: number;
}

export function feeRule(s: Partial<Settings> | undefined): FeeRule {
  return {
    hourly: Number.isFinite(s?.feeHourly) ? Number(s!.feeHourly) : 500,
    half: Number.isFinite(s?.feeHalf) ? Number(s!.feeHalf) : 250,
    threshold: Number.isFinite(s?.feeThresholdMinutes) ? Number(s!.feeThresholdMinutes) : 15,
  };
}

export function feeFor(minutes: number, rule: FeeRule): number {
  const m = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return hours * rule.hourly + (rest > rule.threshold ? rule.half : 0);
}

export type FeeBasis = 'verified' | 'estimated';

export interface FeeLine {
  assignmentId: string;
  sessionId: string;
  spId: string;
  spName: string;
  date: string;
  unit: string;
  topic: string;
  location: string;
  start: string;
  end: string;
  minutes: number;
  fee: number;
  basis: FeeBasis;
}

/** 單筆明細的演出費；缺席、取消、刪除回傳 null（不列入） */
export function feeLine(a: Assignment, s: Session | undefined, spName: string, rule: FeeRule): FeeLine | null {
  if (!s || s.isDeleted || s.status === 'cancelled' || a.isDeleted) return null;
  if (a.attendance === 'absent' || a.attendance === 'cancelled') return null;
  const verified = isCountable(a, s);
  if (a.verifyStatus === 'verified' && !verified) return null;
  const minutes = verified ? (a.approvedMinutes as number) : Math.max(0, diffMinutes(s.startTime, s.endTime));
  return {
    assignmentId: a.assignmentId,
    sessionId: s.sessionId,
    spId: a.spId,
    spName,
    date: s.date,
    unit: s.unit,
    topic: topicOf(a, s),
    location: s.location,
    start: verified && a.actualStart ? a.actualStart : s.startTime,
    end: verified && a.actualEnd ? a.actualEnd : s.endTime,
    minutes,
    fee: feeFor(minutes, rule),
    basis: verified ? 'verified' : 'estimated',
  };
}

export const fmtMoney = (n: number) => n.toLocaleString('zh-TW');
