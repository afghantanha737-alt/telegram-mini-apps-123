/* =========================================================
   POINTS REWARDS â€” PREMIUM TELEGRAM MINI APP
   File: public/js/app.js
   (ظ†غŒط§ط²ظ…ظ†ط¯ i18n.js â€” ط¨ط§غŒط¯ ظ‚ط¨ظ„ ط§ط² ط§غŒظ† ظپط§غŒظ„ ظ„ظˆط¯ ط´ظˆط¯)
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
  totalCheckins: 0,
  minWithdrawGram: 0,
  nextResetAt: 0,
  referralCode: "",
  shareLink: "",
  invitedCount: 0,
  invited: [],
  referralMinTasks: 2,
  tasks: [],
  completions: [],
  leaderboard: [],
  myRank: null,
  adsEnabled: false,
  adsProvider: "",
  adsBlockId: "",
  adsWidgetId: "",
  adsDebug: false,
  adsConfigLoaded: false,
  adsWatched: 0,
  adsMilestones: [],
  adsBusy: false,
  adsStarted: false,
  adsCooldownSeconds: 60,
  adsCooldownUntil: 0,
  captchaA: 0,
  captchaB: 0,
  initialized: false
};
window.state = state;

/* ================= DOM HELPERS ================= */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

/* ================= TELEGRAM INIT DATA ================= */
function getHashInitData() {
  const hash = String(window.location.hash || '').replace(/^#/, '');
  if (!hash) return '';

  try {
    return String(new URLSearchParams(hash).get('tgWebAppData') || '').trim();
  } catch {
    return '';
  }
}

function getInitData() {
  return String(
    window.Telegram?.WebApp?.initData ||
    tg?.initData ||
    getHashInitData() ||
    ''
  ).trim();
}

function getTelegramUser() {
  const sdkUser = window.Telegram?.WebApp?.initDataUnsafe?.user || tg?.initDataUnsafe?.user;
  if (sdkUser) return sdkUser;

  try {
    return JSON.parse(new URLSearchParams(getInitData()).get('user') || 'null');
  } catch {
    return null;
  }
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
  if (icon) icon.textContent = theme === "dark" ? "ًںŒ™" : "âک€ï¸ڈ";
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
  if (diffSeconds < 60) return "â€¢";
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${formatPoints(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${formatPoints(hours)}h`;
  const days = Math.floor(hours / 24);
  return `${formatPoints(days)}d`;
}
function pad2(n) { return String(n).padStart(2, "0"); }

/* ================= API ================= */
function idempotencyKey(scope) {
  const suffix = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${scope}:${suffix}`;
}

async function api(url, options = {}) {
  const config = { ...options, headers: { ...(options.headers || {}) } };

  if (config.body && typeof config.body !== "string") {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(config.body);
  }

  const separator = url.includes("?") ? "&" : "?";
  const initData = getInitData();
  const finalUrl = `${url}${separator}initData=${encodeURIComponent(initData)}`;

  // ط§ع¯ط± ط³ط±ظˆط± ط¨غŒط´ ط§ط² ط­ط¯ ع©ظ†ط¯ ط´ط¯ (ظ…ط«ظ„ط§ظ‹ ط³ط±ظˆغŒط³ ط±ط§غŒع¯ط§ظ† طھط§ط²ظ‡ ط¨غŒط¯ط§ط± ط´ط¯ظ‡)طŒ
  // ط¯ط±ط®ظˆط§ط³طھ ط¨ط¹ط¯ ط§ط² غ²غ° ط«ط§ظ†غŒظ‡ ط®ظˆط¯ط´ ظ‚ط·ط¹ ظ…غŒâ€Œط´ظˆط¯ طھط§ ط¯ع©ظ…ظ‡ ظ‡غŒع†â€Œظˆظ‚طھ ط¨ط±ط§غŒ ظ‡ظ…غŒط´ظ‡ ع¯غŒط± ظ†ع©ظ†ط¯.
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
    const err = new Error(data?.message || t("error_generic"));
    err.code = data?.code || null;
    throw err;
  }
  return data;
}

/**
 * ط¨ط±ط§غŒ ط¢ظ¾ظ„ظˆط¯ multipart (ط§ط³ع©ط±غŒظ†â€Œط´ط§طھ طھط³ع©) â€” initData ط±ط§ ط¨ظ‡â€Œطµظˆط±طھ query ظ¾ط§ط³ ظ…غŒâ€Œع©ظ†ط¯.
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
    if (error) error.textContent = "ظ¾ط§ط³ط® طµط­غŒط­ ظ†غŒط³طھ. ط¯ظˆط¨ط§ط±ظ‡ طھظ„ط§ط´ ع©ظ†.";
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
let adsController = null;
let adsCooldownTimer = null;

function adsCooldownStorageKey() {
  const user = state.user || getTelegramUser();
  const telegramId = user?.id || user?.telegram_id || "anonymous";
  return `adsCooldownUntil:${telegramId}`;
}

function getAdsCooldownSeconds() {
  const stored = Number(localStorage.getItem(adsCooldownStorageKey()) || 0);
  state.adsCooldownUntil = Number.isFinite(stored) ? stored : 0;
  return Math.max(0, Math.ceil((state.adsCooldownUntil - Date.now()) / 1000));
}

function syncAdsCooldownUI() {
  clearTimeout(adsCooldownTimer);

  const seconds = getAdsCooldownSeconds();
  const buttons = document.querySelectorAll("[data-ads-action]");

  buttons.forEach(button => {
    if (state.adsBusy) {
      button.disabled = true;
      button.textContent = t("ads_loading");
      return;
    }

    button.disabled = seconds > 0;
    button.textContent = seconds > 0
      ? t("ads_cooldown", { n: seconds })
      : t("ads_watch");
  });

  if (seconds > 0) {
    adsCooldownTimer = setTimeout(syncAdsCooldownUI, 1000);
  }
}

function startAdsCooldown() {
  const until = Date.now() + Math.max(1, Number(state.adsCooldownSeconds) || 60) * 1000;
  state.adsCooldownUntil = until;
  localStorage.setItem(adsCooldownStorageKey(), String(until));
  syncAdsCooldownUI();
}

function syncServerAdsCooldown(seconds) {
  const remaining = Math.max(0, Number(seconds) || 0);
  if (!remaining) return;

  const serverUntil = Date.now() + remaining * 1000;
  if (serverUntil > state.adsCooldownUntil) {
    state.adsCooldownUntil = serverUntil;
    localStorage.setItem(adsCooldownStorageKey(), String(serverUntil));
    syncAdsCooldownUI();
  }
}

function markAdStarted() {
  if (state.adsStarted) return;
  state.adsStarted = true;
  startAdsCooldown();
}

function setupAdsController() {
  if (adsController || !state.adsEnabled) return adsController;

  try {
    if (state.adsProvider === "tads") {
      if (!window.tads?.init || !state.adsWidgetId) return null;
      const containerId = `tads-container-${state.adsWidgetId}`;
      if (!document.getElementById(containerId)) {
        const container = document.createElement("div");
        container.id = containerId;
        container.hidden = true;
        document.body.appendChild(container);
      }
      adsController = window.tads.init({
        widgetId: state.adsWidgetId,
        type: "FULLSCREEN_REWARDED",
        debug: state.adsDebug,
        onShowReward: result => {
          console.info("TADS ad viewed:", result);
          markAdStarted();
        },
        onAdsNotFound: () => console.warn("TADS returned no ad")
      });
    } else {
      if (!window.Adsgram?.init || !state.adsBlockId) return null;
      adsController = window.Adsgram.init({
        blockId: state.adsBlockId,
        debug: state.adsDebug
      });
    }
  } catch (error) {
    console.warn("Ad provider initialization failed:", error);
  }
  return adsController;
}

async function loadAdsData() {
  try {
    if (!state.adsConfigLoaded) {
      const config = await api("/api/ads/config");
      state.adsEnabled = Boolean(config?.enabled);
      state.adsProvider = String(config?.provider || "");
      state.adsBlockId = String(config?.blockId || "");
      state.adsWidgetId = String(config?.widgetId || "");
      state.adsDebug = Boolean(config?.debug);
      state.adsCooldownSeconds = Math.max(1, Number(config?.cooldownSeconds) || 60);
      state.adsMilestones = Array.isArray(config?.milestones) ? config.milestones : [];
      state.adsConfigLoaded = true;
      setupAdsController();
    }

    if (!state.adsEnabled) return;
    const data = await api("/api/ads/me");
    state.adsWatched = Number(data?.watched) || 0;
    syncServerAdsCooldown(data?.cooldownSeconds);
    if (Array.isArray(data?.milestones)) state.adsMilestones = data.milestones;
  } catch (error) {
    console.warn("Ad progress failed:", error?.code || error?.message || error);
  }
}

function renderAdTasks() {
  if (!state.adsEnabled) {
    return `
      <div class="card adsCard adsDisabled">
        <div class="cardHeader"><div class="cardTitle">${t("ads_title")}</div></div>
        <div class="small">${t("ads_not_configured")}</div>
      </div>`;
  }

  const milestones = state.adsMilestones.length
    ? state.adsMilestones
    : [{ target: 5, reward: 10 }, { target: 15, reward: 10 }, { target: 30, reward: 20 }];
  const cooldownSeconds = getAdsCooldownSeconds();
  const adsButtonDisabled = state.adsBusy || cooldownSeconds > 0;
  const adsButtonText = state.adsBusy
    ? t("ads_loading")
    : cooldownSeconds > 0
      ? t("ads_cooldown", { n: cooldownSeconds })
      : t("ads_watch");

  const rows = milestones.map(item => {
    const target = Number(item.target) || 0;
    const watched = Math.min(state.adsWatched, target);
    const awarded = Boolean(item.awarded);
    const progress = target > 0 ? Math.min(100, (watched / target) * 100) : 0;
    return `
      <div class="adsTaskRow ${awarded ? "completed" : ""}">
        <div class="adsTaskTop">
          <strong>${t("ads_task_title", { n: formatPoints(target) })}</strong>
          <span class="adsReward">+${formatPoints(item.reward)} ${t("points_unit")}</span>
        </div>
        <div class="adsProgressTrack"><div class="adsProgressBar" style="width:${progress}%"></div></div>
        <div class="adsTaskMeta">
          <span>${awarded ? t("ads_done") : `${formatPoints(watched)} / ${formatPoints(target)} ${t("ads_ads_unit")}`}</span>
          ${awarded ? "âœ“" : ""}
        </div>
      </div>`;
  }).join("");

  return `
    <div class="card adsCard">
      <div class="cardHeader">
        <div>
          <div class="cardTitle">${t("ads_title")}</div>
          <div class="small">${t("ads_desc")}</div>
        </div>
        <div class="badge gold">${formatPoints(state.adsWatched)} ${t("ads_ads_unit")}</div>
      </div>
      <div class="adsTaskList">${rows}</div>
      <button class="primaryBtn" type="button" data-ads-action onclick="showAdsReward()" ${adsButtonDisabled ? "disabled" : ""}>
        ${adsButtonText}
      </button>
    </div>`;
}

async function showAdsReward() {
  if (state.adsBusy) return;

  const cooldownSeconds = getAdsCooldownSeconds();
  if (cooldownSeconds > 0) {
    syncAdsCooldownUI();
    toast(t("ads_cooldown", { n: cooldownSeconds }), "warning");
    return;
  }

  const controller = setupAdsController();
  if (!controller) {
    toast(state.adsEnabled ? t("ads_not_ready") : t("ads_not_configured"), "warning");
    return;
  }

  const watchedBefore = state.adsWatched;
  let counted = false;
  state.adsStarted = false;
  state.adsBusy = true;
  document.querySelectorAll("[data-ads-action]").forEach(button => {
    button.disabled = true;
    button.textContent = t("ads_loading");
  });

  try {
    const resolvedController = await Promise.resolve(controller);
    if (typeof resolvedController.showAd === "function") {
      await resolvedController.showAd();
    } else {
      await resolvedController.show();
    }

    // TADS resolves showAd once an ad is available. Do not wait for the
    // server webhook before starting the client cooldown.
    markAdStarted();

    toast(t("ads_confirming"), "normal");

    // The server callback is the source of truth; wait briefly for the provider webhook.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await loadAdsData();
      if (state.adsWatched > watchedBefore) break;
    }

    counted = state.adsWatched > watchedBefore;

    toast(
      counted ? t("ads_counted") : t("ads_waiting"),
      counted ? "success" : "warning"
    );
  } catch (error) {
    const errorText = String(error?.message || error || "");
    console.warn("Rewarded ad was not completed:", errorText);

    if (/too many/i.test(errorText)) {
      toast("ظ…ط­ط¯ظˆط¯غŒطھ TADS ظپط¹ط§ظ„ ط§ط³طھط› ط­ط¯ط§ع©ط«ط± غ±غ° طھط¨ظ„غŒط؛ ط¯ط± غ³غ° ط¯ظ‚غŒظ‚ظ‡ ظ…ط¬ط§ط² ط§ط³طھ.", "warning");
    } else if (/no ads|no ads data/i.test(errorText)) {
      toast("ط¯ط± ط­ط§ظ„ ط­ط§ط¶ط± طھط¨ظ„غŒط؛غŒ ط§ط² TADS ظ…ظˆط¬ظˆط¯ ظ†غŒط³طھ. ط¨ط¹ط¯ط§ظ‹ ط¯ظˆط¨ط§ط±ظ‡ طھظ„ط§ط´ ع©ظ†.", "warning");
    } else {
      toast(t("ads_error"), "warning");
    }
  } finally {
    state.adsBusy = false;
    await loadAdsData();
    updateHeader();
    if (state.activeTab === "daily") renderDaily();
  }
}
window.showAdsReward = showAdsReward;

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
  state.totalCheckins = Number(data?.totalCheckins) || 0;
  state.minWithdrawGram = Number(data?.minWithdrawGram) || 0;
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
    <section class="hero heroFlat">
      <div class="heroFlatTop">
        <span class="heroFlatLabel">${t("wallet_balance_title")}</span>
        <span class="levelPillFlat">${t("level_label", { n: formatPoints(currentLevel) })}</span>
      </div>
      <p class="heroFlatBalance">${formatPoints(state.points)} <span class="heroFlatUnit">${t("points_unit").toUpperCase()}</span></p>
      <div class="progressTrack"><div class="progressBar" style="width:${levelProgress}%"></div></div>
      <p class="heroFlatCaption">${formatPoints(state.points)} ${t("progress_label")} ${formatPoints(nextLevel)}</p>
    </section>

    <div class="statsGrid">
      <div class="statCard">
        <div class="statIcon">ًں”¥</div>
        <div class="statValue">${formatPoints(state.streak)}</div>
        <div class="statLabel">${t("stat_streak")}</div>
      </div>
      <div class="statCard">
        <div class="statIcon">ًںژ¯</div>
        <div class="statValue">${formatPoints(state.totalCheckins)}</div>
        <div class="statLabel">${t("stat_checkins")}</div>
      </div>
      <div class="statCard">
        <div class="statIcon">ًں‘¥</div>
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
        <div class="earningIcon">â—·</div>
        <div class="earningBody">
          <div class="earningTitle">${t("earn_daily_title")}</div>
          <div class="earningSub">${state.canCheckIn ? t("earn_daily_sub_available") : t("earn_daily_sub_done")}</div>
        </div>
        <div class="earningArrow">â€¹</div>
      </div>
      <div class="earningItem" onclick="navigate('tasks')">
        <div class="earningIcon">âœ“</div>
        <div class="earningBody">
          <div class="earningTitle">${t("earn_tasks_title")}</div>
          <div class="earningSub">${t("earn_tasks_sub", { n: formatPoints(state.tasks.length) })}</div>
        </div>
        <div class="earningArrow">â€¹</div>
      </div>
      <div class="earningItem" onclick="navigate('profile')">
        <div class="earningIcon">ًں‘¥</div>
        <div class="earningBody">
          <div class="earningTitle">${t("earn_referral_title")}</div>
          <div class="earningSub">${t("earn_referral_sub")}</div>
        </div>
        <div class="earningArrow">â€¹</div>
      </div>
      ${featuredTasks.map(task => {
        const status = completionStatus(task._id);
        const subLabel = status === "approved" ? t("task_status_done") : status === "pending" ? t("task_status_pending") : t("task_status_todo");
        return `
        <div class="earningItem" onclick="navigate('tasks')">
          <div class="earningIcon">ًںژپ</div>
          <div class="earningBody">
            <div class="earningTitle">${escapeHTML(task.title)}</div>
            <div class="earningSub">${subLabel}</div>
          </div>
          <div class="earningReward">+${formatPoints(task.reward)}</div>
          <div class="earningArrow">â€¹</div>
        </div>`;
      }).join("")}
    </div>
  `;
}

/* ================= TASKS ================= */
const TASK_ICONS = { channel: "ًں“¢", group: "ًں‘¥", link: "ًں”—", custom: "ًںژپ" };

function openTaskLinkOnly(url) {
  if (!url) return;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank");
}
window.openTaskLinkOnly = openTaskLinkOnly;

/** طھط³ع©â€Œظ‡ط§غŒ طھظ„ع¯ط±ط§ظ…غŒ: ط¨ط±ط±ط³غŒ ط®ظˆط¯ع©ط§ط± ط¹ط¶ظˆغŒطھ ط¨ط§ API ط±ط¨ط§طھ */
async function verifyTelegramTask(taskId) {
  const button = document.querySelector(`[data-verify="${taskId}"]`);
  if (button) { button.disabled = true; button.textContent = t("task_action_verifying"); }

  try {
    const result = await api(`/api/tasks/${taskId}/claim`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey(`task:${taskId}`) }
    });
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
    } else if (error.code === "VERIFY_CONFIG_ERROR") {
      // ط®ط·ط§غŒ ظˆط§ظ‚ط¹غŒ طھظ†ط¸غŒظ…ط§طھ (chatId ط§ط´طھط¨ط§ظ‡طŒ ط±ط¨ط§طھ ط¨ط¯ظˆظ† ط¯ط³طھط±ط³غŒ ظˆ ...) â€” ظ¾غŒط§ظ… ط¯ظ‚غŒظ‚ ط±ط§ ظ†ط´ط§ظ† ط¨ط¯ظ‡
      toast(error.message, "error");
    } else {
      toast(translateServerMessage(error.code, error.message), "error");
    }
    if (button) { button.disabled = false; button.textContent = t("task_action_verify"); }
  }
}
window.verifyTelegramTask = verifyTelegramTask;

