/* =========================================================
   TELEGRAM MINI APP — FINAL STABLE FRONTEND
   Compatible with:
   - current index.html
   - current Telegram Mini App
   - /api/auth/enter
   - /api/auth/captcha
   - /api/points/*
   - /api/tasks/*
   - /api/referral/*
   - /api/leaderboard/*
   ========================================================= */

(() => {
  'use strict';

  /* =========================================================
     TELEGRAM
     ========================================================= */

  const tg = window.Telegram?.WebApp || null;

  if (tg) {
    try {
      tg.ready();
      tg.expand();

      if (typeof tg.disableVerticalSwipes === 'function') {
        tg.disableVerticalSwipes();
      }

      tg.setHeaderColor?.('#050609');
      tg.setBackgroundColor?.('#050609');
    } catch (error) {
      console.warn('Telegram initialization failed:', error);
    }
  }

  const getInitData = () => tg?.initData || '';
  const getStartParam = () =>
    tg?.initDataUnsafe?.start_param || null;


  /* =========================================================
     STATE
     ========================================================= */

  const state = {
    user: null,

    points: 0,
    estimatedCryptoValue: 0,
    rate: 1000,

    streak: 0,
    canCheckIn: true,
    spinChances: 0,
    totalCheckins: 0,

    referralCode: '',
    invitedCount: 0,

    currentTab: 'home',

    captchaPassed: false,
    initialized: false,

    wheelRotation: 0
  };


  const SPIN_SEGMENTS = [2, 3, 5, 7, 10, 15, 25];

  const BOT_USERNAME = 'AmirAFG123_bot';
  const APP_SHORT_NAME = 'app';


  /* =========================================================
     DOM
     ========================================================= */

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));


  /* =========================================================
     HELPERS
     ========================================================= */

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


  function formatPoints(value) {
    return Number(value || 0).toLocaleString('fa-IR');
  }


  function formatCrypto(value) {
    const number = Number(value || 0);

    if (number >= 1) {
      return number.toFixed(4);
    }

    if (number >= 0.001) {
      return number.toFixed(6);
    }

    return number.toFixed(8);
  }


  function haptic(type = 'light') {
    try {
      if (!tg?.HapticFeedback) return;

      if (
        type === 'success' ||
        type === 'error' ||
        type === 'warning'
      ) {
        tg.HapticFeedback.notificationOccurred(type);
        return;
      }

      tg.HapticFeedback.impactOccurred(type);
    } catch {}
  }


  /* =========================================================
     TOAST
     ========================================================= */

  let toastTimer = null;

  function toast(message, type = 'info', duration = 3000) {
    const box = $('#toast');

    if (!box) return;

    clearTimeout(toastTimer);

    box.className = `toast toast-${type}`;
    box.textContent = String(message || '');

    box.classList.add('show');

    toastTimer = setTimeout(() => {
      box.classList.remove('show');
    }, duration);
  }


  /* =========================================================
     API
     ========================================================= */

  async function api(endpoint, options = {}) {
    const initData = getInitData();

    const method = String(
      options.method || 'GET'
    ).toUpperCase();

    let url = endpoint;

    const headers = {
      Accept: 'application/json',
      ...(options.headers || {})
    };

    let body = options.body;

    if (method === 'GET') {
      const separator = url.includes('?')
        ? '&'
        : '?';

      url +=
        `${separator}initData=${encodeURIComponent(initData)}`;
    } else {
      headers['Content-Type'] = 'application/json';

      let payload = {};

      if (body) {
        try {
          payload =
            typeof body === 'string'
              ? JSON.parse(body)
              : body;
        } catch {
          payload = {};
        }
      }

      if (!payload || typeof payload !== 'object') {
        payload = {};
      }

      payload.initData = initData;

      body = JSON.stringify(payload);
    }

    let response;

    try {
      response = await fetch(url, {
        ...options,
        method,
        headers,
        body
      });
    } catch (error) {
      console.error('Network error:', error);

      throw new Error(
        'اتصال به سرور برقرار نشد. اینترنت یا سرور را بررسی کنید.'
      );
    }

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      const message =
        data?.error ||
        data?.message ||
        `خطای سرور (${response.status})`;

      const error = new Error(message);
      error.status = response.status;
      error.data = data;

      throw error;
    }

    if (
      data &&
      data.success === false &&
      !data.user
    ) {
      const error = new Error(
        data.error ||
        data.message ||
        'عملیات انجام نشد.'
      );

      error.status = response.status;
      error.data = data;

      throw error;
    }

    return data;
  }


  /* =========================================================
     THEME
     ========================================================= */

  function getTheme() {
    const saved =
      localStorage.getItem('miniAppTheme');

    return saved === 'light'
      ? 'light'
      : 'dark';
  }


  function applyTheme(theme) {
    const selected =
      theme === 'light'
        ? 'light'
        : 'dark';

    document.documentElement.dataset.theme =
      selected;

    document.body.dataset.theme =
      selected;

    localStorage.setItem(
      'miniAppTheme',
      selected
    );

    try {
      const color =
        selected === 'light'
          ? '#f5f6f9'
          : '#050609';

      tg?.setHeaderColor?.(color);
      tg?.setBackgroundColor?.(color);
    } catch {}

    updateThemeUI();
  }


  function updateThemeUI() {
    const icon = $('#themeIcon');
    const label = $('#themeLabel');
    const toggle = $('#themeToggle');

    const light =
      getTheme() === 'light';

    if (icon) {
      icon.textContent =
        light ? '☀️' : '🌙';
    }

    if (label) {
      label.textContent =
        light
          ? 'حالت روشن'
          : 'حالت تیره';
    }

    if (toggle) {
      toggle.setAttribute(
        'aria-label',
        light
          ? 'تغییر به حالت تیره'
          : 'تغییر به حالت روشن'
      );
    }
  }


  function toggleTheme() {
    const next =
      getTheme() === 'dark'
        ? 'light'
        : 'dark';

    applyTheme(next);

    haptic('light');

    toast(
      next === 'light'
        ? '☀️ حالت روشن فعال شد'
        : '🌙 حالت تیره فعال شد',
      'info'
    );
  }


  /* =========================================================
     HEADER
     ========================================================= */

  function updateHeader() {
    const user =
      state.user || {};

    const name =
      user.firstName ||
      user.first_name ||
      'دوست من';

    const greet =
      $('#greetName');

    const points =
      $('#pointsDisplay');

    const avatar =
      $('#avatar');

    if (greet) {
      greet.textContent =
        `سلام، ${name}`;
    }

    if (points) {
      points.textContent =
        `${formatPoints(state.points)} پوینت`;
    }

    if (avatar) {
      const photo =
        user.photo_url ||
        user.photoUrl ||
        '';

      if (photo) {
        avatar.innerHTML =
          `<img src="${escapeHTML(photo)}" alt="">`;
      } else {
        avatar.textContent =
          name
            .trim()
            .charAt(0)
            .toUpperCase() || 'A';
      }
    }
  }


  /* =========================================================
     LEVEL
     ========================================================= */

  function levelInfo(points) {
    const value =
      Math.max(
        0,
        Number(points || 0)
      );

    const level =
      Math.floor(value / 500) + 1;

    const current =
      value % 500;

    const progress =
      Math.min(
        100,
        (current / 500) * 100
      );

    return {
      level,
      current,
      progress,
      remaining: 500 - current
    };
  }


  /* =========================================================
     NAVIGATION
     ========================================================= */

  function setActiveTab(tab) {
    state.currentTab = tab;

    $$('#tabbar button').forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.tab === tab
      );
    });
  }


  function navigate(tab) {
    haptic('light');

    setActiveTab(tab);

    switch (tab) {
      case 'home':
        renderHome();
        break;

      case 'tasks':
        renderTasks();
        break;

      case 'daily':
        renderDaily();
        break;

      case 'wallet':
        renderWallet();
        break;

      case 'profile':
        renderProfile();
        break;

      default:
        renderHome();
    }
  }


  function bindNavigation() {
    $$('#tabbar button').forEach(button => {
      button.addEventListener(
        'click',
        () => {
          navigate(button.dataset.tab);
        }
      );
    });
  }


  /* =========================================================
     LOADING / ERROR
     ========================================================= */

  function loadingHTML() {
    return `
      <div class="skeletonStack">
        <div class="skeleton cardLine"></div>
        <div class="skeleton cardLine"></div>
        <div class="skeleton cardLine"></div>
        <div class="skeleton cardLine"></div>
      </div>
    `;
  }


  function showError(message) {
    const content =
      $('#content');

    if (!content) return;

    content.innerHTML = `
      <section class="stateCard">
        <div class="stateIcon">⚠️</div>
        <div class="stateTitle">
          مشکلی پیش آمد
        </div>
        <p class="stateText">
          ${escapeHTML(message || 'خطای نامشخص')}
        </p>

        <button
          id="retryButton"
          class="primaryBtn"
          style="margin-top:12px"
        >
          تلاش دوباره
        </button>
      </section>
    `;

    $('#retryButton')?.addEventListener(
      'click',
      () => {
        navigate(state.currentTab || 'home');
      }
    );
  }


  /* =========================================================
     AUTH
     ========================================================= */

  async function authenticate() {
    if (!getInitData()) {
      throw new Error(
        'این برنامه باید از داخل Telegram باز شود.'
      );
    }

    const result =
      await api('/api/auth/enter', {
        method: 'POST',
        body: {
          initData: getInitData(),
          startParam: getStartParam()
        }
      });

    if (result?.user) {
      state.user = result.user;
    }

    state.captchaPassed =
      Boolean(
        result?.captchaPassed ??
        result?.user?.captchaPassed
      );

    return result;
  }


  /* =========================================================
     CAPTCHA
     ========================================================= */

  function showCaptcha(question) {
    const overlay =
      $('#captchaOverlay');

    const questionElement =
      $('#captchaQuestion');

    const answer =
      $('#captchaAnswer');

    const error =
      $('#captchaError');

    if (!overlay) return;

    overlay.style.display = 'flex';

    if (questionElement) {
      questionElement.textContent =
        question
          ? `${question} = ?`
          : 'سؤال امنیتی';
    }

    if (answer) {
      answer.value = '';

      setTimeout(() => {
        answer.focus();
      }, 150);
    }

    if (error) {
      error.textContent = '';
    }
  }


  function hideCaptcha() {
    const overlay =
      $('#captchaOverlay');

    if (overlay) {
      overlay.style.display = 'none';
    }
  }


  async function submitCaptcha() {
    const input =
      $('#captchaAnswer');

    const button =
      $('#submitCaptcha');

    const answer =
      String(
        input?.value || ''
      ).trim();

    if (!answer) {
      $('#captchaError').textContent =
        'جواب را وارد کنید.';
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent =
        'در حال بررسی...';
    }

    try {
      const result =
        await api('/api/auth/captcha', {
          method: 'POST',
          body: {
            initData: getInitData(),
            answer
          }
        });

      if (!result.success) {
        throw new Error(
          result.error ||
          'پاسخ صحیح نیست.'
        );
      }

      state.captchaPassed = true;

      hideCaptcha();

      haptic('success');

      toast(
        'تأیید با موفقیت انجام شد 🎉',
        'success'
      );

      await loadPoints();

      navigate('home');

    } catch (error) {
      haptic('error');

      const errorElement =
        $('#captchaError');

      if (errorElement) {
        errorElement.textContent =
          error.message ||
          'جواب اشتباه بود.';
      }

      if (
        error?.data?.captchaQuestion
      ) {
        showCaptcha(
          error.data.captchaQuestion
        );
      }

    } finally {
      if (button) {
        button.disabled = false;
        button.textContent =
          'تأیید و ادامه';
      }
    }
  }


  /* =========================================================
     TERMS
     ========================================================= */

  function showTerms() {
    const overlay =
      $('#termsOverlay');

    if (!overlay) return;

    overlay.style.display = 'flex';
  }


  function hideTerms() {
    const overlay =
      $('#termsOverlay');

    if (!overlay) return;

    overlay.style.display = 'none';
  }


  /* Expose inline HTML handlers */
  window.submitCaptcha = submitCaptcha;
  window.showTerms = showTerms;
  window.hideTerms = hideTerms;
  window.toggleTheme = toggleTheme;


  /* =========================================================
     LOAD POINTS
     ========================================================= */

  async function loadPoints() {
    const result =
      await api('/api/points/me');

    state.points =
      Number(result.points || 0);

    state.estimatedCryptoValue =
      Number(
        result.estimatedCryptoValue || 0
      );

    state.rate =
      Number(result.rate || 1000);

    state.streak =
      Number(result.streak || 0);

    state.canCheckIn =
      result.canCheckIn !== false;

    state.spinChances =
      Number(result.spinChances || 0);

    state.totalCheckins =
      Number(result.totalCheckins || 0);

    if (result.firstName) {
      state.user = {
        ...(state.user || {}),
        firstName: result.firstName
      };
    }

    updateHeader();

    return result;
  }


  /* =========================================================
     HOME
     ========================================================= */

  async function renderHome() {
    setActiveTab('home');

    const content =
      $('#content');

    if (!content) return;

    content.innerHTML =
      loadingHTML();

    try {
      const data =
        await loadPoints();

      const level =
        levelInfo(data.points);

      content.innerHTML = `
        <section class="heroCard reveal visible">

          <div class="heroOrb"></div>

          <div class="heroTop">
            <div>
              <div class="eyebrow">
                موجودی فعلی
              </div>

              <div class="heroBalance">
                ${formatPoints(data.points)}
                <small>POINTS</small>
              </div>
            </div>

            <div class="coinBadge">
              💎
            </div>
          </div>

          <div class="levelRow">
            <span>
              Level ${level.level}
            </span>

            <span>
              ${formatPoints(level.current)} / 500
            </span>
          </div>

          <div class="progress">
            <div style="width:${level.progress}%"></div>
          </div>

          <div class="levelFoot">
            <span>
              سطح ${level.level}
            </span>

            <span>
              ${formatPoints(level.remaining)}
              پوینت تا سطح بعد
            </span>
          </div>

        </section>


        <section class="sectionBlock">

          <div class="sectionHead">
            <h2>وضعیت حساب</h2>
          </div>

          <div class="quickGrid">

            <button
              class="quickCard"
              data-go="daily"
            >
              <div class="quickIcon fire">
                🔥
              </div>

              <div class="quickValue">
                ${formatPoints(data.streak)}
              </div>

              <div class="quickLabel">
                روز Streak
              </div>
            </button>


            <button
              class="quickCard"
              data-go="daily"
            >
              <div class="quickIcon gift">
                🎁
              </div>

              <div class="quickValue">
                ${data.canCheckIn ? '+۲' : '✓'}
              </div>

              <div class="quickLabel">
                Daily Check
              </div>
            </button>


            <button
              class="quickCard"
              data-go="daily"
            >
              <div class="quickIcon spin">
                🎡
              </div>

              <div class="quickValue">
                ${formatPoints(data.spinChances)}
              </div>

              <div class="quickLabel">
                شانس Spin
              </div>
            </button>


            <button
              class="quickCard"
              data-go="wallet"
            >
              <div class="quickIcon wallet">
                ◇
              </div>

              <div class="quickValue">
                کیف پول
              </div>

              <div class="quickLabel">
                برداشت
              </div>
            </button>

          </div>

        </section>


        <section class="sectionBlock">

          <div class="sectionHead">
            <div>
              <h2>
                الان چی کار کنم؟
              </h2>

              <div class="sectionSubtitle">
                بهترین راه بعدی برای کسب امتیاز
              </div>
            </div>
          </div>

          <button
            class="nextAction"
            data-go="${data.canCheckIn ? 'daily' : 'tasks'}"
          >
            <span class="nextIcon">
              ${data.canCheckIn ? '🎁' : '🎯'}
            </span>

            <span class="nextInfo">
              <span class="nextTitle">
                ${
                  data.canCheckIn
                    ? 'جایزه امروزت آماده است'
                    : 'تسک‌های جدیدت را بررسی کن'
                }
              </span>

              <span class="nextText">
                ${
                  data.canCheckIn
                    ? '+۲ پوینت و حفظ Streak'
                    : 'با انجام تسک‌ها پوینت بیشتری بگیر'
                }
              </span>
            </span>

            <strong>←</strong>
          </button>

        </section>


        <section class="sectionBlock">

          <div class="sectionHead">
            <h2>راه‌های کسب پوینت</h2>
          </div>

          <div class="earnList">

            <button
              class="earnItem"
              data-go="tasks"
            >
              <span class="earnIcon">
                ✓
              </span>

              <span class="earnInfo">
                <span class="earnTitle">
                  انجام تسک‌ها
                </span>

                <span class="earnText">
                  تسک‌های فعال را کامل کن
                </span>
              </span>

              <strong>←</strong>
            </button>


            <button
              class="earnItem"
              data-go="daily"
            >
              <span class="earnIcon">
                🎡
              </span>

              <span class="earnInfo">
                <span class="earnTitle">
                  Daily Check + Spin
                </span>

                <span class="earnText">
                  هر روز وارد شو و جایزه بگیر
                </span>
              </span>

              <strong>←</strong>
            </button>


            <button
              class="earnItem"
              data-go="profile"
            >
              <span class="earnIcon">
                👥
              </span>

              <span class="earnInfo">
                <span class="earnTitle">
                  دعوت دوستان
                </span>

                <span class="earnText">
                  با لینک خودت دوستانت را دعوت کن
                </span>
              </span>

              <strong>←</strong>
            </button>

          </div>

        </section>


        <section class="infoCard">

          <div class="infoIcon">
            💡
          </div>

          <div>
            <h3>
              نکته امروز
            </h3>

            <p>
              هر روز وارد برنامه شو، Streak خودت را حفظ کن
              و با انجام تسک‌ها امتیاز بیشتری بگیر.
            </p>
          </div>

        </section>


        <div class="termsLinkWrap">
          <button
            class="termsLink"
            type="button"
            onclick="showTerms()"
          >
            قوانین و شرایط استفاده
          </button>
        </div>
      `;

      bindGoButtons();

    } catch (error) {
      console.error(
        'Home loading failed:',
        error
      );

      showError(
        error.message ||
        'اطلاعات حساب دریافت نشد.'
      );
    }
  }


  function bindGoButtons() {
    $$('[data-go]').forEach(button => {
      button.addEventListener(
        'click',
        () => {
          navigate(
            button.dataset.go
          );
        }
      );
    });
  }


  /* =========================================================
     DAILY
     ========================================================= */

  async function renderDaily() {
    setActiveTab('daily');

    const content =
      $('#content');

    if (!content) return;

    content.innerHTML =
      loadingHTML();

    try {
      const data =
        await loadPoints();

      const streak =
        Math.min(
          Number(data.streak || 0),
          7
        );

      let daysHTML = '';

      for (let i = 1; i <= 7; i++) {
        daysHTML += `
          <div
            class="day ${
              i <= streak
                ? 'done'
                : ''
            } ${
              i === streak + 1
                ? 'active'
                : ''
            }"
          >
            <div class="dayCircle">
              ${
                i <= streak
                  ? '✓'
                  : i === 7
                    ? '🎁'
                    : i
              }
            </div>

            <div class="dayLabel">
              روز ${i}
            </div>
          </div>
        `;
      }

      content.innerHTML = `
        <section class="pageTitle">
          <div class="eyebrow">
            DAILY REWARDS
          </div>

          <h1>
            جایزه روزانه
          </h1>

          <p class="muted">
            هر روز برگرد، Streak را بساز و Spin بگیر.
          </p>
        </section>


        <section class="dailyHero">

          <div class="dailyGlow"></div>

          <div class="dailyBig">
            🔥
          </div>

          <div class="dailyTitle">
            ${formatPoints(data.streak)}
            روز Streak
          </div>

          <div class="dailyText">
            ${
              data.canCheckIn
                ? 'جایزه امروز آماده است.'
                : 'امروز جایزه‌ات را دریافت کرده‌ای.'
            }
          </div>

          <div class="weekGrid">
            ${daysHTML}
          </div>

          <button
            id="checkinBtn"
            class="primaryBtn"
            ${data.canCheckIn ? '' : 'disabled'}
          >
            ${
              data.canCheckIn
                ? '🎁 دریافت +۲ پوینت'
                : '✓ دریافت شد'
            }
          </button>

          <div class="chanceBadge">
            🎟
            ${formatPoints(data.spinChances)}
            شانس Spin
          </div>

        </section>


        <section class="sectionBlock">

          <div class="sectionHead">
            <h2>
              گردونه شانس
            </h2>

            <span class="badge badgeWarning">
              2 • 3 • 5 • 7 • 10 • 15 • 25
            </span>
          </div>

          <div class="spinnerCard">

            <div class="wheelWrap">
              <div class="wheelPointer"></div>

              ${createWheel()}
            </div>

            <button
              id="spinBtn"
              class="primaryBtn goldBtn spinButton"
              ${data.spinChances > 0 ? '' : 'disabled'}
            >
              ${
                data.spinChances > 0
                  ? '🎡 SPIN NOW'
                  : 'شانس چرخش نداری'
              }
            </button>

            <p class="mutedCenter">
              با تکمیل ۷ روز، یک شانس Spin رایگان می‌گیری.
            </p>

          </div>

        </section>
      `;

      $('#checkinBtn')?.addEventListener(
        'click',
        handleCheckin
      );

      $('#spinBtn')?.addEventListener(
        'click',
        handleSpin
      );

    } catch (error) {
      console.error(
        'Daily loading failed:',
        error
      );

      showError(
        error.message ||
        'اطلاعات روزانه دریافت نشد.'
      );
    }
  }


  /* =========================================================
     DAILY CHECK-IN
     ========================================================= */

  async function handleCheckin() {
    const button =
      $('#checkinBtn');

    if (!button) return;

    button.disabled = true;
    button.textContent =
      'در حال دریافت...';

    try {
      const result =
        await api(
          '/api/points/daily-checkin',
          {
            method: 'POST',
            body: {}
          }
        );

      state.points =
        Number(result.points || state.points);

      state.streak =
        Number(result.streak || 0);

      state.spinChances =
        Number(result.spinChances || 0);

      state.totalCheckins =
        Number(
          result.totalCheckins ||
          state.totalCheckins + 1
        );

      state.canCheckIn = false;

      updateHeader();

      haptic('success');

      toast(
        result.earnedSpin
          ? '🎉 هفت روز کامل شد! +۱ Spin'
          : '🎉 +۲ پوینت دریافت کردی',
        'success'
      );

      await renderDaily();

    } catch (error) {
      console.error(error);

      haptic('error');

      toast(
        error.message ||
        'ثبت پاداش انجام نشد.',
        'error'
      );

      button.disabled = false;

      button.textContent =
        '🎁 دریافت +۲ پوینت';
    }
  }


  /* =========================================================
     WHEEL
     ========================================================= */

  function createWheel() {
    const count =
      SPIN_SEGMENTS.length;

    const angle =
      360 / count;

    const cx = 100;
    const cy = 100;
    const radius = 88;

    let paths = '';
    let labels = '';

    const colors = [
      '#17191f',
      '#8f1d2c',
      '#075f3b'
    ];

    for (let i = 0; i < count; i++) {
      const start =
        i * angle;

      const end =
        start + angle;

      const x1 =
        cx +
        radius *
          Math.sin(
            start * Math.PI / 180
          );

      const y1 =
        cy -
        radius *
          Math.cos(
            start * Math.PI / 180
          );

      const x2 =
        cx +
        radius *
          Math.sin(
            end * Math.PI / 180
          );

      const y2 =
        cy -
        radius *
          Math.cos(
            end * Math.PI / 180
          );

      const mid =
        (start + end) / 2;

      const lx =
        cx +
        radius *
          0.58 *
          Math.sin(
            mid * Math.PI / 180
          );

      const ly =
        cy -
        radius *
          0.58 *
          Math.cos(
            mid * Math.PI / 180
          );

      paths += `
        <path
          d="
            M ${cx} ${cy}
            L ${x1} ${y1}
            A ${radius} ${radius}
              0 0 1
              ${x2} ${y2}
            Z
          "
          fill="${colors[i % colors.length]}"
          stroke="#d4af37"
          stroke-width="1.5"
        />
      `;

      labels += `
        <text
          x="${lx}"
          y="${ly}"
          fill="#fff"
          font-size="13"
          font-weight="800"
          text-anchor="middle"
          dominant-baseline="middle"
        >
          ${SPIN_SEGMENTS[i]}
        </text>
      `;
    }

    return `
      <svg
        id="wheelSvg"
        viewBox="0 0 200 200"
        aria-label="گردونه شانس"
      >
        <circle
          cx="100"
          cy="100"
          r="97"
          fill="none"
          stroke="#d4af37"
          stroke-width="7"
        />

        <g
          id="wheelGroup"
          style="transform-origin:100px 100px"
        >
          ${paths}
          ${labels}
        </g>

        <circle
          cx="100"
          cy="100"
          r="18"
          fill="#111"
          stroke="#d4af37"
          stroke-width="3"
        />

        <text
          x="100"
          y="106"
          font-size="18"
          text-anchor="middle"
        >
          ★
        </text>
      </svg>
    `;
  }


  async function handleSpin() {
    const button =
      $('#spinBtn');

    if (!button) return;

    button.disabled = true;
    button.textContent =
      'در حال چرخش...';

    haptic('medium');

    try {
      const result =
        await api(
          '/api/points/spin',
          {
            method: 'POST',
            body: {}
          }
        );

      const count =
        result.segments?.length ||
        SPIN_SEGMENTS.length;

      const angle =
        360 / count;

      const target =
        Number(
          result.segmentIndex || 0
        ) *
          angle +
        angle / 2;

      const finalRotation =
        state.wheelRotation +
        1800 +
        (360 - target) -
        (state.wheelRotation % 360);

      state.wheelRotation =
        finalRotation;

      const wheel =
        $('#wheelGroup');

      if (wheel) {
        wheel.style.transition =
          'transform 4s cubic-bezier(.17,.67,.12,.99)';

        wheel.style.transform =
          `rotate(${finalRotation}deg)`;
      }

      setTimeout(() => {
        state.points =
          Number(
            result.points ||
            state.points
          );

        state.spinChances =
          Number(
            result.spinChances || 0
          );

        updateHeader();

        haptic('success');

        toast(
          `🎉 +${formatPoints(result.won)} پوینت!`,
          'success'
        );

        renderDaily();

      }, 4200);

    } catch (error) {
      console.error(error);

      haptic('error');

      toast(
        error.message ||
        'چرخاندن گردونه انجام نشد.',
        'error'
      );

      button.disabled = false;

      button.textContent =
        '🎡 SPIN NOW';
    }
  }


  /* =========================================================
     TASKS
     ========================================================= */

  async function renderTasks() {
    setActiveTab('tasks');

    const content =
      $('#content');

    if (!content) return;

    content.innerHTML =
      loadingHTML();

    try {
      const result =
        await api('/api/tasks');

      const tasks =
        Array.isArray(result.tasks)
          ? result.tasks
          : [];

      if (!tasks.length) {
        content.innerHTML = `
          <section class="stateCard">
            <div class="stateIcon">
              🎯
            </div>

            <div class="stateTitle">
              فعلاً تسکی وجود ندارد
            </div>

            <p class="stateText">
              بعداً دوباره سر بزن.
            </p>
          </section>
        `;

        return;
      }

      const completed =
        tasks.filter(
          task => task.completed
        ).length;

      content.innerHTML = `
        <section class="pageTitle">
          <div class="eyebrow">
            QUEST CENTER
          </div>

          <h1>
            تسک‌ها
          </h1>

          <p class="muted">
            تسک‌ها را کامل کن و امتیاز بیشتری بگیر.
          </p>
        </section>


        <section class="card">

          <div class="rowBetween">
            <strong>
              پیشرفت تسک‌ها
            </strong>

            <span class="badge badgeAccent">
              ${completed}/${tasks.length}
            </span>
          </div>

          <div class="progress mt12">
            <div
              style="
                width:${
                  tasks.length
                    ? completed / tasks.length * 100
                    : 0
                }%
              "
            ></div>
          </div>

        </section>


        <section class="sectionBlock">

          <div class="taskList">

            ${tasks.map((task, index) => {
              const id =
                task._id ||
                task.id;

              const title =
                task.title ||
                `تسک ${index + 1}`;

              const description =
                task.description ||
                'این تسک را انجام بده و پاداش بگیر.';

              const reward =
                Number(
                  task.pointsReward ??
                  task.reward ??
                  0
                );

              const link =
                task.link ||
                task.target ||
                task.channelUsername ||
                '';

              const completed =
                Boolean(task.completed);

              return `
                <article
                  class="taskCard ${
                    completed
                      ? 'completed'
                      : ''
                  }"
                >

                  <div class="taskTop">

                    <div class="taskIcon">
                      ${
                        task.icon ||
                        getTaskIcon(link)
                      }
                    </div>

                    <div class="taskInfo">

                      <div class="taskTitle">
                        ${escapeHTML(title)}
                      </div>

                      <div class="taskDescription">
                        ${escapeHTML(description)}
                      </div>

                    </div>

                    <div class="taskReward">
                      +${formatPoints(reward)}
                    </div>

                  </div>


                  <div class="taskBottom">

                    ${
                      link
                        ? `
                          <button
                            class="secondaryBtn smallBtn"
                            data-open-task="${escapeHTML(link)}"
                          >
                            باز کردن
                          </button>
                        `
                        : ''
                    }

                    <button
                      class="primaryBtn smallBtn completeBtn ${
                        completed
                          ? 'completed'
                          : ''
                      }"
                      data-complete-task="${escapeHTML(id)}"
                      ${
                        completed
                          ? 'disabled'
                          : ''
                      }
                    >
                      ${
                        completed
                          ? '✓ انجام شده'
                          : 'انجام دادم'
                      }
                    </button>

                  </div>

                </article>
              `;
            }).join('')}

          </div>

        </section>
      `;

      $$('[data-open-task]').forEach(
        button => {
          button.addEventListener(
            'click',
            () => {
              openTelegramTarget(
                button.dataset.openTask
              );
            }
          );
        }
      );

      $$('[data-complete-task]').forEach(
        button => {
          button.addEventListener(
            'click',
            () => {
              completeTask(
                button.dataset.completeTask,
                button
              );
            }
          );
        }
      );

    } catch (error) {
      console.error(error);

      showError(
        error.message ||
        'تسک‌ها دریافت نشدند.'
      );
    }
  }


  function getTaskIcon(link) {
    const value =
      String(link || '')
        .toLowerCase();

    if (
      value.includes('youtube') ||
      value.includes('youtu.be')
    ) {
      return '▶️';
    }

    if (
      value.includes('instagram')
    ) {
      return '📸';
    }

    if (
      value.includes('t.me')
    ) {
      return '📢';
    }

    return '🎯';
  }


  function openTelegramTarget(target) {
    if (!target) return;

    let url =
      String(target).trim();

    if (
      !/^https?:\/\//i.test(url)
    ) {
      if (/^t\.me\//i.test(url)) {
        url =
          `https://${url}`;
      } else {
        return;
      }
    }

    try {
      if (
        tg &&
        /t\.me/i.test(url) &&
        typeof tg.openTelegramLink ===
          'function'
      ) {
        tg.openTelegramLink(url);
        return;
      }

      if (
        tg &&
        typeof tg.openLink ===
          'function'
      ) {
        tg.openLink(url);
        return;
      }

      window.open(
        url,
        '_blank',
        'noopener,noreferrer'
      );

    } catch (error) {
      console.warn(
        'Could not open target:',
        error
      );
    }
  }


  async function completeTask(id, button) {
    if (!id || !button) return;

    button.disabled = true;
    button.textContent =
      'در حال بررسی...';

    try {
      const result =
        await api(
          `/api/tasks/${encodeURIComponent(id)}/complete`,
          {
            method: 'POST',
            body: {}
          }
        );

      state.points =
        Number(
          result.points ||
          state.points
        );

      updateHeader();

      haptic('success');

      toast(
        `🎉 ${
          formatPoints(
            result.reward ||
            result.pointsAwarded ||
            0
          )
        } پوینت دریافت شد.`,
        'success'
      );

      await renderTasks();

    } catch (error) {
      console.error(error);

      haptic('error');

      toast(
        error.message ||
        'تکمیل تسک انجام نشد.',
        'error'
      );

      button.disabled = false;

      button.textContent =
        'انجام دادم';
    }
  }


  /* =========================================================
     PROFILE
     ========================================================= */

  async function renderProfile() {
    setActiveTab('profile');

    const content =
      $('#content');

    if (!content) return;

    content.innerHTML =
      loadingHTML();

    try {
      const [
        pointsData,
        referralData
      ] = await Promise.all([
        loadPoints(),
        api('/api/referral/me')
      ]);

      state.referralCode =
        referralData.referralCode ||
        '';

      state.invitedCount =
        Number(
          referralData.invitedCount || 0
        );

      const level =
        levelInfo(
          pointsData.points
        );

      const firstName =
        state.user?.firstName ||
        state.user?.first_name ||
        'کاربر';

      const username =
        state.user?.username ||
        '';

      const referralLink =
        `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}` +
        `?startapp=${encodeURIComponent(
          state.referralCode
        )}`;

      content.innerHTML = `
        <section class="profileHero">

          <div class="profileAvatar">
            ${escapeHTML(
              firstName
                .charAt(0)
                .toUpperCase()
            )}
          </div>

          <div class="profileName">
            ${escapeHTML(firstName)}
          </div>

          <div class="profileUsername">
            ${
              username
                ? '@' + escapeHTML(username)
                : 'کاربر فعال'
            }
          </div>

          <div class="profileBalance">
            ${formatPoints(pointsData.points)}
            <span>POINTS</span>
          </div>

          <div class="profileStats">

            <div class="profileStat">
              <div class="profileStatValue">
                ${formatPoints(pointsData.points)}
              </div>
              <div class="profileStatLabel">
                موجودی
              </div>
            </div>

            <div class="profileStat">
              <div class="profileStatValue">
                ${formatPoints(state.invitedCount)}
              </div>
              <div class="profileStatLabel">
                دعوت‌شده
              </div>
            </div>

          </div>

        </section>


        <section class="sectionBlock">

          <div class="referralCard">

            <div class="referralTitle">
              👥 دعوت دوستان
            </div>

            <div class="referralText">
              دوستانت را با لینک اختصاصی خودت دعوت کن.
            </div>

            <div class="refCount">
              ${formatPoints(state.invitedCount)}
              نفر دعوت شده
            </div>

            <input
              id="referralLinkInput"
              class="refLink"
              value="${escapeHTML(referralLink)}"
              readonly
            >

            <div class="twoBtns">

              <button
                id="copyReferral"
                class="secondaryBtn"
              >
                📋 کپی لینک
              </button>

              <button
                id="shareReferral"
                class="primaryBtn"
              >
                🚀 اشتراک
              </button>

            </div>

          </div>

        </section>


        <section class="sectionBlock">

          <div class="settingsList">

            <div class="settingsItem">

              <div class="appearanceIcon">
                🎨
              </div>

              <div class="appearanceInfo">

                <div class="appearanceTitle">
                  ظاهر برنامه
                </div>

                <div
                  id="themeLabel"
                  class="appearanceText"
                >
                  حالت تیره
                </div>

              </div>

              <button
                id="themeToggle"
                class="themeToggle"
                type="button"
              >
                <span class="switchThumb">
                </span>
              </button>

            </div>

          </div>

        </section>


        <section class="sectionBlock">

          <div class="card">

            <div class="rowBetween">

              <strong>
                Level ${level.level}
              </strong>

              <span class="muted">
                ${formatPoints(level.remaining)}
                تا سطح بعد
              </span>

            </div>

            <div class="progress mt12">
              <div
                style="width:${level.progress}%"
              ></div>
            </div>

          </div>

        </section>


        <div class="termsLinkWrap">
          <button
            class="termsLink"
            type="button"
            onclick="showTerms()"
          >
            قوانین و شرایط استفاده
          </button>
        </div>
      `;

      updateThemeUI();

      $('#themeToggle')?.addEventListener(
        'click',
        toggleTheme
      );

      $('#copyReferral')?.addEventListener(
        'click',
        async () => {
          try {
            await navigator.clipboard.writeText(
              referralLink
            );

            haptic('success');

            toast(
              'لینک دعوت کپی شد 📋',
              'success'
            );

          } catch {
            toast(
              referralLink,
              'info',
              6000
            );
          }
        }
      );

      $('#shareReferral')?.addEventListener(
        'click',
        () => {
          const url =
            `https://t.me/share/url?url=${
              encodeURIComponent(referralLink)
            }&text=${
              encodeURIComponent(
                '🎁 بیا داخل برنامه و امتیاز جمع کنیم!'
              )
            }`;

          try {
            if (
              tg &&
              typeof tg.openTelegramLink ===
                'function'
            ) {
              tg.openTelegramLink(url);
            } else {
              window.open(
                url,
                '_blank'
              );
            }
          } catch {}
        }
      );

    } catch (error) {
      console.error(error);

      showError(
        error.message ||
        'پروفایل دریافت نشد.'
      );
    }
  }


  /* =========================================================
     WALLET
     ========================================================= */

  async function renderWallet() {
    setActiveTab('wallet');

    const content =
      $('#content');

    if (!content) return;

    content.innerHTML =
      loadingHTML();

    try {
      const [
        pointsData,
        leaderboardData
      ] = await Promise.all([
        loadPoints(),
        api('/api/leaderboard/top')
      ]);

      const users =
        Array.isArray(
          leaderboardData.top
        )
          ? leaderboardData.top
          : Array.isArray(
              leaderboardData.users
            )
            ? leaderboardData.users
            : [];

      const leaderboard =
        users.map(
          (user, index) => {
            const rank =
              Number(
                user.rank ||
                index + 1
              );

            const name =
              user.firstName ||
              user.first_name ||
              user.username ||
              'کاربر';

            return `
              <div class="leaderRow">

                <div class="leaderRank">
                  ${
                    rank <= 3
                      ? ['🥇','🥈','🥉'][rank - 1]
                      : rank
                  }
                </div>

                <div class="leaderAvatar">
                  ${escapeHTML(
                    name
                      .charAt(0)
                      .toUpperCase()
                  )}
                </div>

                <div class="leaderInfo">

                  <div class="leaderName">
                    ${escapeHTML(name)}
                  </div>

                </div>

                <div class="leaderPoints">
                  ${formatPoints(
                    user.points || 0
                  )}
                </div>

              </div>
            `;
          }
        ).join('');

      content.innerHTML = `
        <section class="pageTitle">

          <div class="eyebrow">
            WALLET
          </div>

          <h1>
            کیف پول
          </h1>

          <p class="muted">
            موجودی و درخواست برداشت خودت را مدیریت کن.
          </p>

        </section>


        <section class="walletHero">

          <div class="walletLabel">
            موجودی قابل برداشت
          </div>

          <div class="walletValue">
            ${formatPoints(pointsData.points)}
          </div>

          <div class="walletEstimate">
            ≈
            ${formatCrypto(
              pointsData.estimatedCryptoValue
            )}
            Crypto
          </div>

        </section>


        <section class="sectionBlock">

          <div class="walletCard">

            <div class="sectionHead">
              <h2>
                درخواست برداشت
              </h2>
            </div>

            <div class="walletForm">

              <label
                class="inputLabel"
                for="withdrawAmount"
              >
                مقدار پوینت
              </label>

              <input
                id="withdrawAmount"
                class="input"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                placeholder="مثلاً 1000"
              >

              <label
                class="inputLabel mt12"
                for="walletAddress"
              >
                آدرس کیف پول
              </label>

              <input
                id="walletAddress"
                class="input"
                type="text"
                autocomplete="off"
                maxlength="200"
                placeholder="آدرس کیف پول را وارد کنید"
              >

              <div class="formHint">
                موجودی فعلی:
                ${formatPoints(pointsData.points)}
                پوینت
              </div>

              <button
                id="withdrawBtn"
                class="primaryBtn withdrawButton"
              >
                💸 ثبت درخواست برداشت
              </button>

            </div>

          </div>

        </section>


        <section class="sectionBlock">

          <div class="sectionHead">
            <h2>
              🏆 برترین‌ها
            </h2>
          </div>

          <div class="leaderList">
            ${
              leaderboard ||
              `
                <div class="stateCard">
                  هنوز داده‌ای وجود ندارد.
                </div>
              `
            }
          </div>

        </section>
      `;

      $('#withdrawBtn')?.addEventListener(
        'click',
        requestWithdraw
      );

    } catch (error) {
      console.error(error);

      showError(
        error.message ||
        'اطلاعات کیف پول دریافت نشد.'
      );
    }
  }


  async function requestWithdraw() {
    const button =
      $('#withdrawBtn');

    const amountInput =
      $('#withdrawAmount');

    const walletInput =
      $('#walletAddress');

    const amount =
      Number(
        amountInput?.value || 0
      );

    const wallet =
      String(
        walletInput?.value || ''
      ).trim();

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      toast(
        'مقدار برداشت را درست وارد کنید.',
        'error'
      );
      return;
    }

    if (
      amount > state.points
    ) {
      toast(
        'موجودی پوینت کافی نیست.',
        'error'
      );
      return;
    }

    if (
      wallet.length < 10
    ) {
      toast(
        'آدرس کیف پول معتبر نیست.',
        'error'
      );
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent =
        'در حال ثبت...';
    }

    try {
      const result =
        await api(
          '/api/points/withdraw',
          {
            method: 'POST',
            body: {
              pointsAmount: amount,
              walletAddress: wallet
            }
          }
        );

      if (
        result.remainingPoints !==
        undefined
      ) {
        state.points =
          Number(
            result.remainingPoints
          );
      } else {
        state.points -= amount;
      }

      updateHeader();

      haptic('success');

      toast(
        result.message ||
        'درخواست برداشت ثبت شد ✅',
        'success',
        5000
      );

      await renderWallet();

    } catch (error) {
      console.error(error);

      haptic('error');

      toast(
        error.message ||
        'درخواست برداشت ثبت نشد.',
        'error'
      );

      if (button) {
        button.disabled = false;
        button.textContent =
          '💸 ثبت درخواست برداشت';
      }
    }
  }


  /* =========================================================
     INITIALIZATION
     ========================================================= */

  async function initialize() {
    if (state.initialized) return;

    state.initialized = true;

    applyTheme(getTheme());

    bindNavigation();

    try {
      if (!getInitData()) {
        throw new Error(
          'این برنامه باید از داخل Telegram اجرا شود.'
        );
      }

      const auth =
        await authenticate();

      /*
       * کاربر جدید:
       * ابتدا CAPTCHA نمایش داده می‌شود.
       */
      if (!auth?.captchaPassed) {
        showCaptcha(
          auth?.captchaQuestion
        );

        return;
      }

      /*
       * کاربر تأیید شده:
       * مستقیماً Home
       */
      state.captchaPassed = true;

      await loadPoints();

      await renderHome();

    } catch (error) {
      console.error(
        'Initialization failed:',
        error
      );

      showError(
        error.message ||
        'اتصال به برنامه برقرار نشد.'
      );
    }
  }


  /* =========================================================
     TELEGRAM EVENTS
     ========================================================= */

  function setupTelegramEvents() {
    if (!tg) return;

    try {
      tg.onEvent?.(
        'themeChanged',
        () => {
          if (
            !localStorage.getItem(
              'miniAppTheme'
            )
          ) {
            applyTheme(
              tg.colorScheme === 'light'
                ? 'light'
                : 'dark'
            );
          }
        }
      );

      tg.onEvent?.(
        'viewportChanged',
        () => {
          document.documentElement.style.setProperty(
            '--tg-viewport-height',
            `${tg.viewportHeight || window.innerHeight}px`
          );
        }
      );

    } catch {}
  }


  /* =========================================================
     KEYBOARD
     ========================================================= */

  document.addEventListener(
    'keydown',
    event => {
      if (
        event.key === 'Enter' &&
        document.activeElement?.id ===
          'captchaAnswer'
      ) {
        submitCaptcha();
      }
    }
  );


  /* =========================================================
     START
     ========================================================= */

  setupTelegramEvents();

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }

})();