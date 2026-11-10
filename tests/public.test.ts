/** 公開檢視：伺服器端去識別化，任何 SP 個資都不得出現在回應中 */
import { describe, expect, it } from 'vitest';
import { createService } from '../server/service';
import { createMemoryEnv, createMemoryRepo, createMockCalendar, emptyState } from '../server/mock/memory';
import { maskName, publicDispatch } from '../server/public';
import type { ApiResponse, Snapshot } from '../shared/types';

describe('公開檢視去識別化', () => {
  it('姓名遮蔽', () => {
    expect(maskName('王小明')).toBe('王○明');
    expect(maskName('李華')).toBe('李○');
    expect(maskName('歐陽小明')).toBe('歐○○明');
  });

  it('回應中不含任何 SP 個資，且只能讀取', () => {
    const state = emptyState();
    const env = createMemoryEnv({ user: 'admin@chimei.org.tw', admins: ['admin@chimei.org.tw'], today: () => '2026-11-10' });
    const svc = createService({ repo: createMemoryRepo(state), env, calendar: createMockCalendar().gateway });
    const PII = {
      name: '黃惠玲', phone: '0912345678', email: 'sp.private@gmail.com', lineNote: 'LINE暱稱小玲', gender: '女', birthday: '52.11.12',
      firstCertYear: '101', assocCert: '113-115', certNo: '(113)0377', role: 'SPT', level: 'SP2', certStatus: '符合', isMember: '是', note: '住址台南市某某路',
    };
    const sp = (svc.dispatch('sp.save', { input: PII }) as { ok: true; data: { sps: { spId: string }[] } }).data.sps[0];
    svc.dispatch('settings.save', { patch: { calendarId: 'owner.private@gmail.com' } });
    const r = svc.dispatch('session.save', { input: { date: '2026-11-09', unit: '護理部', topic: '跌倒', checkinTime: '08:00', startTime: '08:30', endTime: '10:30', location: '技能中心', note: '聯絡黃惠玲 0912345678', spIds: [sp.spId] }, requestId: 'p1' }) as { ok: true; data: { sessions: { sessionId: string; version: number }[] } };
    const sid = r.data.sessions[0].sessionId;
    svc.dispatch('session.complete', { sessionId: sid, expectedVersion: r.data.sessions[0].version });
    const a = state.tables.assignments[0];
    svc.dispatch('assignment.verify', { assignmentId: a.assignmentId, attendance: 'present', actualStart: '08:30', actualEnd: '10:30', approvedMinutes: 120, minutesNote: '領取費用 1000 元', expectedVersion: a.version });
    svc.dispatch('notify.mark', { assignmentIds: [a.assignmentId], status: 'notified' });

    const pub = publicDispatch('bootstrap', () => svc.dispatch('bootstrap', {}) as ApiResponse<Snapshot>) as ApiResponse<Snapshot>;
    expect(pub.ok).toBe(true);
    const text = JSON.stringify(pub);
    for (const v of ['黃惠玲', '0912345678', 'sp.private@gmail.com', 'LINE暱稱小玲', '52.11.12', '(113)0377', '住址', '1000 元', 'owner.private@gmail.com', 'admin@chimei.org.tw', '113-115'])
      expect(text, `不應出現：${v}`).not.toContain(v);
    if (pub.ok) {
      expect(pub.data.access).toBe('public');
      expect(pub.data.sps[0].name).toBe('黃○玲');
      expect(pub.data.sps[0].gender).toBe('');
      expect(pub.data.assignments[0].approvedMinutes).toBe(120); // 統計仍可計算
      expect(pub.data.notifications).toHaveLength(0);
    }
    for (const act of ['sp.save', 'session.save', 'session.cancel', 'assignment.verify', 'notify.mark', 'settings.save', 'audit.list', 'system.accessCode'])
      expect(publicDispatch(act, () => svc.dispatch('bootstrap', {}) as ApiResponse<Snapshot>).ok, act).toBe(false);
  });
});
