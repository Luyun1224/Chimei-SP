/**
 * 「網址直開」模式：前端直接在 GitHub Pages（頂層頁面）執行，不再用 iframe 嵌入 Apps Script。
 * 以 Google Identity Services 取得使用者本人的 OAuth 存取權杖（瀏覽器端，不需要 Client Secret），
 * 再透過 Apps Script API（scripts.run）以「使用者本人身分」執行後端的 api() 函式。
 * 因為是頂層頁面登入，手機 Safari／LINE 內建瀏覽器封鎖第三方 Cookie 也不受影響。
 *
 * 設定：pages/config.js → window.SP_HUB_REMOTE = { clientId, scriptId }（皆為公開識別碼，不是密鑰）。
 */
import { ApiCallError } from './api';

interface RemoteConfig {
  clientId: string;
  scriptId: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string; message?: string }) => void;
      }): { requestAccessToken(o?: { prompt?: string; hint?: string }): void };
      revoke(token: string, done?: () => void): void;
    };
  };
}

declare global {
  interface Window {
    SP_HUB_REMOTE?: Partial<RemoteConfig>;
  }
}

/** 後端 Code.gs 實際使用的權限範圍；scripts.run 要求權杖包含全部範圍 */
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ');

const TOKEN_KEY = 'sp-hub-token';
const HINT_KEY = 'sp-hub-login-hint';

export function remoteConfig(): RemoteConfig | null {
  const c = typeof window !== 'undefined' ? window.SP_HUB_REMOTE : undefined;
  return c?.clientId && c?.scriptId ? { clientId: c.clientId, scriptId: c.scriptId } : null;
}
export const isRemote = () => !!remoteConfig();

let token: { value: string; exp: number } | null = (() => {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    return t && t.exp > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
})();

export const hasToken = () => !!token && token.exp > Date.now() + 60_000;

let gisPromise: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve((window as unknown as { google: Gis }).google);
    s.onerror = () => reject(new Error('無法載入 Google 登入元件，請確認網路連線'));
    document.head.append(s);
  });
  return gisPromise;
}

/** 預先載入登入元件（讓按下登入時能立即開啟視窗，避免手機擋彈出視窗） */
export function preloadSignIn() {
  if (isRemote()) loadGis().catch(() => {});
}

/** 取得權杖：interactive=true 時會開啟 Google 登入／授權視窗（必須在使用者點擊時呼叫） */
export function signIn(interactive = true): Promise<void> {
  const cfg = remoteConfig();
  if (!cfg) return Promise.reject(new Error('尚未設定 Client ID / Script ID'));
  return loadGis().then(
    (gis) =>
      new Promise<void>((resolve, reject) => {
        const client = gis.accounts.oauth2.initTokenClient({
          client_id: cfg.clientId,
          scope: SCOPES,
          callback: (r) => {
            if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || '登入失敗'));
            token = { value: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 };
            sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
            resolve();
          },
          error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? '已關閉登入視窗' : e.message || e.type)),
        });
        client.requestAccessToken({ prompt: interactive ? '' : 'none', hint: localStorage.getItem(HINT_KEY) || undefined });
      }),
  );
}

export function signOut() {
  const t = token?.value;
  token = null;
  sessionStorage.removeItem(TOKEN_KEY);
  if (t) loadGis().then((g) => g.accounts.oauth2.revoke(t)).catch(() => {});
}

export function rememberLogin(email: string) {
  if (email) localStorage.setItem(HINT_KEY, email);
}

interface RunResponse {
  done?: boolean;
  response?: { result?: unknown };
  error?: { code?: number; message?: string; details?: { errorMessage?: string; errorType?: string }[] };
}

/** 以 Apps Script API 執行後端 api(action, payloadJson)，回傳 JSON 字串 */
export async function remoteCall(action: string, payload: unknown): Promise<string> {
  const cfg = remoteConfig()!;
  if (!hasToken()) throw new ApiCallError({ code: 'UNAUTHENTICATED', message: '請先以 Google 帳號登入' });
  let res: Response;
  try {
    res = await fetch(`https://script.googleapis.com/v1/scripts/${encodeURIComponent(cfg.scriptId)}:run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token!.value}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ function: 'api', parameters: [action, JSON.stringify(payload ?? {})], devMode: false }),
    });
  } catch {
    throw new ApiCallError({ code: 'INTERNAL', message: '無法連線 Google，請確認網路後重試' });
  }
  if (res.status === 401) {
    signOut();
    throw new ApiCallError({ code: 'UNAUTHENTICATED', message: '登入已過期，請重新登入' });
  }
  const body = (await res.json().catch(() => ({}))) as RunResponse;
  if (res.status === 403) {
    throw new ApiCallError({ code: 'FORBIDDEN', message: 'Google 拒絕執行：' + (body.error?.message || '請確認 Apps Script API 已啟用且已部署為「API 可執行檔」') });
  }
  if (!res.ok) throw new ApiCallError({ code: 'INTERNAL', message: `Google API 錯誤（${res.status}）：${body.error?.message || ''}` });
  if (body.error) {
    const msg = body.error.details?.[0]?.errorMessage || body.error.message || '後端執行錯誤';
    throw new ApiCallError({ code: 'INTERNAL', message: '後端執行錯誤：' + msg });
  }
  return String(body.response?.result ?? '');
}
