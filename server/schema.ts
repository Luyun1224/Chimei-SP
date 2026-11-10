import type { Assignment, AuditEntry, NotificationEntry, SP, Session } from '../shared/types';

/** 欄位型別：決定 Sheets 字串 ↔ 物件的轉換 */
export type ColType = 'string' | 'number' | 'nullable-number' | 'bool';

export interface TableDef<T> {
  sheet: string;
  idKey: keyof T & string;
  columns: { key: keyof T & string; type: ColType; label: string }[];
}

const s = <K extends string>(key: K, label: string) => ({ key, type: 'string' as const, label });

export const TABLES = {
  sps: {
    sheet: 'SP_Master',
    idKey: 'spId',
    columns: [
      s('spId', 'SP_ID'), s('name', '姓名'), s('phone', '聯絡電話'), s('email', '電子郵件'), s('lineNote', 'LINE 顯示名稱/備註'),
      s('status', '身分狀態'), s('joinDate', '加入日期'), s('certification', '認證狀態'), s('note', '備註'),
      s('createdAt', '建立時間'), s('createdBy', '建立者'), s('updatedAt', '修改時間'), s('updatedBy', '修改者'),
      { key: 'version', type: 'number', label: '版本' },
    ],
  } satisfies TableDef<SP>,
  sessions: {
    sheet: 'Performance_Sessions',
    idKey: 'sessionId',
    columns: [
      s('sessionId', '排程ID'), s('date', '演出日期'), s('unit', '申請單位'), s('topic', '教案主題'),
      s('checkinTime', '報到時間'), s('startTime', '演出開始'), s('endTime', '演出結束'), s('location', '演出地點'), s('note', '備註'),
      s('status', '排程狀態'), s('cancelReason', '取消原因'),
      s('calendarEventId', 'Calendar Event ID'), s('syncStatus', '同步狀態'), s('syncError', '同步錯誤'), s('syncedAt', '同步時間'),
      { key: 'isDeleted', type: 'bool', label: '已刪除' }, s('deleteReason', '刪除原因'), s('requestId', '請求ID'),
      s('createdAt', '建立時間'), s('createdBy', '建立者'), s('updatedAt', '修改時間'), s('updatedBy', '修改者'),
      { key: 'version', type: 'number', label: '版本' },
    ],
  } satisfies TableDef<Session>,
  assignments: {
    sheet: 'Performance_Assignments',
    idKey: 'assignmentId',
    columns: [
      s('assignmentId', '明細ID'), s('sessionId', '排程ID'), s('spId', 'SP_ID'), s('spNameSnapshot', 'SP姓名(快照)'),
      s('attendance', '出席狀態'), s('actualStart', '實際開始'), s('actualEnd', '實際結束'),
      { key: 'approvedMinutes', type: 'nullable-number', label: '核定分鐘' }, s('minutesNote', '時數備註'),
      s('verifyStatus', '核定狀態'), s('verifiedBy', '核定人員'), s('verifiedAt', '核定時間'),
      { key: 'isDeleted', type: 'bool', label: '已刪除' },
      s('createdAt', '建立時間'), s('updatedAt', '修改時間'), s('updatedBy', '修改者'),
      { key: 'version', type: 'number', label: '版本' },
    ],
  } satisfies TableDef<Assignment>,
  notifications: {
    sheet: 'Notification_Log',
    idKey: 'notificationId',
    columns: [
      s('notificationId', '紀錄ID'), s('sessionId', '排程ID'), s('assignmentId', '明細ID'), s('spId', 'SP_ID'),
      s('status', '通知狀態'), s('markedBy', '標記人員'), s('markedAt', '標記時間'), s('fingerprint', '排程指紋'), s('note', '備註'),
    ],
  } satisfies TableDef<NotificationEntry>,
  audit: {
    sheet: 'Audit_Log',
    idKey: 'auditId',
    columns: [
      s('auditId', '稽核ID'), s('at', '時間'), s('actor', '操作人員'), s('entity', '對象類型'), s('entityId', '對象ID'),
      s('action', '動作'), s('before', '異動前'), s('after', '異動後'), s('note', '說明'),
    ],
  } satisfies TableDef<AuditEntry>,
} as const;

export const SETTINGS_SHEET = 'System_Settings';

export interface RowTypes {
  sps: SP;
  sessions: Session;
  assignments: Assignment;
  notifications: NotificationEntry;
  audit: AuditEntry;
}
export type TableName = keyof RowTypes;

/** 物件 → Sheets 一列（全部以字串寫入，欄位格式於初始化時設為純文字） */
export function toRow<K extends TableName>(t: K, obj: RowTypes[K]): string[] {
  const def = TABLES[t] as unknown as TableDef<RowTypes[K]>;
  return def.columns.map((c) => {
    const v = obj[c.key] as unknown;
    if (c.type === 'bool') return v ? 'TRUE' : 'FALSE';
    if (v === null || v === undefined) return '';
    return String(v);
  });
}

/** Sheets 一列 → 物件，容忍 Sheets 自動轉換造成的 Date/number 型別 */
export function fromRow<K extends TableName>(t: K, header: string[], row: unknown[], fmtDate: (d: Date, kind: 'date' | 'time' | 'datetime') => string): RowTypes[K] {
  const def = TABLES[t] as unknown as TableDef<RowTypes[K]>;
  const out: Record<string, unknown> = {};
  for (const c of def.columns) {
    const idx = header.indexOf(c.key);
    let v = idx >= 0 ? row[idx] : '';
    if (v instanceof Date) {
      const kind = /Time$|^actual/.test(c.key) ? 'time' : c.key === 'date' || c.key === 'joinDate' ? 'date' : 'datetime';
      v = fmtDate(v, kind);
    }
    if (c.type === 'number') out[c.key] = Number(v) || 0;
    else if (c.type === 'nullable-number') out[c.key] = v === '' || v === null || v === undefined ? null : Number(v);
    else if (c.type === 'bool') out[c.key] = v === true || String(v).toUpperCase() === 'TRUE';
    else out[c.key] = v === null || v === undefined ? '' : String(v);
  }
  return out as unknown as RowTypes[K];
}
