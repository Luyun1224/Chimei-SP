/**
 * 統計：嚴格區分
 *  - 場次（session）：至少一名 SP 已出席且核定的「已完成」排程數
 *  - 人次（person-time）：已出席且核定的 assignment 筆數
 *  - 人時（person-minutes）：上述 assignment 的核定分鐘數加總
 *  - SP 人數：有核定紀錄的不重複 SP
 * 排程建立本身不計入實績；缺席、取消、軟刪除一律排除。
 */
import type { Assignment, SP, Session, SessionStatus } from './types';
import { addDays, daysBetween, monthOf, startOfWeek, yearOf } from './time';

export interface StatFilter {
  year: number;
  month?: number;
  spId?: string;
  unit?: string;
  topic?: string;
}

export interface Row {
  key: string;
  label: string;
  sessions: number;
  personTimes: number;
  minutes: number;
}

export interface AnnualStats {
  sessions: number;
  personTimes: number;
  minutes: number;
  activeSps: number;
  avgMinutesPerSp: number;
  monthly: { month: number; sessions: number; personTimes: number; minutes: number }[];
  bySp: Row[];
  byUnit: Row[];
  byTopic: Row[];
  pending: { unverifiedAssignments: number; awaitingCompletion: number };
  concentration: { top20Share: number; topCount: number; buckets: { label: string; count: number }[] };
  statusCounts: Record<SessionStatus, number>;
}

/** 明細的教案：同一場次可有多個教案；舊資料沒有時沿用排程的教案 */
export function topicOf(a: { topic?: string }, s: { topic: string } | undefined): string {
  return a.topic || s?.topic || '';
}

export function isCountable(a: Assignment, s: Session | undefined): boolean {
  return (
    !!s &&
    !a.isDeleted &&
    !s.isDeleted &&
    s.status === 'completed' &&
    a.verifyStatus === 'verified' &&
    a.attendance === 'present' &&
    typeof a.approvedMinutes === 'number'
  );
}

export function liveAssignments(assignments: Assignment[], sessionId: string): Assignment[] {
  return assignments.filter((a) => a.sessionId === sessionId && !a.isDeleted);
}

/** 需要核定的 assignment：排程已完成但尚未核定 */
export function needsVerification(a: Assignment, s: Session | undefined): boolean {
  return !!s && !s.isDeleted && !a.isDeleted && s.status === 'completed' && a.verifyStatus !== 'verified';
}

function inc(m: Map<string, Row>, key: string, label: string, sessionId: string, minutes: number, seen: Map<string, Set<string>>) {
  const r = m.get(key) || { key, label, sessions: 0, personTimes: 0, minutes: 0 };
  r.personTimes += 1;
  r.minutes += minutes;
  const set = seen.get(key) || new Set<string>();
  if (!set.has(sessionId)) {
    set.add(sessionId);
    r.sessions += 1;
  }
  seen.set(key, set);
  m.set(key, r);
}
const byMinutes = (a: Row, b: Row) => b.minutes - a.minutes || b.personTimes - a.personTimes || a.label.localeCompare(b.label, 'zh-Hant');

