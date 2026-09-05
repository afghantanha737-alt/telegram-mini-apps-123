/* =========================================================
   POINTS REWARDS — PREMIUM TELEGRAM MINI APP
   File: public/js/app.js
========================================================= */

"use strict";

/* =========================================================
   TELEGRAM WEB APP
========================================================= */

const tg = window.Telegram?.WebApp || null;

if (tg) {
  try {
    tg.ready();
    tg.expand();

    if (typeof tg.disableVerticalSwipes === "function") {
      tg.disableVerticalSwipes();
    }

    document.body.classList.add("telegram-mobile");

    if (tg.setHeaderColor) {
      tg.setHeaderColor("#050609");
    }

    if (tg.setBackgroundColor) {
      tg.setBackgroundColor("#050609");
    }
  } catch (error) {
    console.warn("Telegram WebApp initialization failed:", error);
  }
}


/* =========================================================
   GLOBAL STATE
========================================================= */

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

  referralCode: "",
  invitedCount: 0,

  tasks: [],
  completions: [],

  leaderboard: [],
  myRank: null,

  loading: false,

  captchaA: 0,
  captchaB: 0,

  initialized: false
};


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => Array.from(
  document.querySelectorAll(selector)
);


/* =========================================================
   TELEGRAM INIT DATA
========================================================= */

function getInitData() {
  if (tg?.initData) {
    return tg.initData;
  }

  return "";
}

function getTelegramUser() {
  return tg?.initDataUnsafe?.user || null;
}


/* =========================================================
   LOCAL STORAGE
========================================================= */

const THEME_KEY = "miniAppTheme";

function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);

  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return "dark";
}

function applyTheme(theme) {
  const finalTheme =
    theme === "light" ? "light" : "dark";

  document.documentElement.dataset.theme = finalTheme;

  localStorage.setItem(
    THEME_KEY,
    finalTheme
  );

  updateThemeUI();
}

function toggleTheme() {
  const current = getTheme();

  applyTheme(
    current === "dark"
      ? "light"
      : "dark"
  );

  haptic("selection");
}

function updateThemeUI() {
  const icon = $("#themeIcon");
  const label = $("#themeLabel");
  const toggle = $("#themeToggle");

  const theme = getTheme();

  if (icon) {
    icon.textContent =
      theme === "dark"
        ? "🌙"
        : "☀️";
  }

  if (label) {
    label.textContent =
      theme === "dark"
        ? "حالت تاریک"
        : "حالت روشن";
  }

  if (toggle) {
    toggle.setAttribute(
      "aria-checked",
      theme === "light"
        ? "true"
        : "false"
    );
  }
}

applyTheme(getTheme());


/* =========================================================
   HAPTIC
========================================================= */

function haptic(type = "light") {
  try {
    if (!tg?.HapticFeedback) return;

    if (type === "success") {
      tg.HapticFeedback.notificationOccurred("success");
      return;
    }

    if (type === "error") {
      tg.HapticFeedback.notificationOccurred("error");
      return;
    }

    if (type === "warning") {
      tg.HapticFeedback.notificationOccurred("warning");
      return;
    }

    if (type === "selection") {
      tg.HapticFeedback.selectionChanged();
      return;
    }

    tg.HapticFeedback.impactOccurred(type);
  } catch {
    // Ignore unsupported Telegram haptics.
  }
}


/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;

function toast(message, type = "normal") {
  const el = $("#toast");

  if (!el) return;

  clearTimeout(toastTimer);

  el.textContent = message;

  el.classList.remove(
    "show",
    "success",
    "error",
    "warning"
  );

  if (type !== "normal") {
    el.classList.add(type);
  }

  requestAnimationFrame(() => {
    el.classList.add("show");
  });

  toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2800);
}


/* =========================================================
   SAFE HTML
========================================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   FORMATTERS
========================================================= */

function formatPoints(value) {
  const number = Number(value) || 0;

  return new Intl.NumberFormat("fa-IR").format(
    Math.floor(number)
  );
}

function formatNumber(value, decimals = 2) {
  const number = Number(value) || 0;

  return new Intl.NumberFormat("fa-IR", {
    maximumFractionDigits: decimals
  }).format(number);
}

function getInitials(user) {
  const first =
    user?.first_name ||
    user?.firstName ||
    "";

  const last =
    user?.last_name ||
    user?.lastName ||
    "";

  const text =
    `${first} ${last}`.trim();

  if (!text) return "A";

  return text
    .split(/\s+/)
    .map(item => item.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}


/* =========================================================
   API
========================================================= */

async function api(
  url,
  options = {}
) {
  const config = {
    ...options,
    headers: {
      ...(options.headers || {})
    }
  };

  if (
    config.body &&
    typeof config.body !== "string"
  ) {
    config.headers["Content-Type"] =
      "application/json";

    config.body = JSON.stringify(
      config.body
    );
  }

  const separator =
    url.includes("?")
      ? "&"
      : "?";

  const initData = getInitData();

  const finalUrl =
    `${url}${separator}initData=${encodeURIComponent(initData)}`;

  let response;

  try {
    response = await fetch(
      finalUrl,
      config
    );
  } catch (error) {
    throw new Error(
      "اتصال به سرور برقرار نشد."
    );
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error ||
      "خطایی در سرور رخ داد."
    );
  }

  return data;
}


/* =========================================================
   LOADING
========================================================= */

function showLoading() {
  const content = $("#content");

  if (!content) return;

  content.innerHTML = `
    <div class="loading" style="height:190px;margin-bottom:13px"></div>
    <div class="loading" style="height:95px;margin-bottom:13px"></div>
    <div class="loading" style="height:95px"></div>
  `;
}


/* =========================================================
   HEADER
========================================================= */

function updateHeader() {
  const telegramUser =
    getTelegramUser();

  const user =
    state.user ||
    telegramUser ||
    {};

  const firstName =
    user.first_name ||
    user.firstName ||
    "دوست عزیز";

  const avatar = $("#avatar");
  const greet = $("#greetName");
  const points = $("#pointsDisplay");

  if (avatar) {
    avatar.textContent =
      getInitials(user);

    if (user.photo_url) {
      avatar.innerHTML = `
        <img
          src="${escapeHTML(user.photo_url)}"
          alt=""
        >
      `;
    }
  }

  if (greet) {
    greet.textContent =
      `سلام ${firstName} 👋`;
  }

  if (points) {
    points.textContent =
      `${formatPoints(state.points)} پوینت`;
  }
}


