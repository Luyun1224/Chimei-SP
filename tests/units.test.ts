/** 科部（申請單位）查詢：申請件數與頻率 */
import { describe, expect, it } from 'vitest';
import { computeUnitDetail, computeUnitRows, monthsInScope, unitMatches } from '../shared/units';
import type { Assignment, Session } from '../shared/types';

const TODAY = '2026-06-15';
let n = 0;
function sess(date: string, unit: string, over: Partial<Session> = {}): Session {
  n++;
  return {
    sessionId: `S${n}`, date, unit, topic: '胸痛', category: 'OSCE', checkinTime: '08:00', startTime: '08:30', endTime: '10:30', location: '', note: '',
    status: date < TODAY ? 'completed' : 'scheduled', cancelReason: '', calendarEventId: '', syncStatus: 'synced', syncError: '', syncedAt: '',
    isDeleted: false, deleteReason: '', requestId: '', createdAt: '', createdBy: '', updatedAt: '', updatedBy: '', version: 1, ...over,
  };
}
function asg(s: Session, over: Partial<Assignment> = {}): Assignment {
  n++;
  return {
    assignmentId: `A${n}`, sessionId: s.sessionId, spId: 'P1', spNameSnapshot: '甲', topic: '', attendance: 'present', actualStart: '', actualEnd: '',
    approvedMinutes: 120, minutesNote: '', verifyStatus: 'verified', verifiedBy: '', verifiedAt: '', isDeleted: false, createdAt: '', updatedAt: '', updatedBy: '', version: 1, ...over,
  };
}

describe('科部申請統計', () => {
  const s1 = sess('2026-01-10', '護理部');
  const s2 = sess('2026-03-10', '護理部 ');
  const s3 = sess('2026-05-09', '護理部', { status: 'cancelled' });
  const s4 = sess('2026-07-01', '護理部');
  const s5 = sess('2026-02-01', '急診醫學部');
  const s6 = sess('2026-02-02', '急診醫學部', { isDeleted: true });
  const s7 = sess('2025-11-01', '護理部');
  const data = {
    sessions: [s1, s2, s3, s4, s5, s6, s7],
    assignments: [asg(s1), asg(s1, { spId: 'P2' }), asg(s2, { attendance: 'cancelled', approvedMinutes: null, verifyStatus: 'unverified' }), asg(s3), asg(s4, { verifyStatus: 'unverified', approvedMinutes: null }), asg(s5)],
  };

  it('依科部計算申請件數、狀態與頻率；名稱前後空白視為同一科部；軟刪除不計', () => {
    const rows = computeUnitRows(data, { year: 2026 }, TODAY);
    expect(rows.map((r) => r.unit)).toEqual(['護理部', '急診醫學部']);
    const nurse = rows[0];
    expect(nurse.requests).toBe(4);
    expect(nurse.completed).toBe(2);
    expect(nurse.scheduled).toBe(1);
    expect(nurse.cancelled).toBe(1);
    expect(nurse.spDemand).toBe(3); // s1 兩位 + s4 一位；s2 已取消的 SP、s3 取消場次不計
    expect(nurse.minutes).toBe(240); // 只計已完成且核定出席
    expect(nurse.activeMonths).toBe(4);
    expect(nurse.perMonth).toBe(0.7); // 4 件 ÷ 6 個月（當年度算到本月）
    expect(nurse.avgIntervalDays).toBe(57); // 1/10 → 7/1 共 172 天、3 個間隔
    expect(nurse.lastDate).toBe('2026-05-09');
    expect(nurse.nextDate).toBe('2026-07-01');
    expect(rows[1].requests).toBe(1);
    expect(rows[1].avgIntervalDays).toBeNull();
  });

  it('全部年度與月數換算', () => {
    expect(monthsInScope(data.sessions, { year: 2025 }, TODAY)).toBe(12);
    expect(monthsInScope(data.sessions, { year: 2026 }, TODAY)).toBe(6);
    expect(monthsInScope(data.sessions, {}, TODAY)).toBe(8); // 2025-11 ～ 2026-06
    const all = computeUnitRows(data, {}, TODAY);
    expect(all.find((r) => r.unit === '護理部')!.requests).toBe(5);
  });

  it('單一科部詳情：月度、歷年、教案', () => {
    const det = computeUnitDetail(data, '護理部', { year: 2026 }, TODAY);
    expect(det.monthly[0]).toEqual({ month: 1, requests: 1, completed: 1, cancelled: 0 });
    expect(det.monthly[4]).toEqual({ month: 5, requests: 1, completed: 0, cancelled: 1 });
    expect(det.yearly).toEqual([{ year: 2025, requests: 1, completed: 1 }, { year: 2026, requests: 4, completed: 2 }]);
    expect(det.byTopic).toEqual([{ key: '胸痛', label: '胸痛', sessions: 3 }]); // 取消的場次不計
    expect(det.sessions.map((s) => s.date)).toEqual(['2026-07-01', '2026-05-09', '2026-03-10', '2026-01-10']);
  });

  it('搜尋忽略大小寫與空白', () => {
    expect(unitMatches('醫學系 UGY', 'ugy')).toBe(true);
    expect(unitMatches('急診醫學部', '急診 醫學')).toBe(true);
    expect(unitMatches('護理部', '藥劑')).toBe(false);
    expect(unitMatches('護理部', '')).toBe(true);
  });
});
