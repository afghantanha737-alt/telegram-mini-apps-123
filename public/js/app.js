/* =========================================================
   POINTS REWARDS — PREMIUM TELEGRAM MINI APP
   File: public/js/app.js
   (نیازمند i18n.js — باید قبل از این فایل لود شود)
========================================================= */
"use strict";

/* ================= TELEGRAM WEB APP ================= */
const tg = window.Telegram?.WebApp || null;

if (tg) {
  try {
    tg.ready();
    tg.expand();
    if (typeof tg.disableVerticalSwipes === "function") tg.disableVerticalSwipes();
    document.body.classList.add("telegram-mobile");
    if (tg.setHeaderColor) tg.setHeaderColor("#050609");
    if (tg.setBackgroundColor) tg.setBackgroundColor("#050609");
  } catch (error) {
    console.warn("Telegram WebApp initialization failed:", error);
  }
}

/* ================= GLOBAL STATE ================= */
const state = {
  activeTab: "home",
  language: "fa",
  user: null,
  points: 0,
  estimatedCryptoValue: 0,
  rate: 0,
  streak: 0,
  canCheckIn: false,
  spinChances: 0,
  totalCheckins: 0,
  minWithdrawPoints: 1000,
  nextResetAt: 0,
  referralCode: "",
  shareLink: "",
  invitedCount: 0,
  invited: [],
  tasks: [],
  completions: [],
  leaderboard: [],
  myRank: null,
  captchaA: 0,
  captchaB: 0,
  initialized: false
};
window.state = state;

/* ================= DOM HELPERS ================= */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

/* ================= TELEGRAM INIT DATA ================= */
function getInitData() {
  return tg?.initData || "";
}
function getTelegramUser() {
  return tg?.initDataUnsafe?.user || null;
}

/* ================= LOCAL STORAGE / THEME ================= */
const THEME_KEY = "miniAppTheme";

function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" ? saved : "dark";
}
function applyTheme(theme) {
  const finalTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = finalTheme;
  localStorage.setItem(THEME_KEY, finalTheme);
  updateThemeUI();
}
function toggleTheme() {
  applyTheme(getTheme() === "dark" ? "light" : "dark");
  haptic("selection");
  if (state.activeTab === "profile") renderProfile();
}
function updateThemeUI() {
  const icon = $("#themeIcon");
  const label = $("#themeLabel");
  const toggle = $("#themeToggle");
  const theme = getTheme();
  if (icon) icon.textContent = theme === "dark" ? "🌙" : "☀️";
  if (label) label.textContent = theme === "dark" ? t("theme_dark") : t("theme_light");
  if (toggle) toggle.setAttribute("aria-checked", theme === "light" ? "true" : "false");
}
applyTheme(getTheme());
window.toggleTheme = toggleTheme;

/* ================= HAPTIC ================= */
function haptic(type = "light") {
  try {
    if (!tg?.HapticFeedback) return;
    if (type === "success") return tg.HapticFeedback.notificationOccurred("success");
    if (type === "error") return tg.HapticFeedback.notificationOccurred("error");
    if (type === "warning") return tg.HapticFeedback.notificationOccurred("warning");
    if (type === "selection") return tg.HapticFeedback.selectionChanged();
    tg.HapticFeedback.impactOccurred(type);
  } catch { /* ignore unsupported haptics */ }
}