/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {
  const buttons =
    $$("#tabbar [data-tab]");

  buttons.forEach(button => {
    button.addEventListener(
      "click",
      () => {
        const tab =
          button.dataset.tab;

        if (!tab) return;

        haptic("selection");

        navigate(tab);
      }
    );
  });
}

function updateNavigation() {
  $$("#tabbar [data-tab]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.tab ===
          state.activeTab
      );
    });
}

async function navigate(tab) {
  const validTabs = [
    "home",
    "tasks",
    "daily",
    "wallet",
    "profile"
  ];

  if (!validTabs.includes(tab)) {
    tab = "home";
  }

  state.activeTab = tab;

  updateNavigation();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  await renderCurrentTab();
}


/* =========================================================
   AUTH / TERMS / CAPTCHA
========================================================= */

function termsAccepted() {
  return localStorage.getItem(
    "termsAccepted"
  ) === "1";
}

function acceptTerms() {
  localStorage.setItem(
    "termsAccepted",
    "1"
  );

  hideTerms();
}

function showTerms() {
  const overlay =
    $("#termsOverlay");

  if (overlay) {
    overlay.style.display = "flex";
  }
}

function hideTerms() {
  const overlay =
    $("#termsOverlay");

  if (overlay) {
    overlay.style.display = "none";
  }

  localStorage.setItem(
    "termsAccepted",
    "1"
  );
}

window.hideTerms = hideTerms;

function createCaptcha() {
  state.captchaA =
    Math.floor(Math.random() * 8) + 2;

  state.captchaB =
    Math.floor(Math.random() * 8) + 1;

  const question =
    $("#captchaQuestion");

  const answer =
    $("#captchaAnswer");

  const error =
    $("#captchaError");

  if (question) {
    question.textContent =
      `${formatPoints(state.captchaA)} + ${formatPoints(state.captchaB)} = ؟`;
  }

  if (answer) {
    answer.value = "";
    answer.focus();
  }

  if (error) {
    error.textContent = "";
  }
}

function showCaptcha() {
  const overlay =
    $("#captchaOverlay");

  if (!overlay) return;

  createCaptcha();

  overlay.style.display = "flex";
}

function hideCaptcha() {
  const overlay =
    $("#captchaOverlay");

  if (overlay) {
    overlay.style.display = "none";
  }
}

async function submitCaptcha() {
  const answer =
    $("#captchaAnswer");

  const error =
    $("#captchaError");

  if (!answer) return;

  const value =
    Number(answer.value);

  if (
    value !==
    state.captchaA +
      state.captchaB
  ) {
    if (error) {
      error.textContent =
        "پاسخ صحیح نیست. دوباره تلاش کن.";
    }

    haptic("error");

    createCaptcha();

    return;
  }

  try {
    localStorage.setItem(
      "captchaPassed",
      "1"
    );

    hideCaptcha();

    haptic("success");

    toast(
      "تأیید امنیتی با موفقیت انجام شد.",
      "success"
    );
  } catch {
    toast(
      "خطایی رخ داد.",
      "error"
    );
  }
}

window.submitCaptcha =
  submitCaptcha;


/* =========================================================
   INITIAL DATA
========================================================= */

async function loadUserData() {
  const data =
    await api("/api/points/me");

  state.points =
    Number(data?.points) || 0;

  state.estimatedCryptoValue =
    Number(
      data?.estimatedCryptoValue
    ) || 0;

  state.rate =
    Number(data?.rate) || 0;

  state.streak =
    Number(data?.streak) || 0;

  state.canCheckIn =
    Boolean(data?.canCheckIn);

  state.spinChances =
    Number(data?.spinChances) || 0;

  state.totalCheckins =
    Number(data?.totalCheckins) || 0;

  if (data?.firstName) {
    state.user = {
      ...(state.user || {}),
      first_name: data.firstName
    };
  }

  updateHeader();
}


/* =========================================================
   REFERRAL DATA
========================================================= */

async function loadReferralData() {
  try {
    const data =
      await api("/api/referral/me");

    state.referralCode =
      data?.referralCode ||
      "";

    state.invitedCount =
      Number(data?.invitedCount) || 0;
  } catch (error) {
    console.warn(
      "Referral data failed:",
      error
    );
  }
}


/* =========================================================
   TASK DATA
========================================================= */

async function loadTasks() {
  try {
    const data =
      await api("/api/tasks");

    state.tasks =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.tasks)
          ? data.tasks
          : [];

    if (Array.isArray(data?.completions)) {
      state.completions =
        data.completions;
    }

    return state.tasks;
  } catch (error) {
    console.warn(
      "Tasks failed:",
      error
    );

    state.tasks = [];

    return [];
  }
}


/* =========================================================
   LEADERBOARD DATA
========================================================= */

async function loadLeaderboard() {
  try {
    const data =
      await api("/api/leaderboard/top");

    state.leaderboard =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.top)
          ? data.top
          : [];

    state.myRank =
      data?.myRank ??
      null;

    return state.leaderboard;
  } catch (error) {
    console.warn(
      "Leaderboard failed:",
      error
    );

    state.leaderboard = [];

    return [];
  }
}


/* =========================================================
   HOME
========================================================= */

