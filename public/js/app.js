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