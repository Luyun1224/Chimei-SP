/// <reference types="google-apps-script" />
import type { CalendarGateway } from '../ports';

const TAG = 'spHubSessionId';

function getCal(calendarId: string) {
  const cal = CalendarApp.getCalendarById(calendarId);
  if (!cal) throw new Error(`找不到行事曆或沒有權限：${calendarId}（請確認已將此行事曆以「變更活動」權限分享給操作中的管理員帳號）`);
  return cal;
}

/** 以事件 tag 在當日前後搜尋，作為 eventId 遺失時的去重依據 */
function findByTag(cal: GoogleAppsScript.Calendar.Calendar, date: string, sessionId: string) {
  const day = new Date(`${date}T00:00:00+08:00`);
  const from = new Date(day.getTime() - 86400000);
  const to = new Date(day.getTime() + 2 * 86400000);
  return cal.getEvents(from, to).find((e) => e.getTag(TAG) === sessionId) || null;
}

function safeGetById(cal: GoogleAppsScript.Calendar.Calendar, eventId: string) {
  if (!eventId) return null;
  try {
    return cal.getEventById(eventId);
  } catch {
    return null;
  }
}

export const gasCalendar: CalendarGateway = {
  upsert(calendarId, eventId, ev) {
    const cal = getCal(calendarId);
    const start = new Date(ev.startIso);
    const end = new Date(ev.endIso);
    let event = safeGetById(cal, eventId) || findByTag(cal, ev.date, ev.sessionId);
    if (event) {
      event.setTitle(ev.title);
      event.setTime(start, end);
      event.setDescription(ev.description);
      event.setLocation(ev.location);
    } else {
      // 不加入任何來賓 → 不會寄送邀請或通知信給 SP
      event = cal.createEvent(ev.title, start, end, { description: ev.description, location: ev.location });
    }
    event.setTag(TAG, ev.sessionId);
    event.removeAllReminders();
    if (ev.reminderMinutes !== null && ev.reminderMinutes > 0) event.addPopupReminder(Math.min(ev.reminderMinutes, 40320));
    return event.getId();
  },
  remove(calendarId, eventId, sessionId, date) {
    const cal = getCal(calendarId);
    const event = safeGetById(cal, eventId) || findByTag(cal, date, sessionId);
    if (event) event.deleteEvent();
  },
};