function renderHome() {
  const nextLevel =
    Math.max(
      100,
      (Math.floor(state.points / 100) + 1) * 100
    );

  const currentLevel =
    Math.floor(state.points / 100) + 1;

  const previousLevel =
    (currentLevel - 1) * 100;

  const levelProgress =
    Math.min(
      100,
      Math.max(
        0,
        (
          (
            state.points -
            previousLevel
          ) /
          (
            nextLevel -
            previousLevel
          )
        ) * 100
      )
    );

  const content = $("#content");

  content.innerHTML = `

    <section class="hero">

      <div class="heroTop">

        <div>

          <div class="heroEyebrow">
            PREMIUM REWARDS
          </div>

          <h1 class="heroTitle">
            امتیاز جمع کن،
            <br>
            پاداش بگیر.
          </h1>

          <p class="heroDescription">
            با انجام فعالیت‌های ساده، امتیاز بیشتری به دست بیاور.
          </p>

        </div>

        <div class="badge gold">
          LEVEL ${formatPoints(currentLevel)}
        </div>

      </div>


      <div class="heroBalance">

        <div class="balanceLabel">
          موجودی فعلی
        </div>

        <div class="balanceValue">
          ${formatPoints(state.points)}
          <span class="balanceUnit">
            POINT
          </span>
        </div>

      </div>


      <div class="progressWrap">

        <div class="progressMeta">

          <span>
            پیشرفت سطح
          </span>

          <span>
            ${formatPoints(state.points)}
            /
            ${formatPoints(nextLevel)}
          </span>

        </div>

        <div class="progressTrack">
          <div
            class="progressBar"
            style="width:${levelProgress}%"
          ></div>
        </div>

      </div>


      <div class="heroActions">

        <button
          class="heroAction"
          type="button"
          onclick="navigate('tasks')"
        >
          ⚡ کسب امتیاز
        </button>

        <button
          class="heroAction"
          type="button"
          onclick="navigate('wallet')"
        >
          ◇ کیف پول
        </button>

      </div>

    </section>


    <div class="statsGrid">

      <div class="statCard">

        <div class="statIcon">
          🔥
        </div>

        <div class="statValue">
          ${formatPoints(state.streak)}
        </div>

        <div class="statLabel">
          استریک
        </div>

      </div>


      <div class="statCard">

        <div class="statIcon">
          🎯
        </div>

        <div class="statValue">
          ${formatPoints(state.totalCheckins)}
        </div>

        <div class="statLabel">
          ورود روزانه
        </div>

      </div>


      <div class="statCard">

        <div class="statIcon">
          👥
        </div>

        <div class="statValue">
          ${formatPoints(state.invitedCount)}
        </div>

        <div class="statLabel">
          دعوت‌شده
        </div>

      </div>

    </div>


    <div class="sectionHeader">

      <h2 class="sectionTitle">
        سریع‌ترین راه‌های کسب امتیاز
      </h2>

      <button
        class="sectionMore"
        type="button"
        onclick="navigate('tasks')"
      >
        مشاهده همه
      </button>

    </div>


    <div class="earningList">

      <div
        class="earningItem"
        onclick="navigate('daily')"
      >

        <div class="earningIcon">
          🎁
        </div>

        <div class="earningInfo">

          <div class="earningName">
            پاداش روزانه
          </div>

          <div class="earningDesc">
            هر روز وارد شو و امتیاز بگیر.
          </div>

        </div>

        <div class="earningReward">
          +۲
        </div>

      </div>


      <div
        class="earningItem"
        onclick="navigate('tasks')"
      >

        <div class="earningIcon">
          ⚡
        </div>

        <div class="earningInfo">

          <div class="earningName">
            انجام تسک‌ها
          </div>

          <div class="earningDesc">
            فعالیت‌های موجود را کامل کن.
          </div>

        </div>

        <div class="earningReward">
          +XP
        </div>

      </div>


      <div
        class="earningItem"
        onclick="navigate('profile')"
      >

        <div class="earningIcon">
          👥
        </div>

        <div class="earningInfo">

          <div class="earningName">
            دعوت دوستان
          </div>

          <div class="earningDesc">
            دوستانت را به برنامه دعوت کن.
          </div>

        </div>

        <div class="earningReward">
          REF
        </div>

      </div>

    </div>


    <div class="sectionHeader">

      <h2 class="sectionTitle">
        مسیر شروع
      </h2>

    </div>


    <div class="journey">

      <div class="journeyItem">

        <div class="journeyNumber">
          ۱
        </div>

        <div class="journeyText">

          <div class="journeyTitle">
            پاداش روزانه را دریافت کن
          </div>

          <div class="journeyDescription">
            با ورود روزانه استریک خود را بساز.
          </div>

        </div>

      </div>


      <div class="journeyItem">

        <div class="journeyNumber">
          ۲
        </div>

        <div class="journeyText">

          <div class="journeyTitle">
            تسک‌ها را کامل کن
          </div>

          <div class="journeyDescription">
            فعالیت‌های معتبر را انجام بده و امتیاز بگیر.
          </div>

        </div>

      </div>


      <div class="journeyItem">

        <div class="journeyNumber">
          ۳
        </div>

        <div class="journeyText">

          <div class="journeyTitle">
            دوستانت را دعوت کن
          </div>

          <div class="journeyDescription">
            لینک دعوت خودت را با دوستانت به اشتراک بگذار.
          </div>

        </div>

      </div>

    </div>


    <div class="card">

      <div class="cardHeader">

        <div>
          <div class="cardTitle">
            💡 یک نکته مهم
          </div>
        </div>

      </div>

      <p class="small" style="margin:0">
        فعالیت‌های واقعی و منظم بهترین راه برای افزایش
        امتیاز و حفظ امنیت حساب است.
      </p>

    </div>

  `;
}


/* =========================================================
   DAILY
========================================================= */

