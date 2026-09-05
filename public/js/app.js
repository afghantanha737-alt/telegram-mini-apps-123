/* =========================================================
   POINTS REWARDS — PREMIUM TELEGRAM MINI APP
   File: public/js/app.js
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
  user: null,
  points: 0,
  estimatedCryptoValue: 0,
  rate: 0,
  streak: 0,
  canCheckIn: false,
  spinChances: 0,
  totalCheckins: 0,
  minWithdrawPoints: 1000,
  referralCode: "",
  shareLink: "",
  invitedCount: 0,
  invited: [],
  tasks: [],
  completions: [],
  leaderboard: [],
  myRank: null,
  loading: false,
  captchaA: 0,
  captchaB: 0,
  initialized: false
};

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
  if (label) label.textContent = theme === "dark" ? "حالت تاریک" : "حالت روشن";
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
  return new Intl.NumberFormat("fa-IR").format(Math.floor(Number(value) || 0));
}
function formatNumber(value, decimals = 4) {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: decimals }).format(Number(value) || 0);
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
  if (diffSeconds < 60) return "همین الان";
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${formatPoints(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${formatPoints(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  return `${formatPoints(days)} روز پیش`;
}

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
    throw new Error("اتصال به سرور برقرار نشد.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || "خطایی در سرور رخ داد.");
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

/* ================= HEADER ================= */
function updateHeader() {
  const telegramUser = getTelegramUser();
  const user = state.user || telegramUser || {};
  const firstName = user.first_name || user.firstName || "دوست عزیز";

  const avatar = $("#avatar");
  const greet = $("#greetName");
  const points = $("#pointsDisplay");

  if (avatar) {
    avatar.textContent = getInitials(user);
    if (user.photo_url) avatar.innerHTML = `<img src="${escapeHTML(user.photo_url)}" alt="">`;
  }
  if (greet) greet.textContent = `سلام ${escapeHTML(firstName)} 👋`;
  if (points) points.textContent = `${formatPoints(state.points)} پوینت`;
}

/* ================= NAVIGATION ================= */
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
  if (question) question.textContent = `${formatPoints(state.captchaA)} + ${formatPoints(state.captchaB)} = ؟`;
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
  toast("تأیید امنیتی با موفقیت انجام شد.", "success");
  if (!termsAccepted()) showTerms();
  await boot();
}
window.submitCaptcha = submitCaptcha;

