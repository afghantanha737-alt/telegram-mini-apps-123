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
  gramBalance: 0,
  rate: 0,
  streak: 0,
  canCheckIn: false,
  spinChances: 0,
  spinCostPoints: 30,
  totalCheckins: 0,
  minWithdrawGram: 0,
  nextResetAt: 0,
  referralCode: "",
  shareLink: "",
  invitedCount: 0,
  gateActive: false,
  totalEarnedPoints: 0,
  gramUsdPrice: 0,
  invited: [],
  referralMinTasks: 2,
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
  return saved === "light" || saved === "dark" ? saved : "light";
}
function applyTheme(theme) {
  const finalTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = finalTheme;
  localStorage.setItem(THEME_KEY, finalTheme);
  try {
    const chrome = finalTheme === "light" ? "#faf5ff" : "#050609";
    if (tg && tg.setHeaderColor) tg.setHeaderColor(chrome);
    if (tg && tg.setBackgroundColor) tg.setBackgroundColor(chrome);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", chrome);
  } catch (e) { /* ignore */ }
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
function formatFixed(value, decimals = 3) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
}
function truncateMiddle(str, head = 6, tail = 6) {
  const s = String(str || "");
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
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

  // اگر سرور بیش از حد کند شد (مثلاً سرویس رایگان تازه بیدار شده)،
  // درخواست بعد از ۲۰ ثانیه خودش قطع می‌شود تا دکمه هیچ‌وقت برای همیشه گیر نکند.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 40000);
  config.signal = controller.signal;

  let response;
  try {
    response = await fetch(finalUrl, config);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(t("error_generic") + " (Timeout)");
    }
    throw new Error(t("error_generic"));
  } finally {
    clearTimeout(timeoutId);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    // هر endpoint محافظت‌شده اگر عضویت اجباری را رد کند، صفحه‌ی عضویت اجباری باز می‌شود
    // (مثلاً وقتی کاربر وسط استفاده از یک کانال خارج شده باشد)
    if (data?.code === "MEMBERSHIP_REQUIRED" || data?.code === "MEMBERSHIP_UNAVAILABLE") {
      showMembershipGate({
        required: true,
        verified: false,
        unavailable: data.code === "MEMBERSHIP_UNAVAILABLE",
        channels: Array.isArray(data.channels) ? data.channels : []
      });
    }
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
  const idLine = $("#userIdLine");

  if (avatar) {
    avatar.textContent = getInitials(user);
    if (user.photo_url) avatar.innerHTML = `<img src="${escapeHTML(user.photo_url)}" alt="">`;
  }
  const uid = user.id || user.telegramId || "";
  if (idLine) idLine.textContent = uid ? `ID ${uid}` : "";
}

function applyDirection() {
  const isLtr = state.language === "en";
  document.documentElement.dir = isLtr ? "ltr" : "rtl";
  document.documentElement.lang = state.language;
}

