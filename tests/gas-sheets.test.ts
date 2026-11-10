/**
 * 以模擬的 SpreadsheetApp 物件驗證 Apps Script 的 Sheets 存取層：
 * 表頭對應、以主鍵更新正確列、公式注入防護、Sheets 自動轉型（Date）回讀。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createSheetsRepo } from '../server/gas/sheetsRepo';
import { createService } from '../server/service';
import { createMemoryEnv, createMockCalendar } from '../server/mock/memory';
import { SETTINGS_SHEET, TABLES } from '../server/schema';

class FakeSheet {
  rows: unknown[][] = [];
  constructor(public name: string) {}
  getDataRange() { return { getValues: () => this.rows.map((r) => [...r]) }; }
  getLastRow() { return this.rows.length; }
  getRange(r: number, c: number, nr = 1, nc = 1) {
    return {
      setNumberFormat: () => {},
      setValues: (vals: unknown[][]) => {
        for (let i = 0; i < nr; i++) {
          while (this.rows.length < r + i) this.rows.push([]);
          for (let j = 0; j < nc; j++) this.rows[r - 1 + i][c - 1 + j] = vals[i][j];
        }
      },
    };
  }
  appendRow(row: unknown[]) { this.rows.push([...row]); }
}

const sheets = new Map<string, FakeSheet>();
const ss = { getSheetByName: (n: string) => sheets.get(n) || null } as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet;

beforeAll(() => {
  (globalThis as Record<string, unknown>).SpreadsheetApp = { flush: () => {} };
  (globalThis as Record<string, unknown>).Utilities = {
    formatDate: (d: Date, _tz: string, f: string) => {
      const t = new Date(d.getTime() + 8 * 3600e3).toISOString();
      if (f === 'yyyy-MM-dd') return t.slice(0, 10);
      if (f === 'HH:mm') return t.slice(11, 16);
      return t.slice(0, 19) + '+08:00';
    },
  };
  for (const t of Object.values(TABLES)) {
    const sh = new FakeSheet(t.sheet);
    sh.rows.push(t.columns.map((c) => c.key));
    sheets.set(t.sheet, sh);
  }
  const st = new FakeSheet(SETTINGS_SHEET);
  st.rows.push(['key', 'value', 'updatedAt'], ['calendarId', 'cal@group.calendar.google.com', '']);
  sheets.set(SETTINGS_SHEET, st);
});

describe('Apps Script Sheets 存取層', () => {
  it('完整流程寫入對應工作表與欄位，更新以主鍵定位正確列', () => {
    const cal = createMockCalendar();
    const env = createMemoryEnv({ user: 'a@x.org', admins: ['a@x.org'], today: () => '2026-11-10', now: () => '2026-11-10T09:00:00+08:00' });
    const svc = createService({ repo: createSheetsRepo(ss), env, calendar: cal.gateway });
    const sp1 = svc.dispatch('sp.save', { input: { name: '=HYPERLINK("x")' } });
    expect(sp1.ok).toBe(true);
    const sp2 = svc.dispatch('sp.save', { input: { name: '李美華' } });
    const ids = [sp1, sp2].map((r) => (r.ok ? r.data.sps![0].spId : ''));
    const r = svc.dispatch('session.save', { input: { date: '2026-11-09', unit: '護理部', topic: '衛教', checkinTime: '08:00', startTime: '08:30', endTime: '10:30', location: 'A', spIds: ids }, requestId: 'r1' });
    expect(r.ok).toBe(true);
    const sessions = sheets.get('Performance_Sessions')!.rows;
    const assigns = sheets.get('Performance_Assignments')!.rows;
    expect(sessions).toHaveLength(2);
    expect(assigns).toHaveLength(3);
    const h = sessions[0] as string[];
    expect(sessions[1][h.indexOf('date')]).toBe('2026-11-09');
    expect(sessions[1][h.indexOf('syncStatus')]).toBe('synced');
    expect(sheets.get('SP_Master')!.rows[1][1]).toBe(`'=HYPERLINK("x")`); // 公式注入防護

    // 模擬 Sheets 自動把日期欄轉成 Date 物件後，仍能正確讀回
    sessions[1][h.indexOf('date')] = new Date('2026-11-09T00:00:00+08:00');
    const svc2 = createService({ repo: createSheetsRepo(ss), env, calendar: cal.gateway });
    const boot = svc2.dispatch('bootstrap', {});
    expect(boot.ok && boot.data.sessions[0].date).toBe('2026-11-09');
    expect(boot.ok && boot.data.sps[0].name).toBe('=HYPERLINK("x")');

    const sid = boot.ok ? boot.data.sessions[0].sessionId : '';
    expect(svc2.dispatch('session.complete', { sessionId: sid, expectedVersion: 1 }).ok).toBe(true);
    const v = svc2.dispatch('session.verifyAllAsScheduled', { sessionId: sid });
    expect(v.ok).toBe(true);
    const ah = assigns[0] as string[];
    expect(assigns.slice(1).every((row) => row[ah.indexOf('approvedMinutes')] === '120' && row[ah.indexOf('verifyStatus')] === 'verified')).toBe(true);
    expect(sessions.length).toBe(2); // 更新未新增列
    expect(cal.events).toHaveLength(1);
  });
});
