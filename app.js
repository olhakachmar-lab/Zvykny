/* Zvykny — test build. Everything is stored only on this phone (localStorage). */
(() => {
"use strict";
const KEY = "zvykny.v1";
const H = 3600e3, MIN = 60e3, DAY = 24 * H;
const RHYTHMS = { "13:11": 13, "14:10": 14, "16:8": 16, "18:6": 18 };
const HABITS = ["water", "nosugar", "walk", "protein", "noalcohol"];
const COUNT_MIN_H = 10;

/* ---------- state ---------- */
const fresh = () => ({
  lang: (navigator.language || "en").toLowerCase().startsWith("uk") ? "uk" : "en",
  onboarded: false,
  profile: { name: "", goals: [], stage: null, dinner: "20:00" },
  rhythm: "13:11",
  notif: false,
  current: null,
  fasts: [],
  notes: {},
  habits: [],
  habitLog: {},
  createdAt: Date.now()
});
let S;
try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { S = fresh(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

let V = { view: null, params: {} };           // current screen
const viewStack = [];
let tmp = {};                                  // per-screen temp values
const app = document.getElementById("app");
const sheetsEl = document.getElementById("sheets");

/* ---------- helpers ---------- */
const TX = () => window.TEXTS[S.lang];
const t = (k, vars) => {
  let s = TX()[k];
  if (s == null) s = window.TEXTS.en[k];
  if (s == null) return k;
  if (vars && typeof s === "string") s = s.replace(/\{(\w+)\}/g, (_, x) => vars[x] != null ? vars[x] : "");
  return s;
};
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const hm = ts => { const d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const keyToDate = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const parts = ms => { ms = Math.max(0, ms); const h = Math.floor(ms / H), m = Math.floor((ms % H) / MIN); return { h, m }; };
const dur = ms => { const { h, m } = parts(ms); return S.lang === "uk" ? `${h} год${m ? " " + m + " хв" : ""}` : `${h}h${m ? " " + m + "m" : ""}`; };
const durLong = ms => { const { h, m } = parts(ms); return S.lang === "uk" ? `${h} год ${m} хв` : `${h} h ${m} m`; };
const timerHTML = ms => { const { h, m } = parts(ms); return `${h}<small>${t("h")}</small>${pad(m)}<small>${t("m")}</small>`; };
const hrs = h => S.lang === "uk" ? `${h} год` : `${h} h`;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const locale = () => S.lang === "uk" ? "uk-UA" : "en-GB";
const monthName = (d) => cap(new Intl.DateTimeFormat(locale(), { month: "long" }).format(d));
const monthYear = (d) => cap(new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" }).format(d));
const dateLong = (d) => cap(new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" }).format(d));
const dateShort = (d) => new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" }).format(d);
const plural = (n, forms) => {
  if (S.lang !== "uk") return n === 1 ? forms[0] : forms[1];
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return forms[0];
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return forms[1];
  return forms[2];
};
const vocative = (name) => {
  name = (name || "").trim();
  if (S.lang !== "uk" || !/[а-яіїєґ]$/i.test(name)) return name;
  const low = name.toLowerCase();
  if (low.endsWith("ія")) return name.slice(0, -1) + "є";
  if (low.endsWith("я")) return name.length <= 4 ? name.slice(0, -1) + "ю" : name.slice(0, -1) + "е";
  if (low.endsWith("а")) return name.slice(0, -1) + "о";
  if (low.endsWith("й")) return name.slice(0, -1) + "ю";
  if (/[бвгґджзклмнпрстфхцчшщ]$/.test(low)) return name + "е";
  return name;
};
const goalOf = r => RHYTHMS[r] || 13;
const counted = f => f.end - f.start >= COUNT_MIN_H * H;
const fastsByDay = () => { const m = {}; for (const f of S.fasts) { const k = dayKey(f.end); if (!m[k] || (f.end - f.start) > (m[k].end - m[k].start)) m[k] = f; } return m; };
const countedFasts = () => S.fasts.filter(counted);
const parseHM = s => { const [h, m] = s.split(":").map(Number); return { h, m }; };
const atTime = (base, s) => { const { h, m } = parseHM(s); const d = new Date(base); d.setHours(h, m, 0, 0); return d.getTime(); };
const nextDinner = () => { let ts = atTime(Date.now(), S.profile.dinner || "20:00"); if (ts < Date.now()) ts += DAY; return ts; };
const svgIcon = {
  drop: (c = "currentColor", f = "none") => `<svg width="16" height="20" viewBox="0 0 16 20"><path d="M8 1.5C8 1.5 2 8.4 2 12.6A6 6 0 0 0 14 12.6C14 8.4 8 1.5 8 1.5Z" fill="${f}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  chev: `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  back: `<svg width="9" height="14" viewBox="0 0 9 14"><path d="M7.5 1.5 2 7l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg width="11" height="9" viewBox="0 0 11 9"><path d="M1.5 4.5 4 7l5.5-5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  habit: {
    water: `<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 2S4 7.6 4 11a5 5 0 0 0 10 0C14 7.6 9 2 9 2Z" fill="none" stroke="#3E7689" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    nosugar: `<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6.5" fill="none" stroke="#3D6B5E" stroke-width="1.6"/><path d="M6 9.2 8 11.2 12 7" fill="none" stroke="#3D6B5E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    walk: `<svg width="18" height="18" viewBox="0 0 18 18"><ellipse cx="6" cy="6" rx="2.2" ry="3.2" fill="none" stroke="#3D6B5E" stroke-width="1.5"/><ellipse cx="12" cy="11" rx="2.2" ry="3.2" fill="none" stroke="#3D6B5E" stroke-width="1.5"/></svg>`,
    protein: `<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 2.5c3 0 5 4.5 5 7.5a5 5 0 0 1-10 0c0-3 2-7.5 5-7.5Z" fill="none" stroke="#3D6B5E" stroke-width="1.6"/></svg>`,
    noalcohol: `<svg width="18" height="18" viewBox="0 0 18 18"><path d="M5 3h8l-1 6a3 3 0 0 1-6 0L5 3Zm4 9v3.5M6.5 15.5h5" fill="none" stroke="#3D6B5E" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M3 3l12 12" stroke="#3D6B5E" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    fast: ``
  }
};

/* ---------- calendar (.ics) ---------- */
const isAndroid = () => /android/i.test(navigator.userAgent);
function calTimes() { const s = nextDinner(), e = s + goalOf(S.rhythm) * H; return { s, e }; }
function calBlock() {
  const { s, e } = calTimes();
  return `<div class="card" style="margin-top:14px;display:flex;gap:14px;align-items:flex-start">
    <svg width="22" height="22" viewBox="0 0 22 22" style="flex:none;margin-top:2px"><rect x="3" y="4.5" width="16" height="14" rx="3" fill="none" stroke="#3D6B5E" stroke-width="1.6"/><path d="M3 9h16M7.5 2.5v4M14.5 2.5v4" stroke="#3D6B5E" stroke-width="1.6" stroke-linecap="round"/></svg>
    <div><b style="font-size:15px;display:block">${tmp.calDone || S.calAdded && V.view !== "remind" ? t("calAdded") : t("calTitle")}</b><div class="cap">${t("calWhen", { s: hm(s), e: hm(e) })}</div><div class="cap" style="margin-top:6px">${t("calWhy")}</div></div></div>`;
}
const icsDate = ts => { const d = new Date(ts); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00"; };
const icsUTC = ts => new Date(ts).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEsc = x => String(x).replace(/\\/g, "\\\\").replace(/[,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
function buildICS() {
  const { s, e } = calTimes(), desc = t("calDesc", { r: S.rhythm, s: hm(s), e: hm(e) });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Zvykny//Test build//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", "UID:zvykny-" + Date.now() + "@zvykny.app", "DTSTAMP:" + icsUTC(Date.now()),
    "DTSTART:" + icsDate(s), "DTEND:" + icsDate(e), "RRULE:FREQ=DAILY",
    "SUMMARY:" + icsEsc(t("calEvent")), "DESCRIPTION:" + icsEsc(desc), "TRANSP:TRANSPARENT",
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(t("remindPreviewTitle")), "TRIGGER:PT0M", "END:VALARM",
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(t("notifDoneTitle")), "TRIGGER;RELATED=END:PT0M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
function addToCalendar() {
  const blob = new Blob([buildICS()], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "zvykny.ics"; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  markCal();
}
function addToGoogle() {
  const { s, e } = calTimes(), desc = t("calDesc", { r: S.rhythm, s: hm(s), e: hm(e) });
  const u = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(t("calEvent")) +
    "&dates=" + icsDate(s) + "/" + icsDate(e) + "&details=" + encodeURIComponent(desc) + "&recur=" + encodeURIComponent("RRULE:FREQ=DAILY");
  window.open(u, "_blank"); markCal();
}
function markCal() { S.calAdded = true; S.calSig = S.rhythm + "|" + S.profile.dinner; save(); tmp.calDone = true; setTimeout(() => { render(); if (sheet) renderSheet(false); }, 400); }
function calOutdated() { return S.calAdded && S.calSig !== S.rhythm + "|" + S.profile.dinner; }

/* ---------- ring ---------- */
let ringId = 0;
function ringSVG(size, p, n, mode) {
  ringId++;
  const c = size / 2, sw = size > 100 ? 11 : Math.max(2.5, size * 0.1), R = size > 100 ? c - 12 : c - sw / 2 - 0.5, C = 2 * Math.PI * R, pc = Math.max(0, Math.min(1, p));
  const grad = `g${ringId}`, halo = `h${ringId}`, glow = `w${ringId}`;
  const soft = mode === "eat";
  let dots = "";
  if (size > 100 && n) {
    const rd = R - 20;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
      const done = (i / n) <= pc && mode !== "ready";
      dots += `<circle cx="${(c + rd * Math.cos(a)).toFixed(1)}" cy="${(c + rd * Math.sin(a)).toFixed(1)}" r="2" fill="${done ? "#3D6B5E" : "#80868C"}" opacity="${done ? .45 : .35}"/>`;
    }
  }
  const a = -Math.PI / 2 + pc * 2 * Math.PI, nx = c + R * Math.cos(a), ny = c + R * Math.sin(a);
  const showNow = size > 100 && mode !== "ready" && pc > 0 && pc < 1;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <defs>
      <linearGradient id="${grad}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${soft ? "#BFDCD2" : "#8FC0B0"}"/><stop offset="1" stop-color="${soft ? "#7FB3A3" : "#3D6B5E"}"/></linearGradient>
      <radialGradient id="${halo}"><stop offset="0" stop-color="#E9F1EE"/><stop offset=".7" stop-color="#F3F6F4"/><stop offset="1" stop-color="#F7F7F6" stop-opacity="0"/></radialGradient>
      <radialGradient id="${glow}"><stop offset="0" stop-color="#7FB3A3" stop-opacity=".45"/><stop offset="1" stop-color="#7FB3A3" stop-opacity="0"/></radialGradient>
    </defs>
    ${size > 100 ? `<circle cx="${c}" cy="${c}" r="${R - 26}" fill="url(#${halo})"/>` : ""}
    <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="#E4E6E8" stroke-width="${size > 100 ? 2 : sw}"/>
    ${dots}
    ${pc > 0 ? `<circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="url(#${grad})" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(C * pc).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${c} ${c})" style="transition:stroke-dasharray .6s ease"/>` : ""}
    ${showNow ? `<circle cx="${nx}" cy="${ny}" r="15" fill="url(#${glow})"/><circle cx="${nx}" cy="${ny}" r="7" fill="#fff" stroke="#3D6B5E" stroke-width="3"/>` : ""}
  </svg>`;
}

/* ---------- toast / sheets ---------- */
let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg; requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
let sheet = null; // {name, params}
function openSheet(name, params = {}) { sheet = { name, params }; history.pushState({ s: 1 }, ""); renderSheet(true); }
function closeSheet(fromPop) {
  if (!sheet) return;
  const layer = sheetsEl.firstElementChild;
  sheet = null;
  if (layer) { layer.classList.add("closing"); setTimeout(() => { if (!sheet) sheetsEl.innerHTML = ""; }, 210); }
  if (!fromPop) { ignorePop = true; history.back(); }
}
let ignorePop = false;
function renderSheet(anim) {
  if (!sheet) { sheetsEl.innerHTML = ""; return; }
  const html = SHEETS[sheet.name](sheet.params);
  const existing = sheetsEl.querySelector(".sheet");
  if (existing && !anim) { existing.innerHTML = `<div class="handle"></div>` + html; return; }
  sheetsEl.innerHTML = `<div class="sheet-layer"><div class="sheet-dim" data-a="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="handle"></div>${html}</div></div>`;
}

/* ---------- navigation ---------- */
function go(view, params = {}, opts = {}) {
  if (V.view && !opts.replace) viewStack.push(V);
  V = { view, params }; tmp = opts.keepTmp ? tmp : {};
  if (!opts.replace) history.pushState({ v: view }, "");
  render(); window.scrollTo(0, 0);
}
function back() { history.back(); }
window.addEventListener("popstate", () => {
  if (ignorePop) { ignorePop = false; return; }
  if (sheet) { closeSheet(true); return; }
  const prev = viewStack.pop();
  if (prev) { V = prev; tmp = {}; render(); }
  else history.pushState({}, "");
});

/* ---------- screens ---------- */
const topbar = (step, total, noBack) => `<div class="topbar">${noBack ? "<span></span>" : `<button class="back" data-a="back">${svgIcon.back}<span>${t("back")}</span></button>`}${step ? `<div class="steps">${Array.from({ length: total }, (_, i) => `<i class="${i === step - 1 ? "on" : ""}"></i>`).join("")}</div>` : ""}</div>`;

const SCREENS = {
  welcome() {
    return `<div class="screen">
      <div class="topbar"><span></span>${langPill()}</div>
      <div class="grow" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
        <div class="ring-wrap" style="width:220px;height:220px">${ringSVG(220, .72, 13, "fast")}</div>
        <h1 style="font-size:36px;font-weight:300;margin-top:28px">${t("tagline")}</h1>
        <p class="sub" style="white-space:pre-line">${t("welcomeSub")}</p>
      </div>
      <button class="btn" data-a="go" data-v="intro">${t("getStarted")}</button>
      <button class="link" data-a="already">${t("alreadyFast")}</button>
    </div>`;
  },
  intro() {
    return `<div class="screen">
      <div class="topbar"><button class="back" data-a="back">${svgIcon.back}<span>${t("back")}</span></button><button class="textlink" data-a="go" data-v="goal">${t("skip")}</button></div>
      <h1>${t("introTitle")}</h1>
      <div style="margin-top:12px">${t("introItems").map(([a, b]) => `<div class="intro-item"><i></i><div><b>${a}</b><p>${b}</p></div></div>`).join("")}</div>
      <div class="grow"></div>
      <button class="btn" data-a="go" data-v="goal">${t("gotIt")}</button>
      <p class="foot">${t("notMedical")}</p>
    </div>`;
  },
  goal() {
    const g = S.profile.goals;
    return `<div class="screen">${topbar(1, 5)}
      <h1>${t("goalTitle")}</h1><p class="sub">${t("goalSub")}</p>
      <div class="stack">${t("goals").map((x, i) => `<button class="choice ${g.includes(i) ? "on" : ""}" data-a="toggleGoal" data-v="${i}" aria-pressed="${g.includes(i)}">${x}<span class="box"></span></button>`).join("")}</div>
      <div class="grow" style="min-height:24px"></div>
      <button class="btn" data-a="go" data-v="stage" ${g.length ? "" : "disabled"}>${t("continue")}</button>
    </div>`;
  },
  stage() {
    return `<div class="screen">${topbar(2, 5)}
      <h1>${t("stageTitle")}</h1><p class="sub">${t("stageSub")}</p>
      <div class="stack">${t("stages").map((x, i) => `<button class="choice ${S.profile.stage === i ? "on" : ""}" data-a="setStage" data-v="${i}">${x}<span class="radio"></span></button>`).join("")}</div>
      <p class="cap" style="margin-top:16px">${t("stageNote")}</p>
      <div class="grow" style="min-height:24px"></div>
      <button class="btn" data-a="go" data-v="safety">${t("continue")}</button>
      <button class="link muted" data-a="go" data-v="safety">${t("skip")}</button>
    </div>`;
  },
  safety() {
    tmp.safety = tmp.safety || [false, false, false, false];
    const any = tmp.safety.some(Boolean);
    return `<div class="screen">${topbar(3, 5)}
      <h1>${t("safetyTitle")}</h1><p class="sub">${t("safetySub")}</p>
      <div class="stack">${t("safetyItems").map((x, i) => `<button class="choice ${tmp.safety[i] ? "on" : ""}" data-a="toggleSafety" data-v="${i}" role="switch" aria-checked="${tmp.safety[i]}"><span>${x}</span><span class="toggle"></span></button>`).join("")}</div>
      ${any ? `<div class="note-clay" style="margin-top:14px"><b>${t("safetyNoteTitle")}</b>${t("safetyNoteText")}</div>` : ""}
      <p class="cap" style="text-align:center;margin-top:14px">${t("safetyFoot")}</p>
      <div class="grow" style="min-height:16px"></div>
      <button class="btn" data-a="safetyNext">${t("continue")}</button>
    </div>`;
  },
  safetyExit() {
    return `<div class="screen center">
      <div class="grow" style="display:flex;flex-direction:column;justify-content:center;align-items:center">
        <div style="width:72px;height:72px;border-radius:50%;background:var(--clay-bg);display:grid;place-items:center;margin-bottom:20px"><svg width="28" height="28" viewBox="0 0 28 28"><path d="M14 24s-9-5.6-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.4-9 12-9 12Z" fill="none" stroke="#8A4B3C" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
        <h1>${t("safetyExitTitle")}</h1><p class="sub">${t("safetyExitText")}</p>
      </div>
      <button class="btn secondary" data-a="safetyClose">${t("close")}</button>
      <button class="link" data-a="back">${t("safetyMistake")}</button>
    </div>`;
  },
  dinner() {
    const d = S.profile.dinner, start = atTime(Date.now(), d), end = start + goalOf(S.rhythm) * H;
    return `<div class="screen">${topbar(4, 5)}
      <h1>${t("dinnerTitle")}</h1><p class="sub">${t("dinnerSub")}</p>
      <div class="stepper"><button data-a="dinner" data-v="-30" aria-label="−30">−</button><span class="val">${d}</span><button data-a="dinner" data-v="30" aria-label="+30">+</button></div>
      <div class="ai"><span class="orb"></span><div><div class="who">AI</div><p>${t("dinnerPlan", { rhythm: S.rhythm, start: d, end: hm(end) })}</p></div></div>
      <div class="grow" style="min-height:24px"></div>
      <button class="btn" data-a="go" data-v="${S.onboarded ? "home" : "remind"}">${t("looksGood")}</button>
      <button class="link" data-a="sheet" data-v="rhythm">${t("otherRhythm")}</button>
    </div>`;
  },
  remind() {
    const st = atTime(Date.now(), S.profile.dinner), end = st + goalOf(S.rhythm) * H;
    return `<div class="screen">${topbar(5, 5)}
      <h1>${t("remindTitle")}</h1><p class="sub">${t("remindSub")}</p>
      <div class="notif" style="margin-top:10px"><img src="icons/icon-192.png" alt=""><div><b>${t("remindPreviewTitle")}</b><span>${t("remindPreviewText", { time: hm(end) })}</span></div></div>
      ${calBlock()}
      <div class="grow" style="min-height:24px"></div>
      ${tmp.calDone ? `<button class="btn" data-a="go" data-v="name">${t("continue")}</button><button class="link" data-a="allowNotif">${t("allowNotifs")}</button>`
        : `<button class="btn" data-a="addCal">${t("calAdd")}</button>${isAndroid() ? `<button class="link" data-a="addCalGoogle">${t("calGoogle")}</button>` : ""}<button class="link muted" data-a="allowNotif">${t("allowReminders")}</button><button class="link muted" data-a="go" data-v="name">${t("notNow")}</button>`}
    </div>`;
  },
  name() {
    const v = tmp.name != null ? tmp.name : S.profile.name;
    return `<div class="screen">${topbar(0, 0)}
      <h1>${t("nameTitle")}</h1><p class="sub">${t("nameSub")}</p>
      <input class="field" id="nameInput" maxlength="30" autocomplete="given-name" autocapitalize="words" placeholder="${t("namePh")}" value="${esc(v)}">
      <div style="height:20px"></div>
      <button class="btn" id="nameBtn" data-a="saveName" ${v.trim() ? "" : "disabled"}>${t("continue")}</button>
      <button class="link muted" data-a="skipName">${t("skip")}</button>
    </div>`;
  },
  home() { return homeHTML(); },
  struggle() { return struggleHTML(); },
  unwell() {
    const c = S.current, el = c ? Date.now() - c.start : 0, counts = el >= COUNT_MIN_H * H;
    return `<div class="screen">${topbar(0, 0)}
      <div style="text-align:center;margin-top:24px"><div style="width:72px;height:72px;border-radius:50%;background:var(--accent-subtle);display:grid;place-items:center;margin:0 auto 18px"><svg width="30" height="30" viewBox="0 0 30 30"><path d="M15 25s-9.5-5.9-9.5-12.6A5.2 5.2 0 0 1 15 9.3a5.2 5.2 0 0 1 9.5 3.1C24.5 19.1 15 25 15 25Z" fill="none" stroke="#3D6B5E" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
      <h1>${t("unwellTitle")}</h1><p class="sub">${t("unwellText")}</p></div>
      <div class="card">${counts ? `<b style="font-size:15px;display:block;margin-bottom:2px">${t("itCounts")}</b><div class="cap">${t("itCountsText", { done: dur(el) })}</div>` : `<div class="cap">${t("shortNoCount")}</div>`}</div>
      <div class="note-clay" style="margin-top:12px">${t("unwellWarn")}</div>
      <div class="grow" style="min-height:24px"></div>
      <button class="btn" data-a="endFast" data-v="unwell">${t("endAndEat")}</button>
      <button class="link" data-a="go" data-v="home">${t("feelBetter")}</button>
      <p class="foot" style="margin-top:4px">${t("notMedical")}</p>
    </div>`;
  },
  result() {
    const f = S.fasts.find(x => x.id === V.params.id) || S.fasts[S.fasts.length - 1];
    if (!f) return homeHTML();
    const d = f.end - f.start, reached = d >= f.goal * H, counts = counted(f);
    const mStart = new Date(f.end); mStart.setDate(1); mStart.setHours(0, 0, 0, 0);
    const nMonth = countedFasts().filter(x => x.end >= mStart.getTime()).length;
    const wk = weekStart(f.end), nWeek = countedFasts().filter(x => x.end >= wk).length;
    const big = reached ? `${Math.floor(d / H)}<small>${t("h")}</small>` : timerHTML(d);
    return `<div class="screen">
      <div style="text-align:center;margin-top:12px"><h1 style="margin-bottom:12px">${reached ? t("completeTitle") : t("endedTitle")}</h1><span class="chip">${f.rhythm} · ${t("rhythms")[f.rhythm][0]}</span></div>
      <div class="ring-wrap">${ringSVG(290, reached ? 1 : d / (f.goal * H), f.goal, "fast")}<div class="ring-center"><div class="timer">${big}</div><div class="ring-sub">${reached ? t("doneGently") : counts ? t("stillCounts") : t("endedShortBig")}</div></div></div>
      <div class="card" style="display:flex;gap:14px;align-items:center;margin-top:10px"><div class="ring-wrap small" style="width:36px;height:36px">${ringSVG(36, counts ? 1 : .35, 0, "fast")}</div><div>${counts ? `<b style="font-size:15px">${t("fastNthMonth", { n: nMonth })}</b><div class="cap">${reached ? t("weekLine", { n: nWeek + " " + plural(nWeek, t("fastsWord")) }) : t("endedCounts")}</div>` : `<div class="cap">${t("endedShort")}</div>`}</div></div>
      <div class="grow" style="min-height:20px"></div>
      <button class="btn" data-a="go" data-v="home">${t("done")}</button>
      <button class="link" data-a="go" data-v="rhythmPage">${t("seeRhythm")}</button>
      <div class="info-strip" style="margin-top:6px"><div><span class="label">${t("started")}</span><b>${hm(f.start)}</b></div><div><span class="label">${t("goal")}</span><b>${hrs(f.goal)}</b></div><div><span class="label">${reached ? t("completed") : t("ended")}</span><b class="acc">${hm(f.end)}</b></div></div>
    </div>`;
  },
  rhythmPage() { return rhythmPageHTML(); },
  months() { return monthsHTML(); }
};

function langPill() { return `<div class="pill-switch" role="group" aria-label="Language"><button class="${S.lang === "uk" ? "on" : ""}" data-a="lang" data-v="uk">УКР</button><button class="${S.lang === "en" ? "on" : ""}" data-a="lang" data-v="en">EN</button></div>`; }

function greeting() {
  const h = new Date().getHours();
  const base = h >= 5 && h < 12 ? t("goodMorning") : h >= 12 && h < 18 ? t("goodDay") : t("goodEvening");
  return S.profile.name ? `${base}, ${esc(vocative(S.profile.name))}` : base;
}

/* ---------- home ---------- */
function homeState() {
  const now = Date.now(), c = S.current;
  if (c) { const el = now - c.start, goal = c.goal * H; return { mode: el >= goal ? "reached" : "fast", el, goal, c }; }
  const last = S.fasts[S.fasts.length - 1];
  if (last) { const nd = nextDinner(); if (now - last.end < 20 * H) return { mode: "eat", last, next: nd, from: last.end }; }
  return { mode: "ready" };
}
function homeHTML() {
  const st = homeState(), r = S.rhythm, g = goalOf(r), today = dayKey(Date.now());
  let ring, center, strip, main, sub = "";
  if (st.mode === "fast" || st.mode === "reached") {
    const reached = st.mode === "reached";
    ring = ringSVG(290, st.el / st.goal, st.c.goal, "fast");
    center = reached ? `<div class="timer" id="liveTimer">${timerHTML(st.el)}</div><div class="ring-sub">${t("goalReachedSub", { time: hm(st.c.start + st.goal) })}</div>`
      : `<div class="timer" id="liveTimer">${timerHTML(st.goal - st.el)}</div><div class="ring-sub">${t("left", { time: hm(st.c.start + st.goal) })}</div>`;
    main = reached ? `<button class="btn" data-a="endFast">${t("completeFast")}</button>`
      : `<button class="btn secondary" data-a="go" data-v="struggle">${t("struggling")}</button><button class="link" data-a="sheet" data-v="endConfirm">${t("endFast")}</button>`;
    strip = `<div><span class="label">${t("started")}</span><b>${hm(st.c.start)}</b></div><div><span class="label">${t("goal")}</span><b>${hrs(st.c.goal)}</b></div><div><span class="label">${t("ends")}</span><b class="acc">${hm(st.c.start + st.goal)}</b></div>`;
  } else if (st.mode === "eat") {
    const total = st.next - st.from, left = st.next - Date.now();
    ring = ringSVG(290, 1 - left / total, 24 - goalOf(r), "eat");
    center = `<div class="timer" id="liveTimer">${timerHTML(left)}</div><div class="ring-sub">${t("untilNext", { time: hm(st.next) })}</div>`;
    main = `<button class="btn" data-a="sheet" data-v="startTime">${t("startNext")}</button>`;
    const ld = st.last.end - st.last.start;
    strip = `<div><span class="label">${t("lastFast")}</span><b>${dur(ld)}${counted(st.last) ? " ✓" : ""}</b></div><div><span class="label">${t("rhythmLbl")}</span><b>${r}</b></div><div><span class="label">${t("next")}</span><b class="acc">${hm(st.next)}</b></div>`;
    if (Date.now() - st.last.end < 3 * H) sub = "nice";
  } else {
    ring = ringSVG(290, 0, g, "ready");
    center = `<div class="timer">${g}<small>${t("h")}</small></div><div class="ring-sub">${t("readySub")}</div>`;
    main = `<button class="btn" data-a="sheet" data-v="startTime">${t("startFast")}</button>`;
    strip = `<div><span class="label">${t("rhythmLbl")}</span><b>${r}</b></div><div><span class="label">${t("goal")}</span><b>${hrs(g)}</b></div><div><span class="label">${t("startLabel")}</span><b class="acc">${S.profile.dinner}</b></div>`;
  }
  const greet = sub === "nice" ? (S.profile.name ? `${t("niceWork")}, ${esc(vocative(S.profile.name))}` : t("niceWork")) : greeting();
  const noteSaved = !!(S.notes[today] || "").trim();
  return `<div class="screen" style="padding-bottom:calc(var(--safe-bottom) + 16px)">
    <h1 class="greet">${greet}</h1>
    <div class="row-between"><button class="chip" data-a="sheet" data-v="rhythm">${r} · ${t("rhythms")[r][0]} ${svgIcon.chev}</button><button class="textlink" data-a="go" data-v="rhythmPage">${t("myRhythm")}</button></div>
    <div class="ring-wrap" style="margin-top:14px">${ring}<div class="ring-center">${center}</div></div>
    <div class="today-row"><span class="label">${t("today")}</span><button class="smalllink ${noteSaved ? "saved" : ""}" data-a="sheet" data-v="note">${noteSaved ? t("noteSaved") : t("noteLink")}</button></div>
    ${habitCardHTML()}
    <div style="margin-top:12px">${main}</div>
    <div class="info-strip" style="margin-top:16px">${strip}</div>
  </div>`;
}
function habitCardHTML() {
  const today = dayKey(Date.now()), log = S.habitLog[today] || {};
  if (!S.habits.length) return `<button class="habit-card" data-a="sheet" data-v="addHabit"><div><b>${t("addHabit")}</b><span class="cap">${t("addHabitSub")}</span></div><span class="plus">+</span></button>`;
  let html = "";
  for (const h of S.habits) {
    if (h === "water") {
      const n = log.water || 0;
      const drops = Array.from({ length: 8 }, (_, i) => `<button data-a="water" data-v="${i < n ? -1 : 1}" aria-label="${i < n ? "−" : "+"}">${svgIcon.drop("#3E7689", i < n ? "#3E7689" : "none")}</button>`).join("");
      const v = (n * 0.2).toFixed(1).replace(".", S.lang === "uk" ? "," : ".");
      html += `<div class="habit-card"><div style="flex:1;min-width:0"><div class="row-between"><b>${t("waterToday")}</b><span class="cap" style="font-weight:600;color:var(--water)">${t("waterAmount", { v })}</span></div><div class="drops">${drops}</div></div><button class="plus water" data-a="water" data-v="1" aria-label="+">+</button></div>`;
    } else {
      const done = !!log[h];
      html += `<button class="habit-card habit-row ${done ? "on" : ""}" data-a="toggleHabitToday" data-v="${h}" role="switch" aria-checked="${done}"><span style="display:flex;gap:12px;align-items:center">${svgIcon.habit[h]}<span><b>${t("habits")[h][0]}</b><span class="cap">${done ? t("doneToday") : t("tapWhenDone")}</span></span></span><span class="radio check">${done ? svgIcon.check : ""}</span></button>`;
    }
  }
  if (S.habits.length < 3) html += `<button class="add-row" data-a="sheet" data-v="addHabit"><span>+ ${t("addHabit")}</span><span>${t("ofN", { n: S.habits.length })}</span></button>`;
  return `<div class="habits-stack">${html}</div>`;
}
/* ---------- struggle ---------- */
function struggleHTML() {
  const c = S.current; if (!c) return homeHTML();
  const el = Date.now() - c.start, left = c.goal * H - el, L = tmp.level;
  const easeTo = c.goal >= 16 ? 14 : c.goal - 1;
  const canEase = easeTo >= 12 && easeTo * H > el;
  let tip = "", actions = "";
  if (L) {
    tip = `<div class="ai" style="margin:6px 0 18px"><span class="orb"></span><div><div class="who">AI</div><p>${t("tips")[L - 1].replace("{done}", dur(el))}</p></div></div>`;
    if (L <= 2) actions = `<button class="btn secondary" data-a="hunger" data-v="thanks">${t("thanksGood")}</button>${L === 2 ? `<button class="link" data-a="hunger" data-v="remind">${t("remind20")}</button>` : ""}`;
    else if (L === 3) actions = `<button class="btn secondary" data-a="hunger" data-v="remind">${t("remind20")}</button><button class="link" data-a="hunger" data-v="thanks">${t("thanksGood")}</button>`;
    else if (L === 4) actions = `${canEase ? `<button class="btn secondary" data-a="hunger" data-v="ease">${t("easeOff", { h: easeTo })}</button>` : ""}<button class="${canEase ? "link" : "btn"}" data-a="hunger" data-v="end">${t("endNow")}</button>`;
    else actions = `<button class="btn" data-a="hunger" data-v="end">${t("endNow")}</button>${canEase ? `<button class="link" data-a="hunger" data-v="ease">${t("easeOff", { h: easeTo })}</button>` : ""}`;
  }
  return `<div class="screen">${topbar(0, 0)}
    <div class="mini-head"><div class="ring-wrap small" style="width:36px;height:36px">${ringSVG(36, el / (c.goal * H), 0, "fast")}</div><span>${left > 0 ? t("leftShort", { t: dur(left) }) : t("goalReached")}</span></div>
    <h1>${t("hungerTitle")}</h1><p class="sub">${t("hungerSub")}</p>
    <div class="scale" role="radiogroup">${[1, 2, 3, 4, 5].map(i => `<button class="${L === i ? "on" : ""}" data-a="level" data-v="${i}" role="radio" aria-checked="${L === i}">${i}</button>`).join("")}</div>
    <div class="scale-lbl"><span>${t("aLittle")}</span><span>${t("veryStrong")}</span></div>
    ${tip}
    <div class="stack">${actions}</div>
    <div class="grow" style="min-height:20px"></div>
    <button class="link" data-a="go" data-v="unwell" style="color:var(--clay)">${t("unwell")}</button>
    <p class="foot" style="margin-top:0">${t("unwellFoot")}</p>
  </div>`;
}

/* ---------- rhythm page / calendar ---------- */
function weekStart(ts) { const d = new Date(startOfDay(ts)); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d.getTime(); }
function calendarHTML(year, month, interactive) {
  const first = new Date(year, month, 1), days = new Date(year, month + 1, 0).getDate(), offset = (first.getDay() + 6) % 7;
  const byDay = fastsByDay(), todayK = dayKey(Date.now()), now = Date.now();
  let n = 0, cells = "";
  for (let i = 0; i < offset; i++) cells += `<span></span>`;
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d), k = dayKey(date), f = byDay[k], fasted = f && counted(f);
    if (fasted) n++;
    const cls = ["day", fasted ? "fasted" : "", k === todayK ? "today" : "", date.getTime() > now ? "future" : "", f && !fasted ? "part" : ""].join(" ");
    cells += interactive && date.getTime() <= now ? `<button class="${cls}" data-a="day" data-v="${k}" aria-label="${dateLong(date)}">${d}</button>` : `<span class="${cls}">${d}</span>`;
  }
  const wd = t("wd").map(x => `<span class="wd">${x}</span>`).join("");
  return `<div class="cal"><div class="cal-head"><div class="n">${n}<span>${plural(n, t("fastsWord"))}</span></div><div class="mon">${year !== new Date().getFullYear() ? monthYear(first) : monthName(first)}</div></div><div class="cal-grid">${wd}${cells}</div></div>`;
}
function aiInsight() {
  const cf = countedFasts();
  if (cf.length < 3) return t("aiStart");
  const last5 = cf.slice(-5), d = S.profile.dinner;
  const { h, m } = parseHM(d);
  const ok = last5.filter(f => { const s = new Date(f.start); return s.getHours() * 60 + s.getMinutes() <= h * 60 + m + 30; }).length;
  if (ok >= Math.ceil(last5.length / 2)) return t("aiInsight", { time: d, a: ok, b: last5.length });
  const mStart = new Date(); mStart.setDate(1); mStart.setHours(0, 0, 0, 0);
  const nm = cf.filter(f => f.end >= mStart.getTime()).length;
  return t("aiMonth", { n: nm + " " + plural(nm, t("fastsWord")) });
}
function rhythmPageHTML() {
  const now = new Date(), ws = weekStart(Date.now()), todayK = dayKey(Date.now()), byDay = fastsByDay();
  const days = Array.from({ length: 7 }, (_, i) => ws + i * DAY + 2 * H);
  const we = new Date(ws + 6 * DAY);
  const fmtD = d => new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long" }).format(d);
  const range = new Date(ws).getMonth() === we.getMonth() ? `${new Date(ws).getDate()}–${fmtD(we)}` : `${fmtD(new Date(ws))} – ${fmtD(we)}`;
  const fastCells = days.map(ts => { const k = dayKey(ts), f = byDay[k], done = f && counted(f); return `<span class="wc ${done ? "done" : ""} ${k === todayK ? "today" : ""}">${done ? svgIcon.check : ""}</span>`; }).join("");
  const fastCount = days.filter(ts => { const f = byDay[dayKey(ts)]; return f && counted(f); }).length;
  const habitRows = S.habits.map(h => {
    let c = 0;
    const cells = days.map(ts => { const k = dayKey(ts), log = S.habitLog[k] || {}, done = habitDone(h, log); if (done) c++; return k === todayK ? `<button class="wc today ${done ? "done" : ""}" data-a="toggleHabitToday" data-v="${h}" aria-label="${t("habits")[h][0]}">${done ? svgIcon.check : ""}</button>` : `<span class="wc ${done ? "done" : ""}">${done ? svgIcon.check : ""}</span>`; }).join("");
    return `<div class="wrow"><div class="nm">${svgIcon.habit[h]}<span>${t("habits")[h][0]}</span></div>${cells}<span class="cnt">${c}/7</span></div>`;
  }).join("");
  return `<div class="screen">
    <div class="topbar"><h1 style="margin:0">${t("yourRhythm")}</h1><button class="back" data-a="go" data-v="home">${svgIcon.back}<span>${t("todayBack")}</span></button></div>
    ${calendarHTML(now.getFullYear(), now.getMonth(), true)}
    <div class="week">
      <div class="week-head"><b>${t("thisWeek")}</b><span class="cap">${range}</span></div>
      <div class="wrow wd"><span></span>${t("wd").map(x => `<span class="cap" style="text-align:center;font-size:11px">${x}</span>`).join("")}<span></span></div>
      <div class="wrow"><div class="nm"><span class="ring-wrap small" style="width:18px;height:18px;display:inline-block">${ringSVG(18, .7, 0, "fast")}</span><span>${t("fasting")}</span></div>${fastCells}<span class="cnt">${fastCount}/7</span></div>
      ${habitRows}
      ${S.habits.length < 3 ? `<button class="add-row" data-a="sheet" data-v="addHabit"><span>+ ${t("addHabit")}</span><span>${t("ofN", { n: S.habits.length })}</span></button>` : ""}
    </div>
    <div class="ai" style="margin-top:22px"><span class="orb"></span><div><div class="who">AI</div><p>${aiInsight()}</p></div></div>
    <div style="margin-top:14px">
      ${S.habits.length ? `<button class="link" data-a="sheet" data-v="checkin">${t("eveningCheck")}</button>` : ""}
      <button class="link" data-a="go" data-v="months">${t("allMonths")}</button>
      <button class="link muted" data-a="sheet" data-v="settings">${t("settingsLink")} · ${S.lang === "uk" ? "Українська" : "English"}</button>
    </div>
  </div>`;
}
function habitDone(h, log) { if (h === "water") return (log.water || 0) >= 8 || !!log.waterDone; return !!log[h]; }
function monthsHTML() {
  const now = new Date();
  const firstTs = Math.min(S.createdAt || Date.now(), ...S.fasts.map(f => f.start));
  const start = new Date(firstTs); start.setDate(1);
  const list = []; const d = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d >= new Date(start.getFullYear(), start.getMonth(), 1)) { list.push([d.getFullYear(), d.getMonth()]); d.setMonth(d.getMonth() - 1); }
  return `<div class="screen">${topbar(0, 0)}
    <h1>${t("monthsTitle")}</h1><p class="sub">${t("monthsSub")}</p>
    ${list.map(([y, m]) => `<div class="month-block">${calendarHTML(y, m, true)}</div>`).join("")}
    ${list.length < 2 ? `<div class="card" style="text-align:center"><div class="cap">${t("monthsEmpty")}</div><div class="cap" style="color:var(--accent);margin-top:6px;font-weight:600">${t("monthsLegend")}</div></div>` : `<p class="cap" style="text-align:center">${t("monthsLegend")}</p>`}
  </div>`;
}

/* ---------- sheets ---------- */
const SHEETS = {
  rhythm() {
    const nCounted = countedFasts().length, cur = tmp.pickRhythm || S.rhythm;
    return `<h2>${t("rhythmTitle")}</h2>
      <div class="stack">${Object.keys(RHYTHMS).map(r => { const locked = r === "18:6" && nCounted < 7; const [a, b] = t("rhythms")[r];
        return `<button class="choice rhythm-opt ${cur === r ? "on" : ""} ${locked ? "locked" : ""}" data-a="pickRhythm" data-v="${r}" ${locked ? "disabled" : ""}><span class="num">${r}</span><span class="txt">${a}${r === "16:8" ? `<span class="tag-ai">${t("aiPick")}</span>` : ""}<small>${b}</small></span><span class="radio"></span></button>`; }).join("")}</div>
      <div style="height:18px"></div>
      <button class="btn" data-a="saveRhythm">${t("saveRhythm")}</button>
      <button class="link" data-a="closeSheet">${t("cancel")}</button>`;
  },
  startTime() {
    const now = Date.now(), sel = tmp.startSel == null ? 0 : tmp.startSel;
    const opts = [[t("justNow"), now], [t("hourAgo"), now - H], [t("twoHoursAgo"), now - 2 * H]];
    const g = goalOf(S.rhythm);
    const st = sel === 3 ? customStart() : opts[sel][1];
    const end = st + g * H, sameDay = dayKey(end) === dayKey(now);
    return `<h2>${t("startTimeTitle")}</h2><p class="sub">${t("startTimeSub")}</p>
      <div class="stack">${opts.map(([lab, ts], i) => `<button class="choice ${sel === i ? "on" : ""}" data-a="startSel" data-v="${i}"><span>${lab}</span><span style="display:flex;gap:14px;align-items:center"><span class="cap">${hm(ts)}</span><span class="radio"></span></span></button>`).join("")}
      <label class="choice ${sel === 3 ? "on" : ""}" data-a="startSel" data-v="3"><span>${t("otherTime")}</span><span style="display:flex;gap:10px;align-items:center"><input type="time" id="customTime" value="${tmp.customTime || hm(now - 30 * MIN)}" style="border:0;background:var(--sunken);border-radius:10px;padding:6px 8px;font-size:15px"><span class="radio"></span></span></label></div>
      <p class="cap" style="text-align:center;margin:14px 0">${r(S.rhythm)} · ${sameDay ? t("endsToday", { time: hm(end) }) : t("endsTomorrow", { time: hm(end) })}</p>
      <button class="btn" data-a="startFast">${t("startFast")}</button>
      <button class="link" data-a="closeSheet">${t("cancel")}</button>`;
  },
  endConfirm() {
    const c = S.current; if (!c) return "";
    const el = Date.now() - c.start;
    return `<h2>${t("endTitle")}</h2><p class="sub">${el >= COUNT_MIN_H * H ? t("endTextCounts", { done: dur(el), goal: hrs(c.goal) }) : t("endTextShort", { done: dur(el), goal: hrs(c.goal) })}</p>
      <button class="btn" data-a="keepGoing">${t("keepGoing")}</button>
      <button class="link" data-a="endFast">${t("endFast")}</button>`;
  },
  note(p) {
    const k = p.day || dayKey(Date.now());
    const isToday = k === dayKey(Date.now());
    return `<h2>${isToday ? t("noteTitle") : dateLong(keyToDate(k))}</h2><p class="sub">${t("noteSub")}</p>
      <textarea class="field" id="noteInput" maxlength="600" placeholder="${t("notePh")}">${esc(S.notes[k] || "")}</textarea>
      <div style="height:16px"></div>
      <button class="btn" data-a="saveNote" data-v="${k}">${t("save")}</button>
      <button class="link" data-a="${p.backTo ? "dayBack" : "closeSheet"}" data-v="${k}">${t("cancel")}</button>`;
  },
  addHabit() {
    const sel = tmp.habitSel;
    return `<h2>${t("addHabitTitle")}</h2><p class="sub">${t("addHabitHint")}</p>
      <div class="stack">${HABITS.map(h => { const added = S.habits.includes(h); const [a, b] = t("habits")[h];
        return `<button class="choice ${sel === h || added ? "on" : ""}" data-a="habitSel" data-v="${h}"><span style="display:flex;gap:12px;align-items:center">${svgIcon.habit[h]}<span>${a}<small>${added ? t("added") : b}</small></span></span><span class="radio"></span></button>`; }).join("")}</div>
      ${S.habits.length >= 3 && !S.habits.includes(sel) && sel ? `<p class="cap" style="margin-top:10px">${t("max3")}</p>` : ""}
      <div style="height:18px"></div>
      <button class="btn" data-a="addHabit" ${sel && !S.habits.includes(sel) && S.habits.length < 3 ? "" : "disabled"}>${sel && !S.habits.includes(sel) ? t("addX", { x: t("habits")[sel][0] }) : t("chooseHabit")}</button>
      <button class="link" data-a="closeSheet">${t("notNow")}</button>`;
  },
  checkin() {
    const k = dayKey(Date.now()), log = S.habitLog[k] || {};
    tmp.check = tmp.check || Object.fromEntries(S.habits.map(h => [h, habitDone(h, log)]));
    const n = log.water || 0;
    return `<h2>${t("checkTitle")}</h2><p class="sub">${t("checkSub")}</p>
      <div class="stack">${S.habits.map(h => `<button class="choice ${tmp.check[h] ? "on" : ""}" data-a="checkToggle" data-v="${h}" role="switch" aria-checked="${!!tmp.check[h]}"><span style="display:flex;gap:12px;align-items:center">${svgIcon.habit[h]}<span>${t("habits")[h][0]}${h === "water" ? `<small>${t("waterCounted", { n, v: (n * .2).toFixed(1).replace(".", S.lang === "uk" ? "," : ".") })}</small>` : ""}</span></span><span class="toggle"></span></button>`).join("")}</div>
      <div style="height:18px"></div>
      <button class="btn" data-a="saveCheck">${t("save")}</button>
      <button class="link" data-a="closeSheet">${t("later")}</button>`;
  },
  day(p) { return dayHTML(p.day); },
  log() {
    return `<h2>${t("shareLog")}</h2><p class="sub">${t("shareLogSub")}</p>
      <textarea class="field" id="logText" readonly style="min-height:220px;font-size:13px">${esc(shareLog())}</textarea>
      <div style="height:16px"></div>
      <button class="btn" data-a="copyLog">${t("copyLog")}</button>
      ${navigator.share ? `<button class="link" data-a="nativeShare">${t("shareVia")}</button>` : ""}
      <button class="link muted" data-a="sheet" data-v="settings">${t("back")}</button>`;
  },
  calendar() {
    return `<h2>${t("calTitle")}</h2>${calBlock()}
      <p class="cap" style="margin:12px 0 18px">${t("calNote")}</p>
      <button class="btn" data-a="addCal">${t("calAdd")}</button>
      <button class="link" data-a="addCalGoogle">${t("calGoogle")}</button>
      <button class="link muted" data-a="sheet" data-v="settings">${t("back")}</button>`;
  },
  confirmDelete() {
    return `<h2>${t("deleteAll")}</h2><p class="sub">${t("deleteConfirm")}</p>
      <button class="btn" style="background:#A3412E" data-a="deleteYes">${t("deleteAll")}</button>
      <button class="link" data-a="sheet" data-v="settings">${t("cancel")}</button>`;
  },
  settings() {
    return `<h2>${t("settings")}</h2>
      <div class="settings-row"><span>${t("language")}</span>${langPill()}</div>
      <div class="settings-row" style="display:block"><span class="cap">${t("yourName")}</span><input class="field" id="setName" maxlength="30" value="${esc(S.profile.name)}" placeholder="${t("namePh")}" style="margin-top:8px"></div>
      <button class="settings-row" data-a="sheet" data-v="rhythm"><span>${t("rhythm")}</span><span>${S.rhythm} · ${t("rhythms")[S.rhythm][0]}</span></button>
      <button class="settings-row" data-a="sheet" data-v="calendar"><span>${t("calTitle")}</span><span>${S.calAdded ? (calOutdated() ? "↻" : "✓") : "+"}</span></button>
      <button class="settings-row" data-a="shareLog" style="display:block"><span style="font-weight:600">${t("shareLog")}</span><div class="cap" style="margin-top:4px">${t("shareLogSub")}</div></button>
      ${/demo/.test(location.search) ? `<button class="settings-row" data-a="demo"><span>${t("demoFill")}</span><span></span></button>` : ""}
      <button class="settings-row danger" data-a="deleteAll"><span>${t("deleteAll")}</span><span></span></button>
      <p class="cap" style="margin-top:14px">${t("installHint")}</p>
      <p class="cap" style="text-align:center;margin-top:10px" data-a="ver">${t("version")}</p>
      <button class="btn" data-a="saveSettings" style="margin-top:8px">${t("done")}</button>`;
  }
};
function r(x) { return x; }
function customStart() {
  const v = tmp.customTime || hm(Date.now() - 30 * MIN);
  let ts = atTime(Date.now(), v); if (ts > Date.now()) ts -= DAY; return ts;
}
function momentText(mo) {
  const time = hm(mo.t);
  if (mo.k === "hunger") {
    const act = mo.a === "remind" ? t("mRemind") : mo.a === "ease" ? t("mEase", { h: mo.h }) : mo.a === "end" ? t("mEnd") : t("mThanks");
    return `${time} · ${t("mHunger", { l: mo.l })} → ${act}`;
  }
  if (mo.k === "unwell") return `${time} · ${t("mUnwell")}`;
  return time;
}
function dayHTML(k) {
  const date = keyToDate(k), byDay = fastsByDay();
  const isToday = k === dayKey(Date.now());
  let f = byDay[k], live = false;
  if (!f && isToday && S.current) { f = { start: S.current.start, end: Date.now(), goal: S.current.goal, rhythm: S.current.rhythm, moments: S.current.moments }; live = true; }
  const note = S.notes[k] || "", log = S.habitLog[k] || {};
  const habitsDone = HABITS.filter(h => habitDone(h, log));
  let body = "";
  if (f) {
    const d = f.end - f.start, ok = d >= f.goal * H, cnt = d >= COUNT_MIN_H * H;
    body += `<div class="card sum"><div class="ring-wrap small">${ringSVG(64, d / (f.goal * H), 0, "fast")}</div><div><div style="font-size:24px;font-weight:500">${durLong(d)}</div><div class="cap">${t("fastedGoal", { g: hrs(f.goal) })}</div><span class="badge ${ok || (cnt && !live) ? "ok" : ""}">${live ? t("inProgress") : ok ? t("goalReached") : cnt ? t("endedEarly") : t("notCounted")}</span></div></div>
      <div class="stats3"><div><span class="label">${t("started")}</span><b>${hm(f.start)}</b></div><div><span class="label">${t("ended")}</span><b>${live ? "—" : hm(f.end)}</b></div><div><span class="label">${t("rhythmLbl")}</span><b>${f.rhythm}</b></div></div>`;
    if (f.moments && f.moments.length) body += `<div class="blk"><div class="label">${t("moments")}</div>${f.moments.map(m => `<div style="font-size:15px;margin-bottom:6px">${esc(momentText(m))}</div>`).join("")}</div>`;
  } else body += `<p class="sub">${t("noFastDay")}</p>`;
  if (habitsDone.length) body += `<div class="blk"><div class="label">${t("habitsLbl")}</div><div class="chips">${habitsDone.map(h => `<span>${t("habits")[h][0]} ✓</span>`).join("")}</div></div>`;
  body += `<div class="blk"><div class="label">${t("note")}</div>${note ? `<div class="notecard">${esc(note)}</div><button class="smalllink" style="padding-left:0" data-a="editNote" data-v="${k}">${t("editNote")}</button>` : `<button class="smalllink saved" style="padding-left:0;font-size:15px" data-a="editNote" data-v="${k}">${t("addNote")}</button>`}</div>`;
  return `<h2>${dateLong(date)}</h2>${body}<div style="height:16px"></div><button class="btn secondary" data-a="closeSheet">${t("close")}</button>`;
}

/* ---------- actions ---------- */
function startFast(start) {
  S.current = { start, goal: goalOf(S.rhythm), rhythm: S.rhythm, moments: [] };
  save(); scheduleNotifs();
}
function endFast(reason) {
  const c = S.current; if (!c) return;
  if (reason === "unwell") c.moments.push({ t: Date.now(), k: "unwell" });
  const f = { id: "f" + Date.now(), start: c.start, end: Date.now(), goal: c.goal, rhythm: c.rhythm, moments: c.moments };
  S.fasts.push(f); S.current = null; save(); scheduleNotifs();
  sheet = null; sheetsEl.innerHTML = "";
  viewStack.length = 0; go("result", { id: f.id }, { replace: true });
}
let notifTimers = [];
function notify(title, body) {
  if (!S.notif || !("Notification" in window) || Notification.permission !== "granted") return;
  const o = { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png" };
  if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification(title, o)).catch(() => {});
  else try { new Notification(title, o); } catch (e) {}
}
function scheduleNotifs() {
  notifTimers.forEach(clearTimeout); notifTimers = [];
  const c = S.current; if (!c) return;
  const endAt = c.start + c.goal * H - Date.now();
  if (endAt > 0 && endAt < 2 ** 31 - 1) notifTimers.push(setTimeout(() => { notify(t("notifDoneTitle"), t("notifDoneText")); render(); }, endAt));
  if (c.remindAt && c.remindAt > Date.now()) notifTimers.push(setTimeout(() => { notify("Zvykny", t("remindNotif")); toast(t("remindNotif")); }, c.remindAt - Date.now()));
}
function finishOnboarding() { S.onboarded = true; save(); viewStack.length = 0; go("home", {}, { replace: true }); }

const ACTIONS = {
  back() { back(); },
  go(v) { go(v); },
  sheet(v) { if (v === "rhythm") tmp.pickRhythm = S.rhythm; if (v === "startTime") { tmp.startSel = 0; tmp.customTime = null; } if (v === "addHabit") tmp.habitSel = null; if (v === "checkin") tmp.check = null; if (sheet) { sheet = { name: v, params: {} }; renderSheet(false); } else openSheet(v); },
  closeSheet() { closeSheet(); },
  lang(v) { S.lang = v; document.documentElement.lang = v === "uk" ? "uk" : "en"; save(); render(); if (sheet) renderSheet(false); },
  already() { tmp.already = true; S.flowAlready = true; go("safety"); },
  toggleGoal(v) { v = +v; const g = S.profile.goals; const i = g.indexOf(v); i >= 0 ? g.splice(i, 1) : g.push(v); save(); render(); },
  setStage(v) { S.profile.stage = +v; save(); render(); },
  toggleSafety(v) { tmp.safety[+v] = !tmp.safety[+v]; render(); },
  safetyNext() { if (tmp.safety && tmp.safety.some(Boolean)) go("safetyExit", {}, { keepTmp: true }); else go("dinner"); },
  safetyClose() { viewStack.length = 0; go("welcome", {}, { replace: true }); },
  dinner(v) { const { h, m } = parseHM(S.profile.dinner); let mins = (h * 60 + m + (+v) + 1440) % 1440; S.profile.dinner = pad(Math.floor(mins / 60)) + ":" + pad(mins % 60); save(); render(); },
  allowNotif() {
    const done = () => go("name");
    if ("Notification" in window) { Notification.requestPermission().then(p => { S.notif = p === "granted"; save(); done(); }).catch(done); }
    else { S.notif = false; save(); done(); }
  },
  saveName() { const v = (document.getElementById("nameInput").value || "").trim(); S.profile.name = v; save(); finishOnboarding(); },
  skipName() { S.profile.name = ""; save(); finishOnboarding(); },
  pickRhythm(v) { tmp.pickRhythm = v; renderSheet(false); },
  saveRhythm() { const r = tmp.pickRhythm || S.rhythm; S.rhythm = r; if (S.current) { S.current.goal = goalOf(r); S.current.rhythm = r; scheduleNotifs(); } save(); closeSheet(); render(); if (calOutdated()) setTimeout(() => toast(t("calUpdate")), 400); },
  startSel(v) { tmp.startSel = +v; const ct = document.getElementById("customTime"); if (ct) tmp.customTime = ct.value; renderSheet(false); },
  startFast() { const ct = document.getElementById("customTime"); if (ct) tmp.customTime = ct.value; const sel = tmp.startSel || 0; const st = sel === 3 ? customStart() : Date.now() - sel * H; startFast(st); closeSheet(); render(); },
  keepGoing() { closeSheet(); },
  endFast(v) { endFast(v); },
  level(v) { tmp.level = +v; render(); },
  hunger(v) {
    const c = S.current; if (!c) return go("home");
    const mo = { t: Date.now(), k: "hunger", l: tmp.level, a: v };
    if (v === "ease") { const to = c.goal >= 16 ? 14 : c.goal - 1; mo.h = to; c.goal = to; c.moments.push(mo); save(); scheduleNotifs(); toast(t("toastEased", { h: to })); viewStack.length = 0; go("home", {}, { replace: true }); return; }
    if (v === "remind") { c.remindAt = Date.now() + 20 * MIN; c.moments.push(mo); save(); scheduleNotifs(); toast(t("toastRemind")); viewStack.length = 0; go("home", {}, { replace: true }); return; }
    if (v === "end") { c.moments.push(mo); endFast(); return; }
    c.moments.push(mo); save(); viewStack.length = 0; go("home", {}, { replace: true });
  },
  water(v) { const k = dayKey(Date.now()); const log = S.habitLog[k] = S.habitLog[k] || {}; log.water = Math.max(0, Math.min(8, (log.water || 0) + (+v))); save(); render(); },
  saveNote(k) { const v = (document.getElementById("noteInput").value || "").trim(); if (v) S.notes[k] = v; else delete S.notes[k]; save(); if (sheet && sheet.params.backTo) { sheet = { name: "day", params: { day: k } }; renderSheet(false); } else closeSheet(); render(); },
  editNote(k) { sheet = { name: "note", params: { day: k, backTo: "day" } }; renderSheet(false); setTimeout(() => { const n = document.getElementById("noteInput"); n && n.focus(); }, 50); },
  dayBack(k) { sheet = { name: "day", params: { day: k } }; renderSheet(false); },
  day(k) { openSheet("day", { day: k }); },
  habitSel(v) { if (S.habits.includes(v)) { S.habits = S.habits.filter(x => x !== v); save(); tmp.habitSel = null; render(); } else tmp.habitSel = v; renderSheet(false); },
  addHabit() { const v = tmp.habitSel; if (v && !S.habits.includes(v) && S.habits.length < 3) { S.habits.push(v); save(); } closeSheet(); render(); },
  toggleHabitToday(h) { const k = dayKey(Date.now()); const log = S.habitLog[k] = S.habitLog[k] || {}; if (h === "water") log.waterDone = !habitDone("water", log); else log[h] = !log[h]; save(); render(); },
  checkToggle(h) { tmp.check[h] = !tmp.check[h]; renderSheet(false); },
  saveCheck() { const k = dayKey(Date.now()); const log = S.habitLog[k] = S.habitLog[k] || {}; for (const h of S.habits) { if (h === "water") log.waterDone = !!tmp.check[h]; else log[h] = !!tmp.check[h]; } save(); closeSheet(); toast(t("checkedToast")); render(); },
  saveSettings() { const n = document.getElementById("setName"); if (n) { S.profile.name = n.value.trim(); save(); } closeSheet(); render(); },
  shareLog() { sheet = { name: "log", params: {} }; renderSheet(false); },
  addCal() { addToCalendar(); },
  addCalGoogle() { addToGoogle(); },
  deleteAll() { sheet = { name: "confirmDelete", params: {} }; renderSheet(false); },
  deleteYes() { try { localStorage.removeItem(KEY); } catch (e) {} S = fresh(); sheet = null; sheetsEl.innerHTML = ""; viewStack.length = 0; go("welcome", {}, { replace: true }); },
  copyLog() { const ta = document.getElementById("logText"); const txt = ta ? ta.value : ""; const ok = () => toast(t("copied")); if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok, () => { ta.select(); try { document.execCommand("copy"); ok(); } catch (e) {} }); else { ta.select(); try { document.execCommand("copy"); ok(); } catch (e) {} } },
  nativeShare() { const ta = document.getElementById("logText"); if (navigator.share) navigator.share({ title: "Zvykny", text: ta.value }).catch(() => {}); },
  demo() { demoFill(); closeSheet(); render(); },
  ver() {}
};

function shareLog() {
  const L = []; const tx = TX();
  L.push(`${t("logHeader")} — ${new Date().toLocaleString(locale())}`);
  L.push(`${t("rhythm")}: ${S.rhythm}${S.profile.name ? " · " + S.profile.name : ""}`);
  L.push(`Goals: ${S.profile.goals.map(i => window.TEXTS.en.goals[i]).join(", ") || "—"} · Habits: ${S.habits.join(", ") || "—"}`);
  L.push("");
  const days = new Set([...S.fasts.map(f => dayKey(f.end)), ...Object.keys(S.notes), ...Object.keys(S.habitLog)]);
  [...days].sort().forEach(k => {
    const f = S.fasts.filter(x => dayKey(x.end) === k);
    L.push(`■ ${k}`);
    f.forEach(x => { L.push(`  ${hm(x.start)}–${hm(x.end)} · ${durLong(x.end - x.start)} / ${x.goal}h · ${counted(x) ? "✓" : "<10h"}`); (x.moments || []).forEach(m => L.push(`    ${momentText(m)}`)); });
    const log = S.habitLog[k]; if (log) { const hs = HABITS.filter(h => habitDone(h, log)); if (hs.length || log.water) L.push(`  ${t("habitsLbl")}: ${hs.map(h => tx.habits[h][0]).join(", ")}${log.water ? ` (${log.water}×💧)` : ""}`); }
    if (S.notes[k]) L.push(`  ${t("note")}: ${S.notes[k]}`);
  });
  if (S.current) L.push(`\n${t("inProgress")}: ${hm(S.current.start)} · ${durLong(Date.now() - S.current.start)}`);
  return L.join("\n");
}

function demoFill() {
  const now = Date.now(); S.fasts = []; S.notes = {}; S.habitLog = {};
  const skip = new Set([3, 11, 17]);
  for (let i = 19; i >= 1; i--) {
    if (skip.has(i)) continue;
    const day = startOfDay(now - i * DAY);
    const st = day + 20 * H + (i % 3) * 15 * MIN;
    const len = (i === 9 ? 14.3 : i === 14 ? 15.2 : i === 6 ? 9 : 16 + (i % 4) * 0.1) * H;
    const moments = i === 9 ? [{ t: st + 14 * H, k: "unwell" }] : i === 14 ? [{ t: st + 14.5 * H, k: "hunger", l: 3, a: "thanks" }] : [];
    S.fasts.push({ id: "d" + i, start: st, end: st + len, goal: 16, rhythm: "16:8", moments });
    if (i < 8) S.habitLog[dayKey(st + len)] = { water: 8 - (i % 3) };
  }
  S.notes[dayKey(now - 18 * DAY + DAY)] = S.lang === "uk" ? "Перший день. Легше, ніж я думала." : "First day. Easier than I thought.";
  S.notes[dayKey(now - 8 * DAY)] = S.lang === "uk" ? "Боліла голова. З’їла щось легке." : "Headache. Ate something light.";
  S.rhythm = "16:8"; if (!S.habits.includes("water")) S.habits.unshift("water"); S.habits = S.habits.slice(0, 3);
  S.createdAt = now - 40 * DAY; save();
}

/* ---------- render & events ---------- */
function render() {
  if (!V.view) V = { view: S.onboarded ? "home" : "welcome", params: {} };
  const fn = SCREENS[V.view] || SCREENS.home;
  app.innerHTML = fn(V.params);
  document.documentElement.lang = S.lang === "uk" ? "uk" : "en";
  bindInputs();
}
function bindInputs() {
  const ni = document.getElementById("nameInput");
  if (ni) ni.addEventListener("input", () => { tmp.name = ni.value; document.getElementById("nameBtn").disabled = !ni.value.trim(); });
}
document.addEventListener("click", e => {
  const el = e.target.closest("[data-a]"); if (!el) return;
  if (el.tagName === "INPUT") return;
  if (e.target.tagName === "INPUT") { if (el.dataset.a === "startSel") { tmp.startSel = 3; document.querySelectorAll('[data-a="startSel"]').forEach(x => x.classList.toggle("on", x === el)); } return; }
  const fn = ACTIONS[el.dataset.a]; if (!fn) return;
  e.preventDefault(); fn(el.dataset.v);
});
document.addEventListener("change", e => { if (e.target.id === "customTime") { tmp.customTime = e.target.value; tmp.startSel = 3; renderSheet(false); } });

// live timer
setInterval(() => {
  if (V.view === "home" && !sheet) {
    const st = homeState(), el = document.getElementById("liveTimer");
    if (!el) return;
    if ((st.mode === "fast" && el.closest(".ring-wrap")) || st.mode === "reached" || st.mode === "eat") {
      const ms = st.mode === "fast" ? st.goal - st.el : st.mode === "reached" ? st.el : st.next - Date.now();
      const html = timerHTML(ms); if (el.innerHTML !== html) el.innerHTML = html;
    }
    if (Date.now() - lastFull > 60e3) { lastFull = Date.now(); render(); }
  }
}, 1000);
let lastFull = Date.now();
document.addEventListener("visibilitychange", () => { if (!document.hidden) { render(); scheduleNotifs(); } });

/* ---------- boot ---------- */
function boot() {
  const sp = document.getElementById("splash");
  const tag = sp.querySelector(".tag"); if (tag) tag.textContent = t("tagline");
  history.replaceState({ v: "root" }, ""); history.pushState({}, "");
  render(); scheduleNotifs();
  setTimeout(() => { sp.classList.add("out"); setTimeout(() => sp.remove(), 400); }, S.onboarded ? 1500 : 2100);
}
boot();
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
