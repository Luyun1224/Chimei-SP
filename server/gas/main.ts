/// <reference types="google-apps-script" />
/**
 * Apps Script 入口。由 scripts/build-gas.mjs 打包為 gas/Code.js，
 * 並產生頂層函式 doGet / api / setupSpreadsheet / healthCheck 供 Apps Script 呼叫。
 *
 * 安全模型：
 *  - Web App 以「存取網頁應用程式的使用者」身分執行（USER_ACCESSING），Google 端強制登入。
 *  - 每次呼叫都以 Session.getActiveUser() 對照 Script Properties 的 ADMIN_EMAILS 白名單。
 *  - 試算表與行事曆只分享給管理員，非管理員即使取得網址也無法讀寫資料。
 *  - 不使用任何 Client Secret / Refresh Token / 服務帳戶金鑰。
 */
import { createService } from '../service';
import { createSheetsRepo, fmtGasDate, settingFromSheet, settingKeyOf, settingToSheet } from './sheetsRepo';
import { gasCalendar } from './calendarGateway';
import { LEGACY_SETTINGS_SHEET, SETTINGS_HEADER, SETTINGS_SHEET, SETTING_LABELS, TABLES, fromRow, toRow, type TableName } from '../schema';
import { DEFAULT_SETTINGS } from '../../shared/template';
import { TZ } from '../../shared/time';
import type { Env } from '../ports';
import type { ActionName, HealthReport } from '../../shared/types';

const props = () => PropertiesService.getScriptProperties();