function renderTasks() {
  const content = $("#content");

  if (state.tasks.length === 0) {
    content.innerHTML = `
      <div class="sectionHeader"><h2 class="sectionTitle">${t("tasks_title")}</h2></div>
      <div class="card emptyState">
        <div class="emptyIcon">ًں—‚ï¸ڈ</div>
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
        const icon = TASK_ICONS[task.type] || "ًںژپ";
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
const WHEEL_SIZE = 260;
const WHEEL_CENTER = WHEEL_SIZE / 2;

const SPIN_SEGMENTS_UI = [
  { icon: "ًںھ™", value: "10", color1: "#8b5cf6", color2: "#6d28d9" },
  { icon: "ًںھ™", value: "20", color1: "#a78bfa", color2: "#7c3aed" },
  { icon: "ًں’ژ", value: "50", color1: "#f5c451", color2: "#c98a12" },
  { icon: "ًںڈ†", value: "30", color1: "#22c55e", color2: "#15803d" },
  { icon: "ًں’¨", value: "0", color1: "#3a3f4d", color2: "#1e2028" },
  { icon: "ًںژ،", value: "+1", color1: "#38bdf8", color2: "#0284c7" }
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

/** ط¨ط±ع†ط³ط¨â€Œظ‡ط§ ط¯ط§ط®ظ„ ط®ظˆط¯ظگ ط¯غŒط³ع© ظ‚ط±ط§ط± ظ…غŒâ€Œع¯غŒط±ظ†ط¯ طھط§ ظ‡ظ†ع¯ط§ظ… ع†ط±ط®ط´طŒ ظ‡ظ…ط±ط§ظ‡ ط±ظ†ع¯â€Œظ‡ط§ ط¨ع†ط±ط®ظ†ط¯ */
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

/** ظ†ظ‚ط·ظ‡â€Œظ‡ط§غŒ طھط²ط¦غŒظ†غŒ ظ†ظˆط±ط§ظ†غŒ ط¯ظˆط± ع©ط§ط¯ط± ع¯ط±ط¯ظˆظ†ظ‡ (ط«ط§ط¨طھطŒ ظ†ظ…غŒâ€Œع†ط±ط®ظ†ط¯) */
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

async function doSpin() {
  const button = $("#spinBtn");
  if (state.spinChances <= 0) {
    toast(t("spin_no_chances"), "warning");
    return;
  }
  if (button) button.disabled = true;

  try {
    const result = await api("/api/points/spin", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey("spin") }
    });
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
    const result = await api("/api/points/checkin", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey("checkin") }
    });
    state.points = Number(result.points) || state.points;
    state.streak = Number(result.streak) || state.streak;
    state.spinChances = Number(result.spinChances) || state.spinChances;
    state.canCheckIn = false;
    state.totalCheckins += 1;
    state.nextResetAt = Number(result.nextResetAt) || state.nextResetAt;

    haptic("success");
    toast(`+${formatPoints(result.earned)} ${t("points_unit")} ًںژ‰`, "success");
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
        <span class="dayNum">${isFilled ? "âœ“" : dayNumber}</span>
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
        <div class="wheelPointer">â–¼</div>
        <div class="wheelDisc" id="wheelDisc" style="background:${buildWheelGradient()}">
          ${buildWheelLabels()}
        </div>
        <div class="wheelHub"><span>âœ¦</span></div>
      </div>
      <p style="font-size:11px;margin:14px 0 4px">${t("spin_chances_label")}: <b id="spinChancesValue">${formatPoints(state.spinChances)}</b></p>
      <button id="spinBtn" class="primaryBtn wheelSpinBtn" type="button" ${state.spinChances <= 0 ? "disabled" : ""} onclick="doSpin()">
        ًںژ، ${t("spin_button")}
      </button>
    </div>

    <div class="streakBox">
      <div class="streakFire">ًں”¥</div>
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

    ${renderAdTasks()}
  `;

  startResetCountdown();
  syncAdsCooldownUI();
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
    const result = await api("/api/points/withdraw", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey("withdrawal") },
      body: { gram, address }
    });
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

