import type { Assignment, NotificationEntry, Session, Settings } from './types';
import { addDays, fmtDate, fmtDateShort, weekdayLabel } from './time';

export const DEFAULT_INDIVIDUAL_TEMPLATE = `{SP姓名} 您好，提醒您{相對日}有標準化病人（SP）演出安排：

📅 演出日期：{日期}
📍 演出地點：{地點}
🕘 報到時間：{報到時間}
⏰ 演出時間：{開始時間}–{結束時間}
📋 教案主題：{教案名稱}

再請您依報到時間準時抵達，謝謝您的協助！`;

export const DEFAULT_SUMMARY_TEMPLATE = `【SP 演出總整理】{日期}
共 {場次數} 場、SP {人次} 人次

{場次清單}

如有異動將另行通知，謝謝各位的協助！`;

export const DEFAULT_SETTINGS: Settings = {
  calendarId: '',
  adminReminderEnabled: true,
  adminReminderMinutes: 1440,
  individualTemplate: DEFAULT_INDIVIDUAL_TEMPLATE,
  summaryTemplate: DEFAULT_SUMMARY_TEMPLATE,
  units: [],
  topics: [],
  locations: [],
  inactiveThresholdDays: 90,
  feeHourly: 500,
  feeHalf: 250,
  feeThresholdMinutes: 15,
};

export const PLACEHOLDERS = [
  '{SP姓名}', '{相對日}', '{日期}', '{星期}', '{地點}', '{報到時間}', '{開始時間}', '{結束時間}', '{教案名稱}', '{申請單位}', '{備註}',
];
export const SUMMARY_PLACEHOLDERS = ['{日期}', '{場次數}', '{人次}', '{場次清單}'];

export function relativeDay(date: string, today: string): string {
  if (date === today) return '今日';
  if (date === addDays(today, 1)) return '明日';
  if (date === addDays(today, 2)) return '後天';
  return ` ${fmtDateShort(date)} `;
}

function fill(tpl: string, map: Record<string, string>): string {
  return tpl.replace(/\{[^{}]+\}/g, (k) => (k in map ? map[k] : k));
}

export function renderIndividual(tpl: string, s: Session, spName: string, today: string, topic?: string): string {
  return fill(tpl, {
    '{SP姓名}': spName,
    '{相對日}': relativeDay(s.date, today),
    '{日期}': fmtDate(s.date),
    '{星期}': weekdayLabel(s.date),
    '{地點}': s.location || '（未填）',
    '{報到時間}': s.checkinTime,
    '{開始時間}': s.startTime,
    '{結束時間}': s.endTime,
    '{教案名稱}': topic || s.topic,
    '{申請單位}': s.unit,
    '{備註}': s.note || '',
  });
}

export function renderSummary(
  tpl: string,
  date: string,
  items: { session: Session; spNames: string[]; cases?: { topic: string; spNames: string[] }[] }[],
): string {
  const list = items
    .map(({ session: s, spNames, cases }, i) => {
      const multi = cases && cases.length > 1;
      return [
        `${i + 1}. ${s.startTime}–${s.endTime}｜${s.topic}`,
        `   單位：${s.unit}`,
        `   地點：${s.location}`,
        `   報到：${s.checkinTime}`,
        ...(multi ? cases!.map((c) => `   ${c.topic}：${c.spNames.join('、')}`) : [`   SP：${spNames.join('、')}`]),
        s.note ? `   備註：${s.note}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
  return fill(tpl, {
    '{日期}': fmtDate(date),
    '{場次數}': String(items.length),
    '{人次}': String(items.reduce((n, x) => n + x.spNames.length, 0)),
    '{場次清單}': list || '（無排程）',
  });
}

/** 排程內容指紋：影響 SP 行程的欄位變動時改變 */
export function sessionFingerprint(s: Session, a?: Assignment): string {
  const src = [s.date, s.checkinTime, s.startTime, s.endTime, s.location, a?.topic || s.topic, s.status, s.isDeleted ? 'D' : '', a?.attendance === 'cancelled' || a?.isDeleted ? 'X' : ''].join('|');
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export type NotifyState = 'not_notified' | 'notified' | 'needs_renotify';

/** 取每個 assignment 最新一筆人工標記 */
export function latestNotifications(list: NotificationEntry[]): Map<string, NotificationEntry> {
  const m = new Map<string, NotificationEntry>();
  for (const n of list) {
    const cur = m.get(n.assignmentId);
    if (!cur || n.markedAt > cur.markedAt || (n.markedAt === cur.markedAt && n.notificationId > cur.notificationId))
      m.set(n.assignmentId, n);
  }
  return m;
}

export function notifyState(latest: NotificationEntry | undefined, s: Session, a: Assignment): NotifyState {
  if (!latest || latest.status !== 'notified') return 'not_notified';
  return latest.fingerprint === sessionFingerprint(s, a) ? 'notified' : 'needs_renotify';
}
