/**
 * 「網址直開」模式：系統直接在 GitHub 網址（頂層頁面）執行，手機也能用。
 *
 * 登入：導向 Apps Script 網頁應用程式（以使用者本人身分、頂層頁面）→ 確認為管理員後簽發 90 天權杖（使用中自動續期）
 *       → 帶回本頁網址的 #fragment（不經任何伺服器）→ 存在本機。
 * 資料：以權杖呼叫 Apps Script「資料 API」部署（doPost）；伺服器每次都驗證簽章、期限與管理員名單。
 * 全程不需要 Google Cloud 設定、Client ID 或任何密鑰。
 */
import { ApiCallError } from './api';
import { WEB_APP_URL } from '../config';

declare global {
  interface Window {
    /** GitHub 入口頁設定：本頁即為正式系統 */
    SP_HUB_DIRECT?: boolean;
  }
}

const KEY = 'sp-hub-session-v1';
interface Sess {
  token: string;
  api: string;
  email: string;
}

/** 從登入後帶回的網址 #fragment 取出權杖並清除網址 */
function captureFromHash(): void {
  if (typeof window === 'undefined' || !window.location.hash.includes('sphub_token=')) return;
  const q = new URLSearchParams(window.location.hash.slice(1));
  const token = q.get('sphub_token') || '';
  const api = q.get('sphub_api') || '';
  const email = q.get('sphub_email') || '';
  if (token && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(api)) {
    localStorage.setItem(KEY, JSON.stringify({ token, api, email } satisfies Sess));
  }
  history.replaceState(null, '', window.location.pathname + window.location.search + '#/overview');
}
captureFromHash();

function session(): Sess | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Sess | null;
    if (!s?.token || !s.api) return null;
    // 權杖內含到期時間；過期就視為未登入（伺服器仍會再次驗證）
    const body = s.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const data = JSON.parse(decodeURIComponent(escape(atob(body + '='.repeat((4 - (body.length % 4)) % 4))))) as { x: number };
    return data.x > Date.now() + 60_000 ? s : null;
  } catch {
    return null;
  }
}

export const isRemote = () => typeof window !== 'undefined' && !!window.SP_HUB_DIRECT && !window.google?.script?.run;
export const hasToken = () => !!session();
export const signedInEmail = () => session()?.email || '';
export function preloadSignIn() {}

/** 前往 Google 登入（需另設「資料 API」部署；一般改用存取碼綁定裝置） */
export function signIn(): Promise<void> {
  const back = window.location.origin + window.location.pathname;
  window.location.assign(`${WEB_APP_URL}?login=1&return=${encodeURIComponent(back)}`);
  return new Promise(() => {});
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const kind = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '裝置';
  return `${kind} ${new Date().toISOString().slice(0, 10)}`;
}

/** 以存取碼綁定此裝置：成功後長期保存，之後開網址直接進入 */
export async function pairDevice(code: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'auth.pair', code, device: deviceName() }),
      redirect: 'follow',
    });
  } catch {
    throw new Error('無法連線系統，請確認網路後重試');
  }
  const text = await res.text();
  if (!text.trim().startsWith('{')) throw new Error('系統回應異常：請確認 Apps Script 部署的執行身分為「我」、存取權為「任何人」，並已發佈新版本');
  const r = JSON.parse(text) as { ok: boolean; data?: { token: string }; error?: { message: string } };
  if (!r.ok || !r.data?.token) throw new Error(r.error?.message || '綁定失敗');
  localStorage.setItem(KEY, JSON.stringify({ token: r.data.token, api: WEB_APP_URL, email: '' } satisfies Sess));
}

export function signOut() {
  localStorage.removeItem(KEY);
}

export function rememberLogin(_email: string) {
  void _email;
}

/** 以權杖呼叫資料 API，回傳 JSON 字串 */
export async function remoteCall(action: string, payload: unknown): Promise<string> {
  const s = session();
  if (!s) throw new ApiCallError({ code: 'UNAUTHENTICATED', message: '請先以 Google 帳號登入' });
  let res: Response;
  try {
    // text/plain 為「簡單請求」，不觸發 CORS 預檢；Apps Script 回應允許跨網域讀取
    res = await fetch(s.api, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: s.token, action, payload: JSON.stringify(payload ?? {}) }),
      redirect: 'follow',
    });
  } catch {
    throw new ApiCallError({ code: 'INTERNAL', message: '無法連線系統，請確認網路後重試' });
  }
  const text = await res.text();
  if (!text.trim().startsWith('{')) {
    throw new ApiCallError({ code: 'NOT_CONFIGURED', message: '資料 API 回應異常：請確認 API_URL 部署的「執行身分」為「我」、存取權為「任何人」' });
  }
  if (/"code"\s*:\s*"UNAUTHENTICATED"/.test(text)) signOut();
  // 伺服器換發的新權杖（自動續期）
  const renew = /"renewToken"\s*:\s*"([\w.-]+)"/.exec(text)?.[1];
  if (renew) localStorage.setItem(KEY, JSON.stringify({ ...s, token: renew }));
  return text;
}
