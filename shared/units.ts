/**
 * 科部（申請單位）統計：申請件數與申請頻率。
 *
 * 口徑：
 *  - 申請件數：該科部未刪除的排程筆數（含預定、已完成、已取消），依「演出日期」歸屬年度／月份。
 *  - 已完成／預定／已取消：依排程狀態分開計算。
 *  - SP 需求人次：未取消排程中、未取消的 SP 明細筆數。
 *  - 核定人時：與成果分析相同，只計已完成且已核定出席的紀錄。
 *  - 平均每月件數：申請件數 ÷ 統計月數（當年度只算到本月；全部年度從系統最早一筆排程的月份算到本月）。
 *  - 平均間隔：不重複演出日期之間的平均天數（至少需兩個日期）。
 */
import type { Assignment, Session } from './types';
import { daysBetween, monthOf, yearOf } from './time';
import { categoryOf, isCountable, topicOf } from './stats';

export interface UnitScope {
  /** 未指定 = 全部年度 */
  year?: number;
}

export interface UnitRow {
  unit: string;
  requests: number;
  completed: number;
  scheduled: number;
  cancelled: number;
  /** SP 需求人次（未取消） */
  spDemand: number;
  /** 核定人時（分鐘） */
  minutes: number;
  /** 有申請的不重複月份數 */
  activeMonths: number;
  /** 平均每月件數 */
  perMonth: number;
  /** 不重複演出日期之間的平均天數；少於兩個日期為 null */
  avgIntervalDays: number | null;
  firstDate: string;
  /** 最近一次（今天以前，含今天）申請演出的日期 */
  lastDate: string;
  /** 下一場預定演出日期（今天以後） */
  nextDate: string;
}

export interface UnitDetail extends UnitRow {
  monthly: { month: number; requests: number; completed: number; cancelled: number }[];
  yearly: { year: number; requests: number; completed: number }[];
  byTopic: { key: string; label: string; sessions: number }[];
  byCategory: { key: string; label: string; sessions: number }[];
  sessions: Session[];
}

/** 統一科部名稱的比對方式：去頭尾空白 */
export const unitKey = (u: string) => (u || '').trim();

/** 搜尋：忽略大小寫與空白 */
export function unitMatches(unit: string, q: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  const k = norm(q);
  return !k || norm(unit).includes(k);
}

/** 統計月數：用來換算「平均每月件數」 */
export function monthsInScope(sessions: Session[], scope: UnitScope, today: string): number {
  const ty = yearOf(today), tm = monthOf(today);
  if (scope.year) {
    if (scope.year < ty) return 12;
    if (scope.year === ty) return tm;
    return 12;
  }
  const live = sessions.filter((s) => !s.isDeleted && unitKey(s.unit));
  if (!live.length) return 1;
  const first = live.reduce((m, s) => (s.date < m ? s.date : m), live[0].date);
  const months = (ty - yearOf(first)) * 12 + (tm - monthOf(first)) + 1;
  return Math.max(1, months);
}

function inScope(s: Session, scope: UnitScope) {
  return !s.isDeleted && !!unitKey(s.unit) && (!scope.year || yearOf(s.date) === scope.year);
}

function avgInterval(dates: string[]): number | null {
  const uniq = [...new Set(dates)].sort();
  if (uniq.length < 2) return null;
  return Math.round(daysBetween(uniq[0], uniq[uniq.length - 1]) / (uniq.length - 1));
}

