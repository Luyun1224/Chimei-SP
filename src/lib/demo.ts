/**
 * 本機示範模式後端：在瀏覽器內執行「與 Apps Script 相同」的 service，
 * 只是把 Google Sheets / Calendar 換成 localStorage。畫面會明確標示示範模式，不冒充真實連線。
 */
import { createService } from '../../server/service';
import { createMemoryEnv, createMemoryRepo, createMockCalendar, emptyState, type MemoryState, type MockEvent } from '../../server/mock/memory';
import type { ActionName, ApiActions, ApiResponse, SessionInput } from '../../shared/types';
import { addDays, todayInTaipei } from '../../shared/time';

const KEY = 'sp-hub-demo-v1';
const CAL_KEY = 'sp-hub-demo-calendar-v1';
export const DEMO_USER = 'demo-admin@localhost';

function loadState(): MemoryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return emptyState();
}

let state = loadState();
const events: MockEvent[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(CAL_KEY) || '[]');
  } catch {
    return [];
  }
})();
const persist = () => {
  localStorage.setItem(KEY, JSON.stringify(state));
  localStorage.setItem(CAL_KEY, JSON.stringify(events));
};
const calendar = createMockCalendar(events, persist);
const env = createMemoryEnv({ user: DEMO_USER, admins: [DEMO_USER] });
let service = createService({ repo: createMemoryRepo(state, persist), env, calendar: calendar.gateway });

export const demoControls = {
  calendar,
  events,
  /** 讓下一次 Calendar 呼叫失敗，用於測試重試流程 */
  failNextCalendarCall() {
    calendar.ctl.failNext = 1;
  },
  reset() {
    state = emptyState();
    events.splice(0, events.length);
    persist();
    service = createService({ repo: createMemoryRepo(state, persist), env, calendar: calendar.gateway });
  },
  /** 產生示範資料（僅示範模式可用，所有資料皆標示為示範） */
  seed() {
    this.reset();
    const call = <A extends ActionName>(a: A, p: ApiActions[A]['req']) => {
      const r = service.dispatch(a, p);
      if (!r.ok) throw new Error(r.error.message);
      return r.data;
    };
    call('settings.save', { patch: { calendarId: 'demo-calendar@group.calendar.google.com' } });
    const names = ['王小明', '李美華', '陳志強', '林淑芬', '張家豪', '黃雅婷', '吳建國', '劉怡君', '蔡宗翰', '許雅雯', '鄭文彬', '謝佩珊'];
    const sps = names.map((name, i) =>
      (call('sp.save', { input: { name, status: i === 10 ? 'paused' : 'active', phone: `09${String(12345678 + i * 1111).slice(0, 8)}`, gender: i % 4 ? '女' : '男', birthday: `${45 + i * 2}.0${1 + (i % 9)}.1${i % 9}`, firstCertYear: String(101 + (i % 12)), role: i % 5 ? 'SP' : 'SPT', level: `SP${i % 4}`, certStatus: i % 3 ? '符合' : '尚未認證', isMember: i % 2 ? '是' : '否' } }) as { sps: { spId: string }[] }).sps[0].spId,
    );
    const units = ['醫學系 UGY', '護理部', 'PGY 訓練', '藥劑部', '醫學系 Clerk', '急診醫學部'];
    const topics = ['胸痛病史詢問', '腹痛身體檢查', '糖尿病衛教', '壞消息告知', '術前說明與同意', '頭痛鑑別診斷', '用藥諮詢', '跌倒風險評估', '出院衛教'];
    const locs = ['技能中心 3F 第一考場', '技能中心 3F 第二考場', '技能中心 3F 第三考場', '教學大樓 B1 模擬病房'];
    const slots: [string, string, string][] = [['08:00', '08:30', '11:30'], ['12:30', '13:00', '17:00'], ['08:30', '09:00', '11:00'], ['13:30', '14:00', '16:30']];
    let seed = 11;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const today = todayInTaipei();
    const year = Number(today.slice(0, 4));
    const mk = (date: string, k: number) => {
      const [c, s, e] = pick(slots);
      const n = 1 + Math.floor(rnd() * 3);
      const ids = [...new Set(Array.from({ length: n }, () => pick(sps.filter((_, i) => i !== 10))))];
      const input: SessionInput = { date, unit: pick(units), topic: pick(topics), checkinTime: c, startTime: s, endTime: e, location: pick(locs), spIds: ids, note: k % 7 === 0 ? '請著便服' : '' };
      return call('session.save', { input, requestId: `seed-${k}`, confirm: true }).sessions![0];
    };
    let k = 0;
    for (let m = 1; m <= 12; m++) {
      const count = 3 + Math.floor(rnd() * 4);
      for (let i = 0; i < count; i++) {
        const date = `${year}-${String(m).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 27)).padStart(2, '0')}`;
        const s = mk(date, k++);
        if (date < today) {
          if (rnd() < 0.08) {
            call('session.cancel', { sessionId: s.sessionId, reason: '課程調整', expectedVersion: s.version });
            continue;
          }
          if (date < addDays(today, -10) || rnd() < 0.5) {
            call('session.verifyAllAsScheduled', { sessionId: s.sessionId });
          } else if (rnd() < 0.5) {
            call('session.complete', { sessionId: s.sessionId, expectedVersion: s.version });
          }
        }
      }
    }
    // 前一年少量歷史，供歷年趨勢
    for (let i = 0; i < 14; i++) {
      const s = mk(`${year - 1}-${String(1 + (i % 12)).padStart(2, '0')}-${String(3 + i).padStart(2, '0')}`, k++);
      call('session.verifyAllAsScheduled', { sessionId: s.sessionId });
    }
    mk(addDays(today, 1), k++);
    mk(addDays(today, 1), k++);
    mk(today, k++);
  },
};

export function demoCall<A extends ActionName>(action: A, payload: ApiActions[A]['req']): Promise<ApiResponse<ApiActions[A]['res']>> {
  return new Promise((resolve) => {
    // 模擬網路延遲，確保載入狀態被正確處理
    setTimeout(() => {
      const r = service.dispatch(action, JSON.parse(JSON.stringify(payload ?? {})));
      if (r.ok && action === 'bootstrap') (r.data as { mode: string }).mode = 'demo';
      resolve(JSON.parse(JSON.stringify(r)));
    }, action === 'bootstrap' ? 350 : 220);
  });
}
