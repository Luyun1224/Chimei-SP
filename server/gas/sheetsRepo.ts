/// <reference types="google-apps-script" />
import type { Repo } from '../ports';
import { LEGACY_SETTINGS_SHEET, SETTINGS_SHEET, SETTING_LABELS, TABLES, colIndex, fromRow, toRow, type RowTypes, type TableName, type TableDef } from '../schema';
import { DEFAULT_SETTINGS } from '../../shared/template';
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

  /** 先找中文工作表，找不到再找舊版英文工作表 */
  function sheetOf(name: string, legacy?: string): Sheet {
    const sh = ss.getSheetByName(name) || (legacy ? ss.getSheetByName(legacy) : null);
    if (!sh) throw new AppError('NOT_CONFIGURED', `找不到工作表「${name}」，請先執行 setupSpreadsheet 初始化`);
    return sh;
  }

  function load(t: TableName): Loaded {
    const hit = cache.get(t);
    if (hit) return hit;
    const def = TABLES[t] as unknown as TableDef<RowTypes[TableName]>;
    const sheet = sheetOf(def.sheet, def.legacySheet);
    const values = sheet.getDataRange().getValues();
    const header = (values[0] || []).map(String);
    // 新版本新增的欄位：自動補在表頭最後（不需重新執行 setupSpreadsheet）
    const missing = def.columns.filter((c) => !c.compute && colIndex(header, c) < 0).map((c) => c.label);
    if (missing.length && header.length) {
      sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
      header.push(...missing);
    }
    const idCol = def.columns.find((c) => c.key === def.idKey)!;
    const idIdx = colIndex(header, idCol);
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
      const i = def.columns.findIndex((c) => c.label === h || c.key === h || (c.alt || []).includes(h));
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
      // 只新增不讀取的表（異動紀錄、通知紀錄）：不載入整張表，只讀表頭後直接附加，加快儲存速度
      if (!cache.has(t) && (t === 'audit' || t === 'notifications')) {
        const def = TABLES[t] as unknown as TableDef<RowTypes[TableName]>;
        const sheet = sheetOf(def.sheet, def.legacySheet);
        const cols = Math.max(1, sheet.getLastColumn());
        const header = sheet.getRange(1, 1, 1, cols).getValues()[0].map(String);
        const data = rows.map((r) => toSheetRow(t, header, r));
        const range = sheet.getRange(sheet.getLastRow() + 1, 1, data.length, header.length);
        range.setNumberFormat('@');
        range.setValues(data);
        return;
      }
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
      // 既有資料列已是純文字格式，直接寫入（少一次 Sheets 呼叫）
      L.sheet.getRange(L.rowNumbers[i], 1, 1, L.header.length).setValues([toSheetRow(t, L.header, row)]);
      L.rows[i] = { ...(row as unknown as Record<string, unknown>) };
    },
    getSettings() {
      if (settingsCache) return { ...settingsCache };
      const values = sheetOf(SETTINGS_SHEET, LEGACY_SETTINGS_SHEET).getDataRange().getValues();
      const out: Record<string, string> = {};
      for (let i = 1; i < values.length; i++) {
        const key = settingKeyOf(String(values[i][0] || ''));
        if (key) out[key] = settingFromSheet(key, String(unescape(values[i][1]) ?? ''));
      }
      settingsCache = out;
      return { ...out };
    },
    setSettings(kv) {
      const sh = sheetOf(SETTINGS_SHEET, LEGACY_SETTINGS_SHEET);
      const values = sh.getDataRange().getValues();
      const now = fmtGasDate(new Date(), 'datetime');
      for (const [k, v] of Object.entries(kv)) {
        const label = SETTING_LABELS[k as keyof typeof SETTING_LABELS] || k;
        const idx = values.findIndex((r, i) => i > 0 && (r[0] === label || r[0] === k));
        const shown = sheetSafe(settingToSheet(k, v));
        if (idx > 0) sh.getRange(idx + 1, 1, 1, 3).setValues([[label, shown, now]]);
        else {
          sh.appendRow([label, shown, now]);
          values.push([label, shown, now]);
        }
      }
      settingsCache = null;
    },
  };
}

// ---------- 系統設定：中文項目名稱與易讀的值 ----------

/** 中文項目名稱或英文代碼 → 設定代碼 */
export function settingKeyOf(name: string): string {
  const hit = Object.entries(SETTING_LABELS).find(([k, label]) => label === name || k === name);
  return hit ? hit[0] : '';
}

/** 服務層使用 JSON 字串；工作表上改為易讀格式：清單每行一項、布林為 是/否 */
export function settingToSheet(key: string, json: string): string {
  const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
  if (typeof def === 'string') return json;
  try {
    const v = JSON.parse(json);
    if (Array.isArray(v)) return v.join('\n');
    if (typeof v === 'boolean') return v ? '是' : '否';
    return String(v);
  } catch {
    return json;
  }
}

export function settingFromSheet(key: string, shown: string): string {
  const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
  if (typeof def === 'string') return shown;
  const t = shown.trim();
  if (t.startsWith('[') || t === 'true' || t === 'false') return t; // 舊版 JSON 格式
  if (Array.isArray(def)) return JSON.stringify(t ? t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : []);
  if (typeof def === 'boolean') return JSON.stringify(['是', 'TRUE', 'Y', '1'].includes(t));
  if (typeof def === 'number') return t === '' ? '' : JSON.stringify(Number(t));
  return t;
}