/* ---- Exchange: Points -> GRAM ---- */
function showExchange() {
  if (state.points <= 0) {
    toast(t("error_generic"), "warning");
    return;
  }
  const overlay = $("#exchangeOverlay");
  const input = $("#exchangePoints");
  const error = $("#exchangeError");
  if (input) input.value = "";
  if (error) error.textContent = "";
  updateExchangePreview();
  if (overlay) overlay.style.display = "flex";
}
window.showExchange = showExchange;

function hideExchange() {
  const overlay = $("#exchangeOverlay");
  if (overlay) overlay.style.display = "none";
}
window.hideExchange = hideExchange;

function updateExchangePreview() {
  const input = $("#exchangePoints");
  const preview = $("#exchangePreview");
  if (!input || !preview) return;
  const points = Number(input.value) || 0;
  const gram = points * state.rate;
  preview.textContent = `${t("exchange_result_label")}: ${formatNumber(gram, 6)} GRAM`;
}
window.updateExchangePreview = updateExchangePreview;

async function submitExchange() {
  const input = $("#exchangePoints");
  const error = $("#exchangeError");
  const button = $("#submitExchange");

  const points = Number(input?.value);
  if (!points || points <= 0) {
    if (error) error.textContent = t("error_generic");
    return;
  }
  if (points > state.points) {
    if (error) error.textContent = t("error_generic");
    return;
  }

  if (button) button.disabled = true;
  try {
    const result = await api("/api/points/exchange", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey("exchange") },
      body: { points }
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

/* ---- Exchange: GRAM -> Points ---- */
function showGramToPoints() {
  if (state.gramBalance <= 0) {
    toast(t("error_generic"), "warning");
    return;
  }
  const overlay = $("#gramToPointsOverlay");
  const input = $("#gramToPointsAmount");
  const error = $("#gramToPointsError");
  const title = $("#gramToPointsTitle");
  const label = document.querySelector("#gramToPointsOverlay .fieldLabel");
  const button = $("#submitGramToPoints");
  if (input) input.value = "";
  if (error) error.textContent = "";
  if (title) title.textContent = t("gram_to_points_modal_title");
  if (label) label.textContent = t("gram_to_points_label");
  if (button) button.textContent = t("gram_to_points_submit");
  updateGramToPointsPreview();
  if (overlay) overlay.style.display = "flex";
}
window.showGramToPoints = showGramToPoints;

function hideGramToPoints() {
  const overlay = $("#gramToPointsOverlay");
  if (overlay) overlay.style.display = "none";
}
window.hideGramToPoints = hideGramToPoints;

function updateGramToPointsPreview() {
  const input = $("#gramToPointsAmount");
  const preview = $("#gramToPointsPreview");
  if (!input || !preview) return;
  const gram = Number(input.value) || 0;
  const points = state.rate > 0 ? Math.floor(gram / state.rate) : 0;
  preview.textContent = `${t("gram_to_points_result_label")}: ${formatPoints(points)}`;
}
window.updateGramToPointsPreview = updateGramToPointsPreview;

async function submitGramToPoints() {
  const input = $("#gramToPointsAmount");
  const error = $("#gramToPointsError");
  const button = $("#submitGramToPoints");
  const gram = Number(input?.value);
  if (!gram || gram <= 0 || gram > state.gramBalance) {
    if (error) error.textContent = t("error_generic");
    return;
  }

  if (button) button.disabled = true;
  try {
    const result = await api("/api/points/convert-to-points", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey("gram-to-points") },
      body: { gram }
    });
    state.points = Number(result.points) ?? state.points;
    state.gramBalance = Number(result.gramBalance) ?? state.gramBalance;
    haptic("success");
    toast(result.message, "success");
    hideGramToPoints();
    updateHeader();
    renderWallet();
  } catch (err) {
    if (error) error.textContent = translateServerMessage(err.code, err.message);
    haptic("error");
  } finally {
    if (button) button.disabled = false;
  }
}
window.submitGramToPoints = submitGramToPoints;

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
  pending: { cls: "warning" }, approved: { cls: "success" }, rejected: { cls: "danger" }, paid: { cls: "success" }
};

