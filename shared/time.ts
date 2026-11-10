/** 時間工具：全部以字串運算，不經 Date 物件的時區轉換，避免 UTC 錯位。台灣無日光節約時間，偏移固定 +08:00。 */

export const TZ = 'Asia/Taipei';
export const TZ_OFFSET = '+08:00';
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export const isValidTime = (s: string) => TIME_RE.test(s);

export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export function fromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function diffMinutes(start: string, end: string): number {
  return toMinutes(end) - toMinutes(start);
}

/** 以 UTC 正午運算日期，跨日、跨月皆安全 */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}
export function weekdayLabel(date: string): string {
  return WEEK[weekday(date)];
}
/** 週一為一週起點 */
export function startOfWeek(date: string): string {
  const wd = weekday(date);
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}
export function daysBetween(a: string, b: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(b) - p(a)) / 86400000);
}
export function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}
export function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

/** 取得 Asia/Taipei 的今天（瀏覽器與 Node 用；Apps Script 端另以 Utilities.formatDate 取得） */
export function todayInTaipei(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 8 * 3600_000);
  return t.toISOString().slice(0, 10);
}
export function nowIsoTaipei(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 8 * 3600_000);
  return t.toISOString().slice(0, 19) + TZ_OFFSET;
}

/** 'yyyy-MM-dd' + 'HH:mm' → 帶時區 ISO 字串，給 Calendar 使用 */
export function toZonedIso(date: string, time: string): string {
  return `${date}T${time}:00${TZ_OFFSET}`;
}

export function fmtDate(date: string): string {
  if (!date) return '';
  return `${date.slice(0, 4)}/${date.slice(5, 7)}/${date.slice(8, 10)}（${weekdayLabel(date)}）`;
}
export function fmtDateShort(date: string): string {
  if (!date) return '';
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${weekdayLabel(date)}）`;
}
export function rocYear(y: number): number {
  return y - 1911;
}

/** 分鐘 → 小時（最多兩位小數，僅供顯示） */
export function minutesToHours(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}
export function fmtHours(min: number): string {
  const h = minutesToHours(min);
  return h.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
}
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} 分`;
  return m ? `${h} 小時 ${m} 分` : `${h} 小時`;
}
