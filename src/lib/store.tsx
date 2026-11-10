import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ActionName, ApiActions, Assignment, MutationResult, NotificationEntry, SP, Session, Snapshot } from '../../shared/types';
import { latestNotifications } from '../../shared/template';
import { ApiCallError, call } from './api';
import { ensurePaired, rememberLogin } from './remote';

interface Derived {
  spMap: Map<string, SP>;
  sessionMap: Map<string, Session>;
  /** 未刪除的明細，依 sessionId 分組 */
  bySession: Map<string, Assignment[]>;
  latestNotify: Map<string, NotificationEntry>;
}

interface DataCtx {
  snap: Snapshot | null;
  d: Derived;
  loading: boolean;
  /** 背景更新中（畫面先顯示快取資料） */
  refreshing: boolean;
  error: ApiCallError | null;
  reload: () => Promise<void>;
  /** 呼叫寫入 API，成功後把回傳的實體局部合併進目前資料 */
  mutate: <A extends ActionName>(action: A, payload: ApiActions[A]['req']) => Promise<ApiActions[A]['res']>;
}

const Ctx = createContext<DataCtx | null>(null);

/** 嵌在 GitHub 入口頁時，回報載入狀態，讓入口頁在無法登入時改為直接開啟 */
function notifyEntry(type: 'ready' | 'auth-failed' | 'error') {
  try {
    if (window.top && window.top !== window) window.top.postMessage({ source: 'sp-hub', type }, '*');
  } catch {
    /* 非嵌入情境忽略 */
  }
}

function mergeBy<T>(list: T[], updates: T[] | undefined, key: keyof T): T[] {
  if (!updates?.length) return list;
  const m = new Map(list.map((x) => [x[key], x]));
  for (const u of updates) m.set(u[key], u);
  return [...m.values()];
}

export function DataProvider({ children }: { children: ReactNode }) {
  // 先顯示這台裝置上次的資料（立即開啟），背景再更新為最新資料
  const [snap, setSnap] = useState<Snapshot | null>(() => readCache());
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiCallError | null>(null);
  const inflight = useRef(new Set<string>());

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRefreshing(true);
      const data = await call('bootstrap', {});
      setSnap(data);
      writeCache(data);
      rememberLogin(data.user.email);
      notifyEntry('ready');
    } catch (e) {
      const err = e instanceof ApiCallError ? e : new ApiCallError({ code: 'INTERNAL', message: String(e) });
      if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHENTICATED') {
        clearCache();
        setSnap(null);
      }
      setError(err);
      notifyEntry(err.code === 'UNAUTHENTICATED' ? 'auth-failed' : 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // 專屬網址：先綁定裝置再載入
    ensurePaired().finally(() => reload());
  }, [reload]);

  const mutate = useCallback(async <A extends ActionName>(action: A, payload: ApiActions[A]['req']) => {
    // 防止同一操作連點重複送出
    const key = action + JSON.stringify(payload);
    if (inflight.current.has(key)) throw new ApiCallError({ code: 'STATE', message: '操作處理中，請稍候' });
    inflight.current.add(key);
    try {
      const res = await call(action, payload);
      const m = res as MutationResult;
      if (m && typeof m === 'object' && !Array.isArray(m)) {
        setSnap((s) => {
          const next = s && {
            ...s,
            sps: mergeBy(s.sps, m.sps, 'spId'),
            sessions: mergeBy(s.sessions, m.sessions, 'sessionId').filter((x) => !x.isDeleted),
            assignments: mergeBy(s.assignments, m.assignments, 'assignmentId'),
            notifications: m.notifications ? [...s.notifications, ...m.notifications] : s.notifications,
            settings: m.settings || s.settings,
          };
          if (next) writeCache(next);
          return next;
        });
      }
      return res;
    } catch (e) {
      if (e instanceof ApiCallError && (e.code === 'VERSION_CONFLICT' || e.code === 'UNAUTHENTICATED')) reload();
      throw e;
    } finally {
      inflight.current.delete(key);
    }
  }, [reload]);

  const d = useMemo<Derived>(() => {
    const spMap = new Map((snap?.sps || []).map((p) => [p.spId, p]));
    const sessionMap = new Map((snap?.sessions || []).map((s) => [s.sessionId, s]));
    const bySession = new Map<string, Assignment[]>();
    for (const a of snap?.assignments || []) {
      if (a.isDeleted) continue;
      const l = bySession.get(a.sessionId) || [];
      l.push(a);
      bySession.set(a.sessionId, l);
    }
    return { spMap, sessionMap, bySession, latestNotify: latestNotifications(snap?.notifications || []) };
  }, [snap]);

  return <Ctx.Provider value={{ snap, d, loading, refreshing, error, reload, mutate }}>{children}</Ctx.Provider>;
}

export function useData() {
  const c = useContext(Ctx);
  if (!c) throw new Error('DataProvider missing');
  return c;
}

/** 已載入資料時才使用（頁面層級） */
export function useSnap() {
  const c = useData();
  return { ...c, snap: c.snap as Snapshot };
}

export const spName = (d: Derived, a: Assignment) => d.spMap.get(a.spId)?.name || a.spNameSnapshot;

/** 公開檢視（未綁定裝置）為唯讀 */
export function useCanEdit(): boolean {
  const { snap } = useData();
  return snap?.access !== 'public';
}

// ---------- 本機快取：只在正式模式（Apps Script／網址直開）使用，示範模式不快取 ----------
const CACHE_KEY = 'sp-hub-snapshot-cache-v1';
function cacheEnabled(): boolean {
  try {
    return typeof window !== 'undefined' && (!!window.google?.script?.run || !!window.SP_HUB_DIRECT);
  } catch {
    return false;
  }
}
function readCache(): Snapshot | null {
  if (!cacheEnabled()) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}
function writeCache(s: Snapshot) {
  if (!cacheEnabled() || s.access === 'public') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {
    /* 容量不足時略過 */
  }
}
function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
