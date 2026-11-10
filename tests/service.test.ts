/**
 * 驗收情境自動化測試：與 Apps Script 共用同一份 service，僅替換 Repo / Calendar 為記憶體實作。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createService } from '../server/service';
import { createMemoryEnv, createMemoryRepo, createMockCalendar, emptyState, type MemoryState } from '../server/mock/memory';
import { computeProfile, computeStats } from '../shared/stats';
import { latestNotifications, notifyState, renderIndividual } from '../shared/template';
import type { ApiResponse, MutationResult, SessionInput } from '../shared/types';

const TODAY = '2026-11-10';
let state: MemoryState;
let cal: ReturnType<typeof createMockCalendar>;
let env: ReturnType<typeof createMemoryEnv>;
let svc: ReturnType<typeof createService>;

function ok<T>(r: ApiResponse<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
}

beforeEach(() => {
  state = emptyState();
  cal = createMockCalendar();
  env = createMemoryEnv({ user: 'admin@chimei.org.tw', admins: ['admin@chimei.org.tw'], today: () => TODAY, now: () => `${TODAY}T09:00:00+08:00` });
  svc = createService({ repo: createMemoryRepo(state), env, calendar: cal.gateway });
  ok(svc.dispatch('settings.save', { patch: { calendarId: 'sp-hub@group.calendar.google.com' } }));
});

function addSp(name: string) {
  return ok(svc.dispatch('sp.save', { input: { name } })).sps![0];
}
function input(spIds: string[], over: Partial<SessionInput> = {}): SessionInput {
  return { date: '2026-11-11', unit: '醫學系 UGY', topic: '胸痛病史詢問', checkinTime: '08:00', startTime: '08:30', endTime: '11:30', location: '技能中心 3F 第二考場', spIds, ...over };
}
function createSession(spIds: string[], over: Partial<SessionInput> = {}, requestId = 'req-' + Math.random()) {
  return ok(svc.dispatch('session.save', { input: input(spIds, over), requestId })) as MutationResult;
}

describe('排程與 Sheets 資料結構', () => {
  it('新增 1 場、多名 SP：產生 1 筆 Session 與每位 SP 各 1 筆 Assignment', () => {
    const a = addSp('王小明'), b = addSp('李美華'), c = addSp('陳志強');
    const r = createSession([a.spId, b.spId, c.spId]);
    expect(state.tables.sessions).toHaveLength(1);
    expect(state.tables.assignments).toHaveLength(3);
    expect(state.tables.assignments.every((x) => x.sessionId === r.sessions![0].sessionId)).toBe(true);
    expect(state.tables.assignments.every((x) => x.verifyStatus === 'unverified' && x.approvedMinutes === null)).toBe(true);
    expect(state.tables.audit.some((x) => x.action === 'create' && x.entity === 'session')).toBe(true);
  });

  it('Calendar 僅建立 1 個事件，格式正確、使用 Asia/Taipei', () => {
    const a = addSp('王小明');
    const r = createSession([a.spId]);
    expect(cal.events).toHaveLength(1);
    const ev = cal.events[0];
    expect(ev.title).toBe('【SP演出】胸痛病史詢問｜醫學系 UGY');
    expect(ev.startIso).toBe('2026-11-11T08:30:00+08:00');
    expect(ev.endIso).toBe('2026-11-11T11:30:00+08:00');
    expect(ev.description).toContain('王小明');
    expect(ev.description).toContain('報到時間：08:00');
    expect(ev.description).toContain(r.sessions![0].sessionId);
    expect(r.sessions![0].syncStatus).toBe('synced');
    expect(r.sessions![0].calendarEventId).toBe(ev.eventId);
  });

  it('編輯時間會更新原事件，不重複建立', () => {
    const a = addSp('王小明');
    const s = createSession([a.spId]).sessions![0];
    const r = ok(svc.dispatch('session.save', { sessionId: s.sessionId, input: input([a.spId], { startTime: '09:00', endTime: '12:00' }), expectedVersion: s.version, requestId: 'edit-1' }));
    expect(cal.events).toHaveLength(1);
    expect(cal.ctl.calls.create).toBe(1);
    expect(cal.ctl.calls.update).toBe(1);
    expect(cal.events[0].startIso).toBe('2026-11-11T09:00:00+08:00');
    expect(r.sessions![0].calendarEventId).toBe(s.calendarEventId);
  });

  it('同一 requestId 重送不會產生重複排程（網路重試冪等）', () => {
    const a = addSp('王小明');
    createSession([a.spId], {}, 'same-req');
    createSession([a.spId], {}, 'same-req');
    expect(state.tables.sessions).toHaveLength(1);
    expect(cal.events).toHaveLength(1);
  });

  it('Google API 失敗：保留資料、標記失敗、重試後只有 1 個事件', () => {
    const a = addSp('王小明');
    cal.ctl.failNext = 1;
    const s = createSession([a.spId], {}, 'req-fail').sessions![0];
    expect(s.syncStatus).toBe('failed');
    expect(state.tables.sessions).toHaveLength(1);
    expect(cal.events).toHaveLength(0);
    // 使用者重送同一請求 → 不重複建立排程，且重試同步
    const again = createSession([a.spId], {}, 'req-fail').sessions![0];
    expect(state.tables.sessions).toHaveLength(1);
    expect(again.syncStatus).toBe('synced');
    expect(cal.events).toHaveLength(1);
  });

  it('事件已建立但回應逾時：重試以 sessionId 找回原事件，不重複建立', () => {
    const a = addSp('王小明');
    cal.ctl.failAfterCreate = 1;
    const s = createSession([a.spId]).sessions![0];
    expect(s.syncStatus).toBe('failed');
    expect(cal.events).toHaveLength(1);
    const r = ok(svc.dispatch('session.resync', { sessionId: s.sessionId })).sessions![0];
    expect(r.syncStatus).toBe('synced');
    expect(cal.events).toHaveLength(1);
  });

  it('取消排程：刪除 Calendar 事件、保留系統取消紀錄', () => {
    const a = addSp('王小明');
    const s = createSession([a.spId]).sessions![0];
    const r = ok(svc.dispatch('session.cancel', { sessionId: s.sessionId, reason: '課程延期', expectedVersion: s.version }));
    expect(cal.events).toHaveLength(0);
    expect(r.sessions![0].status).toBe('cancelled');
    expect(r.sessions![0].syncStatus).toBe('removed');
    expect(state.tables.sessions).toHaveLength(1);
    expect(state.tables.assignments[0].attendance).toBe('cancelled');
  });

  it('版本衝突：他人已修改時拒絕覆寫', () => {
    const a = addSp('王小明');
    const s = createSession([a.spId]).sessions![0];
    ok(svc.dispatch('session.save', { sessionId: s.sessionId, input: input([a.spId], { note: 'A' }), expectedVersion: s.version, requestId: 'x1' }));
    const r = svc.dispatch('session.save', { sessionId: s.sessionId, input: input([a.spId], { note: 'B' }), expectedVersion: s.version, requestId: 'x2' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VERSION_CONFLICT');
  });

  it('日期與時間邏輯檢查', () => {
    const a = addSp('王小明');
    const r = svc.dispatch('session.save', { input: input([a.spId], { startTime: '10:00', endTime: '09:00' }), requestId: 'bad' });
    expect(r.ok).toBe(false);
    const r2 = svc.dispatch('session.save', { input: input([a.spId], { checkinTime: '09:00', startTime: '08:30' }), requestId: 'bad2' });
    expect(r2.ok).toBe(false);
    const r3 = svc.dispatch('session.save', { input: input([a.spId], { date: '2026-02-30' }), requestId: 'bad3' });
    expect(r3.ok).toBe(false);
  });
});

describe('衝突與重複偵測', () => {
  it('同一 SP 同時段排程衝突需確認', () => {
    const a = addSp('王小明');
    createSession([a.spId]);
    const r = svc.dispatch('session.save', { input: input([a.spId], { unit: '護理部', topic: '糖尿病衛教', checkinTime: '10:30', startTime: '11:00', endTime: '12:00' }), requestId: 'c1' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('NEEDS_CONFIRMATION');
      expect(JSON.stringify(r.error.details)).toContain('conflict');
    }
    const r2 = svc.dispatch('session.save', { input: input([a.spId], { unit: '護理部', topic: '糖尿病衛教', checkinTime: '10:30', startTime: '11:00', endTime: '12:00' }), requestId: 'c1', confirm: true });
    expect(r2.ok).toBe(true);
  });

  it('不同時段不視為衝突；相同內容重複登錄會提醒', () => {
    const a = addSp('王小明'), b = addSp('李美華');
    createSession([a.spId]);
    expect(svc.dispatch('session.save', { input: input([a.spId], { checkinTime: '13:00', startTime: '13:30', endTime: '15:00' }), requestId: 'n1' }).ok).toBe(true);
    const dup = svc.dispatch('session.save', { input: input([b.spId]), requestId: 'd1' });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(JSON.stringify(dup.error.details)).toContain('duplicate');
  });
});

describe('LINE 人工提醒', () => {
  it('複製文字不會改變狀態；人工標記會保存，排程異動後提示重新通知', () => {
    const a = addSp('王小明');
    const s = createSession([a.spId]).sessions![0];
    const asg = state.tables.assignments[0];
    const text = renderIndividual(svc.getSettings().individualTemplate, s, '王小明', TODAY);
    expect(text).toContain('明日');
    expect(text).toContain('08:30–11:30');
    expect(state.tables.notifications).toHaveLength(0); // 產生文字不寫入任何紀錄

    ok(svc.dispatch('notify.mark', { assignmentIds: [asg.assignmentId], status: 'notified' }));
    let latest = latestNotifications(state.tables.notifications).get(asg.assignmentId);
    expect(latest?.markedBy).toBe('admin@chimei.org.tw');
    expect(notifyState(latest, state.tables.sessions[0], state.tables.assignments[0])).toBe('notified');

    ok(svc.dispatch('session.save', { sessionId: s.sessionId, input: input([a.spId], { checkinTime: '07:30' }), expectedVersion: s.version, requestId: 'e' }));
    latest = latestNotifications(state.tables.notifications).get(asg.assignmentId);
    expect(notifyState(latest, state.tables.sessions[0], state.tables.assignments[0])).toBe('needs_renotify');
  });
});

describe('出席與時數核定', () => {
  it('3 名 SP 各 3 小時：1 場、3 人次、9 人時；排程本身不計入實績', () => {
    const ids = ['甲', '乙', '丙'].map((n) => addSp(n).spId);
    const s = createSession(ids, { date: '2026-11-09', startTime: '09:00', endTime: '12:00' }).sessions![0];
    const data = () => ({ sessions: state.tables.sessions, assignments: state.tables.assignments, sps: state.tables.sps });
    expect(computeStats(data(), { year: 2026 }, TODAY).personTimes).toBe(0);

    // 未標記完成不可核定
    const a0 = state.tables.assignments[0];
    const bad = svc.dispatch('assignment.verify', { assignmentId: a0.assignmentId, attendance: 'present', actualStart: '09:00', actualEnd: '12:00', approvedMinutes: 180, expectedVersion: a0.version });
    expect(bad.ok).toBe(false);

    ok(svc.dispatch('session.complete', { sessionId: s.sessionId, expectedVersion: s.version }));
    for (const a of [...state.tables.assignments])
      ok(svc.dispatch('assignment.verify', { assignmentId: a.assignmentId, attendance: 'present', actualStart: '09:00', actualEnd: '12:00', approvedMinutes: 180, expectedVersion: a.version }));
    const st = computeStats(data(), { year: 2026 }, TODAY);
    expect(st.sessions).toBe(1);
    expect(st.personTimes).toBe(3);
    expect(st.minutes).toBe(540);
    expect(st.activeSps).toBe(3);
    expect(computeProfile(data(), ids[0], 2026).yearMinutes).toBe(180);
  });

  it('缺席與取消不計入成果；同場次不同 SP 可有不同時數；更正需原因並留稽核', () => {
    const ids = ['甲', '乙', '丙'].map((n) => addSp(n).spId);
    const s = createSession(ids, { date: '2026-11-09', startTime: '09:00', endTime: '12:00' }).sessions![0];
    ok(svc.dispatch('session.complete', { sessionId: s.sessionId, expectedVersion: s.version }));
    const [a, b, c] = state.tables.assignments;
    ok(svc.dispatch('assignment.verify', { assignmentId: a.assignmentId, attendance: 'present', actualStart: '09:00', actualEnd: '12:00', approvedMinutes: 180, expectedVersion: a.version }));
    ok(svc.dispatch('assignment.verify', { assignmentId: b.assignmentId, attendance: 'present', actualStart: '09:00', actualEnd: '10:30', approvedMinutes: 90, expectedVersion: b.version }));
    ok(svc.dispatch('assignment.verify', { assignmentId: c.assignmentId, attendance: 'absent', expectedVersion: c.version }));
    const data = () => ({ sessions: state.tables.sessions, assignments: state.tables.assignments, sps: state.tables.sps });
    let st = computeStats(data(), { year: 2026 }, TODAY);
    expect(st.personTimes).toBe(2);
    expect(st.minutes).toBe(270);

    const cur = state.tables.assignments.find((x) => x.assignmentId === b.assignmentId)!;
    const noReason = svc.dispatch('assignment.verify', { assignmentId: cur.assignmentId, attendance: 'present', actualStart: '09:00', actualEnd: '11:00', approvedMinutes: 120, expectedVersion: cur.version });
    expect(noReason.ok).toBe(false);
    ok(svc.dispatch('assignment.verify', { assignmentId: cur.assignmentId, attendance: 'present', actualStart: '09:00', actualEnd: '11:00', approvedMinutes: 120, expectedVersion: cur.version, reason: '簽到表更正' }));
    st = computeStats(data(), { year: 2026 }, TODAY);
    expect(st.minutes).toBe(300);
    expect(state.tables.audit.some((x) => x.action === 'correct' && x.note === '簽到表更正')).toBe(true);

    // 核定分鐘不可超過實際時間
    const over = state.tables.assignments.find((x) => x.assignmentId === a.assignmentId)!;
    expect(svc.dispatch('assignment.verify', { assignmentId: over.assignmentId, attendance: 'present', actualStart: '09:00', actualEnd: '10:00', approvedMinutes: 90, expectedVersion: over.version, reason: 'x' }).ok).toBe(false);
  });

  it('已取消排程不計入；未到日期不可完成', () => {
    const a = addSp('甲');
    const future = createSession([a.spId], { date: '2026-12-01' }).sessions![0];
    expect(svc.dispatch('session.complete', { sessionId: future.sessionId, expectedVersion: future.version }).ok).toBe(false);
    ok(svc.dispatch('session.cancel', { sessionId: future.sessionId, reason: '取消', expectedVersion: future.version }));
    const st = computeStats({ sessions: state.tables.sessions, assignments: state.tables.assignments, sps: state.tables.sps }, { year: 2026 }, TODAY);
    expect(st.personTimes).toBe(0);
    expect(st.statusCounts.cancelled).toBe(1);
  });

  it('SP 改名不影響歷史關聯', () => {
    const a = addSp('王小明');
    createSession([a.spId], { date: '2026-11-09' });
    ok(svc.dispatch('sp.save', { spId: a.spId, input: { name: '王曉明' }, expectedVersion: a.version }));
    expect(state.tables.assignments[0].spId).toBe(a.spId);
    expect(state.tables.sps[0].name).toBe('王曉明');
  });
});

describe('權限', () => {
  it('未登入與未授權帳號無法存取資料', () => {
    env.setUser('');
    const r1 = svc.dispatch('bootstrap', {});
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe('UNAUTHENTICATED');
    env.setUser('stranger@gmail.com');
    const r2 = svc.dispatch('bootstrap', {});
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('FORBIDDEN');
    const r3 = svc.dispatch('sp.save', { input: { name: 'x' } });
    expect(r3.ok).toBe(false);
  });
});
