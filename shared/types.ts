/**
 * 共用型別：前端、Apps Script 後端、測試皆使用同一份定義。
 * 日期一律 'yyyy-MM-dd'、時間一律 'HH:mm'，皆為 Asia/Taipei 當地時間字串，避免 UTC 錯位。
 * 時數一律以「分鐘（整數）」儲存。
 */

export type SpStatus = 'active' | 'paused' | 'inactive';

export interface SP {
  spId: string;
  name: string;
  phone: string;
  email: string;
  lineNote: string;
  /** 在職狀態（系統用：在職／暫停／停用） */
  status: SpStatus;
  // ---- 名冊欄位（與原紙本／Excel 名冊相同） ----
  gender: string;
  /** 生日，民國年格式，例如 43.08.04 */
  birthday: string;
  /** 首次認證年度（民國），例如 101 */
  firstCertYear: string;
  /** 學會認證期間，例如 113-115 */
  assocCert: string;
  /** 證書字號，例如 (113)0377 */
  certNo: string;
  /** 身分：SP／SPT */
  role: string;
  /** 級數：SP0–SP3 */
  level: string;
  /** 證書狀態：符合／尚未認證／未符合／已過效期／待展延 */
  certStatus: string;
  /** 是否協會會員：是／否 */
  isMember: string;
  note: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
}

export type SessionStatus = 'scheduled' | 'completed' | 'cancelled';
/** pending：等待同步；synced：已同步；failed：失敗待重試；removed：已自日曆移除；disabled：未設定 Calendar */
export type SyncStatus = 'pending' | 'synced' | 'failed' | 'removed' | 'disabled';

export interface Session {
  sessionId: string;
  date: string;
  unit: string;
  topic: string;
  checkinTime: string;
  startTime: string;
  endTime: string;
  location: string;
  note: string;
  status: SessionStatus;
  cancelReason: string;
  calendarEventId: string;
  syncStatus: SyncStatus;
  syncError: string;
  syncedAt: string;
  isDeleted: boolean;
  deleteReason: string;
  requestId: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
}

export type Attendance = 'pending' | 'present' | 'absent' | 'cancelled';
export type VerifyStatus = 'unverified' | 'verified';

export interface Assignment {
  assignmentId: string;
  sessionId: string;
  spId: string;
  /** 建立當下的 SP 姓名快照，SP 改名不影響歷史顯示；統計一律以 spId 關聯 */
  spNameSnapshot: string;
  /** 此 SP 演出的教案（同一場次可有多個教案）；空白時沿用排程的教案主題 */
  topic: string;
  attendance: Attendance;
  actualStart: string;
  actualEnd: string;
  /** 核定演出分鐘數；未核定為 null */
  approvedMinutes: number | null;
  minutesNote: string;
  verifyStatus: VerifyStatus;
  verifiedBy: string;
  verifiedAt: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
}

export type NotifyStatus = 'notified' | 'not_notified';

/** 人工提醒標記（append-only）。每個 assignment 以最新一筆為準。 */
export interface NotificationEntry {
  notificationId: string;
  sessionId: string;
  assignmentId: string;
  spId: string;
  status: NotifyStatus;
  markedBy: string;
  markedAt: string;
  /** 標記當下排程內容指紋；排程異動後指紋不同 → 提示是否需重新通知 */
  fingerprint: string;
  note: string;
}

export interface AuditEntry {
  auditId: string;
  at: string;
  actor: string;
  entity: 'sp' | 'session' | 'assignment' | 'notification' | 'settings' | 'system';
  entityId: string;
  action: string;
  before: string;
  after: string;
  note: string;
}

export interface Settings {
  calendarId: string;
  /** 是否在管理員行事曆事件上加「前一天」彈出提醒（只提醒管理員，不代替 LINE 通知） */
  adminReminderEnabled: boolean;
  adminReminderMinutes: number;
  individualTemplate: string;
  summaryTemplate: string;
  units: string[];
  topics: string[];
  locations: string[];
  inactiveThresholdDays: number;
  /** 演出費：每滿 1 小時金額 */
  feeHourly: number;
  /** 演出費：未滿 1 小時的部分超過門檻分鐘時加計的金額 */
  feeHalf: number;
  /** 演出費：加計門檻（分鐘），超過此分鐘數才加計 feeHalf */
  feeThresholdMinutes: number;
}

export interface CurrentUser {
  email: string;
  isAdmin: boolean;
}

export interface Snapshot {
  mode: 'gas' | 'demo';
  /** 後端協定版本（舊版後端沒有此欄位） */
  apiVersion?: number;
  /** public：未綁定裝置的公開檢視（去識別化、唯讀） */
  access?: 'full' | 'public';
  user: CurrentUser;
  today: string;
  serverTime: string;
  sps: SP[];
  sessions: Session[];
  assignments: Assignment[];
  notifications: NotificationEntry[];
  settings: Settings;
}