/* ================= DATA LOADERS ================= */
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
          <div class="heroEyebrow">PREMIUM REWARDS</div>
          <h1 class="heroTitle">امتیاز جمع کن،<br>پاداش بگیر.</h1>
          <p class="heroDescription">با انجام فعالیت‌های ساده، امتیاز بیشتری به دست بیاور.</p>
        </div>
        <div class="badge gold">LEVEL ${formatPoints(currentLevel)}</div>
      </div>
      <div class="heroBalance">
        <div class="balanceLabel">موجودی فعلی</div>
        <div class="balanceValue">${formatPoints(state.points)} <span class="balanceUnit">POINT</span></div>
      </div>
      <div class="progressWrap">
        <div class="progressMeta">
          <span>پیشرفت سطح</span>
          <span>${formatPoints(state.points)} / ${formatPoints(nextLevel)}</span>
        </div>
        <div class="progressTrack"><div class="progressBar" style="width:${levelProgress}%"></div></div>
      </div>
      <div class="heroActions">
        <button class="heroAction" type="button" onclick="navigate('tasks')">⚡ کسب امتیاز</button>
        <button class="heroAction" type="button" onclick="navigate('wallet')">◇ کیف پول</button>
      </div>
    </section>

    <div class="statsGrid">
      <div class="statCard">
        <div class="statIcon">🔥</div>
        <div class="statValue">${formatPoints(state.streak)}</div>
        <div class="statLabel">استریک</div>
      </div>
      <div class="statCard">
        <div class="statIcon">🎯</div>
        <div class="statValue">${formatPoints(state.totalCheckins)}</div>
        <div class="statLabel">ورود روزانه</div>
      </div>
      <div class="statCard">
        <div class="statIcon">👥</div>
        <div class="statValue">${formatPoints(state.invitedCount)}</div>
        <div class="statLabel">دعوت‌شده</div>
      </div>
    </div>

    <div class="sectionHeader">
      <h2 class="sectionTitle">سریع‌ترین راه‌های کسب امتیاز</h2>
      <button class="sectionMore" type="button" onclick="navigate('tasks')">مشاهده همه</button>
    </div>

    <div class="earningList">
      <div class="earningItem" onclick="navigate('daily')">
        <div class="earningIcon">◷</div>
        <div class="earningBody">
          <div class="earningTitle">ورود روزانه</div>
          <div class="earningSub">${state.canCheckIn ? "امروز هنوز ثبت نکرده‌ای" : "امروز قبلاً دریافت شد"}</div>
        </div>
        <div class="earningReward">+ پوینت</div>
        <div class="earningArrow">‹</div>
      </div>
      <div class="earningItem" onclick="navigate('tasks')">
        <div class="earningIcon">✓</div>
        <div class="earningBody">
          <div class="earningTitle">انجام تسک‌ها</div>
          <div class="earningSub">${formatPoints(state.tasks.length)} تسک فعال</div>
        </div>
        <div class="earningReward">متغیر</div>
        <div class="earningArrow">‹</div>
      </div>
      <div class="earningItem" onclick="navigate('profile')">
        <div class="earningIcon">👥</div>
        <div class="earningBody">
          <div class="earningTitle">دعوت از دوستان</div>
          <div class="earningSub">لینک اختصاصی خودت را به اشتراک بگذار</div>
        </div>
        <div class="earningReward">+ پوینت</div>
        <div class="earningArrow">‹</div>
      </div>
      ${featuredTasks.map(task => {
        const status = completionStatus(task._id);
        return `
        <div class="earningItem" onclick="navigate('tasks')">
          <div class="earningIcon">🎁</div>
          <div class="earningBody">
            <div class="earningTitle">${escapeHTML(task.title)}</div>
            <div class="earningSub">${status === "approved" ? "انجام شده" : status === "pending" ? "در انتظار بررسی" : "هنوز انجام نشده"}</div>
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

async function claimTask(taskId) {
  const button = document.querySelector(`[data-claim="${taskId}"]`);
  if (button) button.disabled = true;

  try {
    const result = await api(`/api/tasks/${taskId}/claim`, { method: "POST" });
    haptic(result.status === "approved" ? "success" : "warning");
    toast(result.message, result.status === "approved" ? "success" : "warning");
    state.points = Number(result.points) || state.points;
    await loadTasks();
    updateHeader();
    renderTasks();
  } catch (error) {
    haptic("error");
    toast(error.message, "error");
    if (button) button.disabled = false;
  }
}
window.claimTask = claimTask;

function openTaskLink(url, taskId) {
  if (url) {
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, "_blank");
  }
  setTimeout(() => claimTask(taskId), 600);
}
window.openTaskLink = openTaskLink;

function renderTasks() {
  const content = $("#content");

  if (state.tasks.length === 0) {
    content.innerHTML = `
<div class="sectionHeader"><h2 class="sectionTitle">تسک‌های امروز</h2></div>
      <div class="card emptyState">
        <div class="emptyIcon">🗂️</div>
        <div class="emptyTitle">فعلاً تسکی موجود نیست</div>
        <div class="emptyDesc">به‌زودی تسک‌های جدید اضافه می‌شود.</div>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="sectionHeader"><h2 class="sectionTitle">تسک‌های امروز</h2></div>
    <div class="taskList">
      ${state.tasks.map(task => {
        const status = completionStatus(task._id);
        const icon = TASK_ICONS[task.type] || "🎁";
        let actionHtml;

        if (status === "approved") {
          actionHtml = `<button class="taskAction done" disabled>انجام شد</button>`;
        } else if (status === "pending") {
          actionHtml = `<button class="taskAction pending" disabled>در بررسی</button>`;
        } else if (task.url) {
          actionHtml = `<button class="taskAction" data-claim="${task._id}" onclick="openTaskLink('${task.url.replaceAll("'", "\\'")}','${task._id}')">انجام بده</button>`;
        } else {
          actionHtml = `<button class="taskAction" data-claim="${task._id}" onclick="claimTask('${task._id}')">دریافت</button>`;
        }

        return `
        <div class="taskItem">
          <div class="taskIcon">${icon}</div>
          <div class="taskBody">
            <div class="taskTitle">${escapeHTML(task.title)}</div>
            ${task.description ? `<div class="taskDesc">${escapeHTML(task.description)}</div>` : ""}
            <div class="taskReward">+${formatPoints(task.reward)} پوینت</div>
          </div>
          ${actionHtml}
        </div>`;
      }).join("")}
    </div>
  `;
}

/* ================= DAILY ================= */
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

    haptic("success");
    toast(`${formatPoints(result.earned)} پوینت دریافت کردی! 🎉`, "success");
    if (result.gotSpin) {
      setTimeout(() => toast("یک شانس چرخ‌گردون هم گرفتی! 🎡", "success"), 1200);
    }

    updateHeader();
    renderDaily();
  } catch (error) {
    haptic("error");
    toast(error.message, "error");
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
        <span>روز ${formatPoints(dayNumber)}</span>
      </div>`;
  }).join("");

  content.innerHTML = `
    <div class="sectionHeader"><h2 class="sectionTitle">پاداش روزانه</h2></div>

    <div class="streakBox">
      <div class="streakFire">🔥</div>
      <div>
        <div class="streakValue">${formatPoints(state.streak)} روز</div>
        <div class="streakLabel">استریک فعلی — هر ۷ روز پیوسته یک شانس چرخ‌گردون هدیه می‌گیری</div>
      </div>
    </div>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">📅 تقویم هفتگی</div>
      </div>
      <div class="dailyGrid">${dayCells}</div>
      <button
        id="checkinBtn"
        class="primaryBtn"
        type="button"
        ${state.canCheckIn ? "" : "disabled"}
        onclick="doCheckIn()"
      >
        ${state.canCheckIn ? "دریافت پاداش امروز" : "امروز قبلاً دریافت شد ✓"}
      </button>
    </div>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">🎡 شانس چرخ‌گردون</div>
        <div class="badge gold">${formatPoints(state.spinChances)}</div>
      </div>
      <p style="font-size:11px;margin-bottom:0">
        با استریک ۷ روزه، ۱۴ روزه و همینطور بیشتر، شانس چرخ‌گردون هدیه دریافت می‌کنی.
      </p>
    </div>
  `;
}