function renderDaily() {
  const content = $("#content");

  const days = [
    "ش",
    "ی",
    "د",
    "س",
    "چ",
    "پ",
    "ج"
  ];

  const streak =
    Math.min(
      7,
      Math.max(0, state.streak)
    );

  const daysHTML =
    days.map(
      (day, index) => {

        const active =
          index < streak
            ? "active"
            : "";

        return `
          <div class="dayBox ${active}">

            <div class="dayName">
              ${day}
            </div>

            <div class="dayCircle">
              ${
                index < streak
                  ? "✓"
                  : index + 1
              }
            </div>

          </div>
        `;
      }
    ).join("");

  content.innerHTML = `

    <section class="dailyHero">

      <div class="heroEyebrow">
        DAILY REWARD
      </div>

      <h1 class="dailyHeroTitle">
        پاداش روزانه 🎁
      </h1>

      <p class="dailyHeroDescription">
        هر روز وارد شو، استریک بساز و شانس اسپین بگیر.
      </p>

      <div class="streakBadge">
        🔥
        استریک فعلی:
        ${formatPoints(streak)}
        روز
      </div>

    </section>


    <div class="card">

      <div class="cardHeader">

        <div>
          <div class="cardTitle">
            هفته جاری
          </div>

          <div class="cardSubtitle">
            استمرار بیشتر = پاداش بیشتر
          </div>
        </div>

      </div>

      <div class="weekGrid">
        ${daysHTML}
      </div>

    </div>


    <div class="card">

      <div class="cardHeader">

        <div>

          <div class="cardTitle">
            🎁 ورود امروز
          </div>

          <div class="cardSubtitle">
            ${state.canCheckIn
              ? "پاداش امروز آماده دریافت است."
              : "امروز پاداش خود را دریافت کرده‌ای."
            }
          </div>

        </div>

        <div class="badge ${
          state.canCheckIn
            ? "gold"
            : "success"
        }">
          ${
            state.canCheckIn
              ? "READY"
              : "DONE"
          }
        </div>

      </div>


      <button
        id="dailyCheckBtn"
        class="primaryBtn"
        type="button"
        ${
          state.canCheckIn
            ? ""
            : "disabled"
        }
      >
        ${
          state.canCheckIn
            ? "دریافت +۲ پوینت"
            : "امروز دریافت شده ✓"
        }
      </button>

    </div>


    <div class="card">

      <div class="cardHeader">

        <div>
          <div class="cardTitle">
            🎡 شانس اسپین
          </div>

          <div class="cardSubtitle">
            شانس‌های آماده برای چرخاندن گردونه
          </div>
        </div>

        <div class="badge gold">
          ${formatPoints(state.spinChances)}
          شانس
        </div>

      </div>


      <button
        id="openSpinBtn"
        class="secondaryBtn"
        type="button"
        style="width:100%"
        ${
          state.spinChances > 0
            ? ""
            : "disabled"
        }
      >
        ${
          state.spinChances > 0
            ? "رفتن به گردونه 🎡"
            : "فعلاً شانسی نداری"
        }
      </button>

    </div>


    <div
      id="spinnerSection"
      class="card spinnerCard"
      style="display:none"
    >

      <div class="cardHeader">

        <div>
          <div class="cardTitle">
            🎡 Lucky Spin
          </div>

          <div class="cardSubtitle">
            جایزه خود را امتحان کن
          </div>
        </div>

      </div>


      <div class="wheelWrap">

        <div class="wheelPointer"></div>

        <svg
          id="spinWheel"
          class="wheel"
          viewBox="0 0 300 300"
          aria-label="گردونه شانس"
        >

          <circle
            cx="150"
            cy="150"
            r="142"
            fill="none"
            stroke="rgba(255,255,255,.08)"
            stroke-width="4"
          />

          <g
            id="wheelSegments"
          ></g>

        </svg>

        <div class="spinCenter">
          SPIN
        </div>

      </div>


      <div class="spinInfo">
        شانس باقی‌مانده:
        <strong>
          ${formatPoints(state.spinChances)}
        </strong>
      </div>


      <button
        id="spinBtn"
        class="primaryBtn"
        type="button"
        ${
          state.spinChances > 0
            ? ""
            : "disabled"
        }
      >
        چرخاندن گردونه
      </button>

    </div>

  `;

  setupDailyEvents();

  buildWheel();
}


/* =========================================================
   DAILY EVENTS
========================================================= */

function setupDailyEvents() {
  const checkBtn =
    $("#dailyCheckBtn");

  if (checkBtn) {
    checkBtn.addEventListener(
      "click",
      handleDailyCheckin
    );
  }

  const openSpinBtn =
    $("#openSpinBtn");

  const spinnerSection =
    $("#spinnerSection");

  if (
    openSpinBtn &&
    spinnerSection
  ) {
    openSpinBtn.addEventListener(
      "click",
      () => {
        spinnerSection.style.display =
          "block";

        spinnerSection.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });

        haptic("light");
      }
    );
  }

  const spinBtn =
    $("#spinBtn");

  if (spinBtn) {
    spinBtn.addEventListener(
      "click",
      handleSpin
    );
  }
}


/* =========================================================
   DAILY CHECK-IN
========================================================= */

async function handleDailyCheckin() {
  const button =
    $("#dailyCheckBtn");

  if (!button || !state.canCheckIn) {
    return;
  }

  button.disabled = true;

  const oldText =
    button.textContent;

  button.textContent =
    "در حال ثبت...";

  try {
    const data =
      await api(
        "/api/points/daily-checkin",
        {
          method: "POST"
        }
      );

    if (data?.points !== undefined) {
      state.points =
        Number(data.points);
    }

    if (data?.streak !== undefined) {
      state.streak =
        Number(data.streak);
    }

    if (data?.spinChances !== undefined) {
      state.spinChances =
        Number(data.spinChances);
    }

    if (data?.totalCheckins !== undefined) {
      state.totalCheckins =
        Number(data.totalCheckins);
    }

    state.canCheckIn = false;

    updateHeader();

    haptic("success");

    toast(
      data?.message ||
      "پاداش روزانه با موفقیت دریافت شد 🎉",
      "success"
    );

    renderDaily();
  } catch (error) {
    button.disabled = false;
    button.textContent = oldText;

    haptic("error");

    toast(
      error.message ||
      "ثبت پاداش روزانه انجام نشد.",
      "error"
    );
  }
}


/* =========================================================
   WHEEL
========================================================= */

const SPIN_SEGMENTS = [
  2,
  3,
  5,
  7,
  10,
  15,
  25
];

function polarToCartesian(
  centerX,
  centerY,
  radius,
  angle
) {
  const radians =
    (angle - 90) * Math.PI / 180;

  return {
    x:
      centerX +
      radius *
        Math.cos(radians),

    y:
      centerY +
      radius *
        Math.sin(radians)
  };
}