export function computeStats(
  data: { sessions: Session[]; assignments: Assignment[]; sps: SP[] },
  f: StatFilter,
  today: string,
): AnnualStats {
  const sessionMap = new Map(data.sessions.map((s) => [s.sessionId, s]));
  const spMap = new Map(data.sps.map((p) => [p.spId, p]));
  const sessionInScope = (s: Session) =>
    !s.isDeleted &&
    yearOf(s.date) === f.year &&
    (!f.month || monthOf(s.date) === f.month) &&
    (!f.unit || s.unit === f.unit);

  const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, sessions: 0, personTimes: 0, minutes: 0 }));
  const monthSeen = Array.from({ length: 12 }, () => new Set<string>());
  const bySp = new Map<string, Row>(), byUnit = new Map<string, Row>(), byTopic = new Map<string, Row>();
  const seenSp = new Map<string, Set<string>>(), seenUnit = new Map<string, Set<string>>(), seenTopic = new Map<string, Set<string>>();
  const sessionSet = new Set<string>();
  let personTimes = 0, minutes = 0, unverified = 0;

  for (const a of data.assignments) {
    const s = sessionMap.get(a.sessionId);
    if (!s || !sessionInScope(s)) continue;
    if (f.spId && a.spId !== f.spId) continue;
    if (f.topic && topicOf(a, s) !== f.topic) continue;
    if (needsVerification(a, s)) unverified++;
    if (!isCountable(a, s)) continue;
    const m = a.approvedMinutes as number;
    personTimes++;
    minutes += m;
    sessionSet.add(s.sessionId);
    const mi = monthOf(s.date) - 1;
    monthly[mi].personTimes++;
    monthly[mi].minutes += m;
    if (!monthSeen[mi].has(s.sessionId)) {
      monthSeen[mi].add(s.sessionId);
      monthly[mi].sessions++;
    }
    inc(bySp, a.spId, spMap.get(a.spId)?.name || a.spNameSnapshot, s.sessionId, m, seenSp);
    inc(byUnit, s.unit, s.unit, s.sessionId, m, seenUnit);
    inc(byTopic, topicOf(a, s), topicOf(a, s), s.sessionId, m, seenTopic);
  }

  const statusCounts: Record<SessionStatus, number> = { scheduled: 0, completed: 0, cancelled: 0 };
  let awaitingCompletion = 0;
  for (const s of data.sessions) {
    if (!sessionInScope(s)) continue;
    if (f.spId && !data.assignments.some((a) => a.sessionId === s.sessionId && a.spId === f.spId && !a.isDeleted)) continue;
    if (f.topic && !data.assignments.some((a) => a.sessionId === s.sessionId && !a.isDeleted && topicOf(a, s) === f.topic)) continue;
    statusCounts[s.status]++;
    if (s.status === 'scheduled' && s.date < today) awaitingCompletion++;
  }

  const spRows = [...bySp.values()].sort(byMinutes);
  const activeSps = spRows.length;
  const topCount = Math.max(1, Math.ceil(activeSps * 0.2));
  const topMinutes = spRows.slice(0, topCount).reduce((n, r) => n + r.minutes, 0);
  const bucketDefs: [string, number, number][] = [
    ['< 5 小時', 0, 300],
    ['5–10 小時', 300, 600],
    ['10–20 小時', 600, 1200],
    ['20–40 小時', 1200, 2400],
    ['≥ 40 小時', 2400, Infinity],
  ];
  return {
    sessions: sessionSet.size,
    personTimes,
    minutes,
    activeSps,
    avgMinutesPerSp: activeSps ? Math.round(minutes / activeSps) : 0,
    monthly,
    bySp: spRows,
    byUnit: [...byUnit.values()].sort(byMinutes),
    byTopic: [...byTopic.values()].sort(byMinutes),
    pending: { unverifiedAssignments: unverified, awaitingCompletion },
    concentration: {
      top20Share: minutes ? topMinutes / minutes : 0,
      topCount: activeSps ? topCount : 0,
      buckets: bucketDefs.map(([label, lo, hi]) => ({
        label,
        count: spRows.filter((r) => r.minutes >= lo && r.minutes < hi).length,
      })),
    },
    statusCounts,
  };
}

/** 長期未安排演出的 SP（僅列在職者） */
export function inactiveSps(
  data: { sessions: Session[]; assignments: Assignment[]; sps: SP[] },
  today: string,
  thresholdDays: number,
): { sp: SP; lastDate: string; days: number | null }[] {
  const sessionMap = new Map(data.sessions.map((s) => [s.sessionId, s]));
  const last = new Map<string, string>();
  for (const a of data.assignments) {
    if (a.isDeleted || a.attendance === 'cancelled' || a.attendance === 'absent') continue;
    const s = sessionMap.get(a.sessionId);
    if (!s || s.isDeleted || s.status === 'cancelled') continue;
    if ((last.get(a.spId) || '') < s.date) last.set(a.spId, s.date);
  }
  return data.sps
    .filter((p) => p.status === 'active')
    .map((sp) => {
      const lastDate = last.get(sp.spId) || '';
      return { sp, lastDate, days: lastDate ? daysBetween(lastDate, today) : null };
    })
    .filter((x) => x.days === null || x.days >= thresholdDays)
    .sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9));
}

