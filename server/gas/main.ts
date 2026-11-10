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
import { createSheetsRepo, fmtGasDate } from './sheetsRepo';
import { gasCalendar } from './calendarGateway';
import { SETTINGS_SHEET, TABLES } from '../schema';
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
function openSpreadsheet() {
  const id = props().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('尚未設定 SPREADSHEET_ID，請先在 Apps Script 編輯器執行 setupSpreadsheet');
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
        const sh = ss.getSheetByName(n);
        if (sh) sh.copyTo(copy).setName(n);
      }
      const first = copy.getSheets()[0];
      if (first.getName().startsWith('Sheet') || first.getName().startsWith('工作表')) copy.deleteSheet(first);
      return { name: copy.getName(), url: copy.getUrl() };
    },
    health(): HealthReport {
      const settingsCal = (() => {
        const v = ss.getSheetByName(SETTINGS_SHEET)?.getDataRange().getValues().find((r) => r[0] === 'calendarId');
        return v ? String(v[1]) : '';
      })();
      let calendarOk = false, calendarName = '', calendarError = '';
      if (!settingsCal) calendarError = '尚未設定 Calendar ID';
      else {
        try {
          const cal = CalendarApp.getCalendarById(settingsCal);
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
        sheets: [...Object.values(TABLES).map((t) => t.sheet), SETTINGS_SHEET].map((name) => {
          const sh = ss.getSheetByName(name);
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
      body{font-family:system-ui,"Noto Sans TC",sans-serif;background:#F7F4ED;color:#252B2D;display:grid;place-items:center;min-height:100vh;margin:0}
      main{max-width:440px;padding:40px;background:#fff;border-radius:20px;border:1px solid #e6e1d6}
      h1{font-size:22px;color:#284A45;margin:0 0 12px}p{line-height:1.7;color:#555}</style></head>
      <body><main><h1>無存取權限</h1><p>帳號 <b><?= email ?></b> 未獲授權使用 SP Performance Hub。</p>
      <p>如需使用，請聯絡臨床技能中心系統管理員將您的 Google 帳號加入管理員名單。</p></main></body></html>`,
    );
    t.email = email || '（無法取得，請確認已登入 Google 帳號）';
    return t.evaluate().setTitle('SP Performance Hub｜無存取權限');
  }
  return HtmlService.createHtmlOutput(appShell())
    .setTitle('SP Performance Hub｜標準化病人演出歷程管理平台')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
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
 * 建立或補齊所有工作表、表頭、純文字格式與預設設定。可重複執行（不會覆蓋既有資料）。
 * 若 Script Properties 沒有 SPREADSHEET_ID，會自動建立新的試算表並寫入。
 * 若 ADMIN_EMAILS 為空，會將執行者設為第一位管理員。
 */
export function setupSpreadsheet() {
  const p = props();
  let id = p.getProperty('SPREADSHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('SP Performance Hub 資料庫');
  if (!id) {
    id = ss.getId();
    p.setProperty('SPREADSHEET_ID', id);
  }
  ss.setSpreadsheetTimeZone(TZ);

  const ensure = (name: string, header: string[], labels: string[]) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
    const missing = header.filter((h) => !cur.includes(h));
    if (missing.length) {
      sh.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]);
      missing.forEach((h, i) => {
        const label = labels[header.indexOf(h)];
        if (label) sh!.getRange(1, cur.length + 1 + i).setNote(label);
      });
    }
    const cols = sh.getLastColumn();
    sh.getRange(1, 1, sh.getMaxRows(), cols).setNumberFormat('@');
    sh.getRange(1, 1, 1, cols).setFontWeight('bold').setBackground('#284A45').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    const prot = sh.getRange(1, 1, 1, cols).protect().setDescription('表頭由系統管理，請勿修改');
    prot.setWarningOnly(true);
    return sh;
  };

  for (const t of Object.values(TABLES)) ensure(t.sheet, t.columns.map((c) => c.key), t.columns.map((c) => c.label));
  const st = ensure(SETTINGS_SHEET, ['key', 'value', 'updatedAt'], ['設定鍵', '設定值', '更新時間']);
  const existing = st.getDataRange().getValues().map((r) => String(r[0]));
  const now = fmtGasDate(new Date(), 'datetime');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (!existing.includes(k)) st.appendRow([k, typeof v === 'string' ? v : JSON.stringify(v), now]);
  }
  const blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('工作表1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);

  if (!adminList().length) {
    const me = currentEmail();
    if (me) p.setProperty('ADMIN_EMAILS', me);
  }
  Logger.log('✅ 初始化完成：%s', ss.getUrl());
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