/* ================= TOAST ================= */
let toastTimer = null;
function toast(message, type = "normal") {
  const el = $("#toast");
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = message;
  el.classList.remove("show", "success", "error", "warning");
  if (type !== "normal") el.classList.add(type);
  requestAnimationFrame(() => el.classList.add("show"));
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

/* ================= SAFE HTML ================= */
function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ================= FORMATTERS ================= */
function formatPoints(value) {
  return new Intl.NumberFormat("en-US").format(Math.floor(Number(value) || 0));
}
function formatNumber(value, decimals = 4) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals }).format(Number(value) || 0);
}
function getInitials(user) {
  const first = user?.first_name || user?.firstName || "";
  const last = user?.last_name || user?.lastName || "";
  const text = `${first} ${last}`.trim();
  if (!text) return "A";
  return text.split(/\s+/).map(item => item.charAt(0)).join("").slice(0, 2).toUpperCase();
}
function timeAgo(dateString) {
  const date = new Date(dateString);
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 60) return "•";
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${formatPoints(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${formatPoints(hours)}h`;
  const days = Math.floor(hours / 24);
  return `${formatPoints(days)}d`;
}
function pad2(n) { return String(n).padStart(2, "0"); }

/* ================= API ================= */
async function api(url, options = {}) {
  const config = { ...options, headers: { ...(options.headers || {}) } };

  if (config.body && typeof config.body !== "string") {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(config.body);
  }

  const separator = url.includes("?") ? "&" : "?";
  const initData = getInitData();
  const finalUrl = `${url}${separator}initData=${encodeURIComponent(initData)}`;

  let response;
  try {
    response = await fetch(finalUrl, config);
  } catch (error) {
    throw new Error(t("error_generic"));
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const err = new Error(data?.message || t("error_generic"));
    err.code = data?.code || null;
    throw err;
  }
  return data;
}

/**
 * برای آپلود multipart (اسکرین‌شات تسک) — initData را به‌صورت query پاس می‌کند.
 */
async function apiUpload(url, formData) {
  const separator = url.includes("?") ? "&" : "?";
  const finalUrl = `${url}${separator}initData=${encodeURIComponent(getInitData())}`;

  let response;
  try {
    response = await fetch(finalUrl, { method: "POST", body: formData });
  } catch (error) {
    throw new Error(t("error_generic"));
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const err = new Error(data?.message || t("error_generic"));
    err.code = data?.code || null;
    throw err;
  }
  return data;
}

/* ================= LOADING SKELETON ================= */
function showLoading() {
  const content = $("#content");
  if (!content) return;
  content.innerHTML = `
    <div class="loading" style="height:190px;margin-bottom:13px"></div>
    <div class="loading" style="height:95px;margin-bottom:13px"></div>
    <div class="loading" style="height:95px"></div>
  `;
}

/* ================= HEADER + STATIC TEXT ================= */
function updateHeader() {
  const telegramUser = getTelegramUser();
  const user = state.user || telegramUser || {};
  const firstName = user.first_name || user.firstName || "";

  const avatar = $("#avatar");
  const greet = $("#greetName");
  const points = $("#pointsDisplay");

  if (avatar) {
    avatar.textContent = getInitials(user);
    if (user.photo_url) avatar.innerHTML = `<img src="${escapeHTML(user.photo_url)}" alt="">`;
  }
  if (greet) greet.textContent = t("greet_hello", { name: escapeHTML(firstName) });
  if (points) points.textContent = `${formatPoints(state.points)} ${t("points_unit")}`;
}

function applyStaticTranslations() {
  $$("#tabbar [data-tab]").forEach(button => {
    const label = button.querySelector(".tabLabel");
    if (label) label.textContent = t(`nav_${button.dataset.tab}`);
  });
  updateThemeUI();
  updateHeader();
}

/* ================= NAVIGATION ================= */
let countdownInterval = null;
function setupNavigation() {
  $$("#tabbar [data-tab]").forEach(button => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      if (!tab) return;
      haptic("selection");
      navigate(tab);
    });
  });
}
function updateNavigation() {
  $$("#tabbar [data-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === state.activeTab);
  });
}
async function navigate(tab) {
  const validTabs = ["home", "tasks", "daily", "wallet", "profile"];
  if (!validTabs.includes(tab)) tab = "home";
  clearInterval(countdownInterval);
  state.activeTab = tab;
  updateNavigation();
  window.scrollTo({ top: 0, behavior: "smooth" });
  await renderCurrentTab();
}
window.navigate = navigate;

/* ================= TERMS ================= */
function termsAccepted() {
  return localStorage.getItem("termsAccepted") === "1";
}
function showTerms() {
  const overlay = $("#termsOverlay");
  if (overlay) overlay.style.display = "flex";
}
function hideTerms() {
  const overlay = $("#termsOverlay");
  if (overlay) overlay.style.display = "none";
  localStorage.setItem("termsAccepted", "1");
}
window.hideTerms = hideTerms;
window.showTerms = showTerms;

/* ================= CAPTCHA ================= */
function captchaPassed() {
  return localStorage.getItem("captchaPassed") === "1";
}
function createCaptcha() {
  state.captchaA = Math.floor(Math.random() * 8) + 2;
  state.captchaB = Math.floor(Math.random() * 8) + 1;
  const question = $("#captchaQuestion");
  const answer = $("#captchaAnswer");
  const error = $("#captchaError");
  if (question) question.textContent = `${state.captchaA} + ${state.captchaB} = ?`;
  if (answer) { answer.value = ""; answer.focus(); }
  if (error) error.textContent = "";
}
function showCaptcha() {
  const overlay = $("#captchaOverlay");
  if (!overlay) return;
  createCaptcha();
  overlay.style.display = "flex";
}
function hideCaptcha() {
  const overlay = $("#captchaOverlay");
  if (overlay) overlay.style.display = "none";
}
async function submitCaptcha() {
  const answer = $("#captchaAnswer");
  const error = $("#captchaError");
  if (!answer) return;
  const value = Number(answer.value);

  if (value !== state.captchaA + state.captchaB) {
    if (error) error.textContent = "پاسخ صحیح نیست. دوباره تلاش کن.";
    haptic("error");
    createCaptcha();
    return;
  }

  localStorage.setItem("captchaPassed", "1");
  hideCaptcha();
  haptic("success");
  await boot();
}
window.submitCaptcha = submitCaptcha;

/* ================= LANGUAGE ================= */
function showLanguageOverlay() {
  const overlay = $("#languageOverlay");
  if (overlay) overlay.style.display = "flex";
}
window.showLanguageOverlay = showLanguageOverlay;

function hideLanguageOverlay() {
  const overlay = $("#languageOverlay");
  if (overlay) overlay.style.display = "none";
}
window.hideLanguageOverlay = hideLanguageOverlay;

async function selectLanguage(lang) {
  if (!["fa", "ps", "en"].includes(lang)) return;
  if (lang === state.language) { hideLanguageOverlay(); return; }

  try {
    await api("/api/auth/language", { method: "PATCH", body: { language: lang } });
  } catch (error) {
    console.warn("Failed to persist language:", error);
  }

  state.language = lang;
  localStorage.setItem("appLanguage", lang);
  hideLanguageOverlay();
  applyStaticTranslations();
  await renderCurrentTab();
}
window.selectLanguage = selectLanguage;

/* ================= DATA LOADERS ================= */
async function bootstrapAuth() {
  const params = new URLSearchParams(location.search);
  const ref = params.get("ref") || "";
  const url = ref ? `/api/auth/me?ref=${encodeURIComponent(ref)}` : "/api/auth/me";

  try {
    const data = await api(url);
    state.language = localStorage.getItem("appLanguage") || data.language || "fa";
    if (data.firstName) state.user = { ...(state.user || {}), first_name: data.firstName };
  } catch (error) {
    console.warn("Bootstrap auth failed:", error);
    state.language = localStorage.getItem("appLanguage") || "fa";
  }
}

async function loadUserData() {
  const data = await api("/api/points/me");
  state.points = Number(data?.points) || 0;
  state.estimatedCryptoValue = Number(data?.estimatedCryptoValue) || 0;
  state.rate = Number(data?.rate) || 0;
  state.streak = Number(data?.streak) || 0;
  state.canCheckIn = Boolean(data?.canCheckIn);
  state.spinChances = Number(data?.spinChances) || 0;
  state.totalCheckins = Number(data?.totalCheckins) || 0;
  state.minWithdrawPoints = Number(data?.minWithdrawPoints) || 1000;
  state.nextResetAt = Number(data?.nextResetAt) || 0;
  if (data?.firstName) state.user = { ...(state.user || {}), first_name: data.firstName };
  updateHeader();
}

async function loadReferralData() {
  try {
    const data = await api("/api/referral/me");
    state.referralCode = data?.referralCode || "";
    state.shareLink = data?.shareLink || "";
    state.invitedCount = Number(data?.invitedCount) || 0;
    state.invited = Array.isArray(data?.invited) ? data.invited : [];
  } catch (error) {
    console.warn("Referral data failed:", error);
  }
}

async function loadTasks() {
  try {
    const data = await api("/api/tasks");
    state.tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    state.completions = Array.isArray(data?.completions) ? data.completions : [];
    return state.tasks;
  } catch (error) {
    console.warn("Tasks failed:", error);
    state.tasks = [];
    return [];
  }
}

async function loadLeaderboard() {
  try {
    const data = await api("/api/leaderboard/top");
    state.leaderboard = Array.isArray(data?.top) ? data.top : [];
    state.myRank = data?.myRank ?? null;
    return state.leaderboard;
  } catch (error) {
    console.warn("Leaderboard failed:", error);
    state.leaderboard = [];
    return [];
  }
}

/* ================= HOME ================= */
function completionStatus(taskId) {
  const found = state.completions.find(c => String(c.task) === String(taskId));
  return found ? found.status : null;
}

function renderHome() {
  const nextLevel = Math.max(100, (Math.floor(state.points / 100) + 1) * 100);
  const currentLevel = Math.floor(state.points / 100) + 1;
  const previousLevel = (currentLevel - 1) * 100;
  const levelProgress = Math.min(100, Math.max(0, ((state.points - previousLevel) / (nextLevel - previousLevel)) * 100));

  const featuredTasks = state.tasks.slice(0, 3);

  const content = $("#content");
  content.innerHTML = `
    <section class="hero">
      <div class="heroTop">
        <div>
          <div class="heroEyebrow">${t("hero_eyebrow")}</div>
          <h1 class="heroTitle">${t("hero_title_line1")}<br>${t("hero_title_line2")}</h1>
          <p class="heroDescription">${t("hero_desc")}</p>
        </div>
        <div class="badge gold">${t("level_label", { n: formatPoints(currentLevel) })}</div>
      </div>
      <div class="heroBalance">
        <div class="balanceLabel">${t("wallet_balance_title")}</div>
        <div class="balanceValue">${formatPoints(state.points)} <span class="balanceUnit">${t("points_unit").toUpperCase()}</span></div>
      </div>
      <div class="progressWrap">
        <div class="progressMeta">
          <span>${t("progress_label")}</span>
          <span>${formatPoints(state.points)} / ${formatPoints(nextLevel)}</span>
        </div>
        <div class="progressTrack"><div class="progressBar" style="width:${levelProgress}%"></div></div>
      </div>
      <div class="heroActions">
        <button class="heroAction" type="button" onclick="navigate('tasks')">${t("hero_action_earn")}</button>
        <button class="heroAction" type="button" onclick="navigate('wallet')">${t("hero_action_wallet")}</button>
      </div>
    </section>

    <div class="statsGrid">
      <div class="statCard">
        <div class="statIcon">🔥</div>
        <div class="statValue">${formatPoints(state.streak)}</div>
        <div class="statLabel">${t("stat_streak")}</div>
      </div>
      <div class="statCard">
        <div class="statIcon">🎯</div>
        <div class="statValue">${formatPoints(state.totalCheckins)}</div>
        <div class="statLabel">${t("stat_checkins")}</div>
      </div>
      <div class="statCard">
        <div class="statIcon">👥</div>
        <div class="statValue">${formatPoints(state.invitedCount)}</div>
        <div class="statLabel">${t("stat_invited")}</div>
      </div>
    </div>

    <div class="sectionHeader">
      <h2 class="sectionTitle">${t("section_quick_earn")}</h2>
      <button class="sectionMore" type="button" onclick="navigate('tasks')">${t("section_view_all")}</button>
    </div>

    <div class="earningList">
      <div class="earningItem" onclick="navigate('daily')">
        <div class="earningIcon">◷</div>
        <div class="earningBody">
          <div class="earningTitle">${t("earn_daily_title")}</div>
          <div class="earningSub">${state.canCheckIn ? t("earn_daily_sub_available") : t("earn_daily_sub_done")}</div>
        </div>
        <div class="earningArrow">‹</div>
      </div>
      <div class="earningItem" onclick="navigate('tasks')">
        <div class="earningIcon">✓</div>
        <div class="earningBody">
          <div class="earningTitle">${t("earn_tasks_title")}</div>
          <div class="earningSub">${t("earn_tasks_sub", { n: formatPoints(state.tasks.length) })}</div>
        </div>
        <div class="earningArrow">‹</div>
      </div>
      <div class="earningItem" onclick="navigate('profile')">
        <div class="earningIcon">👥</div>
        <div class="earningBody">
          <div class="earningTitle">${t("earn_referral_title")}</div>
          <div class="earningSub">${t("earn_referral_sub")}</div>
        </div>
        <div class="earningArrow">‹</div>
      </div>
      ${featuredTasks.map(task => {
        const status = completionStatus(task._id);
        const subLabel = status === "approved" ? t("task_status_done") : status === "pending" ? t("task_status_pending") : t("task_status_todo");
        return `
        <div class="earningItem" onclick="navigate('tasks')">
          <div class="earningIcon">🎁</div>
          <div class="earningBody">
            <div class="earningTitle">${escapeHTML(task.title)}</div>
            <div class="earningSub">${subLabel}</div>
          </div>
          <div class="earningReward">+${formatPoints(task.reward)}</div>
          <div class="earningArrow">‹</div>
        </div>`;
      }).join("")}
</div>
  `;
}

/* ================= TASKS ================= */
const TASK_ICONS = { channel: "📢", group: "👥", link: "🔗", custom: "🎁" };

function openTaskLinkOnly(url) {
  if (!url) return;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank");
}
window.openTaskLinkOnly = openTaskLinkOnly;

/** تسک‌های تلگرامی: بررسی خودکار عضویت با API ربات */
async function verifyTelegramTask(taskId) {
  const button = document.querySelector(`[data-verify="${taskId}"]`);
  if (button) { button.disabled = true; button.textContent = t("task_action_verifying"); }

  try {
    const result = await api(`/api/tasks/${taskId}/claim`, { method: "POST" });
    haptic("success");
    toast(result.message, "success");
    state.points = Number(result.points) || state.points;
    await loadTasks();
    updateHeader();
    renderTasks();
  } catch (error) {
    haptic("error");
    if (error.code === "NOT_JOINED") {
      toast(t("toast_verify_needs_join"), "warning");
    } else {
      toast(translateServerMessage(error.code, error.message), "error");
    }
    if (button) { button.disabled = false; button.textContent = t("task_action_verify"); }
  }
}
window.verifyTelegramTask = verifyTelegramTask;

/** تسک‌های دستی: انتخاب فایل -> آپلود خودکار اسکرین‌شات */
function triggerProofUpload(taskId) {
  const input = document.getElementById(`proofInput-${taskId}`);
  if (input) input.click();
}
window.triggerProofUpload = triggerProofUpload;

async function handleProofFileChange(taskId, inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const button = document.querySelector(`[data-upload="${taskId}"]`);
  if (button) { button.disabled = true; button.textContent = t("task_action_uploading"); }

  try {
    const formData = new FormData();
    formData.append("proof", file);
    const result = await apiUpload(`/api/tasks/${taskId}/submit-proof`, formData);
    haptic("success");
    toast(t("toast_proof_sent"), "success");
    await loadTasks();
    renderTasks();
  } catch (error) {
    haptic("error");
    toast(translateServerMessage(error.code, error.message), "error");
    if (button) { button.disabled = false; button.textContent = t("task_action_upload"); }
  } finally {
    inputEl.value = "";
  }
}
window.handleProofFileChange = handleProofFileChange;

function renderTasks() {
  const content = $("#content");

  if (state.tasks.length === 0) {
    content.innerHTML = `
      <div class="sectionHeader"><h2 class="sectionTitle">${t("tasks_title")}</h2></div>
      <div class="card emptyState">
        <div class="emptyIcon">🗂️</div>
        <div class="emptyTitle">${t("tasks_empty_title")}</div>
        <div class="emptyDesc">${t("tasks_empty_desc")}</div>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="sectionHeader"><h2 class="sectionTitle">${t("tasks_title")}</h2></div>
    <div class="taskList">
      ${state.tasks.map(task => {
        const status = completionStatus(task._id);
        const icon = TASK_ICONS[task.type] || "🎁";
        const safeUrl = (task.url || "").replaceAll("'", "\\'");
        let actionHtml;

        if (status === "approved") {
          actionHtml = `<button class="taskAction done" disabled>${t("task_btn_done")}</button>`;
        } else if (status === "pending") {
          actionHtml = `<button class="taskAction pending" disabled>${t("task_btn_pending")}</button>`;
        } else if (task.verifyType === "telegram") {
          actionHtml = `
            <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch">
              ${task.url ? `<button class="taskAction" style="background:var(--surface-3);color:var(--text)" onclick="openTaskLinkOnly('${safeUrl}')">${t("task_action_open")}</button>` : ""}
              <button class="taskAction" data-verify="${task._id}" onclick="verifyTelegramTask('${task._id}')">${t("task_action_verify")}</button>
            </div>`;
        } else {
          actionHtml = `
            <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch">
              ${task.url ? `<button class="taskAction" style="background:var(--surface-3);color:var(--text)" onclick="openTaskLinkOnly('${safeUrl}')">${t("task_action_open")}</button>` : ""}
              <input type="file" accept="image/*" capture="environment" id="proofInput-${task._id}" style="display:none"
                onchange="handleProofFileChange('${task._id}', this)">
              <button class="taskAction" data-upload="${task._id}" onclick="triggerProofUpload('${task._id}')">${t("task_action_upload")}</button>
            </div>`;
        }

        return `
        <div class="taskItem">
          <div class="taskIcon">${icon}</div>
          <div class="taskBody">
            <div class="taskTitle">${escapeHTML(task.title)}</div>
            ${task.description ? `<div class="taskDesc">${escapeHTML(task.description)}</div>` : ""}
            <div class="taskReward">+${formatPoints(task.reward)} ${t("points_unit")}</div>
          </div>
          ${actionHtml}
        </div>`;
      }).join("")}
    </div>
  `;
}

/* ================= DAILY + SPIN WHEEL ================= */
const SPIN_SEGMENTS_UI = [
  { label: "2", color: "#8b5cf6" },
  { label: "5", color: "#a78bfa" },
  { label: "15", color: "#f5c451" },
  { label: "20", color: "#22c55e" },
  { label: "0", color: "#3a3f4d" },
  { label: "🎡", color: "#38bdf8" }
];

let wheelRotation = 0;

function buildWheelGradient() {
  const step = 360 / SPIN_SEGMENTS_UI.length;
  const stops = SPIN_SEGMENTS_UI.map((seg, i) => `${seg.color} ${i * step}deg ${(i + 1) * step}deg`);
  return `conic-gradient(from 0deg, ${stops.join(", ")})`;
}

function buildWheelLabels() {
  const step = 360 / SPIN_SEGMENTS_UI.length;
  const radius = 78;
  return SPIN_SEGMENTS_UI.map((seg, i) => {
    const angleDeg = i * step + step / 2;
    const angleRad = (angleDeg - 90) * (Math.PI / 180);
    const x = 110 + radius * Math.cos(angleRad);
    const y = 110 + radius * Math.sin(angleRad);
    return `<span class="wheelLabel" style="left:${x}px;top:${y}px">${seg.label}</span>`;
  }).join("");
}

function spinWheelTargetRotation(index) {
  const step = 360 / SPIN_SEGMENTS_UI.length;
  const segCenter = index * step + step / 2;
  const currentMod = wheelRotation % 360;
  const desiredMod = (360 - segCenter) % 360;
  let delta = desiredMod - currentMod;
  if (delta <= 0) delta += 360;
  wheelRotation += delta + 360 * 4;
  return wheelRotation;
}

async function doSpin() {
  const button = $("#spinBtn");
  if (state.spinChances <= 0) {
    toast(t("spin_no_chances"), "warning");
    return;
  }
  if (button) button.disabled = true;

  try {
    const result = await api("/api/points/spin", { method: "POST" });
    const disc = $("#wheelDisc");
    const rotation = spinWheelTargetRotation(result.segmentIndex);
    if (disc) disc.style.transform = `rotate(${rotation}deg)`;

    setTimeout(() => {
      state.points = Number(result.points) || state.points;
      state.spinChances = Number(result.spinChances) || 0;
      updateHeader();

      const chancesEl = $("#spinChancesValue");
      if (chancesEl) chancesEl.textContent = formatPoints(state.spinChances);
      if (button) button.disabled = state.spinChances <= 0;

      if (result.type === "points") {
        haptic("success");
        toast(t("spin_result_points", { n: formatPoints(result.value) }), "success");
      } else if (result.type === "spin") {
        haptic("success");
        toast(t("spin_result_extra"), "success");
      } else {
        haptic("warning");
        toast(t("spin_result_empty"), "warning");
      }
    }, 3600);
  } catch (error) {
    haptic("error");
    toast(translateServerMessage(error.code, error.message), "error");
    if (button) button.disabled = false;
  }
}
window.doSpin = doSpin;

function startResetCountdown() {
  clearInterval(countdownInterval);
  const el = $("#resetCountdown");
  if (!el || !state.nextResetAt) return;

  function tick() {
    const remaining = Math.max(0, state.nextResetAt - Date.now());
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      renderCurrentTab();
    }
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

async function doCheckIn() {
  const button = $("#checkinBtn");
  if (button) button.disabled = true;

  try {
    const result = await api("/api/points/checkin", { method: "POST" });
    state.points = Number(result.points) || state.points;
    state.streak = Number(result.streak) || state.streak;
    state.spinChances = Number(result.spinChances) || state.spinChances;
    state.canCheckIn = false;
    state.totalCheckins += 1;
    state.nextResetAt = Number(result.nextResetAt) || state.nextResetAt;

    haptic("success");
    toast(`+${formatPoints(result.earned)} ${t("points_unit")} 🎉`, "success");
    if (result.gotSpin) {
      setTimeout(() => toast(t("spin_result_extra"), "success"), 1200);
    }

    updateHeader();
    renderDaily();
  } catch (error) {
    haptic("error");
    toast(translateServerMessage(error.code, error.message), "error");
    if (button) button.disabled = false;
  }
}
window.doCheckIn = doCheckIn;

function renderDaily() {
  const content = $("#content");
  const streakDays = Math.min(state.streak, 7) || 0;

  const dayCells = Array.from({ length: 7 }, (_, index) => {
    const dayNumber = index + 1;
    const isFilled = dayNumber <= streakDays;
    const isToday = state.canCheckIn && dayNumber === streakDays + 1;
    return `
      <div class="dayCell ${isFilled ? "filled" : ""} ${isToday ? "today" : ""}">
        <span class="dayNum">${isFilled ? "✓" : dayNumber}</span>
        <span>${t("day_label", { n: dayNumber })}</span>
      </div>`;
  }).join("");

  content.innerHTML = `
    <div class="sectionHeader"><h2 class="sectionTitle">${t("daily_title")}</h2></div>

    <div class="card" style="text-align:center">
      <div class="cardHeader" style="justify-content:center">
        <div class="cardTitle">${t("spin_title")}</div>
      </div>
      <div class="wheelOuter">
        <div class="wheelPointer">▼</div>
        <div class="wheelDisc" id="wheelDisc" style="background:${buildWheelGradient()}"></div>
        <div class="wheelLabels">${buildWheelLabels()}</div>
      </div>
      <p style="font-size:11px;margin:12px 0 4px">${t("spin_chances_label")}: <b id="spinChancesValue">${formatPoints(state.spinChances)}</b></p>
      <button id="spinBtn" class="primaryBtn" type="button" style="margin-top:8px" ${state.spinChances <= 0 ? "disabled" : ""} onclick="doSpin()">
        ${t("spin_button")}
      </button>
    </div>

    <div class="streakBox">
      <div class="streakFire">🔥</div>
      <div>
        <div class="streakValue">${formatPoints(state.streak)}</div>
        <div class="streakLabel">${t("streak_label")}</div>
      </div>
    </div>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">${t("daily_calendar_title")}</div>
      </div>
      <div class="dailyGrid">${dayCells}</div>
      <button
        id="checkinBtn"
        class="primaryBtn"
        type="button"
        ${state.canCheckIn ? "" : "disabled"}
        onclick="doCheckIn()"
      >
        ${state.canCheckIn ? t("checkin_button") : t("checkin_done_button")}
      </button>
      ${!state.canCheckIn ? `
        <div style="text-align:center;margin-top:10px">
          <div class="small" style="color:var(--text-muted);font-size:10px">${t("reset_countdown_label")}</div>
          <div id="resetCountdown" style="font-size:20px;font-weight:900;margin-top:4px;letter-spacing:1px">00:00:00</div>
        </div>` : ""
      }
    </div>
  `;

  startResetCountdown();
}
/* ================= WALLET ================= */
function showWithdraw() {
  if (state.points < state.minWithdrawPoints) {
    toast(t("wallet_min_withdraw_note", { n: formatPoints(state.minWithdrawPoints) }), "warning");
    return;
  }
  const overlay = $("#withdrawOverlay");
  const pointsInput = $("#withdrawPoints");
  const addressInput = $("#withdrawAddress");
  const error = $("#withdrawError");
  if (pointsInput) pointsInput.value = "";
  if (addressInput) addressInput.value = "";
  if (error) error.textContent = "";
  if (overlay) overlay.style.display = "flex";
}
window.showWithdraw = showWithdraw;

function hideWithdraw() {
  const overlay = $("#withdrawOverlay");
  if (overlay) overlay.style.display = "none";
}
window.hideWithdraw = hideWithdraw;

async function submitWithdraw() {
  const pointsInput = $("#withdrawPoints");
  const addressInput = $("#withdrawAddress");
  const error = $("#withdrawError");
  const button = $("#submitWithdraw");

  const points = Number(pointsInput?.value);
  const address = String(addressInput?.value || "").trim();

  if (!points || points <= 0) {
    if (error) error.textContent = t("error_generic");
    return;
  }
  if (address.length < 6) {
    if (error) error.textContent = t("error_generic");
    return;
  }

  if (button) button.disabled = true;
  try {
    const result = await api("/api/points/withdraw", { method: "POST", body: { points, address } });
    state.points = Number(result.points) || state.points;
    haptic("success");
    toast(result.message, "success");
    hideWithdraw();
    updateHeader();
    renderWallet();
  } catch (err) {
    if (error) error.textContent = translateServerMessage(err.code, err.message);
    haptic("error");
  } finally {
    if (button) button.disabled = false;
  }
}
window.submitWithdraw = submitWithdraw;

let walletHistory = [];
async function loadWalletHistory() {
  try {
    const data = await api("/api/points/withdrawals");
    walletHistory = Array.isArray(data?.withdrawals) ? data.withdrawals : [];
  } catch (error) {
    console.warn("Withdrawals failed:", error);
    walletHistory = [];
  }
}

const WITHDRAW_STATUS_UI = {
  pending: { cls: "warning" }, approved: { cls: "success" }, rejected: { cls: "danger" }, paid: { cls: "success" }
};

function renderWallet() {
  const content = $("#content");

  content.innerHTML = `
    <div class="sectionHeader"><h2 class="sectionTitle">${t("wallet_title")}</h2></div>

    <section class="walletHero card">
      <div class="balanceLabel">${t("wallet_estimated_value")}</div>
      <div class="walletCryptoValue">${formatNumber(state.estimatedCryptoValue)}</div>
      <div class="walletRate">${t("wallet_rate_label", { rate: formatNumber(state.rate, 6) })}</div>
      <div class="walletActions">
        <button class="primaryBtn" type="button" onclick="showWithdraw()">${t("wallet_withdraw_button")}</button>
        <button class="secondaryBtn" type="button" onclick="navigate('tasks')">${t("wallet_increase_button")}</button>
      </div>
    </section>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">${t("wallet_balance_title")}</div>
        <div class="badge gold">${formatPoints(state.points)}</div>
      </div>
      <p style="font-size:11px;margin-bottom:0">${t("wallet_min_withdraw_note", { n: formatPoints(state.minWithdrawPoints) })}</p>
    </div>

    <div class="card" id="withdrawHistoryCard">
      <div class="cardHeader"><div class="cardTitle">${t("wallet_history_title")}</div></div>
      <div id="withdrawHistoryList">
        <div class="loading" style="height:60px"></div>
      </div>
    </div>
  `;

  loadWalletHistory().then(() => {
    const list = $("#withdrawHistoryList");
    if (!list) return;
    if (walletHistory.length === 0) {
      list.innerHTML = `<div class="emptyState" style="padding:20px 0"><div class="emptyDesc">${t("wallet_history_empty")}</div></div>`;
      return;
    }
    list.innerHTML = walletHistory.map(item => {
      const statusInfo = WITHDRAW_STATUS_UI[item.status] || { cls: "" };
      return `
        <div class="historyItem">
          <div>
            <div class="historyAmount">${formatPoints(item.pointsSpent)} ${t("points_unit")}</div>
            <div class="historyMeta">${timeAgo(item.createdAt)}</div>
          </div>
          <div class="badge ${statusInfo.cls}">${item.status}</div>
        </div>`;
    }).join("");
  });
}

/* ================= PROFILE ================= */
function copyReferralLink() {
  const link = state.shareLink || state.referralCode;
  if (!link) return;

  const finish = () => {
    haptic("success");
    toast(t("toast_link_copied"), "success");
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(link).then(finish).catch(() => fallbackCopy(link, finish));
  } else {
    fallbackCopy(link, finish);
  }
}
window.copyReferralLink = copyReferralLink;

function fallbackCopy(text, onDone) {
  const temp = document.createElement("textarea");
  temp.value = text;
  temp.style.position = "fixed";
  temp.style.opacity = "0";
  document.body.appendChild(temp);
  temp.select();
  try { document.execCommand("copy"); onDone?.(); } catch { /* ignore */ }
  document.body.removeChild(temp);
}

function shareReferralLink() {
  const link = state.shareLink || state.referralCode;
  if (!link) return;
  const text = "🎁";
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  } else if (navigator.share) {
    navigator.share({ text, url: link }).catch(() => {});
  } else {
    copyReferralLink();
  }
}
window.shareReferralLink = shareReferralLink;

let profileView = "menu"; // menu | referral | leaderboard

function setProfileView(view) {
  profileView = view;
  renderProfile();
}
window.setProfileView = setProfileView;

function renderProfileMenu() {
  const telegramUser = getTelegramUser();
  const user = state.user || telegramUser || {};
  const firstName = user.first_name || user.firstName || "";
  const theme = getTheme();
  const langNames = { fa: t("language_fa"), ps: t("language_ps"), en: t("language_en") };

  return `
    <div class="card profileHeaderCard">
      <div class="profileAvatarLg">
        ${user.photo_url ? `<img src="${escapeHTML(user.photo_url)}" alt="">` : escapeHTML(getInitials(user))}
      </div>
      <div>
        <div class="profileNameLg">${escapeHTML(firstName)}</div>
        <div class="profileSubLg">${formatPoints(state.points)} ${t("points_unit")} • ${formatPoints(state.invitedCount)}</div>
      </div>
    </div>

    <div class="card">
      <div class="profileList">
        <div class="profileItem" onclick="setProfileView('referral')">
          <div class="profileIcon">👥</div>
          <div class="profileText">${t("menu_referral")}</div>
<div class="profileChevron">‹</div>
        </div>
        <div class="profileItem" onclick="setProfileView('leaderboard')">
          <div class="profileIcon">🏆</div>
          <div class="profileText">${t("menu_leaderboard")}</div>
          <div class="profileChevron">‹</div>
        </div>
        <div class="profileItem" onclick="showTerms()">
          <div class="profileIcon">📜</div>
          <div class="profileText">${t("menu_terms")}</div>
          <div class="profileChevron">‹</div>
        </div>
        <div class="profileItem" onclick="showLanguageOverlay()">
          <div class="profileIcon">🌐</div>
          <div class="profileText">${t("menu_language")} — ${langNames[state.language]}</div>
          <div class="profileChevron">‹</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="themeRow">
        <div style="display:flex;align-items:center;gap:10px">
          <span id="themeIcon">${theme === "dark" ? "🌙" : "☀️"}</span>
          <span id="themeLabel" style="font-size:13px;font-weight:700">${theme === "dark" ? t("theme_dark") : t("theme_light")}</span>
        </div>
        <div id="themeToggle" class="switchTrack" role="switch" aria-checked="${theme === "light"}" onclick="toggleTheme()">
          <div class="switchThumb"></div>
        </div>
      </div>
    </div>
  `;
}

function renderProfileReferral() {
  return `
    <div class="sectionHeader">
      <button class="sectionMore" type="button" onclick="setProfileView('menu')">${t("referral_back")}</button>
      <h2 class="sectionTitle">${t("referral_title")}</h2>
      <span></span>
    </div>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">${t("referral_code_title")}</div>
        <div class="badge success">${t("referral_code_bonus_badge")}</div>
      </div>
      <div class="referralCodeBox">
        <span class="referralCodeText">${escapeHTML(state.referralCode || "—")}</span>
        <button class="copyBtn" type="button" onclick="copyReferralLink()">${t("referral_copy_button")}</button>
      </div>
      <button class="primaryBtn" type="button" onclick="shareReferralLink()">${t("referral_share_button")}</button>
    </div>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">${t("referral_invited_title")}</div>
        <div class="badge gold">${formatPoints(state.invitedCount)}</div>
      </div>
      ${state.invited.length === 0
        ? `<div class="emptyState" style="padding:20px 0"><div class="emptyDesc">${t("referral_invited_empty")}</div></div>`
        : state.invited.map(person => `
          <div class="historyItem">
            <div>
              <div class="historyAmount">${escapeHTML(person.firstName || person.username || "—")}</div>
              <div class="historyMeta">${timeAgo(person.createdAt)}</div>
            </div>
          </div>`).join("")
      }
    </div>
  `;
}

function renderProfileLeaderboard() {
  const rows = state.leaderboard.map((person, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
    const isMe = state.user && String(person.telegramId) === String(state.user.telegramId);
    return `
      <div class="leaderboardItem ${isMe ? "me" : ""}">
        <div class="rankBadge ${rankClass}">${formatPoints(rank)}</div>
        <div class="leaderName">${escapeHTML(person.firstName || person.username || "—")}</div>
        <div class="leaderPoints">${formatPoints(person.points)}</div>
      </div>`;
  }).join("");

  return `
    <div class="sectionHeader">
      <button class="sectionMore" type="button" onclick="setProfileView('menu')">${t("referral_back")}</button>
      <h2 class="sectionTitle">${t("leaderboard_title")}</h2>
      <span></span>
    </div>

    ${state.myRank ? `
      <div class="card" style="text-align:center">
        <div class="cardSubtitle">${t("leaderboard_rank_label")}</div>
        <div style="font-size:24px;font-weight:900;margin-top:4px">#${formatPoints(state.myRank)}</div>
      </div>` : ""
    }

    ${state.leaderboard.length === 0
      ? `<div class="card emptyState"><div class="emptyDesc">${t("leaderboard_empty")}</div></div>`
      : rows
    }
  `;
}

async function renderProfile() {
  const content = $("#content");
  if (profileView === "leaderboard" && state.leaderboard.length === 0) {
    content.innerHTML = `<div class="loading" style="height:300px"></div>`;
    await loadLeaderboard();
  }
  if (profileView === "referral") {
    content.innerHTML = renderProfileReferral();
  } else if (profileView === "leaderboard") {
    content.innerHTML = renderProfileLeaderboard();
  } else {
    content.innerHTML = renderProfileMenu();
  }
}

/* ================= TAB DISPATCH ================= */
async function renderCurrentTab() {
  showLoading();
  try {
    if (state.activeTab === "home") {
      await Promise.all([loadUserData(), loadTasks(), loadReferralData()]);
      renderHome();
    } else if (state.activeTab === "tasks") {
      await loadTasks();
      renderTasks();
    } else if (state.activeTab === "daily") {
      await loadUserData();
      renderDaily();
    } else if (state.activeTab === "wallet") {
      await loadUserData();
      renderWallet();
    } else if (state.activeTab === "profile") {
      profileView = "menu";
      await Promise.all([loadUserData(), loadReferralData()]);
      renderProfile();
    }
  } catch (error) {
    console.error("Render tab failed:", error);
    $("#content").innerHTML = `
      <div class="card emptyState">
        <div class="emptyIcon">⚠️</div>
        <div class="emptyTitle">${t("error_title")}</div>
        <div class="emptyDesc">${escapeHTML(error.message || t("error_generic"))}</div>
        <button class="secondaryBtn" style="margin-top:14px" onclick="renderCurrentTab()">${t("retry_button")}</button>
      </div>
    `;
  }
}

/* ================= BOOT ================= */
async function boot() {
  if (state.initialized) return;

  setupNavigation();
  updateNavigation();

  const telegramUser = getTelegramUser();
  if (telegramUser) state.user = telegramUser;

  if (!captchaPassed()) {
    updateHeader();
    showCaptcha();
    return;
  }

  await bootstrapAuth();
  applyStaticTranslations();

  if (!termsAccepted()) {
    showTerms();
  }

  state.initialized = true;
  await navigate("home");
}

document.addEventListener("DOMContentLoaded", () => {
  boot();
});