function renderWallet() {
  const content = $("#content");

  content.innerHTML = `
    <div class="sectionHeader"><h2 class="sectionTitle">${t("wallet_title")}</h2></div>

    <div class="walletBalanceGrid">
      <div class="walletBalanceCard gold">
        <div class="walletBalanceIcon">ًںھ™</div>
        <div class="walletBalanceLabel">${t("wallet_points_card_title")}</div>
        <div class="walletBalanceValue">${formatPoints(state.points)}</div>
      </div>
      <div class="walletBalanceCard blue">
        <div class="walletBalanceIcon">ًں’ژ</div>
        <div class="walletBalanceLabel">${t("wallet_gram_card_title")}</div>
        <div class="walletBalanceValue">${formatNumber(state.gramBalance, 6)}</div>
      </div>
    </div>

    <div class="walletActionsGrid">
      <button class="walletActionBtn" type="button" onclick="showDeposit()">
        <span class="walletActionIcon">ï¼‹</span>
        <span>${t("wallet_deposit_button")}</span>
      </button>
      <button class="walletActionBtn" type="button" onclick="showExchange()">
        <span class="walletActionIcon">â‡„</span>
        <span>${t("wallet_exchange_button")}</span>
      </button>
      <button class="walletActionBtn" type="button" onclick="showWithdraw()">
        <span class="walletActionIcon">â‍¤</span>
        <span>${t("wallet_withdraw_button")}</span>
      </button>
    </div>

    <div class="card">
      <p style="font-size:11px;margin-bottom:0">${t("wallet_rate_label", { rate: formatNumber(state.rate, 6) })} â€¢ ${t("wallet_min_withdraw_note", { n: formatNumber(state.minWithdrawGram, 6) })}</p>
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
            <div class="historyAmount">${formatNumber(item.cryptoAmount, 6)} GRAM</div>
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
  const text = "ًںژپ";
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  } else if (navigator.share) {
    navigator.share({ text, url: link }).catch(() => {});
  } else {
    copyReferralLink();
  }
}
window.shareReferralLink = shareReferralLink;

let profileView = "menu"; // menu | referral | leaderboard | history
let transactionHistory = [];

function setProfileView(view) {
  profileView = view;
  renderProfile().catch(error => {
    console.error("Profile view failed:", error);
    const content = $("#content");
    if (content) content.innerHTML = `<div class="card emptyState"><div class="emptyDesc">${escapeHTML(error.message || t("error_generic"))}</div></div>`;
  });
}
window.setProfileView = setProfileView;

async function loadTransactionHistory() {
  const data = await api("/api/points/history?limit=100");
  transactionHistory = Array.isArray(data?.transactions)
    ? data.transactions
    : Array.isArray(data?.entries)
      ? data.entries
      : [];
}

function transactionTypeLabel(type) {
  return t(`transaction_type_${type}`) || type || "â€”";
}

function transactionDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "â€”";
  const locale = state.language === "en" ? "en-US" : state.language === "ps" ? "ps-AF" : "fa-AF";
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "medium" });
}

function renderProfileHistory() {
  const rows = transactionHistory.map(item => {
    const unitLabel = item.unit === "Gram" ? t("history_gram_unit") : t("history_point_unit");
    const amount = item.unit === "Gram"
      ? formatNumber(item.amount, 6)
      : formatPoints(item.amount);
    const direction = item.direction || "neutral";
    const directionLabel = direction === "increase"
      ? t("history_increase")
      : direction === "decrease"
        ? t("history_decrease")
        : t("history_neutral");
    const sign = direction === "increase" ? "+" : direction === "decrease" ? "âˆ’" : "";
    const transactionId = String(item.transactionId || item._id || "â€”");
    const userId = String(item.userId || "â€”");
    return `
      <div class="transactionItem">
        <div class="transactionTop">
          <div class="transactionDescription">${escapeHTML(item.description || transactionTypeLabel(item.type))}</div>
          <div class="transactionAmount ${escapeHTML(direction)}">${sign}${amount} ${unitLabel}</div>
        </div>
        <div class="transactionMeta historyMeta">${directionLabel} â€¢ ${escapeHTML(transactionTypeLabel(item.type))}</div>
        <div class="transactionDetails">
          <div>${escapeHTML(t("history_transaction_id"))}: ${escapeHTML(transactionId)}</div>
          <div>${escapeHTML(t("history_user_id"))}: ${escapeHTML(userId)}</div>
          <div class="transactionDate" title="${escapeHTML(String(item.createdAt || ""))}">${escapeHTML(t("history_date"))}: ${escapeHTML(transactionDate(item.createdAt))}</div>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="sectionHeader">
      <button class="sectionMore" type="button" onclick="setProfileView('menu')">${t("referral_back")}</button>
      <h2 class="sectionTitle">${t("history_title")}</h2>
      <button class="sectionMore" type="button" onclick="setProfileView('history')">â†»</button>
    </div>
    <div class="card transactionList">
      ${rows || `<div class="emptyState" style="padding:24px 0"><div class="emptyDesc">${t("history_empty")}</div></div>`}
    </div>
  `;
}

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
        <div class="profileSubLg">${formatPoints(state.points)} ${t("points_unit")} â€¢ ${formatPoints(state.invitedCount)}</div>
      </div>
    </div>

    <div class="card">
      <div class="profileList">
        <div class="profileItem" onclick="setProfileView('referral')">
          <div class="profileIcon">ًں‘¥</div>
          <div class="profileText">${t("menu_referral")}</div>
          <div class="profileChevron">â€¹</div>
        </div>
        <div class="profileItem" onclick="setProfileView('leaderboard')">
          <div class="profileIcon">ًںڈ†</div>
          <div class="profileText">${t("menu_leaderboard")}</div>
          <div class="profileChevron">â€¹</div>
        </div>
        <div class="profileItem" onclick="setProfileView('history')">
          <div class="profileIcon">ًں§¾</div>
          <div class="profileText">${t("menu_history")}</div>
          <div class="profileChevron">â€¹</div>
        </div>
        <div class="profileItem" onclick="showTerms()">
          <div class="profileIcon">ًں“œ</div>
          <div class="profileText">${t("menu_terms")}</div>
          <div class="profileChevron">â€¹</div>
        </div>
        <div class="profileItem" onclick="showLanguageOverlay()">
          <div class="profileIcon">ًںŒگ</div>
          <div class="profileText">${t("menu_language")} â€” ${langNames[state.language]}</div>
          <div class="profileChevron">â€¹</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="themeRow">
        <div style="display:flex;align-items:center;gap:10px">
          <span id="themeIcon">${theme === "dark" ? "ًںŒ™" : "âک€ï¸ڈ"}</span>
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
        <span class="referralCodeText">${escapeHTML(state.referralCode || "â€”")}</span>
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
                <div class="historyAmount">${escapeHTML(person.firstName || person.username || "â€”")}</div>
                <div class="historyMeta">${timeAgo(person.createdAt)} â€¢ ID ${escapeHTML(person.telegramId)}</div>
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
    const isMe = state.user && String(person.telegramId) === String(state.user.telegramId);
    return `
      <div class="leaderboardItem ${isMe ? "me" : ""}">
        <div class="rankBadge ${rankClass}">${formatPoints(rank)}</div>
        <div class="leaderName">${escapeHTML(person.firstName || person.username || "â€”")}</div>
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
  if (profileView === "history") {
    content.innerHTML = `<div class="loading" style="height:300px"></div>`;
    await loadTransactionHistory();
  }
  if (profileView === "referral") {
    content.innerHTML = renderProfileReferral();
  } else if (profileView === "leaderboard") {
    content.innerHTML = renderProfileLeaderboard();
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
      await Promise.all([loadUserData(), loadAdsData()]);
      renderDaily();
    } else if (state.activeTab === "wallet") {
      await loadUserData();
      renderWallet();
    } else if (state.activeTab === "profile") {
      profileView = "menu";
      await Promise.all([loadUserData(), loadReferralData()]);
      await renderProfile();
    }
  } catch (error) {
    console.error("Render tab failed:", error);
    $("#content").innerHTML = `
      <div class="card emptyState">
        <div class="emptyIcon">âڑ ï¸ڈ</div>
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