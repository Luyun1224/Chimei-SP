/// <reference types="google-apps-script" />
import type { Repo } from '../ports';
import { SETTINGS_SHEET, TABLES, fromRow, toRow, type RowTypes, type TableName, type TableDef } from '../schema';
import { AppError, sheetSafe } from '../../shared/validate';
import { TZ } from '../../shared/time';

type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

export function fmtGasDate(d: Date, kind: 'date' | 'time' | 'datetime'): string {
  if (kind === 'date') return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  if (kind === 'time') return Utilities.formatDate(d, TZ, 'HH:mm');
  return Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

const unescape = (v: unknown) => (typeof v === 'string' && /^'[=+@]/.test(v) ? v.slice(1) : v);

interface Loaded {
  sheet: Sheet;
  header: string[];
  rows: Record<string, unknown>[];
  /** 對應試算表的實際列號（1-based） */
  rowNumbers: number[];
  ids: string[];
}

export function createSheetsRepo(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): Repo {
  const cache = new Map<TableName, Loaded>();
  let settingsCache: Record<string, string> | null = null;

  function sheetOf(name: string): Sheet {
    const sh = ss.getSheetByName(name);
    if (!sh) throw new AppError('NOT_CONFIGURED', `找不到工作表「${name}」，請先執行 setupSpreadsheet 初始化`);
    return sh;
  }

  function load(t: TableName): Loaded {
    const hit = cache.get(t);
    if (hit) return hit;
    const def = TABLES[t] as unknown as TableDef<RowTypes[TableName]>;
    const sheet = sheetOf(def.sheet);
    const values = sheet.getDataRange().getValues();
    const header = (values[0] || []).map(String);
    const idIdx = header.indexOf(def.idKey);
    if (idIdx < 0) throw new AppError('NOT_CONFIGURED', `工作表「${def.sheet}」缺少主鍵欄位 ${def.idKey}`);
    const rows: Record<string, unknown>[] = [], rowNumbers: number[] = [], ids: string[] = [];
    for (let i = 1; i < values.length; i++) {
      const id = String(values[i][idIdx] || '');
      if (!id) continue;
      const obj = fromRow(t, header, values[i].map(unescape), fmtGasDate) as unknown as Record<string, unknown>;
      rows.push(obj);
      rowNumbers.push(i + 1);
      ids.push(id);
    }
    const loaded = { sheet, header, rows, rowNumbers, ids };
    cache.set(t, loaded);
    return loaded;
  }

  /** 依試算表實際表頭順序輸出，允許管理員在表頭後方自行加欄 */
  function toSheetRow<K extends TableName>(t: K, header: string[], obj: RowTypes[K]): string[] {
    const def = TABLES[t] as unknown as TableDef<RowTypes[K]>;
    const vals = toRow(t, obj);
    return header.map((h) => {
      const i = def.columns.findIndex((c) => c.key === h);
      return i >= 0 ? sheetSafe(vals[i]) : '';
    });
  }

  return {
    refresh() {
      cache.clear();
      settingsCache = null;
      SpreadsheetApp.flush();
    },
    all<K extends TableName>(t: K) {
      return load(t).rows.map((r) => ({ ...r })) as unknown as RowTypes[K][];
    },
    insert(t, rows) {
      if (!rows.length) return;
      const L = load(t);
      const data = rows.map((r) => toSheetRow(t, L.header, r));
      const start = L.sheet.getLastRow() + 1;
      const range = L.sheet.getRange(start, 1, data.length, L.header.length);
      range.setNumberFormat('@');
      range.setValues(data);
      const idKey = TABLES[t].idKey as string;
      rows.forEach((r, i) => {
        L.rows.push({ ...(r as unknown as Record<string, unknown>) });
        L.rowNumbers.push(start + i);
        L.ids.push(String((r as unknown as Record<string, unknown>)[idKey]));
      });
    },
    update(t, row) {
      const L = load(t);
      const idKey = TABLES[t].idKey as string;
      const id = String((row as unknown as Record<string, unknown>)[idKey]);
      const i = L.ids.indexOf(id);
      if (i < 0) throw new AppError('NOT_FOUND', '找不到要更新的資料列：' + id);
      const range = L.sheet.getRange(L.rowNumbers[i], 1, 1, L.header.length);
      range.setNumberFormat('@');
      range.setValues([toSheetRow(t, L.header, row)]);
      L.rows[i] = { ...(row as unknown as Record<string, unknown>) };
    },
    getSettings() {
      if (settingsCache) return { ...settingsCache };
      const values = sheetOf(SETTINGS_SHEET).getDataRange().getValues();
      const out: Record<string, string> = {};
      for (let i = 1; i < values.length; i++) if (values[i][0]) out[String(values[i][0])] = String(unescape(values[i][1]) ?? '');
      settingsCache = out;
      return { ...out };
    },
    setSettings(kv) {
      const sh = sheetOf(SETTINGS_SHEET);
      const values = sh.getDataRange().getValues();
      const now = fmtGasDate(new Date(), 'datetime');
      for (const [k, v] of Object.entries(kv)) {
        const idx = values.findIndex((r, i) => i > 0 && r[0] === k);
        if (idx > 0) sh.getRange(idx + 1, 2, 1, 2).setValues([[sheetSafe(v), now]]);
        else {
          sh.appendRow([k, sheetSafe(v), now]);
          values.push([k, v, now]);
        }
      }
      settingsCache = null;
    },
  };
}