function describeArc(
  x,
  y,
  radius,
  startAngle,
  endAngle
) {
  const start =
    polarToCartesian(
      x,
      y,
      radius,
      endAngle
    );

  const end =
    polarToCartesian(
      x,
      y,
      radius,
      startAngle
    );

  const largeArcFlag =
    endAngle - startAngle <= 180
      ? "0"
      : "1";

  return [
    "M",
    x,
    y,
    "L",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
    "Z"
  ].join(" ");
}

function buildWheel() {
  const group =
    $("#wheelSegments");

  if (!group) return;

  const segmentAngle =
    360 /
    SPIN_SEGMENTS.length;

  group.innerHTML = "";

  SPIN_SEGMENTS.forEach(
    (value, index) => {

      const start =
        index *
        segmentAngle;

      const end =
        start +
        segmentAngle;

      const path =
        document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );

      path.setAttribute(
        "d",
        describeArc(
          150,
          150,
          140,
          start,
          end
        )
      );

      path.setAttribute(
        "fill",
        index % 2 === 0
          ? "#8b5cf6"
          : "#171a22"
      );

      path.setAttribute(
        "stroke",
        "rgba(255,255,255,.12)"
      );

      path.setAttribute(
        "stroke-width",
        "2"
      );

      group.appendChild(path);


      const middle =
        start +
        segmentAngle / 2;

      const pos =
        polarToCartesian(
          150,
          150,
          93,
          middle
        );

      const text =
        document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text"
        );

      text.setAttribute(
        "x",
        pos.x
      );

      text.setAttribute(
        "y",
        pos.y
      );

      text.setAttribute(
        "fill",
        "white"
      );

      text.setAttribute(
        "font-size",
        "15"
      );

      text.setAttribute(
        "font-weight",
        "800"
      );

      text.setAttribute(
        "text-anchor",
        "middle"
      );

      text.setAttribute(
        "dominant-baseline",
        "middle"
      );

      text.setAttribute(
        "transform",
        `rotate(${middle},${pos.x},${pos.y})`
      );

      text.textContent =
        `+${value}`;

      group.appendChild(text);
    }
  );
}


/* =========================================================
   SPIN
========================================================= */

let wheelRotation = 0;
let spinning = false;

async function handleSpin() {
  if (
    spinning ||
    state.spinChances <= 0
  ) {
    return;
  }

  const button =
    $("#spinBtn");

  const wheel =
    $("#spinWheel");

  if (!button || !wheel) {
    return;
  }

  spinning = true;
  button.disabled = true;

  haptic("medium");

  try {
    const data =
      await api(
        "/api/points/spin",
        {
          method: "POST"
        }
      );

    const won =
      Number(
        data?.wonPoints ??
        data?.pointsWon ??
        0
      );

    let segmentIndex =
      SPIN_SEGMENTS.indexOf(won);

    if (segmentIndex < 0) {
      segmentIndex = 0;
    }

    const segmentAngle =
      360 /
      SPIN_SEGMENTS.length;

    const target =
      360 * 6 +
      (
        360 -
        (
          segmentIndex *
            segmentAngle +
          segmentAngle / 2
        )
      );

    wheelRotation += target;

    wheel.style.transform =
      `rotate(${wheelRotation}deg)`;

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          3900
        )
    );

    state.points =
      Number(
        data?.points ??
        state.points + won
      );

    state.spinChances =
      Number(
        data?.spinChances ??
        Math.max(
          0,
          state.spinChances - 1
        )
      );

    updateHeader();

    haptic("success");

    toast(
      `تبریک! +${formatPoints(won)} پوینت بردی 🎉`,
      "success"
    );

    renderDaily();
  } catch (error) {
    haptic("error");

    toast(
      error.message ||
      "اسپین انجام نشد.",
      "error"
    );

    button.disabled = false;
  } finally {
    spinning = false;
  }
}


/* =========================================================
   TASKS
========================================================= */

async function renderTasks() {
  const content = $("#content");

  content.innerHTML = `
    <div class="sectionHeader">
      <h1 class="sectionTitle">
        تسک‌ها
      </h1>
    </div>

    <div class="loading" style="height:110px"></div>
  `;

  const tasks =
    await loadTasks();

  if (!tasks.length) {
    content.innerHTML = `

      <div class="sectionHeader">
        <h1 class="sectionTitle">
          تسک‌ها
        </h1>
      </div>

      <div class="emptyState">

        <div class="emptyIcon">
          ✨
        </div>

        <div class="emptyTitle">
          فعلاً تسکی وجود ندارد
        </div>

        <p class="emptyText">
          به‌زودی فعالیت‌های جدید اضافه می‌شوند.
        </p>

      </div>
    `;

    return;
  }

  const completionIds =
    new Set(
      state.completions.map(
        item =>
          String(
            item.taskId ||
            item._id ||
            item
          )
      )
    );

  content.innerHTML = `

    <div class="sectionHeader">

      <div>
        <h1 class="sectionTitle">
          مأموریت‌ها ⚡
        </h1>

        <div class="cardSubtitle">
          فعالیت‌ها را کامل کن و پوینت بگیر.
        </div>
      </div>

      <div class="badge">
        ${formatPoints(tasks.length)}
        تسک
      </div>

    </div>


    <div class="taskList">

      ${tasks.map(
        task => {

          const id =
            task._id ||
            task.id;

          const completed =
            completionIds.has(
              String(id)
            ) ||
            Boolean(
              task.completed
            );

          const title =
            task.title ||
            task.name ||
            "تسک";

          const description =
            task.description ||
            "این فعالیت را کامل کن.";

          const reward =
            Number(
              task.reward ||
              task.points ||
              0
            );

          const url =
            task.url ||
            task.link ||
            "";

          return `

            <article
              class="taskCard"
              data-task-id="${escapeHTML(id)}"
            >

              <div class="taskIcon">
                ${
                  task.icon ||
                  "⚡"
                }
              </div>


              <div class="taskInfo">

                <div class="taskTitle">
                  ${escapeHTML(title)}
                </div>

                <div class="taskDescription">
                  ${escapeHTML(description)}
                </div>

                <div class="taskReward">
                  +${formatPoints(reward)} پوینت
                </div>

              </div>


              <button
                type="button"
                class="taskAction ${
                  completed
                    ? "done"
                    : ""
                }"
                data-task-action="${escapeHTML(id)}"
                data-task-url="${escapeHTML(url)}"
                ${
                  completed
                    ? "disabled"
                    : ""
                }
              >
                ${
                  completed
                    ? "انجام شد ✓"
                    : "انجام"
                }
              </button>

            </article>

          `;
        }
      ).join("")}

    </div>

  `;

  setupTaskEvents();
}