function adminList(): string[] {
  return (props().getProperty('ADMIN_EMAILS') || '')
    .split(/[,\s;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
function currentEmail(): string {
  return (Session.getActiveUser().getEmail() || '').toLowerCase();
}
/** 綁定的試算表（從 Google 試算表「擴充功能 → Apps Script」建立的專案） */
function boundSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet | null {
  try {
    return SpreadsheetApp.getActiveSpreadsheet() || null;
  } catch {
    return null;
  }
}

/** 優先使用綁定的試算表；獨立專案才使用 Script Properties 的 SPREADSHEET_ID */
function openSpreadsheet() {
  const bound = boundSpreadsheet();
  if (bound) return bound;
  const id = props().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('找不到資料試算表：請從 Google 試算表的「擴充功能 → Apps Script」開啟本專案，或在 Script Properties 設定 SPREADSHEET_ID');
  return SpreadsheetApp.openById(id);
}

function buildEnv(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): Env {
  return {
    user: currentEmail,
    isAdmin: (email) => adminList().includes(email.toLowerCase()),
    nowIso: () => fmtGasDate(new Date(), 'datetime'),
    today: () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'),
    randomId: () => Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(),
    withLock(fn) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(25000)) throw new Error('lock timeout');
      try {
        return fn();
      } finally {
        SpreadsheetApp.flush();
        lock.releaseLock();
      }
    },
    backup() {
      const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmm');
      const copy = SpreadsheetApp.create(`SP Performance Hub 備份 ${stamp}`);
      const names = [...Object.values(TABLES).map((t) => t.sheet), SETTINGS_SHEET];
      for (const n of names) {
        const sh = ss.getSheetByName(n);  // 中文工作表（setupSpreadsheet 後）
        if (sh) sh.copyTo(copy).setName(n);
      }
      const first = copy.getSheets()[0];
      if (first.getName().startsWith('Sheet') || first.getName().startsWith('工作表')) copy.deleteSheet(first);
      return { name: copy.getName(), url: copy.getUrl() };
    },
    health(): HealthReport {
      const settingsCal = (() => {
        try {
          return createSheetsRepo(ss).getSettings().calendarId || '';
        } catch {
          return '';
        }
      })();
      let calendarOk = false, calendarName = '', calendarError = '';
      if (!settingsCal) calendarError = '尚未設定 Calendar ID';
      else {
        try {
          const cal = settingsCal === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(settingsCal);
          if (!cal) calendarError = '找不到行事曆或沒有權限';
          else {
            calendarOk = true;
            calendarName = cal.getName();
          }
        } catch (e) {
          calendarError = String((e as Error).message || e);
        }
      }
      return {
        spreadsheetOk: true,
        spreadsheetName: ss.getName(),
        sheets: [...Object.values(TABLES).map((t) => [t.sheet, t.legacySheet]), [SETTINGS_SHEET, LEGACY_SETTINGS_SHEET]].map(([name, legacy]) => {
          const sh = ss.getSheetByName(name) || ss.getSheetByName(legacy);
          return { name, ok: !!sh, rows: sh ? Math.max(0, sh.getLastRow() - 1) : 0 };
        }),
        calendarOk,
        calendarName,
        calendarError,
        user: currentEmail(),
        timezone: Session.getScriptTimeZone(),
      };
    },
  };
}

// ---------------- Web App ----------------

/** 前端程式（app.js / app.css）放在 GitHub Pages；可用 Script Property APP_BASE_URL 覆寫 */
const DEFAULT_APP_BASE = 'https://luyun1224.github.io/Chimei-SP/app/';

function appShell(): string {
  const base = (props().getProperty('APP_BASE_URL') || DEFAULT_APP_BASE).replace(/\/?$/, '/');
  if (!/^https:\/\/[\w.-]+\//.test(base)) throw new Error('APP_BASE_URL 必須是 https 網址');
  // 每 10 分鐘換一次版本參數，避免瀏覽器長時間使用舊版前端
  const v = Math.floor(Date.now() / 600000);
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&family=Noto+Serif+TC:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${base}app.css?v=${v}">
<style>#boot{font-family:system-ui,"Noto Sans TC",sans-serif;color:#284A45;display:grid;place-items:center;min-height:90vh;background:#F7F4ED}</style>
</head><body style="margin:0;background:#F7F4ED"><div id="root"><div id="boot">載入中…</div></div>
<script src="${base}app.js?v=${v}" onerror="document.getElementById('boot').textContent='無法載入前端程式（${base}app.js），請確認網路可連線 GitHub Pages。'"></script>
</body></html>`;
}

export function doGet() {
  const email = currentEmail();
  if (!email || !adminList().includes(email)) {
    const t = HtmlService.createTemplate(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      body{font-family:system-ui,"Noto Sans TC",sans-serif;background:#F7F4ED;color:#252B2D;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box}
      main{max-width:560px;padding:36px;background:#fff;border-radius:20px;border:1px solid #e6e1d6}
      h1{font-size:22px;color:#284A45;margin:0 0 12px}p,li{line-height:1.75;color:#555;font-size:14px}ol{padding-left:20px}
      a.btn{display:inline-block;margin-top:8px;padding:10px 18px;border-radius:999px;background:#284A45;color:#fff;text-decoration:none;font-size:14px}</style></head>
      <body><main>
      <? if (email) { ?>
        <h1>無存取權限</h1><p>帳號 <b><?= email ?></b> 未獲授權使用 SP Performance Hub。</p>
        <p>如需使用，請聯絡臨床技能中心系統管理員將您的 Google 帳號加入管理員名單（Script Properties 的 ADMIN_EMAILS）。</p>
      <? } else { ?>
        <h1>無法辨識您的 Google 帳號</h1>
        <p>系統沒有收到登入身分，通常是以下原因之一：</p>
        <ol>
          <li><b>部署設定</b>：Apps Script「管理部署作業」中，執行身分須為「<b>存取網頁應用程式的使用者</b>」，存取權須為「<b>任何擁有 Google 帳戶的使用者</b>」（或貴院網域），不可選「任何人」。</li>
          <li><b>從 GitHub 網址嵌入開啟時</b>：瀏覽器封鎖了第三方 Cookie（無痕視窗預設會封鎖）。請到 Chrome「設定 → 隱私權和安全性 → 第三方 Cookie → 允許使用第三方 Cookie 的網站」加入 <b>luyun1224.github.io</b>，或改用下方按鈕直接開啟。</li>
        </ol>
        <a class="btn" href="<?= url ?>" target="_blank" rel="noopener">在新分頁直接開啟系統</a>
      <? } ?>
      </main></body></html>`,
    );
    t.email = email;
    t.url = ScriptApp.getService().getUrl();
    return t.evaluate().setTitle('SP Performance Hub｜無存取權限').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createHtmlOutput(appShell())
    .setTitle('SP Performance Hub｜標準化病人演出歷程管理平台')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // 使用者要求：允許嵌入 GitHub Pages 入口（https://luyun1224.github.io/Chimei-SP/）。
    // 前端另以 location.ancestorOrigins 檢查，非允許來源的外層頁面一律拒絕顯示（降低點擊劫持風險）。
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** google.script.run 唯一入口；以 JSON 字串往返，避免 Date 等型別序列化差異 */
export function api(action: string, payloadJson: string): string {
  let payload: unknown = {};
  try {
    payload = payloadJson ? JSON.parse(payloadJson) : {};
  } catch {
    return JSON.stringify({ ok: false, error: { code: 'VALIDATION', message: '請求格式錯誤' } });
  }
  try {
    const email = currentEmail();
    if (!email || !adminList().includes(email)) {
      return JSON.stringify({ ok: false, error: { code: email ? 'FORBIDDEN' : 'UNAUTHENTICATED', message: '未授權的帳號' } });
    }
    const ss = openSpreadsheet();
    const svc = createService({ repo: createSheetsRepo(ss), env: buildEnv(ss), calendar: gasCalendar });
    return JSON.stringify(svc.dispatch(action as ActionName, payload as never));
  } catch (e) {
    return JSON.stringify({ ok: false, error: { code: 'NOT_CONFIGURED', message: String((e as Error).message || e) } });
  }
}

// ---------------- 初始化（在 Apps Script 編輯器手動執行） ----------------

/**
 * 在「綁定的試算表」中建立或補齊所有工作表、表頭、純文字格式與預設設定。可重複執行（不會刪除既有資料）。
 * - 從試算表「擴充功能 → Apps Script」建立的專案：一律使用該試算表，不會另外建立新檔。
 * - 獨立專案：使用 Script Properties 的 SPREADSHEET_ID；兩者都沒有時才建立新試算表（只會建立一次）。
 * 若 ADMIN_EMAILS 為空，會將執行者設為第一位管理員。
 */
export function setupSpreadsheet() {
  const p = props();
  const bound = boundSpreadsheet();
  const savedId = p.getProperty('SPREADSHEET_ID');
  const ss = bound || (savedId ? SpreadsheetApp.openById(savedId) : SpreadsheetApp.create('SP Performance Hub 資料庫'));
  if (p.getProperty('SPREADSHEET_ID') !== ss.getId()) p.setProperty('SPREADSHEET_ID', ss.getId());
  ss.setSpreadsheetTimeZone(TZ);
  const now = fmtGasDate(new Date(), 'datetime');

  /** 取得工作表：舊版英文名稱自動改名為中文；不存在則建立 */
  const sheetFor = (name: string, legacy: string) => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      const old = ss.getSheetByName(legacy);
      sh = old ? old.setName(name) : ss.insertSheet(name);
    }
    return sh;
  };
  const style = (sh: GoogleAppsScript.Spreadsheet.Sheet, cols: number) => {
    sh.getRange(1, 1, sh.getMaxRows(), cols).setNumberFormat('@');
    sh.getRange(1, 1, 1, cols).setFontWeight('bold').setBackground('#284A45').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    const exists = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).some((x) => x.getDescription() === '表頭由系統管理，請勿修改');
    if (!exists) sh.getRange(1, 1, 1, cols).protect().setDescription('表頭由系統管理，請勿修改').setWarningOnly(true);
  };

  // 資料表：表頭改為中文、既有資料的英文狀態值轉為中文；管理員自行新增的欄位保留在最後
  for (const name of Object.keys(TABLES) as TableName[]) {
    const def = TABLES[name];
    const sh = sheetFor(def.sheet, def.legacySheet);
    const values = sh.getLastRow() ? sh.getDataRange().getValues() : [[]];
    const oldHeader = (values[0] || []).map(String);
    const known = def.columns as readonly { key: string; label: string; alt?: string[] }[];
    const extras = oldHeader.filter((h) => h && !known.some((c) => c.label === h || c.key === h || (c.alt || []).includes(h)));
    const header = [...known.map((c) => c.label), ...extras];
    const rows = values.slice(1).filter((r) => r.some((x) => x !== '' && x !== null)).map((r) => {
      const obj = fromRow(name, oldHeader, r, fmtGasDate);
      return [...toRow(name, obj as never), ...extras.map((h) => String(r[oldHeader.indexOf(h)] ?? ''))];
    });
    sh.clearContents();
    sh.getRange(1, 1, 1 + rows.length, header.length).setNumberFormat('@').setValues([header, ...rows]);
    style(sh, header.length);
  }

  // 系統設定：中文項目名稱、易讀的值（清單每行一項、是/否）
  const st = sheetFor(SETTINGS_SHEET, LEGACY_SETTINGS_SHEET);
  const cur = st.getLastRow() ? st.getDataRange().getValues().slice(1) : [];
  const json: Record<string, string> = {};
  for (const r of cur) {
    const key = settingKeyOf(String(r[0] || ''));
    if (key) json[key] = settingFromSheet(key, String(r[1] ?? ''));
  }
  const settingRows = (Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]).map((k) => {
    const def = DEFAULT_SETTINGS[k];
    const val = json[k] !== undefined && json[k] !== '' ? json[k] : typeof def === 'string' ? def : JSON.stringify(def);
    return [SETTING_LABELS[k], settingToSheet(k, val), now];
  });
  st.clearContents();
  st.getRange(1, 1, 1 + settingRows.length, 3).setNumberFormat('@').setValues([SETTINGS_HEADER, ...settingRows]);
  st.setColumnWidth(1, 180).setColumnWidth(2, 420);
  style(st, 3);

  const blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('工作表1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);

  if (!adminList().length) {
    const me = currentEmail();
    if (me) p.setProperty('ADMIN_EMAILS', me);
  }
  Logger.log('✅ 初始化完成（%s）：%s', bound ? '使用綁定的試算表' : '使用 SPREADSHEET_ID 指定的試算表', ss.getUrl());
  Logger.log('管理員：%s', adminList().join(', ') || '（未設定，請於 Script Properties 設定 ADMIN_EMAILS）');
  return ss.getUrl();
}

/** 在編輯器執行：檢查設定是否完整 */
export function healthCheck() {
  const ss = openSpreadsheet();
  const r = buildEnv(ss).health!();
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