function applyStaticTranslations() {
  applyDirection();
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


/* ================= MANDATORY CHANNEL MEMBERSHIP GATE =================
   وضعیت عضویت هرگز در کلاینت ذخیره یا باور نمی‌شود؛ هر بار از سرور (که از خود تلگرام
   می‌پرسد) گرفته می‌شود. سرور علاوه بر این، همه‌ی APIهای محافظت‌شده را هم بلاک می‌کند. */
let gateData = null;
let gateBusy = false;
let lastGateCheckAt = 0;

function gateSafeUrl(url) {
  return /^https:\/\/(t|telegram)\.me\//i.test(String(url || "")) ? String(url) : "";
}

function gateOpenLink(url) {
  const safe = gateSafeUrl(url);
  if (!safe) return;
  try {
    if (tg && typeof tg.openTelegramLink === "function") { tg.openTelegramLink(safe); return; }
  } catch (e) { /* fallback below */ }
  window.open(safe, "_blank", "noopener");
}

const GATE_PLANE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.5 4.4 2.9 11.6c-.9.35-.9 1 0 1.3l4.7 1.5 1.8 5.5c.2.6.4.8.9.8s.6-.2.9-.5l2.3-2.2 4.6 3.4c.9.5 1.5.2 1.7-.8L23 5.8c.3-1.2-.4-1.8-1.5-1.4zM8.8 13.5l9.5-6c.4-.3.8-.1.5.2l-7.8 7.1-.3 3.3-1.9-4.6z"/></svg>';

function ensureGateElement() {
  let el = document.getElementById("membershipGate");
  if (!el) {
    el = document.createElement("div");
    el.id = "membershipGate";
    el.className = "gateOverlay";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    document.body.appendChild(el);
  }
  return el;
}

function gateMessage(data) {
  const channels = data.channels || [];
  const anyNotJoined = channels.some(c => c.state === "not_joined");
  const anyError = channels.some(c => c.state === "error");
  if (data.verified) return { type: "ok", text: t("gate_all_ok") };
  if (anyNotJoined) return { type: "warn", text: t("gate_missing") };
  if (data.unavailable || anyError) return { type: "error", text: anyError ? t("gate_config_error") : t("gate_unavailable") };
  return { type: "warn", text: t("gate_missing") };
}

function renderMembershipGate(override) {
  const el = ensureGateElement();
  const data = gateData || { channels: [] };
  const msg = override || gateMessage(data);
  const channels = data.channels || [];

  const cards = channels.map((c, i) => {
    const joined = c.state === "joined";
    const errored = c.state === "error";
    const pill = joined
      ? `<span class="gatePill gateOk">✓ ${t("gate_joined")}</span>`
      : errored
        ? `<span class="gatePill gateWarnPill">! ${t("gate_error")}</span>`
        : `<span class="gatePill gateBad">✕ ${t("gate_not_joined")}</span>`;
    const handle = c.username ? `@${escapeHTML(c.username)}` : "";
    const canJoin = !joined && gateSafeUrl(c.url);
    return `
      <div class="gateCard">
        <div class="gateCardTop">
          <div class="gateChIcon">${GATE_PLANE}</div>
          <div class="gateChInfo">
            <div class="gateChName">${escapeHTML(c.name)}</div>
            ${handle ? `<div class="gateChUser">${handle}</div>` : ""}
          </div>
          ${pill}
        </div>
        ${canJoin ? `<button type="button" class="gateJoinBtn" data-join="${i}">${GATE_PLANE}<span>${t("gate_join")}</span></button>` : ""}
      </div>`;
  }).join("");

  el.innerHTML = `
    <div class="gateInner">
      <div class="gateBrand">
        <img src="img/logo.svg" alt="Gramup">
        <div class="brandName">Gram<span>up</span></div>
      </div>
      <div class="gateHero">${GATE_PLANE}</div>
      <h1 class="gateTitle">${t("gate_title")}</h1>
      <p class="gateDesc">${t("gate_desc")}</p>
      <div class="gateList">${cards}</div>
      <div id="gateMsg" class="gateMsg gate-${msg.type}" role="status">${escapeHTML(msg.text)}</div>
      <button type="button" id="gateCheckBtn" class="gateCheckBtn">${gateBusy ? t("gate_checking") : (data.fetchFailed || data.unavailable ? t("gate_retry") : t("gate_check"))}</button>
    </div>`;

  el.querySelectorAll("[data-join]").forEach(btn => {
    btn.addEventListener("click", () => {
      haptic("selection");
      const channel = channels[Number(btn.dataset.join)];
      if (channel) gateOpenLink(channel.url); // فقط لینک را باز می‌کند؛ عضو حساب نمی‌شود
    });
  });
  const check = el.querySelector("#gateCheckBtn");
  if (check) {
    check.disabled = gateBusy;
    check.addEventListener("click", gateCheck);
  }
}

function showMembershipGate(data) {
  gateData = data;
  state.gateActive = true;
  document.body.classList.add("is-gated");
  try { if (tg && tg.BackButton && tg.BackButton.hide) tg.BackButton.hide(); } catch (e) { /* ignore */ }
  renderMembershipGate();
}

function hideMembershipGate() {
  state.gateActive = false;
  gateData = null;
  document.body.classList.remove("is-gated");
  const el = document.getElementById("membershipGate");
  if (el) el.remove();
}

function fetchMembership(fresh) {
  return fresh
    ? api("/api/required-channels/check-membership", { method: "POST", body: {} })
    : api("/api/required-channels");
}

/** true = اجازه‌ی ورود؛ false = صفحه‌ی عضویت اجباری نمایش داده شد */
async function enforceMembership() {
  lastGateCheckAt = Date.now();
  try {
    const data = await fetchMembership(false);
    if (data.verified) {
      if (state.gateActive) hideMembershipGate();
      return true;
    }
    showMembershipGate(data);
    return false;
  } catch (error) {
    // اگر نتوانستیم عضویت را بررسی کنیم، اجازه‌ی ورود نمی‌دهیم
    if (!state.gateActive) {
      showMembershipGate({ required: true, verified: false, unavailable: true, fetchFailed: true, channels: [] });
    }
    return false;
  }
}

async function gateCheck() {
  if (gateBusy) return;
  gateBusy = true;
  const btn = document.getElementById("gateCheckBtn");
  if (btn) { btn.disabled = true; btn.textContent = t("gate_checking"); }
  haptic("selection");

  try {
    const data = await fetchMembership(true);
    gateData = data;
    if (data.verified) {
      gateBusy = false;
      renderMembershipGate({ type: "ok", text: t("gate_all_ok") });
      const done = document.getElementById("gateCheckBtn");
      if (done) done.disabled = true;
      haptic("success");
      await new Promise(resolve => setTimeout(resolve, 700));
      hideMembershipGate();
      state.initialized = true;
      await navigate(state.activeTab || "home");
      return;
    }
    gateBusy = false;
    renderMembershipGate();
  } catch (error) {
    gateBusy = false;
    gateData = { ...(gateData || {}), channels: (gateData && gateData.channels) || [], unavailable: true, verified: false, fetchFailed: !(gateData && gateData.channels && gateData.channels.length) };
    renderMembershipGate({ type: "error", text: t("gate_unavailable") });
  } finally {
    gateBusy = false;
  }
}

// کاربر وقتی به برنامه برمی‌گردد (مثلاً بعد از رفتن به کانال یا بازگشت از پس‌زمینه) دوباره بررسی می‌شود
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !state.initialized || state.gateActive) return;
  if (Date.now() - lastGateCheckAt < 15000) return;
  enforceMembership();
});

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
  maybeShowOnboarding();
}
window.hideTerms = hideTerms;
window.showTerms = showTerms;

/* ================= PRIVACY POLICY ================= */
function showPrivacy() {
  const overlay = $("#privacyOverlay");
  if (overlay) overlay.style.display = "flex";
}
function hidePrivacy() {
  const overlay = $("#privacyOverlay");
  if (overlay) overlay.style.display = "none";
}
window.showPrivacy = showPrivacy;
window.hidePrivacy = hidePrivacy;

/* ================= ONBOARDING ================= */
const ONBOARDING_STEP_COUNT = 3;
let onboardingStep = 0;

function onboardingSeen() {
  return localStorage.getItem("onboardingSeen") === "1";
}