/* =========================================================
   TASK EVENTS
========================================================= */

function setupTaskEvents() {
  $$("[data-task-action]")
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          const taskId =
            button.dataset.taskAction;

          const url =
            button.dataset.taskUrl;

          if (!taskId) return;

          haptic("light");

          if (url) {
            try {
              if (tg?.openTelegramLink) {
                tg.openTelegramLink(url);
              } else {
                window.open(
                  url,
                  "_blank",
                  "noopener,noreferrer"
                );
              }
            } catch {
              window.open(
                url,
                "_blank",
                "noopener,noreferrer"
              );
            }

            await new Promise(
              resolve =>
                setTimeout(
                  resolve,
                  800
                )
            );
          }

          await completeTask(
            taskId,
            button
          );
        }
      );
    });
}


/* =========================================================
   COMPLETE TASK
========================================================= */

async function completeTask(
  taskId,
  button
) {
  if (!button) return;

  button.disabled = true;

  const oldText =
    button.textContent;

  button.textContent =
    "بررسی...";

  try {
    const data =
      await api(
        `/api/tasks/${encodeURIComponent(taskId)}/complete`,
        {
          method: "POST"
        }
      );

    const gained =
      Number(
        data?.pointsAwarded ??
        data?.reward ??
        data?.points ??
        0
      );

    state.points =
      Number(
        data?.totalPoints ??
        data?.user?.points ??
        state.points + gained
      );

    updateHeader();

    haptic("success");

    toast(
      data?.message ||
      `تسک با موفقیت انجام شد +${formatPoints(gained)} پوینت`,
      "success"
    );

    await loadTasks();

    renderTasks();
  } catch (error) {
    button.disabled = false;
    button.textContent = oldText;

    haptic("error");

    toast(
      error.message ||
      "تکمیل تسک تأیید نشد.",
      "error"
    );
  }
}


/* =========================================================
   PROFILE
========================================================= */

async function renderProfile() {
  await loadReferralData();

  const content =
    $("#content");

  const user =
    state.user ||
    getTelegramUser() ||
    {};

  const firstName =
    user.first_name ||
    user.firstName ||
    "کاربر";

  const username =
    user.username
      ? `@${user.username}`
      : "Telegram User";

  const referralLink =
    state.referralCode
      ? `https://t.me/AmirAFG123_bot/app?startapp=${encodeURIComponent(state.referralCode)}`
      : "";

  content.innerHTML = `

    <section class="profileHero">

      <div class="profileAvatar">
        ${escapeHTML(
          getInitials(user)
        )}
      </div>

      <div class="profileName">
        ${escapeHTML(firstName)}
      </div>

      <div class="profileUsername">
        ${escapeHTML(username)}
      </div>

    </section>


    <div class="card">

      <div class="cardHeader">

        <div>

          <div class="cardTitle">
            👥 دعوت دوستان
          </div>

          <div class="cardSubtitle">
            لینک دعوت خودت را به اشتراک بگذار.
          </div>

        </div>

        <div class="badge">
          ${formatPoints(state.invitedCount)}
        </div>

      </div>


      <div class="referralBox">

        <div class="small muted">
          لینک دعوت
        </div>

        <div
          id="referralLink"
          class="referralCode"
        >
          ${
            referralLink
              ? escapeHTML(referralLink)
              : "در حال دریافت..."
          }
        </div>


        <div class="referralActions">

          <button
            id="copyReferralBtn"
            type="button"
            class="secondaryBtn"
          >
            📋 کپی
          </button>

          <button
            id="shareReferralBtn"
            type="button"
            class="primaryBtn"
          >
            ↗ اشتراک
          </button>

        </div>

      </div>

    </div>


    <div class="card">

      <div class="cardHeader">

        <div>
          <div class="cardTitle">
            🎨 ظاهر برنامه
          </div>

          <div class="cardSubtitle">
            حالت نمایش برنامه را انتخاب کن.
          </div>
        </div>

      </div>


      <div class="appearanceCard">

        <div
          id="themeIcon"
          class="appearanceIcon"
        >
          🌙
        </div>

        <div class="appearanceInfo">

          <div
            id="themeLabel"
            class="appearanceTitle"
          >
            حالت تاریک
          </div>

          <div class="appearanceDescription">
            تغییر حالت روشن و تاریک
          </div>

        </div>


        <button
          id="themeToggle"
          class="themeToggle"
          type="button"
          role="switch"
          aria-label="تغییر حالت نمایش"
          aria-checked="false"
        ></button>

      </div>

    </div>


    <div class="card">

      <div class="cardHeader">

        <div>
          <div class="cardTitle">
            📜 قوانین
          </div>

          <div class="cardSubtitle">
            قوانین و شرایط استفاده از برنامه.
          </div>
        </div>

      </div>


      <button
        id="showTermsBtn"
        class="secondaryBtn"
        type="button"
        style="width:100%"
      >
        مشاهده قوانین
      </button>

    </div>


    <div class="card center">

      <div class="small muted">
        Points Rewards
      </div>

      <div
        class="tiny muted"
        style="margin-top:5px"
      >
        ساخته شده برای تجربه بهتر داخل تلگرام.
      </div>

    </div>

  `;

  updateThemeUI();

  setupProfileEvents();
}


/* =========================================================
   PROFILE EVENTS
========================================================= */

