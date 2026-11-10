import type { ActionName, ApiActions, ApiError, ApiResponse } from '../../shared/types';
import { isRemote, remoteCall } from './remote';

declare global {
  interface Window {
    google?: {
      script?: {
        run: {
          withSuccessHandler(fn: (v: string) => void): {
            withFailureHandler(fn: (e: Error) => void): { api(action: string, payload: string): void };
          };
        };
      };
    };
  }
}

function takePrefetch(): Promise<string> | null {
  const w = window as unknown as { __SP_BOOT?: Promise<string> };
  const p = w.__SP_BOOT || null;
  w.__SP_BOOT = undefined;
  return p;
}

export const isGas = () => typeof window !== 'undefined' && !!window.google?.script?.run && import.meta.env.VITE_FORCE_DEMO !== 'true';

export class ApiCallError extends Error {
  constructor(public error: ApiError) {
    super(error.message);
  }
  get code() {
    return this.error.code;
  }
}

function gasCall(action: string, payload: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    window.google!.script!.run.withSuccessHandler(resolve)
      .withFailureHandler((e) => reject(new ApiCallError({ code: 'INTERNAL', message: '無法連線 Google Apps Script：' + (e?.message || e) })))
      .api(action, JSON.stringify(payload ?? {}));
  });
}

/** 呼叫後端；失敗時拋出 ApiCallError（含錯誤碼，供 UI 區分衝突確認、版本衝突等） */
export async function call<A extends ActionName>(action: A, payload: ApiActions[A]['req']): Promise<ApiActions[A]['res']> {
  let res: ApiResponse<ApiActions[A]['res']>;
  if (isGas()) {
    // 首次載入：使用頁面一開始就送出的預先請求，省下一次來回
    const boot = action === 'bootstrap' ? takePrefetch() : null;
    res = JSON.parse(boot ? await boot.catch(() => gasCall(action, payload)) : await gasCall(action, payload));
  } else if (isRemote()) {
    res = JSON.parse(await remoteCall(action, payload));
  } else {
    const { demoCall } = await import('./demo');
    res = await demoCall(action, payload);
  }
  if (!res.ok) throw new ApiCallError(res.error);
  return res.data;
}

export const newRequestId = () =>
  (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).toString();