export interface ProfileStats {
  yearSessions: number;
  yearPersonTimes: number;
  yearMinutes: number;
  lifetimeMinutes: number;
  lifetimePersonTimes: number;
  topicCount: number;
  lastDate: string;
  monthly: { month: number; minutes: number; personTimes: number }[];
  yearly: { year: number; minutes: number; personTimes: number }[];
  byTopic: Row[];
  byUnit: Row[];
}

export function computeProfile(
  data: { sessions: Session[]; assignments: Assignment[] },
  spId: string,
  year: number,
): ProfileStats {
  const sessionMap = new Map(data.sessions.map((s) => [s.sessionId, s]));
  const mine = data.assignments.filter((a) => a.spId === spId && !a.isDeleted);
  const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, minutes: 0, personTimes: 0 }));
  const yearly = new Map<number, { year: number; minutes: number; personTimes: number }>();
  const byTopic = new Map<string, Row>(), byUnit = new Map<string, Row>();
  const seenT = new Map<string, Set<string>>(), seenU = new Map<string, Set<string>>();
  const yearSessions = new Set<string>();
  let yearPT = 0, yearMin = 0, lifeMin = 0, lifePT = 0, lastDate = '';
  const topics = new Set<string>();
  for (const a of mine) {
    const s = sessionMap.get(a.sessionId);
    if (!isCountable(a, s) || !s) continue;
    const m = a.approvedMinutes as number;
    lifeMin += m;
    lifePT++;
    topics.add(topicOf(a, s));
    if (s.date > lastDate) lastDate = s.date;
    const y = yearOf(s.date);
    const yr = yearly.get(y) || { year: y, minutes: 0, personTimes: 0 };
    yr.minutes += m;
    yr.personTimes++;
    yearly.set(y, yr);
    if (y === year) {
      yearSessions.add(s.sessionId);
      yearPT++;
      yearMin += m;
      monthly[monthOf(s.date) - 1].minutes += m;
      monthly[monthOf(s.date) - 1].personTimes++;
      inc(byTopic, topicOf(a, s), topicOf(a, s), s.sessionId, m, seenT);
      inc(byUnit, s.unit, s.unit, s.sessionId, m, seenU);
    }
  }
  return {
    yearSessions: yearSessions.size,
    yearPersonTimes: yearPT,
    yearMinutes: yearMin,
    lifetimeMinutes: lifeMin,
    lifetimePersonTimes: lifePT,
    topicCount: topics.size,
    lastDate,
    monthly,
    yearly: [...yearly.values()].sort((a, b) => a.year - b.year),
    byTopic: [...byTopic.values()].sort(byMinutes),
    byUnit: [...byUnit.values()].sort(byMinutes),
  };
}

/** 首頁總覽 */
export function computeOverview(
  data: { sessions: Session[]; assignments: Assignment[]; sps: SP[] },
  today: string,
) {
  const live = data.sessions.filter((s) => !s.isDeleted && s.status !== 'cancelled');
  const wkStart = startOfWeek(today);
  const wkEnd = addDays(wkStart, 6);
  const month = today.slice(0, 7);
  const sessionMap = new Map(data.sessions.map((s) => [s.sessionId, s]));
  const monthPersonTimes = data.assignments.filter((a) => {
    const s = sessionMap.get(a.sessionId);
    return s && !a.isDeleted && !s.isDeleted && s.status !== 'cancelled' && a.attendance !== 'cancelled' && a.attendance !== 'absent' && s.date.startsWith(month);
  }).length;
  const yearStats = computeStats(data, { year: yearOf(today) }, today);
  return {
    todaySessions: live.filter((s) => s.date === today),
    weekSessions: live.filter((s) => s.date >= wkStart && s.date <= wkEnd),
    weekRange: [wkStart, wkEnd] as const,
    monthPersonTimes,
    yearMinutes: yearStats.minutes,
    yearPersonTimes: yearStats.personTimes,
    yearSessions: yearStats.sessions,
    pending: yearStats.pending,
    upcoming: live.filter((s) => s.date >= today && s.status === 'scheduled').sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
  };
}