function maybeShowOnboarding() {
  if (onboardingSeen()) return;
  onboardingStep = 0;
  const overlay = $("#onboardingOverlay");
  if (overlay) overlay.style.display = "flex";
  renderOnboardingStep();
}

function renderOnboardingStep() {
  for (let i = 0; i < ONBOARDING_STEP_COUNT; i++) {
    const step = $(`#onboardingStep${i}`);
    const dot = $(`#onboardingDot${i}`);
    if (step) step.style.display = i === onboardingStep ? "block" : "none";
    if (dot) dot.classList.toggle("active", i === onboardingStep);
  }
  const nextBtn = $("#onboardingNextBtn");
  if (nextBtn) nextBtn.textContent = onboardingStep === ONBOARDING_STEP_COUNT - 1 ? "بزنیم بریم! 🚀" : "بعدی";
}

function onboardingNext() {
  if (onboardingStep >= ONBOARDING_STEP_COUNT - 1) {
    finishOnboarding();
    return;
  }
  onboardingStep += 1;
  renderOnboardingStep();
}
window.onboardingNext = onboardingNext;

function finishOnboarding() {
  const overlay = $("#onboardingOverlay");
  if (overlay) overlay.style.display = "none";
  localStorage.setItem("onboardingSeen", "1");
}

function skipOnboarding() {
  finishOnboarding();
}
window.skipOnboarding = skipOnboarding;

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
  state.gramBalance = Number(data?.gramBalance) || 0;
  state.rate = Number(data?.rate) || 0;
  state.streak = Number(data?.streak) || 0;
  state.canCheckIn = Boolean(data?.canCheckIn);
  state.spinChances = Number(data?.spinChances) || 0;
  state.spinCostPoints = Number(data?.spinCostPoints) || 30;
  state.totalCheckins = Number(data?.totalCheckins) || 0;
  state.minWithdrawGram = Number(data?.minWithdrawGram) || 0;
  state.nextResetAt = Number(data?.nextResetAt) || 0;
  state.totalEarnedPoints = Number(data?.totalEarnedPoints) || 0;
  state.gramUsdPrice = Number(data?.gramUsdPrice) || 0;
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
    state.referralMinTasks = Number(data?.referralMinTasks) || 2;
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

/* ================= TRANSACTION HISTORY (LEDGER) ================= */
let historyList = [];
let historyHasMore = false;
let historyLoading = false;

const LEDGER_TYPE_UI = {
  task: { icon: "✅" },
  checkin: { icon: "📅" },
  spin: { icon: "🎡" },
  referral_bonus: { icon: "👥" },
  exchange_out: { icon: "⇄" },
  exchange_in: { icon: "⇄" },
  withdraw: { icon: "➤" },
  admin_adjust: { icon: "🛠️" }
};

async function loadHistory(reset = true) {
  if (historyLoading) return;
  historyLoading = true;
  try {
    if (reset) historyList = [];
    const before = reset || historyList.length === 0
      ? ""
      : `&before=${encodeURIComponent(historyList[historyList.length - 1].createdAt)}`;
    const data = await api(`/api/points/history?limit=30${before}`);
    const items = Array.isArray(data?.history) ? data.history : [];
    historyList = reset ? items : historyList.concat(items);
    historyHasMore = Boolean(data?.hasMore);
  } catch (error) {
    console.warn("History failed:", error);
    if (reset) { historyList = []; historyHasMore = false; }
  } finally {
    historyLoading = false;
  }
}

