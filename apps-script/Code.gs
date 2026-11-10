// 自動產生，請勿直接編輯（來源：server/）
"use strict";
var SPHub = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // server/gas/main.ts
  var main_exports = {};
  __export(main_exports, {
    api: () => api,
    doGet: () => doGet,
    healthCheck: () => healthCheck,
    setupSpreadsheet: () => setupSpreadsheet
  });

  // shared/time.ts
  var TZ = "Asia/Taipei";
  var TZ_OFFSET = "+08:00";
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  function isValidDate(s2) {
    if (!DATE_RE.test(s2)) return false;
    const [y, m, d] = s2.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  var isValidTime = (s2) => TIME_RE.test(s2);
  function toMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  function diffMinutes(start, end) {
    return toMinutes(end) - toMinutes(start);
  }
  function monthOf(date) {
    return Number(date.slice(5, 7));
  }
  function yearOf(date) {
    return Number(date.slice(0, 4));
  }
  function toZonedIso(date, time) {
    return `${date}T${time}:00${TZ_OFFSET}`;
  }

  // shared/validate.ts
  var AppError = class extends Error {
    constructor(code, message, details) {
      super(message);
      __publicField(this, "code", code);
      __publicField(this, "details", details);
    }
  };
  var MAX = { name: 40, text: 120, note: 1e3 };
  function clean(v, max = MAX.text) {
    if (v === null || v === void 0) return "";
    return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
  }
  function fail(errors) {
    if (Object.keys(errors).length) {
      throw new AppError("VALIDATION", Object.values(errors)[0], { fields: errors });
    }
  }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE_RE = /^[0-9+\-()#\s]{6,20}$/;
  var SP_STATUS = ["active", "paused", "inactive"];
  function validateSpInput(raw) {
    const v = {
      name: clean(raw.name, MAX.name),
      phone: clean(raw.phone, 20),
      email: clean(raw.email, 120).toLowerCase(),
      lineNote: clean(raw.lineNote, MAX.text),
      status: raw.status || "active",
      joinDate: clean(raw.joinDate, 10),
      certification: clean(raw.certification, MAX.text),
      note: clean(raw.note, MAX.note)
    };
    const e = {};
    if (!v.name) e.name = "請輸入 SP 姓名";
    if (v.phone && !PHONE_RE.test(v.phone)) e.phone = "電話格式不正確";
    if (v.email && !EMAIL_RE.test(v.email)) e.email = "電子郵件格式不正確";
    if (!SP_STATUS.includes(v.status)) e.status = "身分狀態不正確";
    if (v.joinDate && !isValidDate(v.joinDate)) e.joinDate = "加入日期格式不正確";
    fail(e);
    return v;
  }
  var uniq = (a) => [...new Set(a)];
  function validateSessionInput(raw) {
    const rawCases = Array.isArray(raw.cases) && raw.cases.length ? raw.cases : [{ topic: raw.topic || "", spIds: raw.spIds || [], newSpNames: raw.newSpNames || [] }];
    const cases = rawCases.map((c) => ({
      topic: clean(c.topic, MAX.text),
      spIds: uniq((Array.isArray(c.spIds) ? c.spIds : []).map((x) => clean(x, 40)).filter(Boolean)),
      newSpNames: uniq((Array.isArray(c.newSpNames) ? c.newSpNames : []).map((x) => clean(x, MAX.name)).filter(Boolean))
    }));
    const v = {
      date: clean(raw.date, 10),
      unit: clean(raw.unit, MAX.text),
      topic: clean(uniq(cases.map((c) => c.topic).filter(Boolean)).join("、"), 300),
      checkinTime: clean(raw.checkinTime, 5),
      startTime: clean(raw.startTime, 5),
      endTime: clean(raw.endTime, 5),
      location: clean(raw.location, MAX.text),
      note: clean(raw.note, MAX.note),
      cases,
      spIds: uniq(cases.flatMap((c) => c.spIds))
    };
    const e = {};
    if (!isValidDate(v.date)) e.date = "請選擇正確的演出日期";
    if (!v.unit) e.unit = "請輸入申請單位";
    if (!v.location) e.location = "請輸入演出地點";
    if (!isValidTime(v.checkinTime)) e.checkinTime = "請輸入報到時間";
    if (!isValidTime(v.startTime)) e.startTime = "請輸入演出開始時間";
    if (!isValidTime(v.endTime)) e.endTime = "請輸入演出結束時間";
    if (!e.startTime && !e.endTime && diffMinutes(v.startTime, v.endTime) <= 0) e.endTime = "演出結束時間必須晚於開始時間";
    if (!e.checkinTime && !e.startTime && diffMinutes(v.checkinTime, v.startTime) < 0)
      e.checkinTime = "報到時間不可晚於演出開始時間";
    if (cases.length > 30) e.cases = "單場教案數過多";
    const seen = /* @__PURE__ */ new Set();
    cases.forEach((c, i) => {
      if (!c.topic) e[`case${i}.topic`] = "請輸入教案主題";
      else if (seen.has(c.topic)) e[`case${i}.topic`] = "同一場次的教案主題重複，請合併為同一列";
      seen.add(c.topic);
      if (!c.spIds.length && !c.newSpNames.length) e[`case${i}.sps`] = "請至少選擇或輸入一位 SP";
      if (c.spIds.length + c.newSpNames.length > 50) e[`case${i}.sps`] = "單一教案 SP 人數過多";
    });
    if (e["case0.topic"] && cases.length === 1) e.topic = e["case0.topic"];
    if (e["case0.sps"] && cases.length === 1) e.spIds = e["case0.sps"];
    fail(e);
    return v;
  }
  function validateVerifyInput(raw) {
    const attendance = raw.attendance;
    const e = {};
    if (!["present", "absent", "cancelled", "pending"].includes(attendance)) e.attendance = "出席狀態不正確";
    if (attendance === "pending") e.attendance = "請選擇出席狀態後再核定";
    const actualStart = clean(raw.actualStart, 5);
    const actualEnd = clean(raw.actualEnd, 5);
    let minutes = 0;
    if (attendance === "present") {
      if (!isValidTime(actualStart)) e.actualStart = "請輸入實際開始時間";
      if (!isValidTime(actualEnd)) e.actualEnd = "請輸入實際結束時間";
      if (!e.actualStart && !e.actualEnd && diffMinutes(actualStart, actualEnd) <= 0) e.actualEnd = "實際結束必須晚於開始";
      const m = raw.approvedMinutes;
      if (m === null || m === void 0 || !Number.isInteger(m) || m < 0 || m > 24 * 60)
        e.approvedMinutes = "核定分鐘數需為 0–1440 的整數";
      else minutes = m;
      if (!e.approvedMinutes && !e.actualEnd && !e.actualStart && minutes > diffMinutes(actualStart, actualEnd))
        e.approvedMinutes = "核定分鐘數不可超過實際演出時間";
    }
    fail(e);
    return {
      ...raw,
      actualStart: attendance === "present" ? actualStart : "",
      actualEnd: attendance === "present" ? actualEnd : "",
      approvedMinutes: attendance === "present" ? minutes : 0,
      minutesNote: clean(raw.minutesNote, MAX.note),
      reason: clean(raw.reason, MAX.note)
    };
  }
  function sheetSafe(s2) {
    return /^[=+@]/.test(s2) ? `'${s2}` : s2;
  }

  // shared/stats.ts
  function topicOf(a, s2) {
    return a.topic || (s2 == null ? void 0 : s2.topic) || "";
  }
  function isCountable(a, s2) {
    return !!s2 && !a.isDeleted && !s2.isDeleted && s2.status === "completed" && a.verifyStatus === "verified" && a.attendance === "present" && typeof a.approvedMinutes === "number";
  }
  function needsVerification(a, s2) {
    return !!s2 && !s2.isDeleted && !a.isDeleted && s2.status === "completed" && a.verifyStatus !== "verified";
  }
  function inc(m, key, label, sessionId, minutes, seen) {
    const r = m.get(key) || { key, label, sessions: 0, personTimes: 0, minutes: 0 };
    r.personTimes += 1;
    r.minutes += minutes;
    const set = seen.get(key) || /* @__PURE__ */ new Set();
    if (!set.has(sessionId)) {
      set.add(sessionId);
      r.sessions += 1;
    }
    seen.set(key, set);
    m.set(key, r);
  }
  var byMinutes = (a, b) => b.minutes - a.minutes || b.personTimes - a.personTimes || a.label.localeCompare(b.label, "zh-Hant");
  function computeStats(data, f, today) {
    var _a;
    const sessionMap = new Map(data.sessions.map((s2) => [s2.sessionId, s2]));
    const spMap = new Map(data.sps.map((p) => [p.spId, p]));
    const sessionInScope = (s2) => !s2.isDeleted && yearOf(s2.date) === f.year && (!f.month || monthOf(s2.date) === f.month) && (!f.unit || s2.unit === f.unit);
    const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, sessions: 0, personTimes: 0, minutes: 0 }));
    const monthSeen = Array.from({ length: 12 }, () => /* @__PURE__ */ new Set());
    const bySp = /* @__PURE__ */ new Map(), byUnit = /* @__PURE__ */ new Map(), byTopic = /* @__PURE__ */ new Map();
    const seenSp = /* @__PURE__ */ new Map(), seenUnit = /* @__PURE__ */ new Map(), seenTopic = /* @__PURE__ */ new Map();
    const sessionSet = /* @__PURE__ */ new Set();
    let personTimes = 0, minutes = 0, unverified = 0;
    for (const a of data.assignments) {
      const s2 = sessionMap.get(a.sessionId);
      if (!s2 || !sessionInScope(s2)) continue;
      if (f.spId && a.spId !== f.spId) continue;
      if (f.topic && topicOf(a, s2) !== f.topic) continue;
      if (needsVerification(a, s2)) unverified++;
      if (!isCountable(a, s2)) continue;
      const m = a.approvedMinutes;
      personTimes++;
      minutes += m;
      sessionSet.add(s2.sessionId);
      const mi = monthOf(s2.date) - 1;
      monthly[mi].personTimes++;
      monthly[mi].minutes += m;
      if (!monthSeen[mi].has(s2.sessionId)) {
        monthSeen[mi].add(s2.sessionId);
        monthly[mi].sessions++;
      }
      inc(bySp, a.spId, ((_a = spMap.get(a.spId)) == null ? void 0 : _a.name) || a.spNameSnapshot, s2.sessionId, m, seenSp);
      inc(byUnit, s2.unit, s2.unit, s2.sessionId, m, seenUnit);
      inc(byTopic, topicOf(a, s2), topicOf(a, s2), s2.sessionId, m, seenTopic);
    }
    const statusCounts = { scheduled: 0, completed: 0, cancelled: 0 };
    let awaitingCompletion = 0;
    for (const s2 of data.sessions) {
      if (!sessionInScope(s2)) continue;
      if (f.spId && !data.assignments.some((a) => a.sessionId === s2.sessionId && a.spId === f.spId && !a.isDeleted)) continue;
      if (f.topic && !data.assignments.some((a) => a.sessionId === s2.sessionId && !a.isDeleted && topicOf(a, s2) === f.topic)) continue;
      statusCounts[s2.status]++;
      if (s2.status === "scheduled" && s2.date < today) awaitingCompletion++;
    }
    const spRows = [...bySp.values()].sort(byMinutes);
    const activeSps = spRows.length;
    const topCount = Math.max(1, Math.ceil(activeSps * 0.2));
    const topMinutes = spRows.slice(0, topCount).reduce((n, r) => n + r.minutes, 0);
    const bucketDefs = [
      ["< 5 小時", 0, 300],
      ["5–10 小時", 300, 600],
      ["10–20 小時", 600, 1200],
      ["20–40 小時", 1200, 2400],
      ["≥ 40 小時", 2400, Infinity]
    ];
    return {
      sessions: sessionSet.size,
      personTimes,
      minutes,
      activeSps,
      avgMinutesPerSp: activeSps ? Math.round(minutes / activeSps) : 0,
      monthly,
      bySp: spRows,
      byUnit: [...byUnit.values()].sort(byMinutes),
      byTopic: [...byTopic.values()].sort(byMinutes),
      pending: { unverifiedAssignments: unverified, awaitingCompletion },
      concentration: {
        top20Share: minutes ? topMinutes / minutes : 0,
        topCount: activeSps ? topCount : 0,
        buckets: bucketDefs.map(([label, lo, hi]) => ({
          label,
          count: spRows.filter((r) => r.minutes >= lo && r.minutes < hi).length
        }))
      },
      statusCounts
    };
  }

  // shared/version.ts
  var API_VERSION = 3;

  // shared/template.ts
  var DEFAULT_INDIVIDUAL_TEMPLATE = `{SP姓名} 您好，提醒您{相對日}有標準化病人（SP）演出安排：

📅 演出日期：{日期}
📍 演出地點：{地點}
🕘 報到時間：{報到時間}
⏰ 演出時間：{開始時間}–{結束時間}
📋 教案主題：{教案名稱}

再請您依報到時間準時抵達，謝謝您的協助！`;
  var DEFAULT_SUMMARY_TEMPLATE = `【SP 演出總整理】{日期}
共 {場次數} 場、SP {人次} 人次

{場次清單}

如有異動將另行通知，謝謝各位的協助！`;
  var DEFAULT_SETTINGS = {
    calendarId: "",
    adminReminderEnabled: true,
    adminReminderMinutes: 1440,
    individualTemplate: DEFAULT_INDIVIDUAL_TEMPLATE,
    summaryTemplate: DEFAULT_SUMMARY_TEMPLATE,
    units: [],
    topics: [],
    locations: [],
    inactiveThresholdDays: 90
  };
  function sessionFingerprint(s2, a) {
    const src = [s2.date, s2.checkinTime, s2.startTime, s2.endTime, s2.location, (a == null ? void 0 : a.topic) || s2.topic, s2.status, s2.isDeleted ? "D" : "", (a == null ? void 0 : a.attendance) === "cancelled" || (a == null ? void 0 : a.isDeleted) ? "X" : ""].join("|");
    let h = 5381;
    for (let i = 0; i < src.length; i++) h = (h << 5) + h + src.charCodeAt(i) >>> 0;
    return h.toString(16);
  }

  // server/service.ts
  var AUDIT_MAX = 45e3;
  function createService({ repo, env, calendar }) {
    const id = (prefix) => `${prefix}-${env.today().replace(/-/g, "")}-${env.randomId()}`;
    function find(t, key) {
      const idKey = { sps: "spId", sessions: "sessionId", assignments: "assignmentId", notifications: "notificationId", audit: "auditId" }[t];
      const row = repo.all(t).find((r) => r[idKey] === key);
      if (!row) throw new AppError("NOT_FOUND", "找不到資料，可能已被他人刪除，請重新整理");
      return row;
    }
    function audit(entity, entityId, action, before, after, note = "") {
      const j = (v) => v === void 0 || v === null ? "" : JSON.stringify(v).slice(0, AUDIT_MAX);
      repo.insert("audit", [{ auditId: id("L"), at: env.nowIso(), actor: env.user(), entity, entityId, action, before: j(before), after: j(after), note: clean(note, 1e3) }]);
    }
    function checkVersion(current, expected) {
      if (expected !== void 0 && current.version !== expected)
        throw new AppError("VERSION_CONFLICT", "這筆資料剛剛已被其他人修改，請重新載入後再操作", { current });
    }
    function getSettings() {
      const raw = repo.getSettings();
      const out = { ...DEFAULT_SETTINGS };
      for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
        if (!(k in raw) || raw[k] === "") continue;
        try {
          out[k] = typeof def === "string" ? raw[k] : JSON.parse(raw[k]);
        } catch {
          out[k] = def;
        }
      }
      return out;
    }
    function rememberOptions(input) {
      const st = getSettings();
      const patch = {};
      const add = (key, v) => {
        if (v && !st[key].includes(v)) {
          st[key] = [...st[key], v].slice(-300);
          patch[key] = JSON.stringify(st[key]);
        }
      };
      add("units", input.unit);
      for (const c of input.cases) add("topics", c.topic);
      add("locations", input.location);
      if (Object.keys(patch).length) repo.setSettings(patch);
    }
    const liveAssignmentsOf = (sessionId) => repo.all("assignments").filter((a) => a.sessionId === sessionId && !a.isDeleted);
    function detectWarnings(input, selfId) {
      var _a;
      const warnings = [];
      const sps = new Map(repo.all("sps").map((p) => [p.spId, p]));
      const others = repo.all("sessions").filter((s2) => s2.sessionId !== selfId && !s2.isDeleted && s2.status !== "cancelled" && s2.date === input.date);
      const s1 = toMinutes(input.checkinTime), e1 = toMinutes(input.endTime);
      for (const o of others) {
        const overlap = s1 < toMinutes(o.endTime) && toMinutes(o.checkinTime) < e1;
        if (o.unit === input.unit && o.topic === input.topic && o.startTime === input.startTime)
          warnings.push({ type: "duplicate", otherSessionId: o.sessionId, message: `已有相同日期、單位、教案與開始時間的排程（${o.startTime}–${o.endTime}），可能重複登錄` });
        if (!overlap) continue;
        const busy = liveAssignmentsOf(o.sessionId).filter((a) => a.attendance !== "cancelled" && input.spIds.includes(a.spId));
        for (const a of busy)
          warnings.push({
            type: "conflict",
            spId: a.spId,
            otherSessionId: o.sessionId,
            message: `${((_a = sps.get(a.spId)) == null ? void 0 : _a.name) || a.spNameSnapshot} 在 ${o.checkinTime}–${o.endTime} 已排定「${o.topic}」（${o.unit}）`
          });
      }
      for (const spId of input.spIds) {
        const p = sps.get(spId);
        if (!p) throw new AppError("VALIDATION", "選擇的 SP 不存在，請重新整理");
        if (p.status !== "active") warnings.push({ type: "sp_inactive", spId, message: `${p.name} 目前狀態為「${p.status === "paused" ? "暫停" : "停用"}」` });
      }
      return warnings;
    }
    function buildEvent(s2) {
      const live = liveAssignmentsOf(s2.sessionId).filter((a) => a.attendance !== "cancelled");
      const byTopic = /* @__PURE__ */ new Map();
      for (const a of live) {
        const t = topicOf(a, s2);
        byTopic.set(t, [...byTopic.get(t) || [], a.spNameSnapshot]);
      }
      const st = getSettings();
      const caseLines = [...byTopic.entries()].map(([t, names]) => `・${t}：${names.join("、")}`);
      return {
        sessionId: s2.sessionId,
        title: `【SP演出】${s2.topic}｜${s2.unit}`,
        location: s2.location,
        startIso: toZonedIso(s2.date, s2.startTime),
        endIso: toZonedIso(s2.date, s2.endTime),
        date: s2.date,
        reminderMinutes: st.adminReminderEnabled ? st.adminReminderMinutes : null,
        description: [
          `報到時間：${s2.checkinTime}`,
          `演出時間：${s2.startTime}–${s2.endTime}`,
          `申請單位：${s2.unit}`,
          `演出地點：${s2.location}`,
          `教案與 SP（共 ${live.length} 人次）：`,
          ...caseLines.length ? caseLines : ["（未指派）"],
          s2.note ? `備註：${s2.note}` : "",
          "",
          `系統排程 ID：${s2.sessionId}`,
          "（本事件由 SP Performance Hub 管理，請勿直接修改；此提醒僅供管理員，不代替 LINE 人工通知）"
        ].filter((x) => x !== "").join("\n")
      };
    }
    function syncCalendar(sessionId) {
      const s2 = find("sessions", sessionId);
      const st = getSettings();
      let patch;
      if (!st.calendarId) {
        patch = { syncStatus: "disabled", syncError: "尚未設定 Calendar ID" };
      } else {
        try {
          if (s2.isDeleted || s2.status === "cancelled") {
            calendar.remove(st.calendarId, s2.calendarEventId, s2.sessionId, s2.date);
            patch = { calendarEventId: "", syncStatus: "removed", syncError: "", syncedAt: env.nowIso() };
          } else {
            const eventId = calendar.upsert(st.calendarId, s2.calendarEventId, buildEvent(s2));
            patch = { calendarEventId: eventId, syncStatus: "synced", syncError: "", syncedAt: env.nowIso() };
          }
        } catch (e) {
          patch = { syncStatus: "failed", syncError: clean(e.message || String(e), 500) };
        }
      }
      return env.withLock(() => {
        repo.refresh();
        const latest = find("sessions", sessionId);
        const next = { ...latest, ...patch };
        repo.update("sessions", next);
        if (patch.syncStatus === "failed") audit("session", sessionId, "calendar_sync_failed", null, null, patch.syncError);
        return next;
      });
    }
    const handlers = {
      bootstrap: () => ({
        mode: "gas",
        apiVersion: API_VERSION,
        user: { email: env.user(), isAdmin: true },
        today: env.today(),
        serverTime: env.nowIso(),
        sps: repo.all("sps"),
        sessions: repo.all("sessions").filter((s2) => !s2.isDeleted),
        assignments: repo.all("assignments"),
        notifications: repo.all("notifications"),
        settings: getSettings()
      }),
      "sp.save": ({ spId, input, expectedVersion }) => {
        const v = validateSpInput(input);
        return env.withLock(() => {
          repo.refresh();
          const now = env.nowIso(), actor = env.user();
          const dup = repo.all("sps").find((p) => p.name === v.name && p.spId !== spId && p.status !== "inactive");
          if (dup && !spId) throw new AppError("VALIDATION", `已有同名 SP「${v.name}」，若為不同人請在姓名加註區別`);
          if (!spId) {
            const sp = { spId: id("SP"), ...v, createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor, version: 1 };
            repo.insert("sps", [sp]);
            audit("sp", sp.spId, "create", null, sp);
            return { sps: [sp] };
          }
          const cur = find("sps", spId);
          checkVersion(cur, expectedVersion);
          const next = { ...cur, ...v, updatedAt: now, updatedBy: actor, version: cur.version + 1 };
          repo.update("sps", next);
          audit("sp", spId, cur.status !== next.status ? `status:${next.status}` : "update", cur, next);
          return { sps: [next] };
        });
      },
      "session.save": ({ sessionId, input, expectedVersion, requestId, confirm }) => {
        const v = validateSessionInput(input);
        const reqId = clean(requestId, 80);
        const written = env.withLock(() => {
          repo.refresh();
          if (!sessionId && reqId) {
            const prev = repo.all("sessions").find((s2) => s2.requestId === reqId);
            if (prev) return { session: prev, replay: true };
          }
          const allSps = repo.all("sps");
          const toCreate = /* @__PURE__ */ new Set();
          const resolved = /* @__PURE__ */ new Map();
          for (const c of v.cases) {
            for (const name of c.newSpNames) {
              const same = allSps.filter((p) => p.name === name).sort((a, b) => (a.status === "active" ? -1 : 0) - (b.status === "active" ? -1 : 0));
              const hit = same.find((p) => p.status !== "inactive") || same[0];
              if (hit) resolved.set(name, hit.spId);
              else toCreate.add(name);
            }
          }
          v.spIds = [.../* @__PURE__ */ new Set([...v.spIds, ...resolved.values()])];
          const warnings = detectWarnings(v, sessionId);
          if (warnings.length && !confirm) throw new AppError("NEEDS_CONFIRMATION", "偵測到可能的衝突或重複，請確認", { warnings });
          const now = env.nowIso(), actor = env.user();
          const createdSps = [...toCreate].map((name) => ({
            spId: id("SP"),
            name,
            phone: "",
            email: "",
            lineNote: "",
            status: "active",
            joinDate: "",
            certification: "",
            note: "",
            createdAt: now,
            createdBy: actor,
            updatedAt: now,
            updatedBy: actor,
            version: 1
          }));
          if (createdSps.length) {
            repo.insert("sps", createdSps);
            for (const p of createdSps) {
              audit("sp", p.spId, "create", null, p, "排程表單中直接新增");
              resolved.set(p.name, p.spId);
            }
          }
          const pairs = [];
          for (const c of v.cases) {
            const ids = [...c.spIds, ...c.newSpNames.map((n) => resolved.get(n))];
            for (const spId of new Set(ids)) pairs.push({ topic: c.topic, spId });
          }
          const keyOf = (x) => `${x.spId}|${x.topic}`;
          const spMap = new Map(repo.all("sps").map((p) => [p.spId, p]));
          const newAssignment = (sid, spId, topic) => ({
            assignmentId: id("A"),
            sessionId: sid,
            spId,
            spNameSnapshot: spMap.get(spId).name,
            topic,
            attendance: "pending",
            actualStart: "",
            actualEnd: "",
            approvedMinutes: null,
            minutesNote: "",
            verifyStatus: "unverified",
            verifiedBy: "",
            verifiedAt: "",
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
            updatedBy: actor,
            version: 1
          });
          const fields = { date: v.date, unit: v.unit, topic: v.topic, checkinTime: v.checkinTime, startTime: v.startTime, endTime: v.endTime, location: v.location, note: v.note };
          const auditCases = v.cases.map((c) => ({ topic: c.topic, sps: pairs.filter((p) => p.topic === c.topic).map((p) => {
            var _a;
            return (_a = spMap.get(p.spId)) == null ? void 0 : _a.name;
          }) }));
          if (!sessionId) {
            const s2 = {
              sessionId: id("S"),
              ...fields,
              status: "scheduled",
              cancelReason: "",
              calendarEventId: "",
              syncStatus: "pending",
              syncError: "",
              syncedAt: "",
              isDeleted: false,
              deleteReason: "",
              requestId: reqId,
              createdAt: now,
              createdBy: actor,
              updatedAt: now,
              updatedBy: actor,
              version: 1
            };
            repo.insert("sessions", [s2]);
            repo.insert("assignments", pairs.map((p) => newAssignment(s2.sessionId, p.spId, p.topic)));
            audit("session", s2.sessionId, "create", null, { ...s2, cases: auditCases }, warnings.map((w) => w.message).join("；"));
            rememberOptions(v);
            return { session: s2, warnings };
          }
          const cur = find("sessions", sessionId);
          if (cur.isDeleted) throw new AppError("STATE", "此排程已刪除");
          if (cur.status === "cancelled") throw new AppError("STATE", "已取消的排程不可修改");
          checkVersion(cur, expectedVersion);
          const existing = liveAssignmentsOf(sessionId);
          const wanted = new Set(pairs.map(keyOf));
          const existingKey = (a) => keyOf({ spId: a.spId, topic: topicOf(a, cur) });
          const removed = existing.filter((a) => !wanted.has(existingKey(a)));
          const locked = removed.filter((a) => a.verifyStatus === "verified");
          if (locked.length) throw new AppError("STATE", `${locked.map((a) => a.spNameSnapshot).join("、")} 已完成時數核定，請先在「演出核定」取消核定後再移除或更換教案`);
          for (const a of removed) repo.update("assignments", { ...a, isDeleted: true, updatedAt: now, updatedBy: actor, version: a.version + 1 });
          for (const a of existing) if (!a.topic && wanted.has(existingKey(a))) repo.update("assignments", { ...a, topic: cur.topic, updatedAt: now, updatedBy: actor, version: a.version + 1 });
          const have = new Set(existing.map(existingKey));
          const added = pairs.filter((p) => !have.has(keyOf(p))).map((p) => newAssignment(sessionId, p.spId, p.topic));
          if (added.length) repo.insert("assignments", added);
          const next = { ...cur, ...fields, syncStatus: "pending", updatedAt: now, updatedBy: actor, version: cur.version + 1 };
          repo.update("sessions", next);
          audit("session", sessionId, "update", { ...cur, cases: existing.map((a) => ({ topic: topicOf(a, cur), sp: a.spNameSnapshot })) }, { ...next, cases: auditCases }, warnings.map((w) => w.message).join("；"));
          rememberOptions(v);
          return { session: next, warnings };
        });
        const synced = written.session.syncStatus === "synced" ? written.session : syncCalendar(written.session.sessionId);
        return {
          sessions: [synced],
          sps: repo.all("sps"),
          assignments: repo.all("assignments").filter((a) => a.sessionId === synced.sessionId),
          warnings: "warnings" in written ? written.warnings : [],
          settings: getSettings()
        };
      },
      "session.cancel": ({ sessionId, reason, expectedVersion }) => {
        const why = clean(reason, 500);
        if (!why) throw new AppError("VALIDATION", "請填寫取消原因");
        env.withLock(() => {
          repo.refresh();
          const cur = find("sessions", sessionId);
          checkVersion(cur, expectedVersion);
          if (cur.status === "cancelled") return;
          const now = env.nowIso(), actor = env.user();
          const locked = liveAssignmentsOf(sessionId).filter((a) => a.verifyStatus === "verified");
          if (locked.length) throw new AppError("STATE", "此排程已有核定時數，請先取消核定再取消排程");
          const next = { ...cur, status: "cancelled", cancelReason: why, syncStatus: "pending", updatedAt: now, updatedBy: actor, version: cur.version + 1 };
          repo.update("sessions", next);
          for (const a of liveAssignmentsOf(sessionId))
            repo.update("assignments", { ...a, attendance: "cancelled", approvedMinutes: 0, updatedAt: now, updatedBy: actor, version: a.version + 1 });
          audit("session", sessionId, "cancel", cur, next, why);
        });
        const s2 = syncCalendar(sessionId);
        return { sessions: [s2], assignments: repo.all("assignments").filter((a) => a.sessionId === sessionId) };
      },
      "session.delete": ({ sessionId, reason, expectedVersion }) => {
        const why = clean(reason, 500);
        if (!why) throw new AppError("VALIDATION", "請填寫刪除原因（例如：誤建、重複登錄）");
        env.withLock(() => {
          repo.refresh();
          const cur = find("sessions", sessionId);
          checkVersion(cur, expectedVersion);
          if (liveAssignmentsOf(sessionId).some((a) => a.verifyStatus === "verified"))
            throw new AppError("STATE", "此排程已有核定時數，不可刪除；如需更正請先取消核定");
          const now = env.nowIso(), actor = env.user();
          const next = { ...cur, isDeleted: true, deleteReason: why, syncStatus: "pending", updatedAt: now, updatedBy: actor, version: cur.version + 1 };
          repo.update("sessions", next);
          audit("session", sessionId, "soft_delete", cur, next, why);
        });
        const s2 = syncCalendar(sessionId);
        return { sessions: [s2] };
      },
      "session.complete": ({ sessionId, expectedVersion }) => env.withLock(() => {
        repo.refresh();
        const cur = find("sessions", sessionId);
        checkVersion(cur, expectedVersion);
        if (cur.isDeleted || cur.status === "cancelled") throw new AppError("STATE", "已取消或刪除的排程無法標記完成");
        if (cur.date > env.today()) throw new AppError("STATE", "演出日期尚未到，無法標記為已完成");
        if (cur.status === "completed") return { sessions: [cur] };
        const now = env.nowIso();
        const next = { ...cur, status: "completed", updatedAt: now, updatedBy: env.user(), version: cur.version + 1 };
        repo.update("sessions", next);
        audit("session", sessionId, "complete", cur, next);
        return { sessions: [next] };
      }),
      "session.resync": ({ sessionId }) => ({ sessions: [syncCalendar(sessionId)] }),
      /** 批次同步尚未同步／失敗的排程（例如剛設定好 Calendar ID 後）；每次最多處理 limit 筆，避免執行逾時 */
      "session.resyncAll": ({ limit }) => {
        if (!getSettings().calendarId) throw new AppError("NOT_CONFIGURED", "請先在系統設定填寫 Google 日曆 ID");
        const max = Math.min(Math.max(1, Number(limit) || 30), 60);
        const todo = repo.all("sessions").filter(
          (s2) => !s2.isDeleted && s2.status !== "cancelled" ? s2.syncStatus !== "synced" : s2.syncStatus !== "removed" && !!s2.calendarEventId
        );
        const done = [];
        for (const s2 of todo.slice(0, max)) done.push(syncCalendar(s2.sessionId));
        return {
          sessions: done,
          synced: done.filter((s2) => s2.syncStatus === "synced" || s2.syncStatus === "removed").length,
          failed: done.filter((s2) => s2.syncStatus === "failed").length,
          remaining: Math.max(0, todo.length - max)
        };
      },
      "session.verifyAllAsScheduled": ({ sessionId }) => env.withLock(() => {
        repo.refresh();
        const cur = find("sessions", sessionId);
        if (cur.isDeleted || cur.status === "cancelled") throw new AppError("STATE", "已取消或刪除的排程無法核定");
        if (cur.date > env.today()) throw new AppError("STATE", "演出日期尚未到，無法核定");
        const now = env.nowIso(), actor = env.user();
        let s2 = cur;
        if (cur.status !== "completed") {
          s2 = { ...cur, status: "completed", updatedAt: now, updatedBy: actor, version: cur.version + 1 };
          repo.update("sessions", s2);
          audit("session", sessionId, "complete", cur, s2);
        }
        const minutes = diffMinutes(cur.startTime, cur.endTime);
        const changed = [];
        for (const a of liveAssignmentsOf(sessionId)) {
          if (a.verifyStatus === "verified" || a.attendance === "cancelled") continue;
          const next = {
            ...a,
            attendance: "present",
            actualStart: cur.startTime,
            actualEnd: cur.endTime,
            approvedMinutes: minutes,
            verifyStatus: "verified",
            verifiedBy: actor,
            verifiedAt: now,
            updatedAt: now,
            updatedBy: actor,
            version: a.version + 1
          };
          repo.update("assignments", next);
          audit("assignment", a.assignmentId, "verify", a, next, "依預定時間批次核定");
          changed.push(next);
        }
        return { sessions: [s2], assignments: changed };
      }),
      "assignment.verify": (raw) => {
        const v = validateVerifyInput(raw);
        return env.withLock(() => {
          repo.refresh();
          const cur = find("assignments", v.assignmentId);
          checkVersion(cur, v.expectedVersion);
          if (cur.isDeleted) throw new AppError("STATE", "此明細已移除");
          const s2 = find("sessions", cur.sessionId);
          if (s2.isDeleted || s2.status === "cancelled") throw new AppError("STATE", "排程已取消或刪除，無法核定");
          if (s2.status !== "completed") throw new AppError("STATE", "請先將排程標記為「已完成」再核定時數");
          if (cur.verifyStatus === "verified" && !v.reason) throw new AppError("VALIDATION", "更正已核定紀錄需填寫更正原因");
          const now = env.nowIso(), actor = env.user();
          const next = {
            ...cur,
            attendance: v.attendance,
            actualStart: v.actualStart || "",
            actualEnd: v.actualEnd || "",
            approvedMinutes: v.approvedMinutes,
            minutesNote: v.minutesNote || "",
            verifyStatus: "verified",
            verifiedBy: actor,
            verifiedAt: now,
            updatedAt: now,
            updatedBy: actor,
            version: cur.version + 1
          };
          repo.update("assignments", next);
          audit("assignment", cur.assignmentId, cur.verifyStatus === "verified" ? "correct" : "verify", cur, next, v.reason || "");
          return { assignments: [next] };
        });
      },
      "assignment.unverify": ({ assignmentId, reason, expectedVersion }) => {
        const why = clean(reason, 500);
        if (!why) throw new AppError("VALIDATION", "請填寫取消核定原因");
        return env.withLock(() => {
          repo.refresh();
          const cur = find("assignments", assignmentId);
          checkVersion(cur, expectedVersion);
          if (cur.verifyStatus !== "verified") return { assignments: [cur] };
          const now = env.nowIso(), actor = env.user();
          const next = { ...cur, verifyStatus: "unverified", verifiedBy: "", verifiedAt: "", updatedAt: now, updatedBy: actor, version: cur.version + 1 };
          repo.update("assignments", next);
          audit("assignment", assignmentId, "unverify", cur, next, why);
          return { assignments: [next] };
        });
      },
      "notify.mark": ({ assignmentIds, status, note }) => {
        if (!Array.isArray(assignmentIds) || !assignmentIds.length) throw new AppError("VALIDATION", "請選擇要標記的 SP");
        if (status !== "notified" && status !== "not_notified") throw new AppError("VALIDATION", "通知狀態不正確");
        return env.withLock(() => {
          repo.refresh();
          const now = env.nowIso(), actor = env.user();
          const rows = assignmentIds.slice(0, 200).map((aid) => {
            const a = find("assignments", aid);
            const s2 = find("sessions", a.sessionId);
            return {
              notificationId: id("N"),
              sessionId: s2.sessionId,
              assignmentId: aid,
              spId: a.spId,
              status,
              markedBy: actor,
              markedAt: now,
              fingerprint: sessionFingerprint(s2, a),
              note: clean(note, 500)
            };
          });
          repo.insert("notifications", rows);
          audit("notification", rows.map((r) => r.assignmentId).join(","), `mark:${status}`, null, null, `人工標記 ${rows.length} 筆（僅代表管理員確認，非送達/已讀）`);
          return { notifications: rows };
        });
      },
      "settings.save": ({ patch }) => env.withLock(() => {
        repo.refresh();
        const before = getSettings();
        const kv = {};
        for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
          if (!patch || !(k in patch)) continue;
          const val = patch[k];
          if (typeof def === "string") kv[k] = clean(val, k.endsWith("Template") ? 4e3 : 300);
          else if (typeof def === "number") {
            const n = Number(val);
            if (!Number.isInteger(n) || n < 0 || n > 40320) throw new AppError("VALIDATION", "數值設定不正確");
            kv[k] = JSON.stringify(n);
          } else if (typeof def === "boolean") kv[k] = JSON.stringify(!!val);
          else if (Array.isArray(def)) {
            if (!Array.isArray(val)) throw new AppError("VALIDATION", "選項清單格式不正確");
            kv[k] = JSON.stringify([...new Set(val.map((x) => clean(x, 120)).filter(Boolean))].slice(0, 300));
          }
        }
        repo.setSettings(kv);
        const after = getSettings();
        audit("settings", "System_Settings", "update", before, after);
        return { settings: after };
      }),
      "audit.list": ({ entityId, limit }) => {
        const all = repo.all("audit");
        const list = entityId ? all.filter((a) => a.entityId === entityId || a.entityId.split(",").includes(entityId)) : all;
        return list.slice(-Math.min(limit || 200, 1e3)).reverse();
      },
      "stats.annual": ({ year }) => {
        if (!Number.isInteger(year) || year < 2e3 || year > 2100) throw new AppError("VALIDATION", "年度不正確");
        return computeStats({ sessions: repo.all("sessions"), assignments: repo.all("assignments"), sps: repo.all("sps") }, { year }, env.today());
      },
      "system.backup": () => {
        if (!env.backup) throw new AppError("NOT_CONFIGURED", "此環境不支援雲端備份，請使用匯出 JSON");
        const r = env.backup();
        audit("system", "backup", "backup", null, r);
        return r;
      },
      "system.health": () => {
        if (!env.health) throw new AppError("NOT_CONFIGURED", "此環境不支援健康檢查");
        return env.health();
      }
    };
    function dispatch(action, payload) {
      try {
        const email = env.user();
        if (!email) throw new AppError("UNAUTHENTICATED", "無法取得登入身分，請以 Google 帳號登入");
        if (!env.isAdmin(email)) throw new AppError("FORBIDDEN", `帳號 ${email} 未獲授權使用本系統，請聯絡臨床技能中心管理員`);
        const h = handlers[action];
        if (!h) throw new AppError("VALIDATION", `未知的操作：${String(action)}`);
        return { ok: true, data: h(payload || {}) };
      } catch (e) {
        if (e instanceof AppError) return { ok: false, error: { code: e.code, message: e.message, details: e.details } };
        const msg = (e == null ? void 0 : e.message) || String(e);
        if (/lock|鎖/i.test(msg)) return { ok: false, error: { code: "LOCK_TIMEOUT", message: "系統忙碌中，請稍後再試" } };
        try {
          audit("system", String(action), "error", null, null, msg);
        } catch {
        }
        return { ok: false, error: { code: "INTERNAL", message: "系統發生錯誤：" + msg } };
      }
    }
    return { dispatch, handlers, getSettings };
  }

  // server/schema.ts
  var s = (key, label, en) => ({ key, type: "string", label, enum: en });
  var ENUMS = {
    spStatus: { active: "在職", paused: "暫停", inactive: "停用" },
    sessionStatus: { scheduled: "預定", completed: "已完成", cancelled: "已取消" },
    syncStatus: { pending: "待同步", synced: "已同步", failed: "同步失敗", removed: "已自日曆移除", disabled: "未設定日曆" },
    attendance: { pending: "待確認", present: "已出席", absent: "缺席", cancelled: "取消" },
    verifyStatus: { unverified: "未核定", verified: "已核定" },
    notifyStatus: { notified: "已通知", not_notified: "未通知" },
    auditEntity: { sp: "SP人員", session: "演出排程", assignment: "演出明細", notification: "LINE通知", settings: "系統設定", system: "系統" },
    auditAction: {
      create: "建立",
      update: "修改",
      cancel: "取消排程",
      soft_delete: "刪除（軟刪除）",
      complete: "標記完成",
      verify: "核定",
      correct: "更正核定",
      unverify: "取消核定",
      calendar_sync_failed: "日曆同步失敗",
      "mark:notified": "標記已通知",
      "mark:not_notified": "標記未通知",
      "status:active": "狀態改為在職",
      "status:paused": "狀態改為暫停",
      "status:inactive": "狀態改為停用",
      backup: "建立備份",
      error: "系統錯誤"
    }
  };
  var TABLES = {
    sps: {
      sheet: "SP人員主檔",
      legacySheet: "SP_Master",
      idKey: "spId",
      columns: [
        s("spId", "SP編號"),
        s("name", "姓名"),
        s("phone", "聯絡電話"),
        s("email", "電子郵件"),
        s("lineNote", "LINE顯示名稱/備註"),
        s("status", "身分狀態", ENUMS.spStatus),
        s("joinDate", "加入日期"),
        s("certification", "認證狀態"),
        s("note", "備註"),
        s("createdAt", "建立時間"),
        s("createdBy", "建立者"),
        s("updatedAt", "修改時間"),
        s("updatedBy", "修改者"),
        { key: "version", type: "number", label: "版本" }
      ]
    },
    sessions: {
      sheet: "演出排程",
      legacySheet: "Performance_Sessions",
      idKey: "sessionId",
      columns: [
        s("sessionId", "排程編號"),
        s("date", "演出日期"),
        s("unit", "申請單位"),
        s("topic", "教案主題"),
        s("checkinTime", "報到時間"),
        s("startTime", "演出開始"),
        s("endTime", "演出結束"),
        s("location", "演出地點"),
        s("note", "備註"),
        s("status", "排程狀態", ENUMS.sessionStatus),
        s("cancelReason", "取消原因"),
        s("calendarEventId", "日曆事件ID"),
        s("syncStatus", "日曆同步狀態", ENUMS.syncStatus),
        s("syncError", "同步錯誤訊息"),
        s("syncedAt", "同步時間"),
        { key: "isDeleted", type: "bool", label: "已刪除" },
        s("deleteReason", "刪除原因"),
        s("requestId", "請求編號"),
        s("createdAt", "建立時間"),
        s("createdBy", "建立者"),
        s("updatedAt", "修改時間"),
        s("updatedBy", "修改者"),
        { key: "version", type: "number", label: "版本" }
      ]
    },
    assignments: {
      sheet: "演出明細",
      legacySheet: "Performance_Assignments",
      idKey: "assignmentId",
      columns: [
        s("assignmentId", "明細編號"),
        s("sessionId", "排程編號"),
        s("spId", "SP編號"),
        s("spNameSnapshot", "SP姓名"),
        s("topic", "教案主題"),
        s("attendance", "出席狀態", ENUMS.attendance),
        s("actualStart", "實際開始"),
        s("actualEnd", "實際結束"),
        { key: "approvedMinutes", type: "nullable-number", label: "核定分鐘數" },
        s("minutesNote", "時數備註"),
        s("verifyStatus", "核定狀態", ENUMS.verifyStatus),
        s("verifiedBy", "核定人員"),
        s("verifiedAt", "核定時間"),
        { key: "isDeleted", type: "bool", label: "已刪除" },
        s("createdAt", "建立時間"),
        s("updatedAt", "修改時間"),
        s("updatedBy", "修改者"),
        { key: "version", type: "number", label: "版本" }
      ]
    },
    notifications: {
      sheet: "LINE通知紀錄",
      legacySheet: "Notification_Log",
      idKey: "notificationId",
      columns: [
        s("notificationId", "紀錄編號"),
        s("sessionId", "排程編號"),
        s("assignmentId", "明細編號"),
        s("spId", "SP編號"),
        s("status", "通知狀態", ENUMS.notifyStatus),
        s("markedBy", "標記人員"),
        s("markedAt", "標記時間"),
        s("fingerprint", "排程指紋"),
        s("note", "備註")
      ]
    },
    audit: {
      sheet: "異動紀錄",
      legacySheet: "Audit_Log",
      idKey: "auditId",
      columns: [
        s("auditId", "紀錄編號"),
        s("at", "時間"),
        s("actor", "操作人員"),
        s("entity", "對象類型", ENUMS.auditEntity),
        s("entityId", "對象編號"),
        s("action", "動作", ENUMS.auditAction),
        s("before", "異動前"),
        s("after", "異動後"),
        s("note", "說明")
      ]
    }
  };
  var SETTINGS_SHEET = "系統設定";
  var LEGACY_SETTINGS_SHEET = "System_Settings";
  var SETTINGS_HEADER = ["設定項目", "設定值", "更新時間"];
  var SETTING_LABELS = {
    calendarId: "Google日曆ID",
    adminReminderEnabled: "管理員日曆提醒",
    adminReminderMinutes: "提前提醒分鐘數",
    individualTemplate: "個別通知範本",
    summaryTemplate: "總整理通知範本",
    units: "常用申請單位",
    topics: "常用教案主題",
    locations: "常用演出地點",
    inactiveThresholdDays: "長期未排演出門檻天數"
  };
  var BOOL_TRUE = ["TRUE", "true", "是", "Y", "1"];
  function colIndex(header, c) {
    const i = header.indexOf(c.label);
    return i >= 0 ? i : header.indexOf(c.key);
  }
  function toRow(t, obj) {
    const def = TABLES[t];
    return def.columns.map((c) => {
      const v = obj[c.key];
      if (c.type === "bool") return v ? "是" : "否";
      if (v === null || v === void 0) return "";
      const str = String(v);
      return c.enum && str in c.enum ? c.enum[str] : str;
    });
  }
  function fromRow(t, header, row, fmtDate2) {
    var _a;
    const def = TABLES[t];
    const out = {};
    for (const c of def.columns) {
      const idx = colIndex(header, c);
      let v = idx >= 0 ? row[idx] : "";
      if (v instanceof Date) {
        const kind = /Time$|^actual/.test(c.key) ? "time" : c.key === "date" || c.key === "joinDate" ? "date" : "datetime";
        v = fmtDate2(v, kind);
      }
      if (c.type === "number") out[c.key] = Number(v) || 0;
      else if (c.type === "nullable-number") out[c.key] = v === "" || v === null || v === void 0 ? null : Number(v);
      else if (c.type === "bool") out[c.key] = v === true || BOOL_TRUE.includes(String(v).trim());
      else {
        let str = v === null || v === void 0 ? "" : String(v);
        if (c.enum) {
          const code = (_a = Object.entries(c.enum).find(([, label]) => label === str)) == null ? void 0 : _a[0];
          if (code) str = code;
        }
        out[c.key] = str;
      }
    }
    return out;
  }

  // server/gas/sheetsRepo.ts
  function fmtGasDate(d, kind) {
    if (kind === "date") return Utilities.formatDate(d, TZ, "yyyy-MM-dd");
    if (kind === "time") return Utilities.formatDate(d, TZ, "HH:mm");
    return Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  var unescape = (v) => typeof v === "string" && /^'[=+@]/.test(v) ? v.slice(1) : v;
  function createSheetsRepo(ss) {
    const cache = /* @__PURE__ */ new Map();
    let settingsCache = null;
    function sheetOf(name, legacy) {
      const sh = ss.getSheetByName(name) || (legacy ? ss.getSheetByName(legacy) : null);
      if (!sh) throw new AppError("NOT_CONFIGURED", `找不到工作表「${name}」，請先執行 setupSpreadsheet 初始化`);
      return sh;
    }
    function load(t) {
      const hit = cache.get(t);
      if (hit) return hit;
      const def = TABLES[t];
      const sheet = sheetOf(def.sheet, def.legacySheet);
      const values = sheet.getDataRange().getValues();
      const header = (values[0] || []).map(String);
      const idCol = def.columns.find((c) => c.key === def.idKey);
      const idIdx = colIndex(header, idCol);
      if (idIdx < 0) throw new AppError("NOT_CONFIGURED", `工作表「${def.sheet}」缺少主鍵欄位 ${def.idKey}`);
      const rows = [], rowNumbers = [], ids = [];
      for (let i = 1; i < values.length; i++) {
        const id = String(values[i][idIdx] || "");
        if (!id) continue;
        const obj = fromRow(t, header, values[i].map(unescape), fmtGasDate);
        rows.push(obj);
        rowNumbers.push(i + 1);
        ids.push(id);
      }
      const loaded = { sheet, header, rows, rowNumbers, ids };
      cache.set(t, loaded);
      return loaded;
    }
    function toSheetRow(t, header, obj) {
      const def = TABLES[t];
      const vals = toRow(t, obj);
      return header.map((h) => {
        const i = def.columns.findIndex((c) => c.label === h || c.key === h);
        return i >= 0 ? sheetSafe(vals[i]) : "";
      });
    }
    return {
      refresh() {
        cache.clear();
        settingsCache = null;
        SpreadsheetApp.flush();
      },
      all(t) {
        return load(t).rows.map((r) => ({ ...r }));
      },
      insert(t, rows) {
        if (!rows.length) return;
        const L = load(t);
        const data = rows.map((r) => toSheetRow(t, L.header, r));
        const start = L.sheet.getLastRow() + 1;
        const range = L.sheet.getRange(start, 1, data.length, L.header.length);
        range.setNumberFormat("@");
        range.setValues(data);
        const idKey = TABLES[t].idKey;
        rows.forEach((r, i) => {
          L.rows.push({ ...r });
          L.rowNumbers.push(start + i);
          L.ids.push(String(r[idKey]));
        });
      },
      update(t, row) {
        const L = load(t);
        const idKey = TABLES[t].idKey;
        const id = String(row[idKey]);
        const i = L.ids.indexOf(id);
        if (i < 0) throw new AppError("NOT_FOUND", "找不到要更新的資料列：" + id);
        const range = L.sheet.getRange(L.rowNumbers[i], 1, 1, L.header.length);
        range.setNumberFormat("@");
        range.setValues([toSheetRow(t, L.header, row)]);
        L.rows[i] = { ...row };
      },
      getSettings() {
        var _a;
        if (settingsCache) return { ...settingsCache };
        const values = sheetOf(SETTINGS_SHEET, LEGACY_SETTINGS_SHEET).getDataRange().getValues();
        const out = {};
        for (let i = 1; i < values.length; i++) {
          const key = settingKeyOf(String(values[i][0] || ""));
          if (key) out[key] = settingFromSheet(key, String((_a = unescape(values[i][1])) != null ? _a : ""));
        }
        settingsCache = out;
        return { ...out };
      },
      setSettings(kv) {
        const sh = sheetOf(SETTINGS_SHEET, LEGACY_SETTINGS_SHEET);
        const values = sh.getDataRange().getValues();
        const now = fmtGasDate(/* @__PURE__ */ new Date(), "datetime");
        for (const [k, v] of Object.entries(kv)) {
          const label = SETTING_LABELS[k] || k;
          const idx = values.findIndex((r, i) => i > 0 && (r[0] === label || r[0] === k));
          const shown = sheetSafe(settingToSheet(k, v));
          if (idx > 0) sh.getRange(idx + 1, 1, 1, 3).setValues([[label, shown, now]]);
          else {
            sh.appendRow([label, shown, now]);
            values.push([label, shown, now]);
          }
        }
        settingsCache = null;
      }
    };
  }
  function settingKeyOf(name) {
    const hit = Object.entries(SETTING_LABELS).find(([k, label]) => label === name || k === name);
    return hit ? hit[0] : "";
  }
  function settingToSheet(key, json) {
    const def = DEFAULT_SETTINGS[key];
    if (typeof def === "string") return json;
    try {
      const v = JSON.parse(json);
      if (Array.isArray(v)) return v.join("\n");
      if (typeof v === "boolean") return v ? "是" : "否";
      return String(v);
    } catch {
      return json;
    }
  }
  function settingFromSheet(key, shown) {
    const def = DEFAULT_SETTINGS[key];
    if (typeof def === "string") return shown;
    const t = shown.trim();
    if (t.startsWith("[") || t === "true" || t === "false") return t;
    if (Array.isArray(def)) return JSON.stringify(t ? t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : []);
    if (typeof def === "boolean") return JSON.stringify(["是", "TRUE", "Y", "1"].includes(t));
    if (typeof def === "number") return t === "" ? "" : JSON.stringify(Number(t));
    return t;
  }

  // server/gas/calendarGateway.ts
  var TAG = "spHubSessionId";
  function getCal(calendarId) {
    const cal = calendarId === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calendarId);
    if (!cal) throw new Error(`找不到行事曆或沒有權限：${calendarId}（請確認已將此行事曆以「變更活動」權限分享給操作中的管理員帳號）`);
    return cal;
  }
  function findByTag(cal, date, sessionId) {
    const day = /* @__PURE__ */ new Date(`${date}T00:00:00+08:00`);
    const from = new Date(day.getTime() - 864e5);
    const to = new Date(day.getTime() + 2 * 864e5);
    return cal.getEvents(from, to).find((e) => e.getTag(TAG) === sessionId) || null;
  }
  function safeGetById(cal, eventId) {
    if (!eventId) return null;
    try {
      return cal.getEventById(eventId);
    } catch {
      return null;
    }
  }
  var gasCalendar = {
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
    }
  };

  // server/gas/main.ts
  var props = () => PropertiesService.getScriptProperties();
  function adminList() {
    return (props().getProperty("ADMIN_EMAILS") || "").split(/[,\s;]+/).map((s2) => s2.trim().toLowerCase()).filter(Boolean);
  }
  function currentEmail() {
    return (Session.getActiveUser().getEmail() || "").toLowerCase();
  }
  function boundSpreadsheet() {
    try {
      return SpreadsheetApp.getActiveSpreadsheet() || null;
    } catch {
      return null;
    }
  }
  function openSpreadsheet() {
    const bound = boundSpreadsheet();
    if (bound) return bound;
    const id = props().getProperty("SPREADSHEET_ID");
    if (!id) throw new Error("找不到資料試算表：請從 Google 試算表的「擴充功能 → Apps Script」開啟本專案，或在 Script Properties 設定 SPREADSHEET_ID");
    return SpreadsheetApp.openById(id);
  }
  function buildEnv(ss) {
    return {
      user: currentEmail,
      isAdmin: (email) => adminList().includes(email.toLowerCase()),
      nowIso: () => fmtGasDate(/* @__PURE__ */ new Date(), "datetime"),
      today: () => Utilities.formatDate(/* @__PURE__ */ new Date(), TZ, "yyyy-MM-dd"),
      randomId: () => Utilities.getUuid().replace(/-/g, "").slice(0, 8).toUpperCase(),
      withLock(fn) {
        const lock = LockService.getScriptLock();
        if (!lock.tryLock(25e3)) throw new Error("lock timeout");
        try {
          return fn();
        } finally {
          SpreadsheetApp.flush();
          lock.releaseLock();
        }
      },
      backup() {
        const stamp = Utilities.formatDate(/* @__PURE__ */ new Date(), TZ, "yyyyMMdd-HHmm");
        const copy = SpreadsheetApp.create(`SP Performance Hub 備份 ${stamp}`);
        const names = [...Object.values(TABLES).map((t) => t.sheet), SETTINGS_SHEET];
        for (const n of names) {
          const sh = ss.getSheetByName(n);
          if (sh) sh.copyTo(copy).setName(n);
        }
        const first = copy.getSheets()[0];
        if (first.getName().startsWith("Sheet") || first.getName().startsWith("工作表")) copy.deleteSheet(first);
        return { name: copy.getName(), url: copy.getUrl() };
      },
      health() {
        const settingsCal = (() => {
          try {
            return createSheetsRepo(ss).getSettings().calendarId || "";
          } catch {
            return "";
          }
        })();
        let calendarOk = false, calendarName = "", calendarError = "";
        if (!settingsCal) calendarError = "尚未設定 Calendar ID";
        else {
          try {
            const cal = settingsCal === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(settingsCal);
            if (!cal) calendarError = "找不到行事曆或沒有權限";
            else {
              calendarOk = true;
              calendarName = cal.getName();
            }
          } catch (e) {
            calendarError = String(e.message || e);
          }
        }
        return {
          spreadsheetOk: true,
          spreadsheetName: ss.getName(),
          sheets: [...Object.values(TABLES).map((t) => [t.sheet, t.legacySheet]), [SETTINGS_SHEET, LEGACY_SETTINGS_SHEET]].map(([name, legacy]) => {
            const sh = ss.getSheetByName(name) || ss.getSheetByName(legacy);
            return { name, ok: !!sh, rows: sh ? Math.max(0, sh.getLastRow() - 1) : 0 };
          }),
          calendarOk,
          calendarName,
          calendarError,
          user: currentEmail(),
          timezone: Session.getScriptTimeZone()
        };
      }
    };
  }
  var DEFAULT_APP_BASE = "https://luyun1224.github.io/Chimei-SP/app/";
  function appShell() {
    const base = (props().getProperty("APP_BASE_URL") || DEFAULT_APP_BASE).replace(/\/?$/, "/");
    if (!/^https:\/\/[\w.-]+\//.test(base)) throw new Error("APP_BASE_URL 必須是 https 網址");
    const v = Math.floor(Date.now() / 6e5);
    return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&family=Noto+Serif+TC:wght@600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${base}app.css?v=${v}">
<style>#boot{font-family:system-ui,"Noto Sans TC",sans-serif;color:#284A45;display:grid;place-items:center;min-height:90vh;background:#F7F4ED}</style>
</head><body style="margin:0;background:#F7F4ED"><div id="root"><div id="boot">載入中…</div></div>
<script src="${base}app.js?v=${v}" onerror="document.getElementById('boot').textContent='無法載入前端程式（${base}app.js），請確認網路可連線 GitHub Pages。'"><\/script>
</body></html>`;
  }
  function doGet() {
    const email = currentEmail();
    if (!email || !adminList().includes(email)) {
      const t = HtmlService.createTemplate(
        `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      body{font-family:system-ui,"Noto Sans TC",sans-serif;background:#F7F4ED;color:#252B2D;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box}
      main{max-width:560px;padding:36px;background:#fff;border-radius:20px;border:1px solid #e6e1d6}
      h1{font-size:22px;color:#284A45;margin:0 0 12px}p,li{line-height:1.75;color:#555;font-size:14px}ol{padding-left:20px}
      a.btn{display:inline-block;margin-top:8px;padding:10px 18px;border-radius:999px;background:#284A45;color:#fff;text-decoration:none;font-size:14px}</style></head>
      <body><main>
      <? if (email) { ?>
        <h1>無存取權限</h1><p>帳號 <b><?= email ?></b> 未獲授權使用 SP Performance Hub。</p>
        <p>如需使用，請聯絡臨床技能中心系統管理員將您的 Google 帳號加入管理員名單（Script Properties 的 ADMIN_EMAILS）。</p>
      <? } else { ?>
        <h1>無法辨識您的 Google 帳號</h1>
        <p>系統沒有收到登入身分，通常是以下原因之一：</p>
        <ol>
          <li><b>部署設定</b>：Apps Script「管理部署作業」中，執行身分須為「<b>存取網頁應用程式的使用者</b>」，存取權須為「<b>任何擁有 Google 帳戶的使用者</b>」（或貴院網域），不可選「任何人」。</li>
          <li><b>從 GitHub 網址嵌入開啟時</b>：瀏覽器封鎖了第三方 Cookie（無痕視窗預設會封鎖）。請到 Chrome「設定 → 隱私權和安全性 → 第三方 Cookie → 允許使用第三方 Cookie 的網站」加入 <b>luyun1224.github.io</b>，或改用下方按鈕直接開啟。</li>
        </ol>
        <a class="btn" href="<?= url ?>" target="_blank" rel="noopener">在新分頁直接開啟系統</a>
      <? } ?>
      </main></body></html>`
      );
      t.email = email;
      t.url = ScriptApp.getService().getUrl();
      return t.evaluate().setTitle("SP Performance Hub｜無存取權限").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    return HtmlService.createHtmlOutput(appShell()).setTitle("SP Performance Hub｜標準化病人演出歷程管理平台").addMetaTag("viewport", "width=device-width, initial-scale=1").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  function api(action, payloadJson) {
    let payload = {};
    try {
      payload = payloadJson ? JSON.parse(payloadJson) : {};
    } catch {
      return JSON.stringify({ ok: false, error: { code: "VALIDATION", message: "請求格式錯誤" } });
    }
    try {
      const email = currentEmail();
      if (!email || !adminList().includes(email)) {
        return JSON.stringify({ ok: false, error: { code: email ? "FORBIDDEN" : "UNAUTHENTICATED", message: "未授權的帳號" } });
      }
      const ss = openSpreadsheet();
      const svc = createService({ repo: createSheetsRepo(ss), env: buildEnv(ss), calendar: gasCalendar });
      return JSON.stringify(svc.dispatch(action, payload));
    } catch (e) {
      return JSON.stringify({ ok: false, error: { code: "NOT_CONFIGURED", message: String(e.message || e) } });
    }
  }
  function setupSpreadsheet() {
    var _a;
    const p = props();
    const bound = boundSpreadsheet();
    const savedId = p.getProperty("SPREADSHEET_ID");
    const ss = bound || (savedId ? SpreadsheetApp.openById(savedId) : SpreadsheetApp.create("SP Performance Hub 資料庫"));
    if (p.getProperty("SPREADSHEET_ID") !== ss.getId()) p.setProperty("SPREADSHEET_ID", ss.getId());
    ss.setSpreadsheetTimeZone(TZ);
    const now = fmtGasDate(/* @__PURE__ */ new Date(), "datetime");
    const sheetFor = (name, legacy) => {
      let sh = ss.getSheetByName(name);
      if (!sh) {
        const old = ss.getSheetByName(legacy);
        sh = old ? old.setName(name) : ss.insertSheet(name);
      }
      return sh;
    };
    const style = (sh, cols) => {
      sh.getRange(1, 1, sh.getMaxRows(), cols).setNumberFormat("@");
      sh.getRange(1, 1, 1, cols).setFontWeight("bold").setBackground("#284A45").setFontColor("#FFFFFF");
      sh.setFrozenRows(1);
      const exists = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).some((x) => x.getDescription() === "表頭由系統管理，請勿修改");
      if (!exists) sh.getRange(1, 1, 1, cols).protect().setDescription("表頭由系統管理，請勿修改").setWarningOnly(true);
    };
    for (const name of Object.keys(TABLES)) {
      const def = TABLES[name];
      const sh = sheetFor(def.sheet, def.legacySheet);
      const values = sh.getLastRow() ? sh.getDataRange().getValues() : [[]];
      const oldHeader = (values[0] || []).map(String);
      const known = def.columns;
      const extras = oldHeader.filter((h) => h && !known.some((c) => c.label === h || c.key === h));
      const header = [...known.map((c) => c.label), ...extras];
      const rows = values.slice(1).filter((r) => r.some((x) => x !== "" && x !== null)).map((r) => {
        const obj = fromRow(name, oldHeader, r, fmtGasDate);
        return [...toRow(name, obj), ...extras.map((h) => {
          var _a2;
          return String((_a2 = r[oldHeader.indexOf(h)]) != null ? _a2 : "");
        })];
      });
      sh.clearContents();
      sh.getRange(1, 1, 1 + rows.length, header.length).setNumberFormat("@").setValues([header, ...rows]);
      style(sh, header.length);
    }
    const st = sheetFor(SETTINGS_SHEET, LEGACY_SETTINGS_SHEET);
    const cur = st.getLastRow() ? st.getDataRange().getValues().slice(1) : [];
    const json = {};
    for (const r of cur) {
      const key = settingKeyOf(String(r[0] || ""));
      if (key) json[key] = settingFromSheet(key, String((_a = r[1]) != null ? _a : ""));
    }
    const settingRows = Object.keys(DEFAULT_SETTINGS).map((k) => {
      const def = DEFAULT_SETTINGS[k];
      const val = json[k] !== void 0 && json[k] !== "" ? json[k] : typeof def === "string" ? def : JSON.stringify(def);
      return [SETTING_LABELS[k], settingToSheet(k, val), now];
    });
    st.clearContents();
    st.getRange(1, 1, 1 + settingRows.length, 3).setNumberFormat("@").setValues([SETTINGS_HEADER, ...settingRows]);
    st.setColumnWidth(1, 180).setColumnWidth(2, 420);
    style(st, 3);
    const blank = ss.getSheetByName("Sheet1") || ss.getSheetByName("工作表1");
    if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);
    if (!adminList().length) {
      const me = currentEmail();
      if (me) p.setProperty("ADMIN_EMAILS", me);
    }
    Logger.log("✅ 初始化完成（%s）：%s", bound ? "使用綁定的試算表" : "使用 SPREADSHEET_ID 指定的試算表", ss.getUrl());
    Logger.log("管理員：%s", adminList().join(", ") || "（未設定，請於 Script Properties 設定 ADMIN_EMAILS）");
    return ss.getUrl();
  }
  function healthCheck() {
    const ss = openSpreadsheet();
    const r = buildEnv(ss).health();
    Logger.log(JSON.stringify(r, null, 2));
    return r;
  }
  return __toCommonJS(main_exports);
})();

function doGet() { return SPHub.doGet.apply(null, arguments); }
function api() { return SPHub.api.apply(null, arguments); }
function setupSpreadsheet() { return SPHub.setupSpreadsheet.apply(null, arguments); }
function healthCheck() { return SPHub.healthCheck.apply(null, arguments); }