function buildRow(unit: string, list: Session[], liveBySession: Map<string, Assignment[]>, months: number, today: string): UnitRow {
  let completed = 0, scheduled = 0, cancelled = 0, spDemand = 0, minutes = 0;
  const monthsSeen = new Set<string>();
  let firstDate = '', lastDate = '', nextDate = '';
  for (const s of list) {
    if (s.status === 'completed') completed++;
    else if (s.status === 'cancelled') cancelled++;
    else scheduled++;
    monthsSeen.add(s.date.slice(0, 7));
    if (!firstDate || s.date < firstDate) firstDate = s.date;
    if (s.date <= today && s.date > lastDate) lastDate = s.date;
    if (s.date > today && s.status === 'scheduled' && (!nextDate || s.date < nextDate)) nextDate = s.date;
    for (const a of liveBySession.get(s.sessionId) || []) {
      if (s.status !== 'cancelled' && a.attendance !== 'cancelled') spDemand++;
      if (isCountable(a, s)) minutes += a.approvedMinutes as number;
    }
  }
  return {
    unit,
    requests: list.length,
    completed,
    scheduled,
    cancelled,
    spDemand,
    minutes,
    activeMonths: monthsSeen.size,
    perMonth: months ? Math.round((list.length / months) * 10) / 10 : 0,
    avgIntervalDays: avgInterval(list.map((s) => s.date)),
    firstDate,
    lastDate,
    nextDate,
  };
}

function groupLive(assignments: Assignment[]) {
  const m = new Map<string, Assignment[]>();
  for (const a of assignments) {
    if (a.isDeleted) continue;
    const l = m.get(a.sessionId) || [];
    l.push(a);
    m.set(a.sessionId, l);
  }
  return m;
}

/** 所有科部的申請統計（依申請件數由多到少） */
export function computeUnitRows(
  data: { sessions: Session[]; assignments: Assignment[] },
  scope: UnitScope,
  today: string,
): UnitRow[] {
  const by = new Map<string, Session[]>();
  for (const s of data.sessions) {
    if (!inScope(s, scope)) continue;
    const k = unitKey(s.unit);
    const l = by.get(k) || [];
    l.push(s);
    by.set(k, l);
  }
  const live = groupLive(data.assignments);
  const months = monthsInScope(data.sessions, scope, today);
  return [...by.entries()]
    .map(([unit, list]) => buildRow(unit, list, live, months, today))
    .sort((a, b) => b.requests - a.requests || b.lastDate.localeCompare(a.lastDate) || a.unit.localeCompare(b.unit, 'zh-Hant'));
}

/** 單一科部：月度、歷年、教案、演出類型與排程清單 */
export function computeUnitDetail(
  data: { sessions: Session[]; assignments: Assignment[] },
  unit: string,
  scope: UnitScope,
  today: string,
): UnitDetail {
  const key = unitKey(unit);
  const all = data.sessions.filter((s) => !s.isDeleted && unitKey(s.unit) === key);
  const list = all.filter((s) => inScope(s, scope));
  const live = groupLive(data.assignments);
  const row = buildRow(key, list, live, monthsInScope(data.sessions, scope, today), today);

  const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, requests: 0, completed: 0, cancelled: 0 }));
  if (scope.year) {
    for (const s of list) {
      const m = monthly[monthOf(s.date) - 1];
      m.requests++;
      if (s.status === 'completed') m.completed++;
      if (s.status === 'cancelled') m.cancelled++;
    }
  }

  const yearly = new Map<number, { year: number; requests: number; completed: number }>();
  for (const s of all) {
    const y = yearOf(s.date);
    const r = yearly.get(y) || { year: y, requests: 0, completed: 0 };
    r.requests++;
    if (s.status === 'completed') r.completed++;
    yearly.set(y, r);
  }

  const topics = new Map<string, number>(), cats = new Map<string, number>();
  for (const s of list) {
    if (s.status === 'cancelled') continue;
    const ts = new Set((live.get(s.sessionId) || []).map((a) => topicOf(a, s)).filter(Boolean));
    if (!ts.size && s.topic) ts.add(s.topic);
    for (const t of ts) topics.set(t, (topics.get(t) || 0) + 1);
    const c = categoryOf(s);
    cats.set(c, (cats.get(c) || 0) + 1);
  }
  const rows = (m: Map<string, number>) =>
    [...m.entries()].map(([k, n]) => ({ key: k, label: k, sessions: n })).sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label, 'zh-Hant'));

  return {
    ...row,
    monthly,
    yearly: [...yearly.values()].sort((a, b) => a.year - b.year),
    byTopic: rows(topics),
    byCategory: rows(cats),
    sessions: [...list].sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime)),
  };
}
