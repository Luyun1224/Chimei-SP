/**
 * 以模擬的 SpreadsheetApp 物件驗證 Apps Script 的 Sheets 存取層：
 * 中文工作表／表頭／狀態值、舊版英文工作表升級、公式注入防護、Sheets 自動轉型回讀。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createSheetsRepo } from '../server/gas/sheetsRepo';
import { setupSpreadsheet } from '../server/gas/main';
import { createService } from '../server/service';
import { createMemoryEnv, createMockCalendar } from '../server/mock/memory';
import { SETTINGS_SHEET, TABLES } from '../server/schema';

class FakeSheet {
  rows: unknown[][] = [];
  constructor(public name: string, private book: FakeBook) {}
  getName() { return this.name; }
  setName(n: string) { this.book.sheets.delete(this.name); this.name = n; this.book.sheets.set(n, this); return this; }
  getDataRange() { return { getValues: () => this.rows.map((r) => [...r]) }; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0, ...this.rows.map((r) => r.length)); }
  getMaxRows() { return Math.max(1000, this.rows.length); }
  clearContents() { this.rows = []; }
  setFrozenRows() {}
  setColumnWidth() { return this; }
  getProtections() { return []; }
  getRange(r: number, c: number, nr = 1, nc = 1) {
    const range = {
      getValues: () => this.rows.slice(r - 1, r - 1 + nr).map((row) => Array.from({ length: nc }, (_, j) => row[c - 1 + j] ?? '')),
      setNumberFormat: () => range, setFontWeight: () => range, setBackground: () => range, setFontColor: () => range,
      protect: () => ({ setDescription: () => ({ setWarningOnly: () => {} }) }),
      setValues: (vals: unknown[][]) => {
        for (let i = 0; i < nr; i++) {
          while (this.rows.length < r + i) this.rows.push([]);
          for (let j = 0; j < nc; j++) this.rows[r - 1 + i][c - 1 + j] = vals[i][j];
        }
        return range;
      },
    };
    return range;
  }
  appendRow(row: unknown[]) { this.rows.push([...row]); }
}
class FakeBook {
  sheets = new Map<string, FakeSheet>();
  getSheetByName(n: string) { return this.sheets.get(n) || null; }
  insertSheet(n: string) { const s = new FakeSheet(n, this); this.sheets.set(n, s); return s; }
  getSheets() { return [...this.sheets.values()]; }
  deleteSheet(s: FakeSheet) { this.sheets.delete(s.name); }
  setSpreadsheetTimeZone() {}
  getUrl() { return 'https://sheet'; }
  getId() { return 'ID'; }
}

let book: FakeBook;
const ss = () => book as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet;

beforeEach(() => {
  book = new FakeBook();
  const props: Record<string, string> = { SPREADSHEET_ID: 'ID', ADMIN_EMAILS: 'a@x.org' };
  Object.assign(globalThis as Record<string, unknown>, {
    SpreadsheetApp: { flush: () => {}, openById: () => book, ProtectionType: { RANGE: 'RANGE' } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => (props[k] = v) }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'a@x.org' }) },
    Logger: { log: () => {} },
    Utilities: {
      formatDate: (d: Date, _tz: string, f: string) => {
        const t = new Date(d.getTime() + 8 * 3600e3).toISOString();
        if (f === 'yyyy-MM-dd') return t.slice(0, 10);
        if (f === 'HH:mm') return t.slice(11, 16);
        return t.slice(0, 19) + '+08:00';
      },
    },
  });
});

const env = () => createMemoryEnv({ user: 'a@x.org', admins: ['a@x.org'], today: () => '2026-11-10', now: () => '2026-11-10T09:00:00+08:00' });

describe('Apps Script Sheets 存取層（中文工作表）', () => {
  it('初始化建立中文工作表與表頭，完整流程寫入中文狀態值', () => {
    setupSpreadsheet();
    expect([...book.sheets.keys()].sort()).toEqual(['LINE通知紀錄', 'SP人員主檔', '演出明細', '演出排程', '異動紀錄', '系統設定'].sort());
    expect(book.getSheetByName('演出排程')!.rows[0].slice(0, 4)).toEqual(['排程編號', '演出日期', '申請單位', '教案主題']);
    const st = book.getSheetByName(SETTINGS_SHEET)!.rows;
    expect(st[0]).toEqual(['設定項目', '設定值', '更新時間']);
    expect(st.some((r) => r[0] === 'Google日曆ID')).toBe(true);

    const cal = createMockCalendar();
    const svc = createService({ repo: createSheetsRepo(ss()), env: env(), calendar: cal.gateway });
    expect(svc.dispatch('settings.save', { patch: { calendarId: 'cal@group.calendar.google.com', units: ['護理部', '醫學系'] } }).ok).toBe(true);
    const units = st.find((r) => r[0] === '常用申請單位');
    expect(book.getSheetByName(SETTINGS_SHEET)!.rows.find((r) => r[0] === '常用申請單位')![1]).toBe('護理部\n醫學系');
    void units;

    const sp1 = svc.dispatch('sp.save', { input: { name: '=HYPERLINK("x")' } });
    expect(sp1.ok).toBe(true);
    const r = svc.dispatch('session.save', { input: { date: '2026-11-09', unit: '護理部', topic: '衛教', checkinTime: '08:00', startTime: '08:30', endTime: '10:30', location: 'A', spIds: [], newSpNames: ['郭志鴻', '李美華'] }, requestId: 'r1' });
    expect(r.ok).toBe(true);
    const sessions = book.getSheetByName('演出排程')!.rows;
    const h = sessions[0] as string[];
    expect(sessions[1][h.indexOf('演出日期')]).toBe('2026-11-09');
    expect(sessions[1][h.indexOf('排程狀態')]).toBe('預定');
    expect(sessions[1][h.indexOf('日曆同步狀態')]).toBe('已同步');
    expect(sessions[1][h.indexOf('已刪除')]).toBe('否');
    expect(book.getSheetByName('SP人員主檔')!.rows[1][1]).toBe(`'=HYPERLINK("x")`);
    expect(book.getSheetByName('SP人員主檔')!.rows[1][5]).toBe('在職');

    // 重新讀取：中文 → 代碼；Sheets 自動轉 Date 也能還原
    sessions[1][h.indexOf('演出日期')] = new Date('2026-11-09T00:00:00+08:00');
    const svc2 = createService({ repo: createSheetsRepo(ss()), env: env(), calendar: cal.gateway });
    const boot = svc2.dispatch('bootstrap', {});
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;
    expect(boot.data.sessions[0].date).toBe('2026-11-09');
    expect(boot.data.sessions[0].status).toBe('scheduled');
    expect(boot.data.settings.units).toEqual(['護理部', '醫學系']);
    expect(boot.data.settings.calendarId).toBe('cal@group.calendar.google.com');

    const sid = boot.data.sessions[0].sessionId;
    expect(svc2.dispatch('session.complete', { sessionId: sid, expectedVersion: 1 }).ok).toBe(true);
    expect(svc2.dispatch('session.verifyAllAsScheduled', { sessionId: sid }).ok).toBe(true);
    const as = book.getSheetByName('演出明細')!.rows;
    const ah = as[0] as string[];
    expect(as.slice(1).every((row) => row[ah.indexOf('核定分鐘數')] === '120' && row[ah.indexOf('核定狀態')] === '已核定' && row[ah.indexOf('出席狀態')] === '已出席')).toBe(true);
    expect(sessions.length).toBe(2);
    expect(cal.events).toHaveLength(1);
    expect(book.getSheetByName('異動紀錄')!.rows.slice(1).some((row) => row[5] === '核定')).toBe(true);
  });

  it('舊版英文工作表：可直接讀取，執行初始化後轉為中文且資料保留', () => {
    // 建立舊版英文結構與資料
    for (const t of Object.values(TABLES)) {
      const sh = book.insertSheet(t.legacySheet);
      sh.rows.push(t.columns.map((c) => c.key));
    }
    const legacySettings = book.insertSheet('System_Settings');
    legacySettings.rows.push(['key', 'value', 'updatedAt'], ['calendarId', 'old@group.calendar.google.com', ''], ['units', '["護理部"]', '']);
    const spSheet = book.getSheetByName('SP_Master')!;
    const spRow = TABLES.sps.columns.map((c) => ({ spId: 'SP-1', name: '王小明', status: 'paused', version: '1' } as Record<string, string>)[c.key] ?? '');
    spSheet.rows.push(spRow);

    const before = createService({ repo: createSheetsRepo(ss()), env: env(), calendar: createMockCalendar().gateway }).dispatch('bootstrap', {});
    expect(before.ok && before.data.sps[0].status).toBe('paused');
    expect(before.ok && before.data.settings.units).toEqual(['護理部']);

    setupSpreadsheet();
    expect(book.getSheetByName('SP_Master')).toBeNull();
    const sp = book.getSheetByName('SP人員主檔')!.rows;
    expect(sp[0][0]).toBe('SP編號');
    expect(sp[1][1]).toBe('王小明');
    expect(sp[1][5]).toBe('暫停');
    const st = book.getSheetByName('系統設定')!.rows;
    expect(st.find((r) => r[0] === 'Google日曆ID')![1]).toBe('old@group.calendar.google.com');
    expect(st.find((r) => r[0] === '常用申請單位')![1]).toBe('護理部');

    const after = createService({ repo: createSheetsRepo(ss()), env: env(), calendar: createMockCalendar().gateway }).dispatch('bootstrap', {});
    expect(after.ok && after.data.sps[0]).toMatchObject({ spId: 'SP-1', name: '王小明', status: 'paused' });
    expect(after.ok && after.data.settings.calendarId).toBe('old@group.calendar.google.com');
  });

  it('綁定的試算表：setupSpreadsheet 直接使用它，不另外建立新檔', () => {
    const props: Record<string, string> = { ADMIN_EMAILS: 'a@x.org', SPREADSHEET_ID: 'OTHER' };
    let created = 0;
    Object.assign(globalThis as Record<string, unknown>, {
      SpreadsheetApp: { flush: () => {}, getActiveSpreadsheet: () => book, openById: () => { throw new Error('should not open by id'); }, create: () => { created++; return book; }, ProtectionType: { RANGE: 'RANGE' } },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => (props[k] = v) }) },
    });
    setupSpreadsheet();
    setupSpreadsheet();
    expect(created).toBe(0);
    expect(props.SPREADSHEET_ID).toBe('ID');
    expect(book.getSheetByName('演出排程')).not.toBeNull();
  });
});