/* ================= WALLET ================= */
function showWithdraw() {
  if (state.points < state.minWithdrawPoints) {
    toast(`حداقل موجودی برای برداشت ${formatPoints(state.minWithdrawPoints)} پوینت است.`, "warning");
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
    if (error) error.textContent = "مقدار پوینت را درست وارد کن.";
    return;
  }
  if (address.length < 6) {
    if (error) error.textContent = "آدرس کیف پول را کامل وارد کن.";
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
    if (error) error.textContent = err.message;
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

const WITHDRAW_STATUS_FA = {
  pending: { label: "در انتظار", cls: "warning" },
  approved: { label: "تأیید شد", cls: "success" },
  rejected: { label: "رد شد", cls: "danger" },
  paid: { label: "پرداخت شد", cls: "success" }
};

function renderWallet() {
  const content = $("#content");

  content.innerHTML = `
    <div class="sectionHeader"><h2 class="sectionTitle">کیف پول</h2></div>

    <section class="walletHero card">
      <div class="balanceLabel">ارزش تخمینی</div>
      <div class="walletCryptoValue">${formatNumber(state.estimatedCryptoValue)}</div>
      <div class="walletRate">نرخ فعلی: هر پوینت ≈ ${formatNumber(state.rate, 6)}</div>
      <div class="walletActions">
        <button class="primaryBtn" type="button" onclick="showWithdraw()">برداشت</button>
        <button class="secondaryBtn" type="button" onclick="navigate('tasks')">افزایش پوینت</button>
      </div>
    </section>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">موجودی پوینت</div>
        <div class="badge gold">${formatPoints(state.points)}</div>
      </div>
      <p style="font-size:11px;margin-bottom:0">
        حداقل مقدار برای ثبت درخواست برداشت: ${formatPoints(state.minWithdrawPoints)} پوینت.
      </p>
    </div>

    <div class="card" id="withdrawHistoryCard">
      <div class="cardHeader"><div class="cardTitle">تاریخچه برداشت</div></div>
      <div id="withdrawHistoryList">
        <div class="loading" style="height:60px"></div>
      </div>
    </div>
  `;

  loadWalletHistory().then(() => {
    const list = $("#withdrawHistoryList");
    if (!list) return;
    if (walletHistory.length === 0) {
      list.innerHTML = `<div class="emptyState" style="padding:20px 0"><div class="emptyDesc">هنوز درخواست برداشتی ثبت نشده است.</div></div>`;
      return;
    }
    list.innerHTML = walletHistory.map(item => {
      const statusInfo = WITHDRAW_STATUS_FA[item.status] || { label: item.status, cls: "" };
      return `
        <div class="historyItem">
          <div>
            <div class="historyAmount">${formatPoints(item.pointsSpent)} پوینت</div>
            <div class="historyMeta">${timeAgo(item.createdAt)}</div>
          </div>
          <div class="badge ${statusInfo.cls}">${statusInfo.label}</div>
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
    toast("لینک دعوت کپی شد.", "success");
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
  const text = "بیا با من به این ربات امتیاز و پاداش بپیوند! 🎁";
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
  const firstName = user.first_name || user.firstName || "دوست عزیز";
  const theme = getTheme();

  return `
    <div class="card profileHeaderCard">
      <div class="profileAvatarLg">
        ${user.photo_url ? `<img src="${escapeHTML(user.photo_url)}" alt="">` : escapeHTML(getInitials(user))}
      </div>
      <div>
        <div class="profileNameLg">${escapeHTML(firstName)}</div>
        <div class="profileSubLg">${formatPoints(state.points)} پوینت • ${formatPoints(state.invitedCount)} دعوت</div>
      </div>
    </div>

    <div class="card">
      <div class="profileList">
        <div class="profileItem" onclick="setProfileView('referral')">
          <div class="profileIcon">👥</div>
          <div class="profileText">دعوت دوستان</div>
          <div class="profileChevron">‹</div>
        </div>
        <div class="profileItem" onclick="setProfileView('leaderboard')">
          <div class="profileIcon">🏆</div>
          <div class="profileText">جدول امتیازات برتر</div>
          <div class="profileChevron">‹</div>
        </div>
        <div class="profileItem" onclick="showTerms()">
          <div class="profileIcon">📜</div>
          <div class="profileText">قوانین و شرایط</div>
          <div class="profileChevron">‹</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="themeRow">
        <div style="display:flex;align-items:center;gap:10px">
          <span id="themeIcon">${theme === "dark" ? "🌙" : "☀️"}</span>
          <span id="themeLabel" style="font-size:13px;font-weight:700">${theme === "dark" ? "حالت تاریک" : "حالت روشن"}</span>
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
      <button class="sectionMore" type="button" onclick="setProfileView('menu')">‹ بازگشت</button>
      <h2 class="sectionTitle">دعوت دوستان</h2>
      <span></span>
    </div>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">🎁 کد اختصاصی تو</div>
        <div class="badge success">+ پوینت به ازای هر نفر</div>
      </div>
      <div class="referralCodeBox">
        <span class="referralCodeText">${escapeHTML(state.referralCode || "—")}</span>
        <button class="copyBtn" type="button" onclick="copyReferralLink()">کپی لینک</button>
      </div>
      <button class="primaryBtn" type="button" onclick="shareReferralLink()">اشتراک‌گذاری لینک دعوت</button>
    </div>

    <div class="card">
      <div class="cardHeader">
        <div class="cardTitle">دوستان دعوت‌شده</div>
        <div class="badge gold">${formatPoints(state.invitedCount)}</div>
      </div>
      ${state.invited.length === 0
        ? `<div class="emptyState" style="padding:20px 0"><div class="emptyDesc">هنوز کسی را دعوت نکرده‌ای.</div></div>`
        : state.invited.map(person => `
          <div class="historyItem">
            <div>
              <div class="historyAmount">${escapeHTML(person.firstName || person.username || "کاربر")}</div>
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
        <div class="leaderName">${escapeHTML(person.firstName || person.username || "کاربر")}</div>
        <div class="leaderPoints">${formatPoints(person.points)}</div>
      </div>`;
  }).join("");

  return `
    <div class="sectionHeader">
      <button class="sectionMore" type="button" onclick="setProfileView('menu')">‹ بازگشت</button>
      <h2 class="sectionTitle">جدول امتیازات برتر</h2>
      <span></span>
    </div>

    ${state.myRank ? `
      <div class="card" style="text-align:center">
        <div class="cardSubtitle">رتبه فعلی تو</div>
        <div style="font-size:24px;font-weight:900;margin-top:4px">#${formatPoints(state.myRank)}</div>
      </div>` : ""
    }

    ${state.leaderboard.length === 0
      ? `<div class="card emptyState"><div class="emptyDesc">هنوز داده‌ای برای نمایش نیست.</div></div>`
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
        <div class="emptyTitle">مشکلی پیش آمد</div>
        <div class="emptyDesc">${escapeHTML(error.message || "لطفاً دوباره تلاش کن.")}</div>
        <button class="secondaryBtn" style="margin-top:14px" onclick="renderCurrentTab()">تلاش دوباره</button>
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
  updateHeader();

  if (!captchaPassed()) {
    showCaptcha();
    return;
  }
  if (!termsAccepted()) {
    showTerms();
  }

  state.initialized = true;
  await navigate("home");
}

document.addEventListener("DOMContentLoaded", () => {
  boot();
});