function setupProfileEvents() {
  const toggle =
    $("#themeToggle");

  if (toggle) {
    toggle.addEventListener(
      "click",
      toggleTheme
    );
  }

  const copyBtn =
    $("#copyReferralBtn");

  if (copyBtn) {
    copyBtn.addEventListener(
      "click",
      copyReferral
    );
  }

  const shareBtn =
    $("#shareReferralBtn");

  if (shareBtn) {
    shareBtn.addEventListener(
      "click",
      shareReferral
    );
  }

  const termsBtn =
    $("#showTermsBtn");

  if (termsBtn) {
    termsBtn.addEventListener(
      "click",
      showTerms
    );
  }
}


/* =========================================================
   COPY REFERRAL
========================================================= */

async function copyReferral() {
  if (!state.referralCode) {
    toast(
      "لینک دعوت هنوز آماده نیست.",
      "warning"
    );

    return;
  }

  const link =
    `https://t.me/AmirAFG123_bot/app?startapp=${encodeURIComponent(state.referralCode)}`;

  try {
    await navigator.clipboard.writeText(
      link
    );

    haptic("success");

    toast(
      "لینک دعوت کپی شد 📋",
      "success"
    );
  } catch {
    toast(
      link,
      "normal"
    );
  }
}


/* =========================================================
   SHARE REFERRAL
========================================================= */

function shareReferral() {
  if (!state.referralCode) {
    toast(
      "لینک دعوت هنوز آماده نیست.",
      "warning"
    );

    return;
  }

  const link =
    `https://t.me/AmirAFG123_bot/app?startapp=${encodeURIComponent(state.referralCode)}`;

  const text =
    "بیا وارد برنامه شو و پوینت جمع کن 🎁";

  try {
    if (
      tg?.openTelegramLink
    ) {
      tg.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
      );

      return;
    }

    if (
      navigator.share
    ) {
      navigator.share({
        title: "Points Rewards",
        text,
        url: link
      });

      return;
    }

    navigator.clipboard.writeText(
      link
    );

    toast(
      "لینک دعوت کپی شد.",
      "success"
    );
  } catch {
    toast(
      "اشتراک‌گذاری انجام نشد.",
      "error"
    );
  }
}


/* =========================================================
   WALLET
========================================================= */

async function renderWallet() {
  const content =
    $("#content");

  await loadLeaderboard();

  content.innerHTML = `

    <section class="walletBalance">

      <div class="walletLabel">
        موجودی قابل برداشت
      </div>

      <div class="walletPoints">
        ${formatPoints(state.points)}
      </div>

      <div class="walletEstimate">
        ارزش تقریبی:
        ${formatNumber(
          state.estimatedCryptoValue,
          4
        )}
      </div>

    </section>


    <div class="card">

      <div class="cardHeader">

        <div>

          <div class="cardTitle">
            💳 درخواست برداشت
          </div>

          <div class="cardSubtitle">
            اطلاعات کیف پول را با دقت وارد کن.
          </div>

        </div>

      </div>


      <div class="walletForm">

        <input
          id="withdrawAmount"
          type="number"
          inputmode="decimal"
          min="1"
          step="1"
          placeholder="مقدار پوینت"
        >


        <input
          id="walletAddress"
          type="text"
          autocomplete="off"
          placeholder="آدرس کیف پول"
          dir="ltr"
        >


        <button
          id="withdrawBtn"
          class="primaryBtn"
          type="button"
        >
          ثبت درخواست برداشت
        </button>

      </div>


      <div
        class="alert warning"
        style="margin-top:12px;margin-bottom:0"
      >
        درخواست‌های برداشت ممکن است پس از بررسی مدیریت
        تأیید شوند.
      </div>

    </div>


    <div class="card">

      <div class="cardHeader">

        <div>

          <div class="cardTitle">
            🏆 جدول برترین‌ها
          </div>

          <div class="cardSubtitle">
            بهترین کاربران بر اساس پوینت
          </div>

        </div>

        ${
          state.myRank
            ? `
              <div class="badge">
                رتبه ${formatPoints(state.myRank)}
              </div>
            `
            : ""
        }

      </div>


      <div class="leaderboard">

        ${
          state.leaderboard.length
            ? state.leaderboard
                .slice(0, 10)
                .map(
                  (item, index) => {

                    const name =
                      item.firstName ||
                      item.first_name ||
                      item.username ||
                      "کاربر";

                    const points =
                      Number(
                        item.points
                      ) || 0;

                    return `

                      <div class="leaderRow">

                        <div class="rank ${
                          index < 3
                            ? "top"
                            : ""
                        }">
                          ${
                            index === 0
                              ? "🥇"
                              : index === 1
                                ? "🥈"
                                : index === 2
                                  ? "🥉"
                                  : formatPoints(index + 1)
                          }
                        </div>


                        <div class="leaderAvatar">
                          ${escapeHTML(
                            getInitials({
                              first_name: name
                            })
                          )}
                        </div>


                        <div class="leaderInfo">

                          <div class="leaderName">
                            ${escapeHTML(name)}
                          </div>

                          <div class="leaderPoints">
                            ${formatPoints(points)} پوینت
                          </div>

                        </div>


                        <div class="leaderScore">
                          ${formatPoints(points)}
                        </div>

                      </div>

                    `;
                  }
                )
                .join("")
            : `
              <div class="emptyState">
                <div class="emptyIcon">
                  🏆
                </div>

                <div class="emptyTitle">
                  هنوز رتبه‌بندی آماده نیست
                </div>

                <p class="emptyText">
                  به‌زودی اطلاعات نمایش داده می‌شود.
                </p>
              </div>
            `
        }

      </div>

    </div>

  `;

  const withdrawBtn =
    $("#withdrawBtn");

  if (withdrawBtn) {
    withdrawBtn.addEventListener(
      "click",
      handleWithdraw
    );
  }
}


/* =========================================================
   WITHDRAW
========================================================= */