// ---------- API 輸入 ----------

export interface SpInput {
  name: string;
  phone?: string;
  email?: string;
  lineNote?: string;
  status?: SpStatus;
  gender?: string;
  birthday?: string;
  firstCertYear?: string;
  assocCert?: string;
  certNo?: string;
  role?: string;
  level?: string;
  certStatus?: string;
  isMember?: string;
  note?: string;
}

/** 場次內的一個教案與其 SP */
export interface CaseInput {
  topic: string;
  spIds: string[];
  /** 直接輸入、尚未建檔的 SP 姓名 */
  newSpNames?: string[];
}

export interface SessionInput {
  date: string;
  unit: string;
  /** 舊版單一教案欄位；有 cases 時由各教案自動彙總 */
  topic?: string;
  checkinTime: string;
  startTime: string;
  endTime: string;
  location: string;
  note?: string;
  /** 舊版：單一教案時的 SP；有 cases 時忽略 */
  spIds?: string[];
  /** 直接輸入、尚未建檔的 SP 姓名；儲存時自動建立 SP 主檔（同名已存在則沿用） */
  newSpNames?: string[];
  /** 同一場次的多個教案，各自有 SP */
  cases?: CaseInput[];
}

export interface VerifyInput {
  assignmentId: string;
  attendance: Attendance;
  actualStart?: string;
  actualEnd?: string;
  approvedMinutes?: number | null;
  minutesNote?: string;
  expectedVersion: number;
  /** 已核定紀錄更正時必填 */
  reason?: string;
}

export interface Warning {
  type: 'conflict' | 'duplicate' | 'sp_inactive';
  message: string;
  spId?: string;
  otherSessionId?: string;
}

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'NEEDS_CONFIRMATION'
  | 'FORBIDDEN'
  | 'UNAUTHENTICATED'
  | 'STATE'
  | 'LOCK_TIMEOUT'
  | 'NOT_CONFIGURED'
  | 'INTERNAL';

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** 所有寫入動作回傳「有變動的實體」，前端據此局部更新，不必整頁重載 */
export interface MutationResult {
  sps?: SP[];
  sessions?: Session[];
  assignments?: Assignment[];
  notifications?: NotificationEntry[];
  settings?: Settings;
  warnings?: Warning[];
}

export interface ApiActions {
  bootstrap: { req: Record<string, never>; res: Snapshot };
  'sp.save': { req: { spId?: string; input: SpInput; expectedVersion?: number }; res: MutationResult };
  'session.save': {
    req: {
      sessionId?: string; input: SessionInput; expectedVersion?: number; requestId: string; confirm?: boolean;
      /** 新增時一併建立的其他日期（相同時間、教案與 SP） */
      extraDates?: string[];
      /** true：先寫入資料立即回應，日曆由前端在背景同步 */
      deferSync?: boolean;
    };
    res: MutationResult;
  };
  'session.cancel': { req: { sessionId: string; reason: string; expectedVersion: number }; res: MutationResult };
  'session.delete': { req: { sessionId: string; reason: string; expectedVersion: number }; res: MutationResult };
  'session.complete': { req: { sessionId: string; expectedVersion: number }; res: MutationResult };
  'session.resync': { req: { sessionId: string }; res: MutationResult };
  'session.resyncAll': { req: { limit?: number }; res: MutationResult & { synced: number; failed: number; remaining: number } };
  'session.verifyAllAsScheduled': { req: { sessionId: string }; res: MutationResult };
  'assignment.verify': { req: VerifyInput; res: MutationResult };
  'assignment.unverify': { req: { assignmentId: string; reason: string; expectedVersion: number }; res: MutationResult };
  'notify.mark': {
    req: { assignmentIds: string[]; status: NotifyStatus; note?: string };
    res: MutationResult;
  };
  'settings.save': { req: { patch: Partial<Settings> }; res: MutationResult };
  'audit.list': { req: { entityId?: string; limit?: number }; res: AuditEntry[] };
  'stats.annual': { req: { year: number }; res: unknown };
  'system.backup': { req: Record<string, never>; res: { name: string; url: string } };
  'system.health': { req: Record<string, never>; res: HealthReport };
  'system.accessCode': { req: { rotate?: boolean }; res: { code: string } };
}

export type ActionName = keyof ApiActions;

export interface HealthReport {
  spreadsheetOk: boolean;
  spreadsheetName: string;
  sheets: { name: string; ok: boolean; rows: number }[];
  calendarOk: boolean;
  calendarName: string;
  calendarError: string;
  user: string;
  timezone: string;
}
