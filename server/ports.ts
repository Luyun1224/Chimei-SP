import type { RowTypes, TableName } from './schema';

/** 資料存取介面：Apps Script 以 Google Sheets 實作；本機示範／測試以記憶體實作 */
export interface Repo {
  /** 取得鎖後呼叫：丟棄快取，重新讀取最新資料 */
  refresh(): void;
  all<K extends TableName>(t: K): RowTypes[K][];
  insert<K extends TableName>(t: K, rows: RowTypes[K][]): void;
  /** 以主鍵覆寫整列 */
  update<K extends TableName>(t: K, row: RowTypes[K]): void;
  getSettings(): Record<string, string>;
  setSettings(kv: Record<string, string>): void;
}

export interface Env {
  /** 目前操作者 email（Apps Script：Session.getActiveUser） */
  user(): string;
  isAdmin(email: string): boolean;
  nowIso(): string;
  today(): string;
  randomId(): string;
  /** 互斥鎖：多步驟寫入須在鎖內完成 */
  withLock<T>(fn: () => T): T;
  backup?(): { name: string; url: string };
  health?(): import('../shared/types').HealthReport;
}

export interface CalendarEventInput {
  sessionId: string;
  title: string;
  description: string;
  location: string;
  startIso: string;
  endIso: string;
  date: string;
  reminderMinutes: number | null;
}

export interface CalendarGateway {
  /**
   * 建立或更新事件，回傳 eventId。
   * 實作需具冪等性：有 eventId 先更新；找不到時以事件 tag（sessionId）搜尋當日事件，仍找不到才建立。
   */
  upsert(calendarId: string, eventId: string, ev: CalendarEventInput): string;
  /** 刪除事件；不存在時視為成功 */
  remove(calendarId: string, eventId: string, sessionId: string, date: string): void;
}
