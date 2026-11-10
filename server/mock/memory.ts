/**
 * 記憶體 / localStorage 版的 Repo 與 Calendar，用於：
 *  1. 單元測試（驗收情境自動化）
 *  2. 本機示範模式（npm run dev，未連線 Google 時），畫面會明確標示「示範模式」
 */
import type { CalendarEventInput, CalendarGateway, Env, Repo } from '../ports';
import type { RowTypes, TableName } from '../schema';
import { TABLES } from '../schema';
import { nowIsoTaipei, todayInTaipei } from '../../shared/time';

export interface MemoryState {
  tables: { [K in TableName]: RowTypes[K][] };
  settings: Record<string, string>;
}

export const emptyState = (): MemoryState => ({
  tables: { sps: [], sessions: [], assignments: [], notifications: [], audit: [] },
  settings: {},
});

export function createMemoryRepo(state: MemoryState, onWrite?: () => void): Repo {
  const idKey = (t: TableName) => TABLES[t].idKey as string;
  return {
    refresh() {},
    all: (t) => state.tables[t].map((r) => ({ ...r })),
    insert(t, rows) {
      (state.tables[t] as unknown[]).push(...rows.map((r) => ({ ...r })));
      onWrite?.();
    },
    update(t, row) {
      const k = idKey(t);
      const list = state.tables[t] as unknown as Record<string, unknown>[];
      const i = list.findIndex((r) => r[k] === (row as unknown as Record<string, unknown>)[k]);
      if (i < 0) throw new Error('row not found: ' + String((row as unknown as Record<string, unknown>)[k]));
      list[i] = { ...row } as unknown as Record<string, unknown>;
      onWrite?.();
    },
    getSettings: () => ({ ...state.settings }),
    setSettings(kv) {
      Object.assign(state.settings, kv);
      onWrite?.();
    },
  };
}

export interface MockEvent extends CalendarEventInput {
  eventId: string;
  calendarId: string;
}

/** 模擬 Calendar：可設定 failNext 測試失敗與重試 */
export function createMockCalendar(events: MockEvent[] = [], onWrite?: () => void) {
  let seq = events.length;
  const ctl = { failNext: 0, failAfterCreate: 0, calls: { create: 0, update: 0, remove: 0 } };
  const gateway: CalendarGateway = {
    upsert(calendarId, eventId, ev) {
      if (ctl.failNext > 0) {
        ctl.failNext--;
        throw new Error('模擬：Google Calendar 暫時無法連線');
      }
      let target = eventId ? events.find((e) => e.eventId === eventId) : undefined;
      // 與 Apps Script 實作一致：找不到 eventId 時以 sessionId 搜尋，避免重複建立
      if (!target) target = events.find((e) => e.sessionId === ev.sessionId && e.calendarId === calendarId);
      if (target) {
        Object.assign(target, ev);
        ctl.calls.update++;
        onWrite?.();
        return target.eventId;
      }
      const created: MockEvent = { ...ev, calendarId, eventId: `mock-evt-${++seq}` };
      events.push(created);
      ctl.calls.create++;
      onWrite?.();
      if (ctl.failAfterCreate > 0) {
        ctl.failAfterCreate--;
        throw new Error('模擬：事件已建立但回應逾時');
      }
      return created.eventId;
    },
    remove(calendarId, eventId, sessionId) {
      if (ctl.failNext > 0) {
        ctl.failNext--;
        throw new Error('模擬：Google Calendar 暫時無法連線');
      }
      const i = events.findIndex((e) => (eventId && e.eventId === eventId) || (e.sessionId === sessionId && e.calendarId === calendarId));
      if (i >= 0) events.splice(i, 1);
      ctl.calls.remove++;
      onWrite?.();
    },
  };
  return { gateway, events, ctl };
}

export function createMemoryEnv(opts: { user?: string; admins?: string[]; today?: () => string; now?: () => string } = {}): Env & { setUser(u: string): void } {
  let user = opts.user ?? 'admin@example.org';
  const admins = opts.admins ?? [user];
  let n = 0;
  return {
    user: () => user,
    setUser: (u: string) => (user = u),
    isAdmin: (email) => admins.map((a) => a.toLowerCase()).includes(email.toLowerCase()),
    nowIso: opts.now ?? (() => nowIsoTaipei()),
    today: opts.today ?? (() => todayInTaipei()),
    randomId: () => (Date.now().toString(36).slice(-4) + (++n).toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase(),
    withLock: (fn) => fn(),
  };
}
