/**
 * Google Sheets 資料結構（中文工作表、中文欄位、中文狀態值）。
 * 程式內部仍使用英文代碼；寫入 Sheets 時轉成中文，讀取時轉回代碼。
 * 為相容舊版英文工作表：讀取時同時接受英文表頭／英文代碼，setupSpreadsheet 會把舊表轉為中文。
 */
import type { Assignment, AuditEntry, NotificationEntry, SP, Session, Settings } from '../shared/types';
import { ageOf, seniorityOf } from '../shared/validate';
import { todayInTaipei } from '../shared/time';

/** 欄位型別：決定 Sheets 字串 ↔ 物件的轉換 */
export type ColType = 'string' | 'number' | 'nullable-number' | 'bool';

export interface ColumnDef<T> {
  /** 物件欄位；以底線開頭者為「計算欄」（只寫入、不讀回） */
  key: (keyof T & string) | `_${string}`;
  type: ColType;
  label: string;
  /** 代碼 → 中文 */
  enum?: Record<string, string>;
  /** 舊版表頭名稱（升級相容） */
  alt?: string[];
  /** 計算欄：寫入時依物件計算 */
  compute?: (obj: T) => string;
}

export interface TableDef<T> {
  sheet: string;
  /** 舊版英文工作表名稱（升級相容） */
  legacySheet: string;
  idKey: keyof T & string;
  columns: ColumnDef<T>[];
}

const s = <K extends string>(key: K, label: string, en?: Record<string, string>) => ({ key, type: 'string' as const, label, enum: en });

export const ENUMS = {
  spStatus: { active: '在職', paused: '暫停', inactive: '停用' },
  sessionStatus: { scheduled: '預定', completed: '已完成', cancelled: '已取消' },
  syncStatus: { pending: '待同步', synced: '已同步', failed: '同步失敗', removed: '已自日曆移除', disabled: '未設定日曆' },
  attendance: { pending: '待確認', present: '已出席', absent: '缺席', cancelled: '取消' },
  verifyStatus: { unverified: '未核定', verified: '已核定' },
  notifyStatus: { notified: '已通知', not_notified: '未通知' },
  auditEntity: { sp: 'SP人員', session: '演出排程', assignment: '演出明細', notification: 'LINE通知', settings: '系統設定', system: '系統' },
  auditAction: {
    create: '建立', update: '修改', cancel: '取消排程', soft_delete: '刪除（軟刪除）', complete: '標記完成', verify: '核定', correct: '更正核定',
    unverify: '取消核定', calendar_sync_failed: '日曆同步失敗', 'mark:notified': '標記已通知', 'mark:not_notified': '標記未通知',
    'status:active': '狀態改為在職', 'status:paused': '狀態改為暫停', 'status:inactive': '狀態改為停用', backup: '建立備份', error: '系統錯誤',
  },
} as const;

export const TABLES = {
  sps: {
    sheet: 'SP人員主檔',
    legacySheet: 'SP_Master',
    idKey: 'spId',
    columns: [
      s('spId', 'SP編號'), s('name', '姓名'), s('gender', '性別'),
      { key: '_age', type: 'string', label: '年齡', compute: (p: SP) => ageOf(p.birthday, todayInTaipei()) },
      s('birthday', '生日'), s('firstCertYear', '首次認證'),
      { key: '_seniority', type: 'string', label: 'SP年資', compute: (p: SP) => seniorityOf(p.firstCertYear, todayInTaipei()) },
      s('assocCert', '學會認證'), s('certNo', '證書字號'), s('role', '身分'), s('level', '級數'), s('certStatus', '證書狀態'), s('isMember', '是否協會會員'),
      { key: 'status', type: 'string', label: '在職狀態', enum: ENUMS.spStatus, alt: ['身分狀態'] },
      s('phone', '聯絡電話'), s('email', '電子郵件'), s('lineNote', 'LINE顯示名稱/備註'), s('note', '備註'),
      s('createdAt', '建立時間'), s('createdBy', '建立者'), s('updatedAt', '修改時間'), s('updatedBy', '修改者'),
      { key: 'version', type: 'number', label: '版本' },
    ],
  } satisfies TableDef<SP>,
  sessions: {
    sheet: '演出排程',
    legacySheet: 'Performance_Sessions',
    idKey: 'sessionId',
    columns: [
      s('sessionId', '排程編號'), s('date', '演出日期'), s('unit', '申請單位'), s('topic', '教案主題'),
      s('checkinTime', '報到時間'), s('startTime', '演出開始'), s('endTime', '演出結束'), s('location', '演出地點'), s('note', '備註'),
      s('status', '排程狀態', ENUMS.sessionStatus), s('cancelReason', '取消原因'),
      s('calendarEventId', '日曆事件ID'), s('syncStatus', '日曆同步狀態', ENUMS.syncStatus), s('syncError', '同步錯誤訊息'), s('syncedAt', '同步時間'),
      { key: 'isDeleted', type: 'bool', label: '已刪除' }, s('deleteReason', '刪除原因'), s('requestId', '請求編號'),
      s('createdAt', '建立時間'), s('createdBy', '建立者'), s('updatedAt', '修改時間'), s('updatedBy', '修改者'),
      { key: 'version', type: 'number', label: '版本' },
    ],
  } satisfies TableDef<Session>,
  assignments: {
    sheet: '演出明細',
    legacySheet: 'Performance_Assignments',
    idKey: 'assignmentId',
    columns: [
      s('assignmentId', '明細編號'), s('sessionId', '排程編號'), s('spId', 'SP編號'), s('spNameSnapshot', 'SP姓名'), s('topic', '教案主題'),
      s('attendance', '出席狀態', ENUMS.attendance), s('actualStart', '實際開始'), s('actualEnd', '實際結束'),
      { key: 'approvedMinutes', type: 'nullable-number', label: '核定分鐘數' }, s('minutesNote', '時數備註'),
      s('verifyStatus', '核定狀態', ENUMS.verifyStatus), s('verifiedBy', '核定人員'), s('verifiedAt', '核定時間'),
      { key: 'isDeleted', type: 'bool', label: '已刪除' },
      s('createdAt', '建立時間'), s('updatedAt', '修改時間'), s('updatedBy', '修改者'),
      { key: 'version', type: 'number', label: '版本' },
    ],
  } satisfies TableDef<Assignment>,
  notifications: {
    sheet: 'LINE通知紀錄',
    legacySheet: 'Notification_Log',
    idKey: 'notificationId',
    columns: [
      s('notificationId', '紀錄編號'), s('sessionId', '排程編號'), s('assignmentId', '明細編號'), s('spId', 'SP編號'),
      s('status', '通知狀態', ENUMS.notifyStatus), s('markedBy', '標記人員'), s('markedAt', '標記時間'), s('fingerprint', '排程指紋'), s('note', '備註'),
    ],
  } satisfies TableDef<NotificationEntry>,
  audit: {
    sheet: '異動紀錄',
    legacySheet: 'Audit_Log',
    idKey: 'auditId',
    columns: [
      s('auditId', '紀錄編號'), s('at', '時間'), s('actor', '操作人員'), s('entity', '對象類型', ENUMS.auditEntity), s('entityId', '對象編號'),
      s('action', '動作', ENUMS.auditAction), s('before', '異動前'), s('after', '異動後'), s('note', '說明'),
    ],
  } satisfies TableDef<AuditEntry>,
} as const;

