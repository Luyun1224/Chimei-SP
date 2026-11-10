/**
 * 業務邏輯（與執行環境無關）。Apps Script 與本機示範模式共用同一份程式，確保行為一致、可單元測試。
 */
import type {
  ActionName, ApiActions, ApiResponse, Assignment, AuditEntry, NotificationEntry, SP, Session, SessionInput,
  Settings, Warning,
} from '../shared/types';
import { AppError, clean, validateSessionInput, validateSpInput, validateVerifyInput } from '../shared/validate';
import { DEFAULT_SETTINGS, sessionFingerprint } from '../shared/template';
import { diffMinutes, toMinutes, toZonedIso } from '../shared/time';
import { computeStats } from '../shared/stats';
import type { CalendarGateway, Env, Repo } from './ports';
import type { TableName, RowTypes } from './schema';

const AUDIT_MAX = 45000; // Sheets 單格上限 50,000 字元

export interface Deps {
  repo: Repo;
  env: Env;
  calendar: CalendarGateway;
}

export function createService({ repo, env, calendar }: Deps) {
  // ---------- 小工具 ----------
  const id = (prefix: string) => `${prefix}-${env.today().replace(/-/g, '')}-${env.randomId()}`;

  function find<K extends TableName>(t: K, key: string): RowTypes[K] {
    const idKey = ({ sps: 'spId', sessions: 'sessionId', assignments: 'assignmentId', notifications: 'notificationId', audit: 'auditId' } as const)[t];
    const row = repo.all(t).find((r) => (r as unknown as Record<string, string>)[idKey] === key);
    if (!row) throw new AppError('NOT_FOUND', '找不到資料，可能已被他人刪除，請重新整理');
    return row;
  }

  function audit(entity: AuditEntry['entity'], entityId: string, action: string, before: unknown, after: unknown, note = '') {
    const j = (v: unknown) => (v === undefined || v === null ? '' : JSON.stringify(v).slice(0, AUDIT_MAX));
    repo.insert('audit', [{ auditId: id('L'), at: env.nowIso(), actor: env.user(), entity, entityId, action, before: j(before), after: j(after), note: clean(note, 1000) }]);
  }

  function checkVersion(current: { version: number }, expected: number | undefined) {
    if (expected !== undefined && current.version !== expected)
      throw new AppError('VERSION_CONFLICT', '這筆資料剛剛已被其他人修改，請重新載入後再操作', { current });
  }

  function getSettings(): Settings {
    const raw = repo.getSettings();
    const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(k in raw) || raw[k] === '') continue;
      try {
        out[k] = typeof def === 'string' ? raw[k] : JSON.parse(raw[k]);
      } catch {
        out[k] = def;
      }
    }
    return out as unknown as Settings;
  }

  /** 自動把新的單位／教案／地點加入常用選項 */
  function rememberOptions(input: SessionInput) {
    const st = getSettings();
    const patch: Record<string, string> = {};
    const add = (key: 'units' | 'topics' | 'locations', v: string) => {
      if (v && !st[key].includes(v)) patch[key] = JSON.stringify([...st[key], v].slice(-300));
    };
    add('units', input.unit);
    add('topics', input.topic);
    add('locations', input.location);
    if (Object.keys(patch).length) repo.setSettings(patch);
  }

  const liveAssignmentsOf = (sessionId: string) => repo.all('assignments').filter((a) => a.sessionId === sessionId && !a.isDeleted);

  // ---------- 衝突／重複偵測 ----------
  function detectWarnings(input: SessionInput, selfId?: string): Warning[] {
    const warnings: Warning[] = [];
    const sps = new Map(repo.all('sps').map((p) => [p.spId, p]));
    const others = repo.all('sessions').filter((s) => s.sessionId !== selfId && !s.isDeleted && s.status !== 'cancelled' && s.date === input.date);
    const s1 = toMinutes(input.checkinTime), e1 = toMinutes(input.endTime);
    for (const o of others) {
      const overlap = s1 < toMinutes(o.endTime) && toMinutes(o.checkinTime) < e1;
      if (o.unit === input.unit && o.topic === input.topic && o.startTime === input.startTime)
        warnings.push({ type: 'duplicate', otherSessionId: o.sessionId, message: `已有相同日期、單位、教案與開始時間的排程（${o.startTime}–${o.endTime}），可能重複登錄` });
      if (!overlap) continue;
      const busy = liveAssignmentsOf(o.sessionId).filter((a) => a.attendance !== 'cancelled' && input.spIds.includes(a.spId));
      for (const a of busy)
        warnings.push({
          type: 'conflict', spId: a.spId, otherSessionId: o.sessionId,
          message: `${sps.get(a.spId)?.name || a.spNameSnapshot} 在 ${o.checkinTime}–${o.endTime} 已排定「${o.topic}」（${o.unit}）`,
        });
    }
    for (const spId of input.spIds) {
      const p = sps.get(spId);
      if (!p) throw new AppError('VALIDATION', '選擇的 SP 不存在，請重新整理');
      if (p.status !== 'active') warnings.push({ type: 'sp_inactive', spId, message: `${p.name} 目前狀態為「${p.status === 'paused' ? '暫停' : '停用'}」` });
    }
    return warnings;
  }

  // ---------- Calendar 同步（在鎖外呼叫 Google API，結果再於鎖內寫回） ----------
  function buildEvent(s: Session) {
    const names = liveAssignmentsOf(s.sessionId).filter((a) => a.attendance !== 'cancelled').map((a) => a.spNameSnapshot);
    const st = getSettings();
    return {
      sessionId: s.sessionId,
      title: `【SP演出】${s.topic}｜${s.unit}`,
      location: s.location,
      startIso: toZonedIso(s.date, s.startTime),
      endIso: toZonedIso(s.date, s.endTime),
      date: s.date,
      reminderMinutes: st.adminReminderEnabled ? st.adminReminderMinutes : null,
      description: [
        `SP：${names.join('、') || '（未指派）'}`,
        `報到時間：${s.checkinTime}`,
        `演出時間：${s.startTime}–${s.endTime}`,
        `教案主題：${s.topic}`,
        `申請單位：${s.unit}`,
        `演出地點：${s.location}`,
        s.note ? `備註：${s.note}` : '',
        '',
        `系統排程 ID：${s.sessionId}`,
        '（本事件由 SP Performance Hub 管理，請勿直接修改；此提醒僅供管理員，不代替 LINE 人工通知）',
      ].filter((x) => x !== '').join('\n'),
    };
  }

  function syncCalendar(sessionId: string): Session {
    const s = find('sessions', sessionId);
    const st = getSettings();
    let patch: Partial<Session>;
    if (!st.calendarId) {
      patch = { syncStatus: 'disabled', syncError: '尚未設定 Calendar ID' };
    } else {
      try {
        if (s.isDeleted || s.status === 'cancelled') {
          calendar.remove(st.calendarId, s.calendarEventId, s.sessionId, s.date);
          patch = { calendarEventId: '', syncStatus: 'removed', syncError: '', syncedAt: env.nowIso() };
        } else {
          const eventId = calendar.upsert(st.calendarId, s.calendarEventId, buildEvent(s));
          patch = { calendarEventId: eventId, syncStatus: 'synced', syncError: '', syncedAt: env.nowIso() };
        }
      } catch (e) {
        patch = { syncStatus: 'failed', syncError: clean((e as Error).message || String(e), 500) };
      }
    }
    // 只寫回同步欄位，不覆蓋同時間其他人的內容修改，也不變更 version
    return env.withLock(() => {
      repo.refresh();
      const latest = find('sessions', sessionId);
      const next = { ...latest, ...patch };
      repo.update('sessions', next);
      if (patch.syncStatus === 'failed') audit('session', sessionId, 'calendar_sync_failed', null, null, patch.syncError);
      return next;
    });
  }

  // ---------- Actions ----------
  type Handler<A extends ActionName> = (req: ApiActions[A]['req']) => ApiActions[A]['res'];
  const handlers: { [A in ActionName]: Handler<A> } = {
    bootstrap: () => ({
      mode: 'gas',
      user: { email: env.user(), isAdmin: true },
      today: env.today(),
      serverTime: env.nowIso(),
      sps: repo.all('sps'),
      sessions: repo.all('sessions').filter((s) => !s.isDeleted),
      assignments: repo.all('assignments'),
      notifications: repo.all('notifications'),
      settings: getSettings(),
    }),

    'sp.save': ({ spId, input, expectedVersion }) => {
      const v = validateSpInput(input);
      return env.withLock(() => {
        repo.refresh();
        const now = env.nowIso(), actor = env.user();
        const dup = repo.all('sps').find((p) => p.name === v.name && p.spId !== spId && p.status !== 'inactive');
        if (dup && !spId) throw new AppError('VALIDATION', `已有同名 SP「${v.name}」，若為不同人請在姓名加註區別`);
        if (!spId) {
          const sp: SP = { spId: id('SP'), ...v, createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor, version: 1 };
          repo.insert('sps', [sp]);
          audit('sp', sp.spId, 'create', null, sp);
          return { sps: [sp] };
        }
        const cur = find('sps', spId);
        checkVersion(cur, expectedVersion);
        const next: SP = { ...cur, ...v, updatedAt: now, updatedBy: actor, version: cur.version + 1 };
        repo.update('sps', next);
        audit('sp', spId, cur.status !== next.status ? `status:${next.status}` : 'update', cur, next);
        return { sps: [next] };
      });
    },

    'session.save': ({ sessionId, input, expectedVersion, requestId, confirm }) => {
      const v = validateSessionInput(input);
      const reqId = clean(requestId, 80);
      const written = env.withLock(() => {
        repo.refresh();
        // 冪等：同一個 requestId 重送（例如網路逾時重試）不會建立第二筆
        if (!sessionId && reqId) {
          const prev = repo.all('sessions').find((s) => s.requestId === reqId);
          if (prev) return { session: prev, replay: true };
        }
        const warnings = detectWarnings(v, sessionId);
        if (warnings.length && !confirm) throw new AppError('NEEDS_CONFIRMATION', '偵測到可能的衝突或重複，請確認', { warnings });
        const now = env.nowIso(), actor = env.user();
        const spMap = new Map(repo.all('sps').map((p) => [p.spId, p]));
        const newAssignment = (sid: string, spId: string): Assignment => ({
          assignmentId: id('A'), sessionId: sid, spId, spNameSnapshot: spMap.get(spId)!.name, attendance: 'pending', actualStart: '', actualEnd: '',
          approvedMinutes: null, minutesNote: '', verifyStatus: 'unverified', verifiedBy: '', verifiedAt: '', isDeleted: false,
          createdAt: now, updatedAt: now, updatedBy: actor, version: 1,
        });
        const fields = { date: v.date, unit: v.unit, topic: v.topic, checkinTime: v.checkinTime, startTime: v.startTime, endTime: v.endTime, location: v.location, note: v.note };

        if (!sessionId) {
          const s: Session = {
            sessionId: id('S'), ...fields, status: 'scheduled', cancelReason: '', calendarEventId: '', syncStatus: 'pending', syncError: '', syncedAt: '',
            isDeleted: false, deleteReason: '', requestId: reqId, createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor, version: 1,
          };
          const as = v.spIds.map((spId) => newAssignment(s.sessionId, spId));
          repo.insert('sessions', [s]);
          repo.insert('assignments', as);
          audit('session', s.sessionId, 'create', null, { ...s, spIds: v.spIds }, warnings.map((w) => w.message).join('；'));
          rememberOptions(v);
          return { session: s, warnings };
        }

        const cur = find('sessions', sessionId);
        if (cur.isDeleted) throw new AppError('STATE', '此排程已刪除');
        if (cur.status === 'cancelled') throw new AppError('STATE', '已取消的排程不可修改');
        checkVersion(cur, expectedVersion);
        const existing = liveAssignmentsOf(sessionId);
        const removed = existing.filter((a) => !v.spIds.includes(a.spId));
        const locked = removed.filter((a) => a.verifyStatus === 'verified');
        if (locked.length) throw new AppError('STATE', `${locked.map((a) => a.spNameSnapshot).join('、')} 已完成時數核定，請先在「演出核定」取消核定後再移除`);
        for (const a of removed) repo.update('assignments', { ...a, isDeleted: true, updatedAt: now, updatedBy: actor, version: a.version + 1 });
        const added = v.spIds.filter((spId) => !existing.some((a) => a.spId === spId)).map((spId) => newAssignment(sessionId, spId));
        if (added.length) repo.insert('assignments', added);
        const next: Session = { ...cur, ...fields, syncStatus: 'pending', updatedAt: now, updatedBy: actor, version: cur.version + 1 };
        repo.update('sessions', next);
        audit('session', sessionId, 'update', { ...cur, spIds: existing.map((a) => a.spId) }, { ...next, spIds: v.spIds }, warnings.map((w) => w.message).join('；'));
        rememberOptions(v);
        return { session: next, warnings };
      });
      // 已存在的 requestId：若先前同步失敗則重試一次，但絕不重複建立
      const synced = written.session.syncStatus === 'synced' ? written.session : syncCalendar(written.session.sessionId);
      return {
        sessions: [synced],
        assignments: repo.all('assignments').filter((a) => a.sessionId === synced.sessionId),
        warnings: 'warnings' in written ? written.warnings : [],
        settings: getSettings(),
      };
    },

    'session.cancel': ({ sessionId, reason, expectedVersion }) => {
      const why = clean(reason, 500);
      if (!why) throw new AppError('VALIDATION', '請填寫取消原因');
      env.withLock(() => {
        repo.refresh();
        const cur = find('sessions', sessionId);
        checkVersion(cur, expectedVersion);
        if (cur.status === 'cancelled') return;
        const now = env.nowIso(), actor = env.user();
        const locked = liveAssignmentsOf(sessionId).filter((a) => a.verifyStatus === 'verified');
        if (locked.length) throw new AppError('STATE', '此排程已有核定時數，請先取消核定再取消排程');
        const next: Session = { ...cur, status: 'cancelled', cancelReason: why, syncStatus: 'pending', updatedAt: now, updatedBy: actor, version: cur.version + 1 };
        repo.update('sessions', next);
        for (const a of liveAssignmentsOf(sessionId))
          repo.update('assignments', { ...a, attendance: 'cancelled', approvedMinutes: 0, updatedAt: now, updatedBy: actor, version: a.version + 1 });
        audit('session', sessionId, 'cancel', cur, next, why);
      });
      const s = syncCalendar(sessionId);
      return { sessions: [s], assignments: repo.all('assignments').filter((a) => a.sessionId === sessionId) };
    },

    'session.delete': ({ sessionId, reason, expectedVersion }) => {
      const why = clean(reason, 500);
      if (!why) throw new AppError('VALIDATION', '請填寫刪除原因（例如：誤建、重複登錄）');
      env.withLock(() => {
        repo.refresh();
        const cur = find('sessions', sessionId);
        checkVersion(cur, expectedVersion);
        if (liveAssignmentsOf(sessionId).some((a) => a.verifyStatus === 'verified'))
          throw new AppError('STATE', '此排程已有核定時數，不可刪除；如需更正請先取消核定');
        const now = env.nowIso(), actor = env.user();
        const next: Session = { ...cur, isDeleted: true, deleteReason: why, syncStatus: 'pending', updatedAt: now, updatedBy: actor, version: cur.version + 1 };
        repo.update('sessions', next);
        audit('session', sessionId, 'soft_delete', cur, next, why);
      });
      const s = syncCalendar(sessionId);
      return { sessions: [s] };
    },

    'session.complete': ({ sessionId, expectedVersion }) =>
      env.withLock(() => {
        repo.refresh();
        const cur = find('sessions', sessionId);
        checkVersion(cur, expectedVersion);
        if (cur.isDeleted || cur.status === 'cancelled') throw new AppError('STATE', '已取消或刪除的排程無法標記完成');
        if (cur.date > env.today()) throw new AppError('STATE', '演出日期尚未到，無法標記為已完成');
        if (cur.status === 'completed') return { sessions: [cur] };
        const now = env.nowIso();
        const next: Session = { ...cur, status: 'completed', updatedAt: now, updatedBy: env.user(), version: cur.version + 1 };
        repo.update('sessions', next);
        audit('session', sessionId, 'complete', cur, next);
        return { sessions: [next] };
      }),

    'session.resync': ({ sessionId }) => ({ sessions: [syncCalendar(sessionId)] }),

    'session.verifyAllAsScheduled': ({ sessionId }) =>
      env.withLock(() => {
        repo.refresh();
        const cur = find('sessions', sessionId);
        if (cur.isDeleted || cur.status === 'cancelled') throw new AppError('STATE', '已取消或刪除的排程無法核定');
        if (cur.date > env.today()) throw new AppError('STATE', '演出日期尚未到，無法核定');
        const now = env.nowIso(), actor = env.user();
        let s = cur;
        if (cur.status !== 'completed') {
          s = { ...cur, status: 'completed', updatedAt: now, updatedBy: actor, version: cur.version + 1 };
          repo.update('sessions', s);
          audit('session', sessionId, 'complete', cur, s);
        }
        const minutes = diffMinutes(cur.startTime, cur.endTime);
        const changed: Assignment[] = [];
        for (const a of liveAssignmentsOf(sessionId)) {
          if (a.verifyStatus === 'verified' || a.attendance === 'cancelled') continue;
          const next: Assignment = {
            ...a, attendance: 'present', actualStart: cur.startTime, actualEnd: cur.endTime, approvedMinutes: minutes,
            verifyStatus: 'verified', verifiedBy: actor, verifiedAt: now, updatedAt: now, updatedBy: actor, version: a.version + 1,
          };
          repo.update('assignments', next);
          audit('assignment', a.assignmentId, 'verify', a, next, '依預定時間批次核定');
          changed.push(next);
        }
        return { sessions: [s], assignments: changed };
      }),

    'assignment.verify': (raw) => {
      const v = validateVerifyInput(raw);
      return env.withLock(() => {
        repo.refresh();
        const cur = find('assignments', v.assignmentId);
        checkVersion(cur, v.expectedVersion);
        if (cur.isDeleted) throw new AppError('STATE', '此明細已移除');
        const s = find('sessions', cur.sessionId);
        if (s.isDeleted || s.status === 'cancelled') throw new AppError('STATE', '排程已取消或刪除，無法核定');
        if (s.status !== 'completed') throw new AppError('STATE', '請先將排程標記為「已完成」再核定時數');
        if (cur.verifyStatus === 'verified' && !v.reason) throw new AppError('VALIDATION', '更正已核定紀錄需填寫更正原因');
        const now = env.nowIso(), actor = env.user();
        const next: Assignment = {
          ...cur, attendance: v.attendance, actualStart: v.actualStart || '', actualEnd: v.actualEnd || '', approvedMinutes: v.approvedMinutes,
          minutesNote: v.minutesNote || '', verifyStatus: 'verified', verifiedBy: actor, verifiedAt: now, updatedAt: now, updatedBy: actor, version: cur.version + 1,
        };
        repo.update('assignments', next);
        audit('assignment', cur.assignmentId, cur.verifyStatus === 'verified' ? 'correct' : 'verify', cur, next, v.reason || '');
        return { assignments: [next] };
      });
    },

    'assignment.unverify': ({ assignmentId, reason, expectedVersion }) => {
      const why = clean(reason, 500);
      if (!why) throw new AppError('VALIDATION', '請填寫取消核定原因');
      return env.withLock(() => {
        repo.refresh();
        const cur = find('assignments', assignmentId);
        checkVersion(cur, expectedVersion);
        if (cur.verifyStatus !== 'verified') return { assignments: [cur] };
        const now = env.nowIso(), actor = env.user();
        const next: Assignment = { ...cur, verifyStatus: 'unverified', verifiedBy: '', verifiedAt: '', updatedAt: now, updatedBy: actor, version: cur.version + 1 };
        repo.update('assignments', next);
        audit('assignment', assignmentId, 'unverify', cur, next, why);
        return { assignments: [next] };
      });
    },

    'notify.mark': ({ assignmentIds, status, note }) => {
      if (!Array.isArray(assignmentIds) || !assignmentIds.length) throw new AppError('VALIDATION', '請選擇要標記的 SP');
      if (status !== 'notified' && status !== 'not_notified') throw new AppError('VALIDATION', '通知狀態不正確');
      return env.withLock(() => {
        repo.refresh();
        const now = env.nowIso(), actor = env.user();
        const rows: NotificationEntry[] = assignmentIds.slice(0, 200).map((aid) => {
          const a = find('assignments', aid);
          const s = find('sessions', a.sessionId);
          return {
            notificationId: id('N'), sessionId: s.sessionId, assignmentId: aid, spId: a.spId, status,
            markedBy: actor, markedAt: now, fingerprint: sessionFingerprint(s, a), note: clean(note, 500),
          };
        });
        repo.insert('notifications', rows);
        audit('notification', rows.map((r) => r.assignmentId).join(','), `mark:${status}`, null, null, `人工標記 ${rows.length} 筆（僅代表管理員確認，非送達/已讀）`);
        return { notifications: rows };
      });
    },

    'settings.save': ({ patch }) =>
      env.withLock(() => {
        repo.refresh();
        const before = getSettings();
        const kv: Record<string, string> = {};
        for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
          if (!patch || !(k in patch)) continue;
          const val = (patch as Record<string, unknown>)[k];
          if (typeof def === 'string') kv[k] = clean(val, k.endsWith('Template') ? 4000 : 300);
          else if (typeof def === 'number') {
            const n = Number(val);
            if (!Number.isInteger(n) || n < 0 || n > 40320) throw new AppError('VALIDATION', '數值設定不正確');
            kv[k] = JSON.stringify(n);
          } else if (typeof def === 'boolean') kv[k] = JSON.stringify(!!val);
          else if (Array.isArray(def)) {
            if (!Array.isArray(val)) throw new AppError('VALIDATION', '選項清單格式不正確');
            kv[k] = JSON.stringify([...new Set(val.map((x) => clean(x, 120)).filter(Boolean))].slice(0, 300));
          }
        }
        repo.setSettings(kv);
        const after = getSettings();
        audit('settings', 'System_Settings', 'update', before, after);
        return { settings: after };
      }),

    'audit.list': ({ entityId, limit }) => {
      const all = repo.all('audit');
      const list = entityId ? all.filter((a) => a.entityId === entityId || a.entityId.split(',').includes(entityId)) : all;
      return list.slice(-(Math.min(limit || 200, 1000))).reverse();
    },

    'stats.annual': ({ year }) => {
      if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AppError('VALIDATION', '年度不正確');
      return computeStats({ sessions: repo.all('sessions'), assignments: repo.all('assignments'), sps: repo.all('sps') }, { year }, env.today());
    },

    'system.backup': () => {
      if (!env.backup) throw new AppError('NOT_CONFIGURED', '此環境不支援雲端備份，請使用匯出 JSON');
      const r = env.backup();
      audit('system', 'backup', 'backup', null, r);
      return r;
    },

    'system.health': () => {
      if (!env.health) throw new AppError('NOT_CONFIGURED', '此環境不支援健康檢查');
      return env.health();
    },
  };

  /** 單一入口：權限檢查 → 執行 → 統一回應格式與錯誤記錄 */
  function dispatch<A extends ActionName>(action: A, payload: ApiActions[A]['req']): ApiResponse<ApiActions[A]['res']> {
    try {
      const email = env.user();
      if (!email) throw new AppError('UNAUTHENTICATED', '無法取得登入身分，請以 Google 帳號登入');
      if (!env.isAdmin(email)) throw new AppError('FORBIDDEN', `帳號 ${email} 未獲授權使用本系統，請聯絡臨床技能中心管理員`);
      const h = handlers[action] as Handler<A> | undefined;
      if (!h) throw new AppError('VALIDATION', `未知的操作：${String(action)}`);
      return { ok: true, data: h(payload || ({} as ApiActions[A]['req'])) };
    } catch (e) {
      if (e instanceof AppError) return { ok: false, error: { code: e.code, message: e.message, details: e.details } };
      const msg = (e as Error)?.message || String(e);
      if (/lock|鎖/i.test(msg)) return { ok: false, error: { code: 'LOCK_TIMEOUT', message: '系統忙碌中，請稍後再試' } };
      try {
        audit('system', String(action), 'error', null, null, msg);
      } catch {
        /* 記錄失敗不影響回應 */
      }
      return { ok: false, error: { code: 'INTERNAL', message: '系統發生錯誤：' + msg } };
    }
  }

  return { dispatch, handlers, getSettings };
}

export type Service = ReturnType<typeof createService>;