async function handleWithdraw() {
  const amountInput =
    $("#withdrawAmount");

  const walletInput =
    $("#walletAddress");

  const button =
    $("#withdrawBtn");

  if (
    !amountInput ||
    !walletInput ||
    !button
  ) {
    return;
  }

  const amount =
    Number(
      amountInput.value
    );

  const wallet =
    walletInput.value.trim();

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    toast(
      "مقدار برداشت را صحیح وارد کن.",
      "warning"
    );

    amountInput.focus();

    return;
  }

  if (
    amount >
    state.points
  ) {
    toast(
      "موجودی کافی نیست.",
      "warning"
    );

    return;
  }

  if (wallet.length < 6) {
    toast(
      "آدرس کیف پول معتبر نیست.",
      "warning"
    );

    walletInput.focus();

    return;
  }

  button.disabled = true;

  const oldText =
    button.textContent;

  button.textContent =
    "در حال ثبت...";

  try {
    const data =
      await api(
        "/api/points/withdraw",
        {
          method: "POST",
          body: {
            amount,
            walletAddress: wallet
          }
        }
      );

    state.points =
      Number(
        data?.points ??
        data?.remainingPoints ??
        state.points - amount
      );

    updateHeader();

    amountInput.value = "";
    walletInput.value = "";

    haptic("success");

    toast(
      data?.message ||
      "درخواست برداشت ثبت شد.",
      "success"
    );

    await renderWallet();
  } catch (error) {
    button.disabled = false;
    button.textContent = oldText;

    haptic("error");

    toast(
      error.message ||
      "ثبت برداشت انجام نشد.",
      "error"
    );
  }
}


/* =========================================================
   CURRENT TAB RENDER
========================================================= */

async function renderCurrentTab() {
  if (state.activeTab === "home") {
    renderHome();
    return;
  }

  if (state.activeTab === "tasks") {
    await renderTasks();
    return;
  }

  if (state.activeTab === "daily") {
    renderDaily();
    return;
  }

  if (state.activeTab === "wallet") {
    await renderWallet();
    return;
  }

  if (state.activeTab === "profile") {
    await renderProfile();
    return;
  }

  renderHome();
}


/* =========================================================
   TELEGRAM THEME / VIEWPORT EVENTS
========================================================= */

function setupTelegramEvents() {
  if (!tg) return;

  try {
    tg.onEvent(
      "themeChanged",
      () => {
        /*
          Telegram theme is only used as a fallback.
          User-selected local theme remains the priority.
        */

        if (
          !localStorage.getItem(
            THEME_KEY
          )
        ) {
          applyTheme(
            tg.colorScheme === "light"
              ? "light"
              : "dark"
          );
        }
      }
    );

    tg.onEvent(
      "viewportChanged",
      () => {
        document.documentElement.style.setProperty(
          "--tg-viewport-height",
          `${tg.viewportHeight || window.innerHeight}px`
        );
      }
    );
  } catch {
    // Telegram event support varies between clients.
  }
}


/* =========================================================
   GLOBAL KEYBOARD EVENTS
========================================================= */

function setupKeyboardEvents() {
  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Escape"
      ) {
        hideTerms();
        hideCaptcha();
      }

      if (
        event.key === "Enter" &&
        document.activeElement ===
          $("#captchaAnswer")
      ) {
        submitCaptcha();
      }

    }
  );
}


/* =========================================================
   TELEGRAM MAIN BUTTON HELPERS
========================================================= */

function hideTelegramMainButton() {
  try {
    tg?.MainButton?.hide();
  } catch {
    // Ignore.
  }
}

function showTelegramMainButton(
  text,
  callback
) {
  try {
    if (!tg?.MainButton) return;

    tg.MainButton.setText(text);

    tg.MainButton.show();

    tg.MainButton.offClick?.(
      callback
    );

    tg.MainButton.onClick(
      callback
    );
  } catch {
    // Ignore unsupported clients.
  }
}


/* =========================================================
   INITIALIZATION
========================================================= */

async function initializeApp() {
  if (state.initialized) {
    return;
  }

  state.initialized = true;

  setupNavigation();
  setupTelegramEvents();
  setupKeyboardEvents();

  updateNavigation();

  const telegramUser =
    getTelegramUser();

  if (telegramUser) {
    state.user =
      telegramUser;
  }

  updateHeader();

  showLoading();

  try {
    await Promise.all([
      loadUserData(),
      loadReferralData()
    ]);

    updateHeader();

    /*
      Terms are shown only once.
    */
    if (!termsAccepted()) {
      showTerms();
    }

    /*
      CAPTCHA is also only required once
      on this device/browser.
    */
    if (
      !localStorage.getItem(
        "captchaPassed"
      )
    ) {
      /*
        Do not force CAPTCHA over the terms
        immediately. Show it after terms
        are accepted / hidden.
      */
      setTimeout(() => {

        if (
          termsAccepted() &&
          !localStorage.getItem(
            "captchaPassed"
          )
        ) {
          showCaptcha();
        }

      }, 500);
    }

    await renderCurrentTab();

  } catch (error) {

    console.error(
      "App initialization failed:",
      error
    );

    const content =
      $("#content");

    if (content) {
      content.innerHTML = `

        <div class="emptyState">

          <div class="emptyIcon">
            ⚠️
          </div>

          <div class="emptyTitle">
            اتصال برقرار نشد
          </div>

          <p class="emptyText">
            لطفاً اتصال اینترنت را بررسی کن و دوباره تلاش کن.
          </p>

          <button
            id="retryAppBtn"
            class="primaryBtn"
            style="margin-top:15px"
            type="button"
          >
            تلاش دوباره
          </button>

        </div>

      `;

      $("#retryAppBtn")?.addEventListener(
        "click",
        () => {
          state.initialized = false;
          initializeApp();
        }
      );
    }
  }
}


/* =========================================================
   TERMS → CAPTCHA FLOW
========================================================= */

const originalHideTerms =
  hideTerms;

hideTerms = function () {

  originalHideTerms();

  setTimeout(() => {

    if (
      !localStorage.getItem(
        "captchaPassed"
      )
    ) {
      showCaptcha();
    }

  }, 250);
};

window.hideTerms =
  hideTerms;


/* =========================================================
   WINDOW HELPERS
========================================================= */

window.navigate =
  navigate;

window.toggleTheme =
  toggleTheme;

window.showTerms =
  showTerms;


/* =========================================================
   START APP
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeApp,
    {
      once: true
    }
  );

} else {

  initializeApp();

}