export const SETTINGS_SHEET = '系統設定';
export const LEGACY_SETTINGS_SHEET = 'System_Settings';
export const SETTINGS_HEADER = ['設定項目', '設定值', '更新時間'];

export const SETTING_LABELS: Record<keyof Settings, string> = {
  calendarId: 'Google日曆ID',
  adminReminderEnabled: '管理員日曆提醒',
  adminReminderMinutes: '提前提醒分鐘數',
  individualTemplate: '個別通知範本',
  summaryTemplate: '總整理通知範本',
  units: '常用申請單位',
  topics: '常用教案主題',
  locations: '常用演出地點',
  inactiveThresholdDays: '長期未排演出門檻天數',
};

export interface RowTypes {
  sps: SP;
  sessions: Session;
  assignments: Assignment;
  notifications: NotificationEntry;
  audit: AuditEntry;
}
export type TableName = keyof RowTypes;

const BOOL_TRUE = ['TRUE', 'true', '是', 'Y', '1'];

/** 欄位在表頭中的位置：優先中文表頭，相容英文代碼表頭 */
export function colIndex(header: string[], c: { key: string; label: string; alt?: string[] }): number {
  for (const name of [c.label, ...(c.alt || []), c.key]) {
    const i = header.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

/** 物件 → Sheets 一列（依 def 欄位順序；狀態值轉中文） */
export function toRow<K extends TableName>(t: K, obj: RowTypes[K]): string[] {
  const def = TABLES[t] as unknown as TableDef<RowTypes[K]>;
  return def.columns.map((c) => {
    if (c.compute) return c.compute(obj);
    const v = obj[c.key as keyof RowTypes[K]] as unknown;
    if (c.type === 'bool') return v ? '是' : '否';
    if (v === null || v === undefined) return '';
    const str = String(v);
    return c.enum && str in c.enum ? c.enum[str] : str;
  });
}

/** Sheets 一列 → 物件，容忍 Sheets 自動轉換造成的 Date/number 型別，以及舊版英文代碼 */
export function fromRow<K extends TableName>(t: K, header: string[], row: unknown[], fmtDate: (d: Date, kind: 'date' | 'time' | 'datetime') => string): RowTypes[K] {
  const def = TABLES[t] as unknown as TableDef<RowTypes[K]>;
  const out: Record<string, unknown> = {};
  for (const c of def.columns) {
    if (c.compute) continue;
    const idx = colIndex(header, c);
    let v = idx >= 0 ? row[idx] : '';
    if (v instanceof Date) {
      const kind = /Time$|^actual/.test(c.key) ? 'time' : c.key === 'date' || c.key === 'joinDate' ? 'date' : 'datetime';
      v = fmtDate(v, kind);
    }
    if (c.type === 'number') out[c.key] = Number(v) || 0;
    else if (c.type === 'nullable-number') out[c.key] = v === '' || v === null || v === undefined ? null : Number(v);
    else if (c.type === 'bool') out[c.key] = v === true || BOOL_TRUE.includes(String(v).trim());
    else {
      let str = v === null || v === undefined ? '' : String(v);
      if (c.enum) {
        const code = Object.entries(c.enum).find(([, label]) => label === str)?.[0];
        if (code) str = code;
      }
      out[c.key] = str;
    }
  }
  return out as unknown as RowTypes[K];
}
