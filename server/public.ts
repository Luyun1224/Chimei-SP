/**
 * 公開檢視模式（未綁定裝置的任何人）：只回傳去識別化的資料，且一律唯讀。
 *
 * 原則：伺服器端先移除個資才送出，前端拿不到原始資料。
 * - SP：只保留系統編號、遮蔽後姓名（王○明）、在職狀態；生日、年齡、性別、電話、Email、LINE、證書、備註全部移除
 * - 明細：SP 姓名遮蔽；時數備註（含費用）、核定人員等移除
 * - 排程：建立／修改／核定者（管理員 Email）、備註、取消／刪除原因移除
 * - 通知紀錄、稽核紀錄、通知範本、日曆 ID：不提供
 */
import type { ApiResponse, Assignment, SP, Session, Snapshot } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/template';

/** 姓名遮蔽：王小明 → 王○明；李華 → 李○；歐陽小明 → 歐○○明 */
export function maskName(name: string): string {
  const s = [...String(name || '').trim()];
  if (s.length <= 1) return s.length ? '○' : '';
  if (s.length === 2) return s[0] + '○';
  return s[0] + '○'.repeat(s.length - 2) + s[s.length - 1];
}

function publicSp(p: SP): SP {
  return {
    spId: p.spId, name: maskName(p.name), status: p.status,
    gender: '', birthday: '', firstCertYear: '', assocCert: '', certNo: '', role: '', level: '', certStatus: '', isMember: '',
    phone: '', email: '', lineNote: '', note: '',
    createdAt: '', createdBy: '', updatedAt: '', updatedBy: '', version: 0,
  };
}

function publicSession(s: Session): Session {
  return {
    ...s,
    note: '', cancelReason: '', deleteReason: '', requestId: '', calendarEventId: '', syncError: '',
    createdBy: '', updatedBy: '', createdAt: '', updatedAt: '', version: 0,
  };
}

function publicAssignment(a: Assignment): Assignment {
  return {
    ...a,
    spNameSnapshot: maskName(a.spNameSnapshot), minutesNote: '', verifiedBy: '', updatedBy: '', verifiedAt: '', createdAt: '', updatedAt: '', version: 0,
  };
}

export function publicSnapshot(s: Snapshot): Snapshot {
  return {
    mode: s.mode,
    apiVersion: s.apiVersion,
    access: 'public',
    user: { email: '', isAdmin: false },
    today: s.today,
    serverTime: s.serverTime,
    sps: s.sps.map(publicSp),
    sessions: s.sessions.map(publicSession),
    assignments: s.assignments.filter((a) => !a.isDeleted).map(publicAssignment),
    notifications: [],
    settings: { ...DEFAULT_SETTINGS, units: s.settings.units, topics: s.settings.topics, locations: s.settings.locations, calendarId: '', individualTemplate: '', summaryTemplate: '' },
  };
}

/** 公開模式只允許讀取總覽資料；其餘一律拒絕 */
export function publicDispatch(action: string, full: () => ApiResponse<Snapshot>): ApiResponse<unknown> {
  if (action !== 'bootstrap') return { ok: false, error: { code: 'FORBIDDEN', message: '公開檢視模式為唯讀，請以管理者專屬網址開啟' } };
  const r = full();
  return r.ok ? { ok: true, data: publicSnapshot(r.data) } : r;
}