async function loadMoreHistory() {
  const btn = $("#historyLoadMoreBtn");
  if (btn) { btn.disabled = true; btn.textContent = t("history_loading"); }
  await loadHistory(false);
  renderProfile();
}
window.loadMoreHistory = loadMoreHistory;

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
  const approvedTasks = state.completions.filter(c => c.status === "approved").length;
  const usd = state.gramBalance * state.gramUsdPrice;
  const usdPill = state.gramUsdPrice > 0
    ? `<span class="tbPill tbPillGreen">≈ $${formatFixed(usd, 3)} USD</span>`
    : "";

  const content = $("#content");
  content.innerHTML = `
    <section class="tbCard tbBalance">
      <div class="tbBalanceTop">
        <div class="tbBalanceInfo">
          <div class="tbLabel">${t("tb_total_balance")}</div>
          <div class="tbAmount"><span class="tbAmountNum">${formatFixed(state.gramBalance, 3)}</span><span class="tbAmountUnit">GRAM</span></div>
          <div class="tbPills">
            ${usdPill}
            <span class="tbPill tbPillPurple">${t("tb_points_chip", { n: formatPoints(state.points) })}</span>
          </div>
        </div>
        <div class="tbGemRing"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#2f9bf0"/><path d="M20 24h24l6 8-18 20L14 32z" fill="#fff"/><path d="M32 30v10M27 35h10" stroke="#2f9bf0" stroke-width="3" stroke-linecap="round"/></svg></div>
      </div>
      <div class="tbActions">
        <button class="tbBtnPrimary" type="button" onclick="showWithdraw()"><span class="tbBtnIcon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg></span>${t("tb_withdraw")}</button>
        <button class="tbBtnGhost" type="button" onclick="openHistory()"><span class="tbBtnIcon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7.5V12l3 2"/></svg></span>${t("tb_history")}</button>
      </div>
    </section>

    <div class="tbSectionHead">
      <h2 class="tbSectionTitle">${t("tb_your_progress")} <span class="tbSpark">✨</span></h2>
      <button class="tbLink" type="button" onclick="navigate('profile')">${t("tb_view_all")} <span class="tbLinkArrow">→</span></button>
    </div>

    <div class="tbStats">
      <div class="tbStat">
        <div class="tbStatIcon tbIconMint"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#2f9bf0"/><path d="M20 24h24l6 8-18 20L14 32z" fill="#fff"/><path d="M32 30v10M27 35h10" stroke="#2f9bf0" stroke-width="3" stroke-linecap="round"/></svg></div>
        <div class="tbStatLabel tbColGreen">${t("tb_earned")}</div>
        <div class="tbStatValue">${formatPoints(state.totalEarnedPoints)}</div>
      </div>
      <div class="tbStat">
        <div class="tbStatIcon tbIconOrange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2A6.5 6.5 0 0 1 21.5 20"/></svg></div>
        <div class="tbStatLabel tbColOrange">${t("tb_referrals")}</div>
        <div class="tbStatValue">${formatPoints(state.invitedCount)}</div>
      </div>
      <div class="tbStat">
        <div class="tbStatIcon tbIconPurple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17.5" rx="2.5"/><path d="M9 3.5h6v3H9z"/><path d="m9 13.5 2 2 4-4"/></svg></div>
        <div class="tbStatLabel tbColPurple">${t("tb_tasks")}</div>
        <div class="tbStatValue">${formatPoints(approvedTasks)}</div>
      </div>
    </div>

    <section class="tbExplore">
      <div class="tbExploreText">
        <h3 class="tbExploreTitle">${t("tb_explore_title")}</h3>
        <p class="tbExploreDesc">${t("tb_explore_desc")}</p>
        <button class="tbBtnDark" type="button" onclick="navigate('tasks')">${t("tb_view_tasks")} <span class="tbBtnIcon tbFlip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></button>
      </div>
      <div class="tbExploreGem"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#2f9bf0"/><path d="M20 24h24l6 8-18 20L14 32z" fill="#fff"/><path d="M32 30v10M27 35h10" stroke="#2f9bf0" stroke-width="3" stroke-linecap="round"/></svg></div>
    </section>
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

/**
 * راهنمای پایدار زیر هر تسک، بعد از تلاش ناموفق برای تایید — کلید taskId.
 * بر خلاف toast (که بعد از ۲.۸ ثانیه محو می‌شود)، این راهنما تا اقدام بعدی
 * کاربر (یا موفقیت تسک) روی صفحه باقی می‌ماند، تا واقعاً بداند چه کاری
 * باید انجام بدهد، نه فقط اینکه «رد شد».
 */
const taskHints = {};

/** تسک‌های تلگرامی: بررسی خودکار عضویت با API ربات */
async function verifyTelegramTask(taskId) {
  const button = document.querySelector(`[data-verify="${taskId}"]`);
  if (button) { button.disabled = true; button.textContent = t("task_action_verifying"); }

  try {
    const result = await api(`/api/tasks/${taskId}/claim`, { method: "POST" });
    haptic("success");
    toast(result.message, "success");
    delete taskHints[taskId];
    state.points = Number(result.points) || state.points;
    await loadTasks();
    updateHeader();
    renderTasks();
  } catch (error) {
    haptic("error");
    const task = state.tasks.find(item => String(item._id) === String(taskId));

    if (error.code === "NOT_JOINED") {
      toast(t("toast_verify_needs_join"), "warning");
      taskHints[taskId] = {
        type: "warning",
        message: task && task.url ? t("task_hint_not_joined_with_link") : t("task_hint_not_joined_no_link")
      };
    } else if (error.code === "VERIFY_CONFIG_ERROR") {
      // خطای واقعی تنظیمات (chatId اشتباه، ربات بدون دسترسی و ...) — پیام دقیق را نشان بده
      toast(error.message, "error");
      taskHints[taskId] = { type: "error", message: `${error.message} ${t("task_hint_config_error_suffix")}` };
    } else {
      const message = translateServerMessage(error.code, error.message);
      toast(message, "error");
      taskHints[taskId] = { type: "error", message };
    }
    if (button) { button.disabled = false; button.textContent = t("task_action_verify"); }
    renderTasks();
  }
}
window.verifyTelegramTask = verifyTelegramTask;

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

  const doneCount = state.tasks.filter(task => completionStatus(task._id) === "approved").length;

  content.innerHTML = `
    <div class="sectionHeader">
      <h2 class="sectionTitle">${t("tasks_title")}</h2>
      <span class="tbPill tbPillPurple">${formatPoints(doneCount)} / ${formatPoints(state.tasks.length)}</span>
    </div>
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
        } else {
          actionHtml = `
            <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch">
              ${task.url ? `<button class="taskAction" style="background:var(--surface-3);color:var(--text)" onclick="openTaskLinkOnly('${safeUrl}')">${t("task_action_open")}</button>` : ""}
              <button class="taskAction" data-verify="${task._id}" onclick="verifyTelegramTask('${task._id}')">${t("task_action_verify")}</button>
            </div>`;
        }

        const hint = status === "todo" ? taskHints[task._id] : null;

        return `
        <div class="taskItem" style="flex-wrap:wrap">
          <div class="taskIcon">${icon}</div>
          <div class="taskBody">
            <div class="taskTitle">${escapeHTML(task.title)}</div>
            ${task.description ? `<div class="taskDesc">${escapeHTML(task.description)}</div>` : ""}
            <div class="taskReward">+${formatPoints(task.reward)} ${t("points_unit")}</div>
          </div>
          ${actionHtml}
          ${hint ? `<div class="taskHint ${hint.type}" style="flex-basis:100%">${escapeHTML(hint.message)}</div>` : ""}
        </div>`;
      }).join("")}
    </div>
  `;
}

/* ================= DAILY + SPIN WHEEL ================= */
const WHEEL_SIZE = 260;
const WHEEL_CENTER = WHEEL_SIZE / 2;

const SPIN_SEGMENTS_UI = [
  { icon: "🪙", value: "20", color1: "#8b5cf6", color2: "#6d28d9" },
  { icon: "🪙", value: "40", color1: "#a78bfa", color2: "#7c3aed" },
  { icon: "🪙", value: "60", color1: "#f5c451", color2: "#c98a12" },
  { icon: "🪙", value: "100", color1: "#22c55e", color2: "#15803d" },
  { icon: "🪙", value: "0", color1: "#3a3f4d", color2: "#1e2028" },
  { icon: "🎡", value: "+1", color1: "#38bdf8", color2: "#0284c7" }
];

let wheelRotation = 0;

function buildWheelGradient() {
  const step = 360 / SPIN_SEGMENTS_UI.length;
  const stops = SPIN_SEGMENTS_UI.map((seg, i) => {
    const mid = i * step + step / 2;
    return `${seg.color1} ${i * step}deg ${mid}deg, ${seg.color2} ${mid}deg ${(i + 1) * step}deg`;
  });
  return `conic-gradient(from 0deg, ${stops.join(", ")})`;
}

/** برچسب‌ها داخل خودِ دیسک قرار می‌گیرند تا هنگام چرخش، همراه رنگ‌ها بچرخند */
function buildWheelLabels() {
  const step = 360 / SPIN_SEGMENTS_UI.length;
  const radius = WHEEL_CENTER - 46;
  return SPIN_SEGMENTS_UI.map((seg, i) => {
    const angleDeg = i * step + step / 2;
    const angleRad = (angleDeg - 90) * (Math.PI / 180);
    const x = WHEEL_CENTER + radius * Math.cos(angleRad);
    const y = WHEEL_CENTER + radius * Math.sin(angleRad);
    const isSpin = seg.value === "+1";
    return `
      <span class="wheelLabel" style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(${angleDeg}deg)">
        <span class="wheelLabelInner" style="transform:rotate(${-angleDeg}deg)">
          <span class="wheelIcon">${seg.icon}</span>
          <span class="wheelValue">${seg.value}${isSpin ? "" : ""}</span>
        </span>
      </span>`;
  }).join("");
}

/** نقطه‌های تزئینی نورانی دور کادر گردونه (ثابت، نمی‌چرخند) */
function buildWheelRingDots() {
  const count = 12;
  const radius = WHEEL_CENTER + 6;
  let dots = "";
  for (let i = 0; i < count; i++) {
    const angleRad = (i * (360 / count)) * (Math.PI / 180);
    const x = WHEEL_CENTER + radius * Math.cos(angleRad);
    const y = WHEEL_CENTER + radius * Math.sin(angleRad);
    dots += `<span class="wheelDot" style="left:${x}px;top:${y}px"></span>`;
  }
  return dots;
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

function refreshSpinButtons(spinning = false) {
  const free = $("#spinBtn");
  const paid = $("#paidSpinBtn");
  if (free) free.disabled = spinning || state.spinChances <= 0;
  if (paid) paid.disabled = spinning || state.points < state.spinCostPoints;
}

async function doSpin(paid = false) {
  paid = paid === true;
  if (!paid && state.spinChances <= 0) {
    toast(t("spin_no_chances"), "warning");
    return;
  }
  if (paid && state.points < state.spinCostPoints) {
    toast(t("spin_paid_not_enough", { n: formatPoints(state.spinCostPoints) }), "warning");
    return;
  }
  refreshSpinButtons(true);

  try {
    // هزینه/شانس در سرور کم می‌شود؛ نتیجه‌ی چرخش هم فقط از سرور می‌آید
    const result = await api("/api/points/spin", { method: "POST", body: { paid } });
    const disc = $("#wheelDisc");
    const rotation = spinWheelTargetRotation(result.segmentIndex);
    if (disc) disc.style.transform = `rotate(${rotation}deg)`;

    setTimeout(() => {
      state.points = Number(result.points) || 0;
      state.spinChances = Number(result.spinChances) || 0;
      state.spinCostPoints = Number(result.spinCostPoints) || state.spinCostPoints;
      updateHeader();

      const chancesEl = $("#spinChancesValue");
      if (chancesEl) chancesEl.textContent = formatPoints(state.spinChances);
      refreshSpinButtons(false);

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
    refreshSpinButtons(false);
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
        <div class="wheelRingDots">${buildWheelRingDots()}</div>
        <div class="wheelPointer">▼</div>
        <div class="wheelDisc" id="wheelDisc" style="background:${buildWheelGradient()}">
          ${buildWheelLabels()}
        </div>
        <div class="wheelHub"><span>✦</span></div>
      </div>
      <p style="font-size:11px;margin:14px 0 4px">${t("spin_chances_label")}: <b id="spinChancesValue">${formatPoints(state.spinChances)}</b></p>
      <button id="spinBtn" class="primaryBtn wheelSpinBtn" type="button" ${state.spinChances <= 0 ? "disabled" : ""} onclick="doSpin()">
        🎡 ${t("spin_button")}
      </button>
      <button id="paidSpinBtn" class="secondaryBtn wheelPaidBtn" type="button" ${state.points < state.spinCostPoints ? "disabled" : ""} onclick="doSpin(true)">
        🪙 ${t("spin_paid_button", { n: formatPoints(state.spinCostPoints) })}
      </button>
      <p class="wheelPaidHint">${t("spin_paid_hint", { n: formatPoints(state.spinCostPoints) })}</p>
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
  if (state.gramBalance < state.minWithdrawGram) {
    toast(t("wallet_min_withdraw_note", { n: formatNumber(state.minWithdrawGram, 6) }), "warning");
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
  const gramInput = $("#withdrawPoints");
  const addressInput = $("#withdrawAddress");
  const error = $("#withdrawError");
  const button = $("#submitWithdraw");

  const gram = Number(gramInput?.value);
  const address = String(addressInput?.value || "").trim();

  if (!gram || gram <= 0) {
    if (error) error.textContent = t("error_generic");
    return;
  }
  if (address.length < 6) {
    if (error) error.textContent = t("error_generic");
    return;
  }

  if (button) button.disabled = true;
  try {
    const result = await api("/api/points/withdraw", { method: "POST", body: { gram, address } });
    state.gramBalance = Number(result.gramBalance) ?? state.gramBalance;
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

/* ---- Exchange: Points <-> GRAM (bidirectional) ---- */
let exchangeDirection = "points_to_gram"; // "points_to_gram" | "gram_to_points"

function showExchange() {
  if (state.points <= 0 && state.gramBalance <= 0) {
    toast(t("error_generic"), "warning");
    return;
  }
  const overlay = $("#exchangeOverlay");
  const input = $("#exchangePoints");
  const error = $("#exchangeError");
  if (input) input.value = "";
  if (error) error.textContent = "";
  setExchangeDirection("points_to_gram");
  if (overlay) overlay.style.display = "flex";
}
window.showExchange = showExchange;

function hideExchange() {
  const overlay = $("#exchangeOverlay");
  if (overlay) overlay.style.display = "none";
}
window.hideExchange = hideExchange;

function setExchangeDirection(direction) {
  exchangeDirection = direction === "gram_to_points" ? "gram_to_points" : "points_to_gram";

  const btnPTG = $("#exchangeDirPTG");
  const btnGTP = $("#exchangeDirGTP");
  if (btnPTG) btnPTG.classList.toggle("active", exchangeDirection === "points_to_gram");
  if (btnGTP) btnGTP.classList.toggle("active", exchangeDirection === "gram_to_points");

  const label = $("#exchangeAmountLabel");
  const input = $("#exchangePoints");
  const title = $("#exchangeTitle");
  if (exchangeDirection === "points_to_gram") {
    if (label) label.textContent = t("exchange_points_label");
    if (input) input.setAttribute("placeholder", "مثلاً 1000");
    if (title) title.textContent = t("exchange_modal_title");
  } else {
    if (label) label.textContent = t("exchange_gram_label");
    if (input) input.setAttribute("placeholder", "مثلاً 0.5");
    if (title) title.textContent = t("exchange_modal_title_reverse");
  }

  if (input) input.value = "";
  const error = $("#exchangeError");
  if (error) error.textContent = "";
  updateExchangePreview();
}
window.setExchangeDirection = setExchangeDirection;

function updateExchangePreview() {
  const input = $("#exchangePoints");
  const preview = $("#exchangePreview");
  if (!input || !preview) return;
  const amount = Number(input.value) || 0;

  if (exchangeDirection === "points_to_gram") {
    const gram = amount * state.rate;
    preview.textContent = `${t("exchange_result_label")}: ${formatNumber(gram, 6)} GRAM`;
  } else {
    const points = state.rate > 0 ? Math.floor(amount / state.rate) : 0;
    preview.textContent = `${t("exchange_result_label_points")}: ${formatPoints(points)}`;
  }
}
window.updateExchangePreview = updateExchangePreview;

async function submitExchange() {
  const input = $("#exchangePoints");
  const error = $("#exchangeError");
  const button = $("#submitExchange");

  const amount = Number(input?.value);
  if (!amount || amount <= 0) {
    if (error) error.textContent = t("error_generic");
    return;
  }
  if (exchangeDirection === "points_to_gram" && amount > state.points) {
    if (error) error.textContent = t("error_generic");
    return;
  }
  if (exchangeDirection === "gram_to_points" && amount > state.gramBalance) {
    if (error) error.textContent = t("error_generic");
    return;
  }

  if (button) button.disabled = true;
  try {
    const result = await api("/api/points/exchange", {
      method: "POST",
      body: { direction: exchangeDirection, amount }
    });
    state.points = Number(result.points) ?? state.points;
    state.gramBalance = Number(result.gramBalance) ?? state.gramBalance;
    haptic("success");
    toast(result.message, "success");
    hideExchange();
    updateHeader();
    renderWallet();
  } catch (err) {
    if (error) error.textContent = translateServerMessage(err.code, err.message);
    haptic("error");
  } finally {
    if (button) button.disabled = false;
  }
}
window.submitExchange = submitExchange;

/* ---- Deposit: placeholder ---- */
function showDeposit() {
  const overlay = $("#depositOverlay");
  const message = $("#depositMessage");
  if (message) message.textContent = t("deposit_coming_soon");
  if (overlay) overlay.style.display = "flex";
}
window.showDeposit = showDeposit;

function hideDeposit() {
  const overlay = $("#depositOverlay");
  if (overlay) overlay.style.display = "none";
}
window.hideDeposit = hideDeposit;

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
  pending: { cls: "warning" }, rejected: { cls: "danger" }, paid: { cls: "success" }
};

let publicHistory = [];
async function loadPublicHistory() {
  try {
    const data = await api("/api/points/public-history");
    publicHistory = Array.isArray(data?.history) ? data.history : [];
  } catch (error) {
    console.warn("Public history failed:", error);
    publicHistory = [];
  }
}

const TB_ICONS = {
  coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.3c-.4-.9-1.4-1.4-2.5-1.4-1.4 0-2.5.8-2.5 1.9 0 2.6 5 1.4 5 4.2 0 1.1-1.1 1.9-2.5 1.9-1.1 0-2.1-.5-2.5-1.4M12 6.5v1.4M12 16.1v1.4"/></svg>',
  gem: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#2f9bf0"/><path d="M20 24h24l6 8-18 20L14 32z" fill="#fff"/><path d="M32 30v10M27 35h10" stroke="#2f9bf0" stroke-width="3" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  exchange: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h15M17 20l4-4-4-4M21 16H6"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>'
};

function renderWallet() {
  const content = $("#content");

  content.innerHTML = `
    <div class="sectionHeader"><h2 class="sectionTitle">${t("wallet_title")}</h2></div>

    <div class="tbWalletGrid">
      <div class="tbWalletCard">
        <div class="tbWalletIcon tbIconOrange">${TB_ICONS.coin}</div>
        <div class="tbStatLabel tbColOrange">${t("wallet_points_card_title")}</div>
        <div class="tbWalletValue">${formatPoints(state.points)}</div>
      </div>
      <div class="tbWalletCard">
        <div class="tbWalletIcon tbIconBlue">${TB_ICONS.gem}</div>
        <div class="tbStatLabel tbColBlue">${t("wallet_gram_card_title")}</div>
        <div class="tbWalletValue">${formatNumber(state.gramBalance, 6)}</div>
        ${state.gramUsdPrice > 0 ? `<span class="tbPill tbPillGreen tbPillSm">≈ $${formatFixed(state.gramBalance * state.gramUsdPrice, 3)}</span>` : ""}
      </div>
    </div>

    <div class="tbWalletActions">
      <button class="tbAct" type="button" onclick="showDeposit()">
        <span class="tbActIcon">${TB_ICONS.plus}</span>
        <span>${t("wallet_deposit_button")}</span>
      </button>
      <button class="tbAct" type="button" onclick="showExchange()">
        <span class="tbActIcon">${TB_ICONS.exchange}</span>
        <span>${t("wallet_exchange_button")}</span>
      </button>
      <button class="tbAct tbActPrimary" type="button" onclick="showWithdraw()">
        <span class="tbActIcon">${TB_ICONS.out}</span>
        <span>${t("wallet_withdraw_button")}</span>
      </button>
    </div>

    <div class="card">
      <p style="font-size:11px;margin-bottom:0">${t("wallet_rate_label", { rate: formatNumber(state.rate, 6) })} • ${t("wallet_min_withdraw_note", { n: formatNumber(state.minWithdrawGram, 6) })}</p>
    </div>

    <div class="card" id="withdrawHistoryCard">
      <div class="cardHeader"><div class="cardTitle">${t("wallet_history_title")}</div></div>
      <div id="withdrawHistoryList">
        <div class="loading" style="height:60px"></div>
      </div>
    </div>

    <div class="card" id="publicHistoryCard">
      <div class="cardHeader">
        <div class="cardTitle">${t("wallet_public_history_title")}</div>
      </div>
      <p class="cardSubtitle" style="margin-bottom:10px">${t("wallet_public_history_desc")}</p>
      <div id="publicHistoryList">
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
            <div class="historyAmount">${formatNumber(item.cryptoAmount, 6)} ${escapeHTML(item.token || "GRAM")}</div>
            <div class="historyMeta">${timeAgo(item.createdAt)}</div>
            ${item.status === "paid" && item.txHash ? `
              <div class="historyTxRow">
                <span class="verifiedTick">${item.verified ? "✅" : "⚠️"}</span>
                <span>${escapeHTML(truncateMiddle(item.txHash))}</span>
              </div>` : ""}
          </div>
          <div class="badge ${statusInfo.cls}">${t(`withdraw_status_${item.status}`)}</div>
        </div>`;
    }).join("");
  });

  loadPublicHistory().then(() => {
    const list = $("#publicHistoryList");
    if (!list) return;
    if (publicHistory.length === 0) {
      list.innerHTML = `<div class="emptyState" style="padding:20px 0"><div class="emptyDesc">${t("wallet_public_history_empty")}</div></div>`;
      return;
    }
    list.innerHTML = publicHistory.map(item => `
      <div class="publicTxCard">
        <div class="publicTxTop">
          <span class="publicTxAmount">${formatNumber(item.amount, 6)} ${escapeHTML(item.token)}</span>
          <span class="publicTxStatus">${item.verified ? "✅" : "⚠️"} ${t("history_status_completed")}</span>
        </div>
        <div class="publicTxRow"><span>${t("history_to_label")}</span><span>${escapeHTML(truncateMiddle(item.toAddress))}</span></div>
        ${item.fromAddress ? `<div class="publicTxRow"><span>${t("history_from_label")}</span><span>${escapeHTML(truncateMiddle(item.fromAddress))}</span></div>` : ""}
        ${item.txHash ? `<div class="publicTxRow"><span>${t("history_txid_label")}</span><span>${escapeHTML(truncateMiddle(item.txHash))}</span></div>` : ""}
        <div class="publicTxRow"><span>${t("history_date_label")}</span><span style="font-family:inherit">${timeAgo(item.date)}</span></div>
      </div>
    `).join("");
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

let profileView = "menu"; // menu | referral | leaderboard | about | history
let pendingProfileView = null;

function openHistory() {
  pendingProfileView = "history";
  navigate("profile");
}
window.openHistory = openHistory;

function setProfileView(view) {
  profileView = view;
  if (view === "history") { historyList = []; historyHasMore = false; }
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
      <div class="profileHeadInfo">
        <div class="profileNameLg">${escapeHTML(firstName)}</div>
        <div class="tbPills">
          <span class="tbPill tbPillPurple tbPillSm">${t("tb_points_chip", { n: formatPoints(state.points) })}</span>
          <span class="tbPill tbPillOrange tbPillSm">${formatPoints(state.invitedCount)} ${t("tb_referrals")}</span>
        </div>
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
        <div class="profileItem" onclick="setProfileView('history')">
          <div class="profileIcon">🧾</div>
          <div class="profileText">${t("menu_history")}</div>
          <div class="profileChevron">‹</div>
        </div>
        <div class="profileItem" onclick="setProfileView('about')">
          <div class="profileIcon">ℹ️</div>
          <div class="profileText">${t("menu_about")}</div>
          <div class="profileChevron">‹</div>
        </div>
        <div class="profileItem" onclick="showTerms()">
          <div class="profileIcon">📜</div>
          <div class="profileText">${t("menu_terms")}</div>
          <div class="profileChevron">‹</div>
        </div>
        <div class="profileItem" onclick="showPrivacy()">
          <div class="profileIcon">🔒</div>
          <div class="profileText">${t("menu_privacy")}</div>
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

function renderProfileAbout() {
  return `
    <div class="sectionHeader">
      <button class="sectionMore" type="button" onclick="setProfileView('menu')">${t("referral_back")}</button>
      <h2 class="sectionTitle">${t("about_title")}</h2>
      <span></span>
    </div>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">${t("about_what_title")}</div>
      </div>
      <p class="cardSubtitle" style="line-height:1.9">${t("about_what_desc")}</p>
    </div>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">${t("about_earn_title")}</div>
      </div>
      <p class="cardSubtitle" style="line-height:1.9">${t("about_earn_desc")}</p>
    </div>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">${t("about_ads_title")}</div>
      </div>
      <p class="cardSubtitle" style="line-height:1.9">${t("about_ads_desc")}</p>
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
        : state.invited.map(person => {
            const statusHtml = person.bonusAwarded
              ? `<span class="badge success" style="margin-top:4px">${t("team_status_awarded")}</span>`
              : `<span class="badge warning" style="margin-top:4px">${t("team_status_pending", { n: person.tasksRemaining })}</span>`;
            return `
            <div class="historyItem" style="align-items:flex-start">
              <div>
                <div class="historyAmount">${escapeHTML(person.firstName || person.username || "—")}</div>
                <div class="historyMeta">${timeAgo(person.createdAt)} • ID ${escapeHTML(person.telegramId)}</div>
              </div>
              ${statusHtml}
            </div>`;
          }).join("")
      }
    </div>
  `;
}

function renderProfileLeaderboard() {
  const rows = state.leaderboard.map((person, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
    const isMe = Boolean(person.isMe);
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

function renderProfileHistory() {
  const rows = historyList.map(item => {
    const isPositive = Number(item.amount) >= 0;
    const unit = item.currency === "gram" ? "GRAM" : t("points_unit");
    const amountText = `${isPositive ? "+" : ""}${item.currency === "gram" ? formatNumber(item.amount, 6) : formatPoints(item.amount)} ${unit}`;
    const icon = (LEDGER_TYPE_UI[item.type] || {}).icon || "🔸";
    const desc = item.description || t(`history_type_${item.type}`);

    return `
      <div class="ledgerRow">
        <div class="ledgerIcon">${icon}</div>
        <div class="ledgerBody">
          <div class="ledgerDesc">${escapeHTML(desc)}</div>
          <div class="historyMeta">${timeAgo(item.createdAt)}</div>
        </div>
        <div class="ledgerAmount ${isPositive ? "positive" : "negative"}">${amountText}</div>
      </div>`;
  }).join("");

  return `
    <div class="sectionHeader">
      <button class="sectionMore" type="button" onclick="setProfileView('menu')">${t("referral_back")}</button>
      <h2 class="sectionTitle">${t("history_page_title")}</h2>
      <span></span>
    </div>

    <div class="card" style="padding:0">
      ${historyList.length === 0
        ? `<div class="emptyState"><div class="emptyIcon">🧾</div><div class="emptyDesc">${t("history_empty")}</div></div>`
        : rows
      }
    </div>

    ${historyHasMore ? `<button class="loadMoreBtn" id="historyLoadMoreBtn" type="button" onclick="loadMoreHistory()">${t("history_load_more")}</button>` : ""}
  `;
}

async function renderProfile() {
  const content = $("#content");
  if (profileView === "leaderboard" && state.leaderboard.length === 0) {
    content.innerHTML = `<div class="loading" style="height:300px"></div>`;
    await loadLeaderboard();
  }
  if (profileView === "history" && historyList.length === 0 && !historyLoading) {
    content.innerHTML = `<div class="loading" style="height:300px"></div>`;
    await loadHistory(true);
  }
  if (profileView === "referral") {
    content.innerHTML = renderProfileReferral();
  } else if (profileView === "leaderboard") {
    content.innerHTML = renderProfileLeaderboard();
  } else if (profileView === "about") {
    content.innerHTML = renderProfileAbout();
  } else if (profileView === "history") {
    content.innerHTML = renderProfileHistory();
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
      profileView = pendingProfileView || "menu";
      pendingProfileView = null;
      if (profileView === "history") { historyList = []; historyHasMore = false; }
      await Promise.all([loadUserData(), loadReferralData()]);
      renderProfile();
    }
  } catch (error) {
    console.error("Render tab failed:", error);
    if (state.gateActive) return; // صفحه‌ی عضویت اجباری باز است؛ خطا رویش نوشته نشود
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
  } else {
    maybeShowOnboarding();
  }

  state.initialized = true;

  // عضویت اجباری: هر بار که مینی‌اپ باز می‌شود، عضویت «فعلی» کاربر از تلگرام بررسی می‌شود
  const allowed = await enforceMembership();
  if (!allowed) return;

  await navigate("home");
}

document.addEventListener("DOMContentLoaded", () => {
  boot();
});