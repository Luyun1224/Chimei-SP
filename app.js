/* SP 演出紀錄儀表板 — 純前端，資料存於 localStorage */
(() => {
  'use strict';

  const STORE_KEY = 'chimei-sp-records-v1';
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const $ = (s) => document.querySelector(s);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- 資料存取 ----------
  let records = load();
  let editingId = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch { return []; }
  }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(records)); }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- 工具 ----------
  const toMin = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
  const perfHours = (r) => Math.max(0, toMin(r.end) - toMin(r.start)) / 60;
  const onsiteHours = (r) => Math.max(0, toMin(r.end) - toMin(r.checkin || r.start)) / 60;
  const fmtH = (h) => (Math.round(h * 10) / 10).toLocaleString('zh-TW', { maximumFractionDigits: 1 });
  const splitSPs = (s) => String(s || '').split(/[,，、;；\/\n]+/).map((x) => x.trim()).filter(Boolean);
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoDate(new Date());
  const tomorrowISO = () => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDate(d); };
  const fmtDate = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}（${WEEK[d.getDay()]}）`;
  };
  const shortDate = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
  };
  const sortRecs = (a, b) => (a.date + a.start).localeCompare(b.date + b.start);

  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) n.setAttribute(k, v);
    }
    for (const c of children) if (c !== null && c !== undefined) n.append(c instanceof Node ? c : document.createTextNode(c));
    return n;
  }
  function svg(tag, attrs = {}, text) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
  }

  // ---------- Google 行事曆連結 ----------
  function gcalLink(r) {
    const d = r.date.replace(/-/g, '');
    const t = (x) => x.replace(':', '') + '00';
    const details = [
      `報到時間：${r.checkin}`,
      `演出時間：${r.start}–${r.end}`,
      `單位：${r.unit}`,
      `教案主題：${r.topic}`,
      `SP：${r.sps.join('、')}`,
      r.note ? `備註：${r.note}` : '',
    ].filter(Boolean).join('\n');
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: `SP演出｜${r.topic}（${r.sps.join('、')}）`,
      dates: `${d}T${t(r.checkin || r.start)}/${d}T${t(r.end)}`,
      ctz: 'Asia/Taipei',
      details,
      location: r.unit,
    });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }

  // ---------- 篩選 ----------
  const F = { year: String(new Date().getFullYear()), unit: '', sp: '', q: '' };

  function filtered() {
    const q = F.q.trim().toLowerCase();
    return records.filter((r) => {
      if (F.year && !r.date.startsWith(F.year)) return false;
      if (F.unit && r.unit !== F.unit) return false;
      if (F.sp && !r.sps.includes(F.sp)) return false;
      if (q) {
        const hay = [r.unit, r.topic, r.note, ...r.sps].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort(sortRecs);
  }

  function fillSelect(sel, values, allLabel, current) {
    sel.replaceChildren(el('option', { value: '' }, allLabel));
    for (const v of values) sel.append(el('option', { value: v }, v));
    sel.value = values.includes(current) ? current : '';
    return sel.value;
  }

  function refreshFilterOptions() {
    const thisYear = String(new Date().getFullYear());
    const years = [...new Set([thisYear, ...records.map((r) => r.date.slice(0, 4))])].sort().reverse();
    const ySel = $('#f-year');
    ySel.replaceChildren(el('option', { value: '' }, '全部年度'));
    for (const y of years) ySel.append(el('option', { value: y }, `${y} 年（民國 ${Number(y) - 1911}）`));
    ySel.value = F.year;

    const units = [...new Set(records.map((r) => r.unit))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const sps = [...new Set(records.flatMap((r) => r.sps))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const topics = [...new Set(records.map((r) => r.topic))];
    F.unit = fillSelect($('#f-unit'), units, '全部單位', F.unit);
    F.sp = fillSelect($('#f-sp'), sps, '全部 SP', F.sp);

    const dl = (id, list) => $(id).replaceChildren(...list.map((v) => el('option', { value: v })));
    dl('#dl-unit', units); dl('#dl-sp', sps); dl('#dl-topic', topics);
  }

  // ---------- 統計 ----------
  function spStats(list) {
    const m = new Map();
    for (const r of list) {
      for (const name of r.sps) {
        if (F.sp && name !== F.sp) continue;
        const s = m.get(name) || { name, sessions: 0, perf: 0, onsite: 0, units: new Set(), last: '' };
        s.sessions++; s.perf += perfHours(r); s.onsite += onsiteHours(r); s.units.add(r.unit);
        if (r.date > s.last) s.last = r.date;
        m.set(name, s);
      }
    }
    return [...m.values()].sort((a, b) => b.perf - a.perf || b.sessions - a.sessions);
  }

  // ---------- 渲染 ----------
  function render() {
    refreshFilterOptions();
    const list = filtered();
    const stats = spStats(list);
    renderReminder();
    renderTiles(list, stats);
    renderSpChart(stats);
    renderMonthChart(list);
    renderSpTable(stats);
    renderRecords(list);
  }

  function renderReminder() {
    const tmr = tomorrowISO();
    const items = records.filter((r) => r.date === tmr).sort(sortRecs);
    $('#tomorrow-label').textContent = fmtDate(tmr);
    const body = $('#reminder-body');
    $('#btn-copy-reminder').hidden = !items.length;
    if (!items.length) { body.replaceChildren(el('p', { class: 'muted', style: 'margin:0' }, '明天沒有排定的演出。')); return; }
    body.replaceChildren(...items.map((r) =>
      el('div', { class: 'reminder-item' },
        el('span', { class: 'time' }, `${r.checkin} 報到｜${r.start}–${r.end}`),
        el('span', {}, `${r.unit}・${r.topic}`),
        el('span', {}, ...r.sps.map((n) => el('span', { class: 'chip' }, n))))));
  }

  function reminderText() {
    const tmr = tomorrowISO();
    const items = records.filter((r) => r.date === tmr).sort(sortRecs);
    const lines = [`【SP 演出提醒】明天 ${shortDate(tmr)}`];
    for (const r of items) {
      lines.push('', `▸ ${r.checkin} 報到，${r.start}–${r.end} 演出`, `  單位：${r.unit}`, `  教案：${r.topic}`, `  SP：${r.sps.join('、')}`);
      if (r.note) lines.push(`  備註：${r.note}`);
    }
    lines.push('', '請準時報到，謝謝您的協助！');
    return lines.join('\n');
  }

  function renderTiles(list, stats) {
    const total = stats.reduce((s, st) => s + st.perf, 0);
    const today = todayISO();
    const upcoming = records.filter((r) => r.date >= today).length;
    const top = stats[0];
    const scope = F.year ? `${F.year} 年` : '全部年度';
    const tile = (label, value, unit, foot) =>
      el('div', { class: 'tile' },
        el('div', { class: 'label' }, label),
        el('div', { class: 'value' }, value, unit ? el('small', {}, unit) : null),
        el('div', { class: 'foot' }, foot));
    $('#tiles').replaceChildren(
      tile('演出場次', String(list.length), '場', scope),
      tile('SP 演出總時數', fmtH(total), '小時', '每位 SP 時數加總'),
      tile('參與 SP 人數', String(stats.length), '人', scope),
      tile('時數最多', top ? top.name : '—', top ? `${fmtH(top.perf)} 小時` : '', top ? `${top.sessions} 場` : '尚無資料'),
      tile('即將到來', String(upcoming), '場', '今天起（不受篩選影響）'),
    );
  }

  // --- Tooltip ---
  const tip = $('#tooltip');
  function showTip(evt, value, label) {
    tip.replaceChildren(el('div', { class: 'tt-val' }, value), el('div', { class: 'tt-label' }, label));
    tip.hidden = false;
    let x, y;
    if (evt.clientX !== undefined && evt.type.startsWith('pointer')) { x = evt.clientX; y = evt.clientY; }
    else { const b = evt.currentTarget.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top; }
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 12)) + 'px';
    tip.style.top = Math.max(8, y - h - 12) + 'px';
  }
  const hideTip = () => (tip.hidden = true);
  function bindTip(g, value, label) {
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', `${label}：${value}`);
    g.addEventListener('pointermove', (e) => showTip(e, value, label));
    g.addEventListener('pointerleave', hideTip);
    g.addEventListener('focus', (e) => showTip(e, value, label));
    g.addEventListener('blur', hideTip);
  }

  // 圓角只在資料端（4px），基線端維持直角
  function barPath(x, y, w, h, dir) {
    const r = Math.min(4, dir === 'h' ? w : h, dir === 'h' ? h / 2 : w / 2);
    if (w <= 0 || h <= 0) return '';
    if (dir === 'h') // 向右長
      return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    // 向上長
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function renderSpChart(stats) {
    const box = $('#chart-sp');
    const W = Math.max(320, box.clientWidth || 560);
    $('#sp-chart-note').textContent = stats.length ? `共 ${stats.length} 位，依時數排序` : '';
    if (!stats.length) { box.replaceChildren(emptySvg(W)); return; }
    const labelW = Math.min(110, Math.max(60, Math.max(...stats.map((s) => s.name.length)) * 14 + 12));
    const rowH = 28, barH = 18, top = 22, right = 56;
    const H = top + stats.length * rowH + 4;
    const plotW = W - labelW - right;
    const max = niceMax(Math.max(...stats.map((s) => s.perf)));
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '各 SP 演出時數長條圖' });

    const grid = svg('g', { class: 'grid' });
    for (let i = 0; i <= 4; i++) {
      const x = labelW + (plotW * i) / 4;
      grid.append(svg('line', { x1: x, x2: x, y1: top - 4, y2: H - 4 }));
      grid.append(svg('text', { x, y: 12, 'text-anchor': 'middle' }, fmtH((max * i) / 4)));
    }
    s.append(grid);

    stats.forEach((st, i) => {
      const y = top + i * rowH;
      const w = (st.perf / max) * plotW;
      const g = svg('g', { class: 'mark' });
      g.append(svg('rect', { class: 'hit', x: 0, y, width: W, height: rowH }));
      g.append(svg('text', { x: labelW - 8, y: y + rowH / 2 + 4, 'text-anchor': 'end' }, st.name));
      g.append(svg('path', { class: 'bar', d: barPath(labelW, y + (rowH - barH) / 2, Math.max(w, 1), barH, 'h') }));
      g.append(svg('text', { class: 'val', x: labelW + w + 6, y: y + rowH / 2 + 4 }, fmtH(st.perf)));
      bindTip(g, `${fmtH(st.perf)} 小時`, `${st.name}・${st.sessions} 場`);
      s.append(g);
    });
    box.replaceChildren(s);
  }

  function renderMonthChart(list) {
    const box = $('#chart-month');
    const W = Math.max(320, box.clientWidth || 560);
    const H = 240, left = 36, right = 8, top = 20, bottom = 26;
    const months = Array.from({ length: 12 }, () => ({ hours: 0, sessions: 0 }));
    for (const r of list) {
      const m = Number(r.date.slice(5, 7)) - 1;
      months[m].hours += perfHours(r) * (F.sp ? 1 : r.sps.length);
      months[m].sessions++;
    }
    const max = niceMax(Math.max(0, ...months.map((m) => m.hours)));
    const plotW = W - left - right, plotH = H - top - bottom;
    const slot = plotW / 12, bw = Math.min(36, slot - 2 - slot * 0.25);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '每月演出時數長條圖' });

    const grid = svg('g', { class: 'grid' });
    for (let i = 0; i <= 4; i++) {
      const y = top + plotH - (plotH * i) / 4;
      grid.append(svg('line', { x1: left, x2: W - right, y1: y, y2: y }));
      grid.append(svg('text', { x: left - 6, y: y + 4, 'text-anchor': 'end' }, fmtH((max * i) / 4)));
    }
    s.append(grid);

    months.forEach((m, i) => {
      const cx = left + slot * i + slot / 2;
      const h = (m.hours / max) * plotH;
      const g = svg('g', { class: 'mark' });
      g.append(svg('rect', { class: 'hit', x: left + slot * i, y: top, width: slot, height: plotH + bottom }));
      if (h > 0) {
        g.append(svg('path', { class: 'bar', d: barPath(cx - bw / 2, top + plotH - h, bw, h, 'v') }));
        g.append(svg('text', { class: 'val', x: cx, y: top + plotH - h - 5, 'text-anchor': 'middle' }, fmtH(m.hours)));
      }
      g.append(svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, `${i + 1}月`));
      bindTip(g, `${fmtH(m.hours)} 小時`, `${i + 1} 月・${m.sessions} 場`);
      s.append(g);
    });
    box.replaceChildren(s);
  }

  function emptySvg(W) {
    const s = svg('svg', { viewBox: `0 0 ${W} 120` });
    s.append(svg('text', { class: 'empty-msg', x: W / 2, y: 64, 'text-anchor': 'middle' }, '此篩選條件下尚無資料'));
    return s;
  }

  function renderSpTable(stats) {
    const tb = $('#tbl-sp tbody');
    if (!stats.length) { tb.replaceChildren(el('tr', {}, el('td', { colspan: 6, class: 'muted' }, '尚無資料'))); return; }
    tb.replaceChildren(...stats.map((st) =>
      el('tr', {},
        el('td', {}, el('span', { class: 'chip link', title: '只看這位 SP', onclick: () => setFilter('sp', st.name) }, st.name)),
        el('td', { class: 'num' }, String(st.sessions)),
        el('td', { class: 'num' }, fmtH(st.perf)),
        el('td', { class: 'num' }, fmtH(st.onsite)),
        el('td', {}, [...st.units].join('、')),
        el('td', { class: 'nowrap' }, fmtDate(st.last)))));
  }

  function renderRecords(list) {
    const tb = $('#tbl-rec tbody');
    const today = todayISO();
    $('#rec-count').textContent = `（${list.length} 筆）`;
    $('#rec-empty').hidden = list.length > 0;
    // 最新在上
    const rows = [...list].reverse().map((r) => {
      const upcoming = r.date >= today;
      return el('tr', { class: upcoming ? '' : 'past' },
        el('td', { class: 'nowrap' }, fmtDate(r.date), upcoming ? el('span', { class: 'badge-upcoming' }, r.date === today ? '今天' : '未來') : null),
        el('td', {}, r.unit),
        el('td', { class: 'nowrap' }, r.checkin),
        el('td', { class: 'nowrap' }, `${r.start}–${r.end}`),
        el('td', {}, r.topic, r.note ? el('div', { class: 'muted small' }, r.note) : null),
        el('td', {}, ...r.sps.map((n) => el('span', { class: 'chip' }, n))),
        el('td', { class: 'num' }, fmtH(perfHours(r))),
        el('td', {}, el('div', { class: 'row-actions' },
          el('a', { href: gcalLink(r), target: '_blank', rel: 'noopener', title: '加入 Google 行事曆' }, '📅 行事曆'),
          el('button', { onclick: () => openDialog(r) }, '編輯'),
          el('button', { class: 'del', onclick: () => removeRecord(r) }, '刪除'))));
    });
    tb.replaceChildren(...rows);
  }

  function setFilter(key, val) {
    F[key] = val;
    const map = { year: '#f-year', unit: '#f-unit', sp: '#f-sp', q: '#f-q' };
    $(map[key]).value = val;
    render();
  }

  // ---------- 新增 / 編輯 ----------
  const dlg = $('#dlg');
  const form = $('#rec-form');

  function openDialog(r) {
    editingId = r ? r.id : null;
    $('#dlg-title').textContent = r ? '編輯演出紀錄' : '新增演出紀錄';
    $('#form-hint').textContent = '';
    form.reset();
    const v = r || { date: todayISO(), checkin: '08:00', start: '08:30', end: '12:00', unit: '', topic: '', sps: [], note: '' };
    form.date.value = v.date; form.unit.value = v.unit; form.checkin.value = v.checkin;
    form.start.value = v.start; form.end.value = v.end; form.topic.value = v.topic;
    form.sps.value = v.sps.join('、'); form.note.value = v.note || '';
    dlg.showModal();
  }

  form.addEventListener('submit', (e) => {
    const rec = {
      id: editingId || uid(),
      date: form.date.value,
      unit: form.unit.value.trim(),
      checkin: form.checkin.value,
      start: form.start.value,
      end: form.end.value,
      topic: form.topic.value.trim(),
      sps: [...new Set(splitSPs(form.sps.value))],
      note: form.note.value.trim(),
    };
    let err = '';
    if (toMin(rec.end) <= toMin(rec.start)) err = '演出結束時間必須晚於開始時間。';
    else if (toMin(rec.checkin) > toMin(rec.start)) err = '報到時間應早於或等於演出開始時間。';
    else if (!rec.sps.length) err = '請至少填寫一位 SP。';
    if (err) { e.preventDefault(); $('#form-hint').textContent = err; return; }

    const idx = records.findIndex((x) => x.id === rec.id);
    if (idx >= 0) records[idx] = rec; else records.push(rec);
    save();
    if (F.year && !rec.date.startsWith(F.year)) F.year = rec.date.slice(0, 4);
    render();
    toast(idx >= 0 ? '已更新紀錄' : '已新增紀錄');
  });
  $('#btn-cancel').addEventListener('click', () => dlg.close());

  function removeRecord(r) {
    if (!confirm(`確定刪除 ${fmtDate(r.date)}「${r.topic}」這筆紀錄？`)) return;
    records = records.filter((x) => x.id !== r.id);
    save(); render(); toast('已刪除');
  }

  // ---------- 匯出 / 匯入 ----------
  const CSV_HEAD = ['日期', '單位', '報到時間', '演出開始', '演出結束', '教案主題', 'SP姓名', '演出時數', '備註'];
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  function exportCSV() {
    const rows = [CSV_HEAD, ...[...records].sort(sortRecs).map((r) =>
      [r.date, r.unit, r.checkin, r.start, r.end, r.topic, r.sps.join('、'), fmtH(perfHours(r)), r.note])];
    download(`SP演出紀錄_${todayISO()}.csv`, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  function exportJSON() {
    download(`SP演出紀錄備份_${todayISO()}.json`, JSON.stringify(records, null, 2), 'application/json');
  }

  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim()));
  }

  const normTime = (t) => { const m = String(t || '').match(/(\d{1,2})[:：](\d{2})/); return m ? `${pad(m[1])}:${m[2]}` : ''; };
  const normDate = (d) => { const m = String(d || '').match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : ''; };

  function sanitize(o) {
    const r = {
      id: o.id || uid(),
      date: normDate(o.date), unit: String(o.unit || '').trim(),
      checkin: normTime(o.checkin) || normTime(o.start), start: normTime(o.start), end: normTime(o.end),
      topic: String(o.topic || '').trim(),
      sps: Array.isArray(o.sps) ? o.sps.map(String).map((s) => s.trim()).filter(Boolean) : splitSPs(o.sps),
      note: String(o.note || '').trim(),
    };
    return r.date && r.start && r.end && r.sps.length ? r : null;
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let incoming = [];
      try {
        if (file.name.toLowerCase().endsWith('.json')) {
          incoming = JSON.parse(reader.result);
        } else {
          const rows = parseCSV(reader.result);
          const head = rows.shift().map((h) => h.trim());
          const col = (name) => head.indexOf(name);
          incoming = rows.map((r) => ({
            date: r[col('日期')], unit: r[col('單位')], checkin: r[col('報到時間')],
            start: r[col('演出開始')], end: r[col('演出結束')], topic: r[col('教案主題')],
            sps: r[col('SP姓名')], note: col('備註') >= 0 ? r[col('備註')] : '',
          }));
        }
      } catch (err) { alert('無法讀取檔案：' + err.message); return; }
      const clean = (Array.isArray(incoming) ? incoming : []).map(sanitize).filter(Boolean);
      const ids = new Set(records.map((r) => r.id));
      let added = 0;
      for (const r of clean) { if (!ids.has(r.id)) { records.push(r); added++; } }
      save(); render();
      toast(`匯入 ${added} 筆紀錄${clean.length - added ? `（略過重複 ${clean.length - added} 筆）` : ''}`);
    };
    reader.readAsText(file, 'utf-8');
  }

  function loadSample() {
    if (records.length && !confirm('範例資料會加入到現有紀錄中，確定嗎？')) return;
    const y = new Date().getFullYear();
    const units = ['醫學系 UGY', '護理部', 'PGY 訓練', '藥劑部', '醫學系 Clerk'];
    const topics = ['胸痛病史詢問', '腹痛身體檢查', '糖尿病衛教', '壞消息告知', '術前說明與同意', '頭痛鑑別診斷', '用藥諮詢', '跌倒風險評估'];
    const sps = ['王小明', '李美華', '陳志強', '林淑芬', '張家豪', '黃雅婷', '吳建國', '劉怡君'];
    const slots = [['08:00', '08:30', '12:00'], ['12:30', '13:00', '17:00'], ['08:30', '09:00', '11:00'], ['13:30', '14:00', '16:30']];
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const out = [];
    for (let i = 0; i < 46; i++) {
      const m = Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 27);
      const [c, s, e] = pick(slots);
      const n = 1 + Math.floor(rnd() * 3);
      out.push({ id: uid() + i, date: `${y}-${pad(m + 1)}-${pad(d)}`, unit: pick(units), checkin: c, start: s, end: e,
        topic: pick(topics), sps: [...new Set(Array.from({ length: n }, () => pick(sps)))], note: '' });
    }
    out.push({ id: uid() + 't', date: tomorrowISO(), unit: '醫學系 UGY', checkin: '07:45', start: '08:30', end: '12:00',
      topic: '胸痛病史詢問', sps: ['王小明', '林淑芬'], note: '第二考場，請著便服' });
    records.push(...out); save();
    F.year = String(y); render(); toast('已載入範例資料');
  }

  // ---------- 事件 ----------
  $('#btn-new').addEventListener('click', () => openDialog(null));
  $('#f-year').addEventListener('change', (e) => setFilter('year', e.target.value));
  $('#f-unit').addEventListener('change', (e) => setFilter('unit', e.target.value));
  $('#f-sp').addEventListener('change', (e) => setFilter('sp', e.target.value));
  $('#f-q').addEventListener('input', (e) => { F.q = e.target.value; render(); });
  $('#btn-export-csv').addEventListener('click', exportCSV);
  $('#btn-export-json').addEventListener('click', exportJSON);
  $('#file-import').addEventListener('change', (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
  $('#btn-sample').addEventListener('click', loadSample);
  $('#btn-clear').addEventListener('click', () => {
    if (!confirm('確定清除全部紀錄？建議先「備份 JSON」。此動作無法復原。')) return;
    records = []; save(); render(); toast('已清除');
  });
  $('#btn-copy-reminder').addEventListener('click', async () => {
    const text = reminderText();
    try { await navigator.clipboard.writeText(text); toast('提醒訊息已複製，可貼到 LINE'); }
    catch { prompt('請複製以下提醒訊息：', text); }
  });
  document.querySelectorAll('.menu-list button, .menu-list .file-btn').forEach((b) =>
    b.addEventListener('click', () => b.closest('details').removeAttribute('open')));
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 150); });

  render();
})();
