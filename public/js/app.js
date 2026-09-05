/* =========================================================
   Telegram Mini App — Premium Frontend
   ========================================================= */

(() => {
  'use strict';

  // =========================================================
  // Telegram
  // =========================================================

  const tg = window.Telegram?.WebApp || null;

  if (tg) {
    try {
      tg.ready();
      tg.expand();

      if (typeof tg.disableVerticalSwipes === 'function') {
        tg.disableVerticalSwipes();
      }

      if (typeof tg.setHeaderColor === 'function') {
        tg.setHeaderColor('#050609');
      }

      if (typeof tg.setBackgroundColor === 'function') {
        tg.setBackgroundColor('#050609');
      }
    } catch (error) {
      console.warn('Telegram WebApp initialization failed:', error);
    }
  }


  // =========================================================
  // DOM helpers
  // =========================================================

  const $ = (selector) =>
    document.querySelector(selector);

  const $$ = (selector) =>
    Array.from(document.querySelectorAll(selector));


  // =========================================================
  // App state
  // =========================================================

  const state = {
    user: null,
    points: 0,
    estimatedCryptoValue: 0,
    rate: 1000,

    streak: 0,
    canCheckIn: true,
    spinChances: 0,
    totalCheckins: 0,

    tasks: [],
    referralCode: '',
    invitedCount: 0,

    currentTab: 'home',
    loading: false,
    initialized: false,

    captchaPassed: false,
    termsAccepted: false
  };


  // =========================================================
  // Telegram initData
  // =========================================================

  function getInitData() {
    return tg?.initData || '';
  }


  // =========================================================
  // Theme
  // =========================================================

  const THEME_KEY = 'miniAppTheme';

  function getTheme() {
    const saved =
      localStorage.getItem(THEME_KEY);

    if (saved === 'light' || saved === 'dark') {
      return saved;
    }

    return 'dark';
  }

  function applyTheme(theme) {
    const normalized =
      theme === 'light'
        ? 'light'
        : 'dark';

    document.documentElement.dataset.theme =
      normalized;

    document.body.dataset.theme =
      normalized;

    localStorage.setItem(
      THEME_KEY,
      normalized
    );

    updateThemeUI();
  }

  function toggleTheme() {
    const next =
      getTheme() === 'dark'
        ? 'light'
        : 'dark';

    applyTheme(next);

    haptic('light');
  }

  function updateThemeUI() {
    const icon = $('#themeIcon');
    const label = $('#themeLabel');

    if (!icon && !label) {
      return;
    }

    const dark = getTheme() === 'dark';

    if (icon) {
      icon.innerHTML = dark
        ? `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 14.8A8.5 8.5 0 0 1 9.2 3
              8.5 8.5 0 1 0 21 14.8Z"/>
          </svg>
        `
        : `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41
              M17.66 17.66l1.41 1.41M2 12h2M20 12h2
              M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
          </svg>
        `;
    }

    if (label) {
      label.textContent =
        dark
          ? 'حالت روشن'
          : 'حالت تاریک';
    }
  }


  // =========================================================
  // Haptic
  // =========================================================

  function haptic(type = 'light') {
    try {
      if (!tg?.HapticFeedback) {
        return;
      }

      if (type === 'success') {
        tg.HapticFeedback.notificationOccurred(
          'success'
        );
        return;
      }

      if (type === 'error') {
        tg.HapticFeedback.notificationOccurred(
          'error'
        );
        return;
      }

      if (type === 'warning') {
        tg.HapticFeedback.notificationOccurred(
          'warning'
        );
        return;
      }

      tg.HapticFeedback.impactOccurred(
        type
      );
    } catch (error) {
      // Ignore haptic errors.
    }
  }


  // =========================================================
  // Toast
  // =========================================================

  let toastTimer = null;

  function toast(
    message,
    type = 'info',
    duration = 3000
  ) {
    const element = $('#toast');

    if (!element) {
      return;
    }

    clearTimeout(toastTimer);

    element.className =
      `toast toast-${type}`;

    element.textContent =
      String(message || '');

    element.classList.add('show');

    toastTimer =
      setTimeout(() => {
        element.classList.remove('show');
      }, duration);
  }


  // =========================================================
  // API
  // =========================================================

  async function api(
    endpoint,
    options = {}
  ) {
    const initData =
      getInitData();

    const method =
      String(
        options.method || 'GET'
      ).toUpperCase();

    const headers = {
      Accept: 'application/json',
      ...(options.headers || {})
    };

    let url = endpoint;
    let body = options.body;

    if (method === 'GET') {
      const separator =
        url.includes('?')
          ? '&'
          : '?';

      url +=
        `${separator}initData=${encodeURIComponent(
          initData
        )}`;
    } else {
      headers['Content-Type'] =
        'application/json';

      let parsedBody = {};

      if (body) {
        try {
          parsedBody =
            typeof body === 'string'
              ? JSON.parse(body)
              : body;
        } catch {
          parsedBody = {};
        }
      }

      parsedBody.initData =
        initData;

      body =
        JSON.stringify(parsedBody);
    }

    const response =
      await fetch(url, {
        ...options,
        method,
        headers,
        body
      });

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = {
        success: false,
        message:
          'پاسخ نامعتبر از سرور دریافت شد.'
      };
    }

    if (!response.ok || data?.success === false) {
      const error =
        new Error(
          data?.message ||
          `خطای سرور (${response.status})`
        );

      error.status =
        response.status;

      error.data = data;

      throw error;
    }

    return data;
  }


  // =========================================================
  // Formatting
  // =========================================================

  function formatPoints(value) {
    const number =
      Number(value) || 0;

    return number.toLocaleString(
      'en-US'
    );
  }

  function formatCrypto(value) {
    const number =
      Number(value) || 0;

    if (number >= 1) {
      return number.toFixed(4);
    }

    if (number >= 0.001) {
      return number.toFixed(6);
    }

    return number.toFixed(8);
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }


  // =========================================================
  // Skeleton
  // =========================================================

  function skeletonCards(count = 3) {
    return Array.from(
      { length: count },
      () => `
        <div class="skeletonCard">
          <div class="skeletonLine skeletonLong"></div>
          <div class="skeletonLine skeletonMedium"></div>
          <div class="skeletonLine skeletonShort"></div>
        </div>
      `
    ).join('');
  }


  // =========================================================
  // Header
  // =========================================================

  function updateHeader() {
    const user =
      state.user || {};

    const firstName =
      user.first_name ||
      user.firstName ||
      'کاربر';

    const avatar =
      $('#avatar');

    const greetName =
      $('#greetName');

    const pointsDisplay =
      $('#pointsDisplay');

    if (greetName) {
      greetName.textContent =
        `سلام، ${firstName}`;
    }

    if (pointsDisplay) {
      pointsDisplay.textContent =
        formatPoints(state.points);
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
          firstName
            .trim()
            .charAt(0)
            .toUpperCase() || 'U';
      }
    }
  }


  // =========================================================
  // Tab navigation
  // =========================================================

  function setActiveTab(tab) {
    state.currentTab =
      tab;

    $$('.navItem').forEach(item => {
      item.classList.toggle(
        'active',
        item.dataset.tab === tab
      );
    });
  }

  function bindNavigation() {
    $$('.navItem').forEach(item => {
      item.addEventListener(
        'click',
        () => {
          const tab =
            item.dataset.tab;

          if (!tab) {
            return;
          }

          haptic('light');

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
      );
    });
  }


  // =========================================================
  // Home
  // =========================================================

  async function renderHome() {
    setActiveTab('home');

    const content =
      $('#content');

    if (!content) {
      return;
    }

    content.innerHTML = `
      <section class="heroSection reveal visible">
        <div class="heroGlow"></div>

        <div class="heroContent">
          <div class="heroEyebrow">
            <span class="statusDot"></span>
            سیستم فعال است
          </div>

          <h1>
            امتیاز جمع کن،
            <br>
            <span>آینده‌ات را بساز.</span>
          </h1>

          <p>
            با انجام مأموریت‌ها، چک‌این روزانه
            و دعوت دوستان امتیاز بیشتری کسب کن.
          </p>
        </div>
      </section>

      <section class="balanceCard reveal visible">
        <div class="balanceTop">
          <span>موجودی امتیاز</span>
          <span class="balanceBadge">POINTS</span>
        </div>

        <div class="balanceValue">
          ${formatPoints(state.points)}
        </div>

        <div class="balanceCrypto">
          ≈ ${formatCrypto(
            state.estimatedCryptoValue
          )} Crypto
        </div>

        <div class="balanceFooter">
          <span>
            نرخ تبدیل:
            ${formatPoints(state.rate)}
            امتیاز
          </span>

          <span>
            ${state.canCheckIn
              ? 'پاداش امروز آماده است'
              : 'چک‌این امروز انجام شده'}
          </span>
        </div>
      </section>

      <section class="statsGrid reveal visible">
        <div class="statCard">
          <div class="statIcon">🔥</div>
          <strong>${state.streak}</strong>
          <span>روز متوالی</span>
        </div>

        <div class="statCard">
          <div class="statIcon">🎡</div>
          <strong>${state.spinChances}</strong>
          <span>شانس اسپین</span>
        </div>

        <div class="statCard">
          <div class="statIcon">🎁</div>
          <strong>${state.totalCheckins}</strong>
          <span>چک‌این‌ها</span>
        </div>
      </section>

      <section class="sectionBlock reveal visible">
        <div class="sectionHeader">
          <div>
            <span class="sectionKicker">QUICK ACTIONS</span>
            <h2>سریع شروع کن</h2>
          </div>
        </div>

        <div class="quickActions">
          <button class="actionCard" data-action="tasks">
            <span class="actionIcon">🎯</span>
            <span>
              <strong>مأموریت‌ها</strong>
              <small>امتیاز بیشتر بگیر</small>
            </span>
            <span class="actionArrow">‹</span>
          </button>

          <button class="actionCard" data-action="daily">
            <span class="actionIcon">🔥</span>
            <span>
              <strong>چک‌این روزانه</strong>
              <small>استریک خودت را حفظ کن</small>
            </span>
            <span class="actionArrow">‹</span>
          </button>

          <button class="actionCard" data-action="profile">
            <span class="actionIcon">👥</span>
            <span>
              <strong>دعوت دوستان</strong>
              <small>امتیاز بیشتری کسب کن</small>
            </span>
            <span class="actionArrow">‹</span>
          </button>
        </div>
      </section>

      <section class="sectionBlock reveal visible">
        <div class="sectionHeader">
          <div>
            <span class="sectionKicker">YOUR JOURNEY</span>
            <h2>مسیر پیشرفت</h2>
          </div>
        </div>

        <div class="journeyCard">
          <div class="journeyStep active">
            <span>۱</span>
            <div>
              <strong>شروع کن</strong>
              <small>اولین امتیازهایت را بگیر</small>
            </div>
          </div>

          <div class="journeyLine"></div>

          <div class="journeyStep">
            <span>۲</span>
            <div>
              <strong>ادامه بده</strong>
              <small>استریک و مأموریت‌ها</small>
            </div>
          </div>

          <div class="journeyLine"></div>

          <div class="journeyStep">
            <span>۳</span>
            <div>
              <strong>برداشت کن</strong>
              <small>امتیازهایت را نقد کن</small>
            </div>
          </div>
        </div>
      </section>

      <section class="infoCard reveal visible">
        <div class="infoIcon">💡</div>
        <div>
          <strong>چطور بیشتر امتیاز بگیرم؟</strong>
          <p>
            هر روز وارد شو، مأموریت‌ها را کامل کن،
            دوستانت را دعوت کن و استریک خودت را حفظ کن.
          </p>
        </div>
      </section>
    `;

    bindHomeActions();
  }


  function bindHomeActions() {
    $$('.actionCard').forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const action =
            button.dataset.action;

          haptic('light');

          if (action === 'tasks') {
            renderTasks();
          }

          if (action === 'daily') {
            renderDaily();
          }

          if (action === 'profile') {
            renderProfile();
          }
        }
      );
    });
  }


  // =========================================================
  // Daily
  // =========================================================

  async function renderDaily() {
    setActiveTab('daily');

    const content =
      $('#content');

    if (!content) {
      return;
    }

    content.innerHTML = `
      <section class="pageHero reveal visible">
        <span class="sectionKicker">DAILY REWARD</span>
        <h1>پاداش روزانه</h1>
        <p>
          هر روز چک‌این کن و استریک خودت را بساز.
        </p>
      </section>

      <section class="streakCard reveal visible">
        <div class="streakOrb">🔥</div>

        <div class="streakNumber">
          ${state.streak}
        </div>

        <div class="streakLabel">
          روز متوالی
        </div>

        <div class="streakProgress">
          ${Array.from(
            { length: 7 },
            (_, index) => `
              <div class="streakDay ${
                index <
                Math.min(state.streak, 7)
                  ? 'done'
                  : ''
              } ${
                index ===
                Math.min(state.streak, 6)
                  ? 'current'
                  : ''
              }">
                <span>${index + 1}</span>
              </div>
            `
          ).join('')}
        </div>

        <p class="streakHint">
          ${
            state.streak >= 6
              ? 'فقط یک روز دیگر تا جایزه ویژه!'
              : '۷ روز متوالی = یک شانس اسپین 🎡'
          }
        </p>

        <button
          id="dailyCheckinBtn"
          class="primaryButton"
          ${state.canCheckIn ? '' : 'disabled'}
        >
          ${
            state.canCheckIn
              ? '🎁 دریافت پاداش امروز'
              : '✓ امروز دریافت شده'
          }
        </button>
      </section>

      <section class="spinCard reveal visible">
        <div class="spinCardTop">
          <div>
            <span class="sectionKicker">LUCKY SPIN</span>
            <h2>گردونه شانس</h2>
          </div>

          <span class="spinCount">
            ${state.spinChances} شانس
          </span>
        </div>

        <div class="spinPreview">
          <div class="spinWheelSmall">
            <span>🎡</span>
          </div>

          <div>
            <strong>
              امتیاز تصادفی برنده شو
            </strong>

            <p>
              ${SPIN_SEGMENTS_TEXT()}
            </p>
          </div>
        </div>

        <button
          id="spinBtn"
          class="secondaryButton"
          ${state.spinChances > 0 ? '' : 'disabled'}
        >
          ${state.spinChances > 0
            ? '🎡 چرخاندن گردونه'
            : 'شانس اسپین ندارید'}
        </button>
      </section>
    `;

    const dailyButton =
      $('#dailyCheckinBtn');

    if (dailyButton) {
      dailyButton.addEventListener(
        'click',
        handleDailyCheckin
      );
    }

    const spinButton =
      $('#spinBtn');

    if (spinButton) {
      spinButton.addEventListener(
        'click',
        handleSpin
      );
    }
  }

  function SPIN_SEGMENTS_TEXT() {
    return '۲، ۳، ۵، ۷، ۱۰، ۱۵ یا ۲۵ امتیاز';
  }


  async function handleDailyCheckin() {
    if (!state.canCheckIn) {
      toast(
        'پاداش امروز را قبلاً دریافت کرده‌ای.',
        'info'
      );
      return;
    }

    const button =
      $('#dailyCheckinBtn');

    if (button) {
      button.disabled = true;
      button.textContent =
        'در حال ثبت...';
    }

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
        Number(result.points) ||
        state.points;

      state.streak =
        Number(result.streak) ||
        0;

      state.spinChances =
        Number(result.spinChances) ||
        0;

      state.canCheckIn = false;

      updateHeader();

      haptic('success');

      toast(
        result.message ||
        'پاداش روزانه دریافت شد.',
        'success',
        4000
      );

      await renderDaily();

    } catch (error) {
      haptic('error');

      toast(
        error.message ||
        'ثبت چک‌این انجام نشد.',
        'error'
      );

      if (button) {
        button.disabled =
          false;

        button.textContent =
          '🎁 دریافت پاداش امروز';
      }
    }
  }


  async function handleSpin() {
    if (state.spinChances <= 0) {
      toast(
        'شانس اسپین ندارید.',
        'info'
      );
      return;
    }

    const button =
      $('#spinBtn');

    if (button) {
      button.disabled = true;
      button.textContent =
        'در حال چرخش...';
    }

    try {
      const result =
        await api(
          '/api/points/spin',
          {
            method: 'POST',
            body: {}
          }
        );

      const won =
        Number(result.won) || 0;

      state.points =
        Number(result.points) ||
        state.points;

      state.spinChances =
        Number(result.spinChances) ||
        0;

      updateHeader();

      haptic('success');

      toast(
        `🎉 تبریک! ${formatPoints(won)} امتیاز بردی.`,
        'success',
        4500
      );

      await renderDaily();

    } catch (error) {
      haptic('error');

      toast(
        error.message ||
        'اسپین انجام نشد.',
        'error'
      );

      if (button) {
        button.disabled =
          false;

        button.textContent =
          '🎡 چرخاندن گردونه';
      }
    }
  }


  // =========================================================
  // Tasks
  // =========================================================

  async function renderTasks() {
    setActiveTab('tasks');

    const content =
      $('#content');

    if (!content) {
      return;
    }

    content.innerHTML = `
      <section class="pageHero reveal visible">
        <span class="sectionKicker">EARN POINTS</span>
        <h1>مأموریت‌ها</h1>
        <p>
          مأموریت‌ها را کامل کن و امتیاز بگیر.
        </p>
      </section>

      <div id="tasksContainer">
        ${skeletonCards(3)}
      </div>
    `;

    try {
      const result =
        await api('/api/tasks');

      state.tasks =
        Array.isArray(result.tasks)
          ? result.tasks
          : [];

      renderTaskList();

    } catch (error) {
      const container =
        $('#tasksContainer');

      if (container) {
        container.innerHTML = `
          <div class="emptyState errorState">
            <div class="emptyIcon">⚠️</div>
            <strong>خطا در دریافت مأموریت‌ها</strong>
            <p>
              ${escapeHTML(
                error.message ||
                'لطفاً دوباره تلاش کنید.'
              )}
            </p>

            <button
              id="retryTasks"
              class="primaryButton"
            >
              تلاش دوباره
            </button>
          </div>
        `;

        $('#retryTasks')
          ?.addEventListener(
            'click',
            renderTasks
          );
      }
    }
  }


  function renderTaskList() {
    const container =
      $('#tasksContainer');

    if (!container) {
      return;
    }

    if (!state.tasks.length) {
      container.innerHTML = `
        <div class="emptyState">
          <div class="emptyIcon">🎯</div>
          <strong>فعلاً مأموریتی وجود ندارد</strong>
          <p>
            به‌زودی مأموریت‌های جدید اضافه می‌شوند.
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      state.tasks.map(
        (task, index) => {
          const title =
            task.title ||
            `مأموریت ${index + 1}`;

          const description =
            task.description ||
            'این مأموریت را کامل کن و امتیاز بگیر.';

          const reward =
            Number(task.reward) || 0;

          const completed =
            Boolean(task.completed);

          const target =
            task.target ||
            task.channelUsername ||
            '';

          return `
            <article
              class="taskCard ${
                completed
                  ? 'completed'
                  : ''
              } reveal visible"
              data-task-id="${escapeHTML(
                task.id ||
                task._id
              )}"
            >
              <div class="taskIcon">
                ${escapeHTML(
                  task.icon ||
                  (task.type === 'channel'
                    ? '📣'
                    : '🎯')
                )}
              </div>

              <div class="taskBody">
                <div class="taskTitleRow">
                  <h3>
                    ${escapeHTML(title)}
                  </h3>

                  <span class="taskReward">
                    +${formatPoints(reward)}
                  </span>
                </div>

                <p>
                  ${escapeHTML(description)}
                </p>

                ${
                  target
                    ? `
                      <span class="taskTarget">
                        ${escapeHTML(target)}
                      </span>
                    `
                    : ''
                }
              </div>

              <button
                class="taskButton ${
                  completed
                    ? 'done'
                    : ''
                }"
                data-complete-task="${
                  escapeHTML(
                    task.id ||
                    task._id
                  )
                }"
                ${
                  completed
                    ? 'disabled'
                    : ''
                }
              >
                ${
                  completed
                    ? '✓ انجام شد'
                    : 'دریافت پاداش'
                }
              </button>
            </article>
          `;
        }
      ).join('');

    $$('[data-complete-task]')
      .forEach(button => {
        button.addEventListener(
          'click',
          () => completeTask(
            button.dataset.completeTask
          )
        );
      });
  }


  async function completeTask(taskId) {
    if (!taskId) {
      return;
    }

    const task =
      state.tasks.find(
        item =>
          String(
            item.id ||
            item._id
          ) === String(taskId)
      );

    if (!task || task.completed) {
      return;
    }

    const button =
      document.querySelector(
        `[data-complete-task="${CSS.escape(
          String(taskId)
        )}"]`
      );

    if (button) {
      button.disabled = true;
      button.textContent =
        'در حال بررسی...';
    }

    try {
      /*
       * اگر task لینک Telegram دارد،
       * ابتدا آن را باز می‌کنیم.
       */
      const target =
        task.target ||
        task.channelUsername ||
        '';

      if (
        target &&
        !task.completed
      ) {
        openTelegramTarget(target);
      }

      /*
       * کمی زمان برای باز شدن لینک.
       */
      await delay(500);

      const result =
        await api(
          `/api/tasks/${encodeURIComponent(
            taskId
          )}/complete`,
          {
            method: 'POST',
            body: {}
          }
        );

      task.completed = true;

      state.points =
        Number(result.points) ||
        state.points;

      updateHeader();

      haptic('success');

      toast(
        result.message ||
        `🎉 ${formatPoints(
          result.reward
        )} امتیاز دریافت کردی.`,
        'success',
        4500
      );

      renderTaskList();

    } catch (error) {
      haptic('error');

      if (
        error?.status === 409
      ) {
        task.completed = true;
        renderTaskList();
      }

      toast(
        error.message ||
        'انجام مأموریت ممکن نشد.',
        'error'
      );

      if (button) {
        button.disabled = false;
        button.textContent =
          'دریافت پاداش';
      }
    }
  }


  function openTelegramTarget(target) {
    const value =
      String(target || '').trim();

    if (!value) {
      return;
    }

    let url =
      value;

    if (
      !/^https?:\/\//i.test(value) &&
      /^t\.me\//i.test(value)
    ) {
      url =
        `https://${value}`;
    }

    if (
      !/^https?:\/\//i.test(url)
    ) {
      return;
    }

    try {
      if (
        tg &&
        typeof tg.openTelegramLink === 'function' &&
        /t\.me/i.test(url)
      ) {
        tg.openTelegramLink(url);
        return;
      }

      if (
        tg &&
        typeof tg.openLink === 'function'
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
        'Could not open Telegram target:',
        error
      );
    }
  }


  // =========================================================
  // Profile / Referral
  // =========================================================

  async function renderProfile() {
    setActiveTab('profile');

    const content =
      $('#content');

    if (!content) {
      return;
    }

    content.innerHTML = `
      <section class="pageHero reveal visible">
        <span class="sectionKicker">YOUR ACCOUNT</span>
        <h1>پروفایل</h1>
        <p>
          حساب، دعوت دوستان و تنظیمات برنامه.
        </p>
      </section>

      <section class="profileCard reveal visible">
        <div class="profileAvatar">
          ${
            state.user?.photo_url
              ? `<img
                  src="${escapeHTML(
                    state.user.photo_url
                  )}"
                  alt=""
                >`
              : escapeHTML(
                  (
                    state.user?.first_name ||
                    'U'
                  )
                    .charAt(0)
                    .toUpperCase()
                )
          }
        </div>

        <div>
          <strong>
            ${escapeHTML(
              state.user?.first_name ||
              'کاربر'
            )}
          </strong>

          <span>
            ${
              state.user?.username
                ? `@${escapeHTML(
                    state.user.username
                  )}`
                : 'عضو برنامه'
            }
          </span>
        </div>
      </section>

      <section class="referralCard reveal visible">
        <div class="referralHeader">
          <div>
            <span class="sectionKicker">
              REFERRAL
            </span>
            <h2>دوستات را دعوت کن</h2>
          </div>

          <span class="referralIcon">👥</span>
        </div>

        <p>
          لینک اختصاصی خودت را برای دوستانت بفرست.
        </p>

        <div class="referralStats">
          <strong id="invitedCount">
            ${formatPoints(
              state.invitedCount
            )}
          </strong>
          <span>دوست دعوت‌شده</span>
        </div>

        <div class="referralLinkBox">
          <span id="referralLinkText">
            در حال دریافت لینک...
          </span>

          <button
            id="copyReferralBtn"
            type="button"
          >
            کپی
          </button>
        </div>

        <button
          id="shareReferralBtn"
          class="primaryButton"
        >
          🚀 دعوت دوستان
        </button>
      </section>

      <section class="appearanceCard reveal visible">
        <div class="settingIcon">
          🎨
        </div>

        <div class="settingBody">
          <strong>ظاهر برنامه</strong>
          <span id="themeLabel">
            حالت روشن
          </span>
        </div>

        <button
          id="themeToggle"
          class="themeToggle"
          type="button"
          aria-label="تغییر تم"
        >
          <span id="themeIcon"></span>
        </button>
      </section>

      <section class="aboutCard reveal visible">
        <div class="aboutIcon">✨</div>

        <div>
          <strong>
            Premium Rewards
          </strong>

          <p>
            مأموریت‌ها را انجام بده، امتیاز جمع کن
            و پاداش بگیر.
          </p>
        </div>
      </section>
    `;

    await loadReferral();

    $('#themeToggle')
      ?.addEventListener(
        'click',
        toggleTheme
      );

    $('#copyReferralBtn')
      ?.addEventListener(
        'click',
        copyReferral
      );

    $('#shareReferralBtn')
      ?.addEventListener(
        'click',
        shareReferral
      );

    updateThemeUI();
  }


  async function loadReferral() {
    try {
      const result =
        await api(
          '/api/referral/me'
        );

      state.referralCode =
        result.referralCode ||
        '';

      state.invitedCount =
        Number(
          result.invitedCount
        ) || 0;

      const link =
        buildReferralLink();

      const text =
        $('#referralLinkText');

      const count =
        $('#invitedCount');

      if (text) {
        text.textContent =
          link ||
          'لینک در دسترس نیست';
      }

      if (count) {
        count.textContent =
          formatPoints(
            state.invitedCount
          );
      }

    } catch (error) {
      console.error(
        'Referral loading failed:',
        error
      );

      const text =
        $('#referralLinkText');

      if (text) {
        text.textContent =
          'خطا در دریافت لینک';
      }
    }
  }


  function buildReferralLink() {
    if (!state.referralCode) {
      return '';
    }

    return (
      `https://t.me/AmirAFG123_bot/app` +
      `?startapp=${encodeURIComponent(
        state.referralCode
      )}`
    );
  }


  async function copyReferral() {
    const link =
      buildReferralLink();

    if (!link) {
      toast(
        'لینک دعوت هنوز آماده نیست.',
        'error'
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(
        link
      );

      haptic('success');

      toast(
        '✅ لینک دعوت کپی شد.',
        'success'
      );

    } catch (error) {
      toast(
        link,
        'info',
        6000
      );
    }
  }


  function shareReferral() {
    const link =
      buildReferralLink();

    if (!link) {
      toast(
        'لینک دعوت هنوز آماده نیست.',
        'error'
      );
      return;
    }

    const text =
      '🎁 بیا داخل برنامه و امتیاز جمع کنیم!';

    const shareUrl =
      `https://t.me/share/url?url=${encodeURIComponent(
        link
      )}&text=${encodeURIComponent(
        text
      )}`;

    try {
      if (
        tg &&
        typeof tg.openTelegramLink === 'function'
      ) {
        tg.openTelegramLink(
          shareUrl
        );
        return;
      }

      window.open(
        shareUrl,
        '_blank',
        'noopener,noreferrer'
      );

    } catch (error) {
      console.error(
        'Referral share failed:',
        error
      );
    }
  }


  // =========================================================
  // Wallet
  // =========================================================

  async function renderWallet() {
    setActiveTab('wallet');

    const content =
      $('#content');

    if (!content) {
      return;
    }

    content.innerHTML = `
      <section class="pageHero reveal visible">
        <span class="sectionKicker">YOUR WALLET</span>
        <h1>کیف پول</h1>
        <p>
          موجودی و درخواست برداشت خودت را مدیریت کن.
        </p>
      </section>

      <section class="walletBalanceCard reveal visible">
        <span>موجودی قابل برداشت</span>

        <strong>
          ${formatPoints(state.points)}
        </strong>

        <small>
          ≈ ${formatCrypto(
            state.estimatedCryptoValue
          )} Crypto
        </small>
      </section>

      <section class="withdrawCard reveal visible">
        <div class="sectionHeader">
          <div>
            <span class="sectionKicker">
              WITHDRAW
            </span>

            <h2>درخواست برداشت</h2>
          </div>
        </div>

        <label class="fieldLabel">
          مقدار امتیاز
        </label>

        <input
          id="withdrawAmount"
          class="textInput"
          type="number"
          min="1"
          step="1"
          inputmode="numeric"
          placeholder="مثلاً 1000"
        >

        <label class="fieldLabel">
          آدرس کیف پول
        </label>

        <input
          id="withdrawWallet"
          class="textInput"
          type="text"
          maxlength="200"
          autocomplete="off"
          placeholder="آدرس کیف پول خود را وارد کنید"
        >

        <div class="withdrawHint">
          موجودی شما:
          <strong>
            ${formatPoints(state.points)}
          </strong>
          points
        </div>

        <button
          id="withdrawBtn"
          class="primaryButton"
        >
          💸 ثبت درخواست برداشت
        </button>
      </section>

      <section class="leaderboardCard reveal visible">
        <div class="sectionHeader">
          <div>
            <span class="sectionKicker">
              LEADERBOARD
            </span>

            <h2>برترین‌ها</h2>
          </div>
        </div>

        <div id="leaderboardList">
          ${skeletonCards(3)}
        </div>
      </section>
    `;

    $('#withdrawBtn')
      ?.addEventListener(
        'click',
        handleWithdraw
      );

    await loadLeaderboard();
  }


  async function handleWithdraw() {
    const amountInput =
      $('#withdrawAmount');

    const walletInput =
      $('#withdrawWallet');

    const button =
      $('#withdrawBtn');

    const amount =
      Number(
        amountInput?.value
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
        'مقدار برداشت باید یک عدد صحیح بیشتر از صفر باشد.',
        'error'
      );
      return;
    }

    if (
      amount > state.points
    ) {
      toast(
        'موجودی امتیاز شما کافی نیست.',
        'error'
      );
      return;
    }

    if (wallet.length < 10) {
      toast(
        'آدرس کیف پول کوتاه یا نامعتبر است.',
        'error'
      );
      return;
    }

    if (wallet.length > 200) {
      toast(
        'آدرس کیف پول بیش از حد طولانی است.',
        'error'
      );
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent =
        'در حال ثبت درخواست...';
    }

    try {
      const result =
        await api(
          '/api/points/withdraw',
          {
            method: 'POST',

            body: {
              amount,
              walletAddress: wallet
            }
          }
        );

      state.points =
        Number(
          result.remainingPoints
        ) ||
        0;

      state.estimatedCryptoValue =
        state.points /
        state.rate;

      updateHeader();

      haptic('success');

      toast(
        result.message ||
        'درخواست برداشت ثبت شد.',
        'success',
        5000
      );

      if (amountInput) {
        amountInput.value = '';
      }

      if (walletInput) {
        walletInput.value = '';
      }

      await renderWallet();

    } catch (error) {
      haptic('error');

      toast(
        error.message ||
        'ثبت برداشت انجام نشد.',
        'error'
      );

      if (button) {
        button.disabled =
          false;

        button.textContent =
          '💸 ثبت درخواست برداشت';
      }
    }
  }


  async function loadLeaderboard() {
    const container =
      $('#leaderboardList');

    if (!container) {
      return;
    }

    try {
      const result =
        await api(
          '/api/leaderboard/top'
        );

      const users =
        Array.isArray(result.users)
          ? result.users
          : Array.isArray(result.top)
            ? result.top
            : [];

      if (!users.length) {
        container.innerHTML = `
          <div class="emptyState">
            <div class="emptyIcon">🏆</div>
            <strong>
              هنوز رتبه‌بندی آماده نیست
            </strong>
          </div>
        `;

        return;
      }

      container.innerHTML =
        users.map(
          (item, index) => {
            const rank =
              Number(
                item.rank
              ) || index + 1;

            const name =
              item.firstName ||
              item.first_name ||
              item.username ||
              'کاربر';

            const points =
              Number(
                item.points
              ) || 0;

            return `
              <div class="leaderRow">
                <span class="leaderRank">
                  ${rank}
                </span>

                <span class="leaderAvatar">
                  ${escapeHTML(
                    name
                      .charAt(0)
                      .toUpperCase()
                  )}
                </span>

                <span class="leaderName">
                  ${escapeHTML(name)}
                </span>

                <strong class="leaderPoints">
                  ${formatPoints(points)}
                </strong>
              </div>
            `;
          }
        ).join('');

    } catch (error) {
      console.error(
        'Leaderboard loading failed:',
        error
      );

      container.innerHTML = `
        <div class="emptyState">
          <div class="emptyIcon">⚠️</div>
          <strong>
            رتبه‌بندی در دسترس نیست
          </strong>
        </div>
      `;
    }
  }


  // =========================================================
  // Auth / Terms / Captcha
  // =========================================================

  function showOverlay(id) {
    const element =
      document.getElementById(id);

    if (!element) {
      return;
    }

    element.classList.add('show');
    element.setAttribute(
      'aria-hidden',
      'false'
    );
  }

  function hideOverlay(id) {
    const element =
      document.getElementById(id);

    if (!element) {
      return;
    }

    element.classList.remove('show');
    element.setAttribute(
      'aria-hidden',
      'true'
    );
  }


  async function authenticate() {
    /*
     * Backend auth endpoint.
     */
    try {
      const result =
        await api(
          '/api/auth',
          {
            method: 'POST',
            body: {}
          }
        );

      if (result?.user) {
        state.user =
          result.user;
      }

      state.captchaPassed =
        Boolean(
          result?.user?.captchaPassed
        );

      state.termsAccepted =
        Boolean(
          result?.user?.termsAccepted
        );

      return result;

    } catch (error) {
      console.error(
        'Authentication failed:',
        error
      );

      /*
       * اگر endpoint اصلی مسیر متفاوتی داشته باشد،
       * /api/auth/me را نیز امتحان می‌کنیم.
       */
      try {
        const result =
          await api(
            '/api/auth/me'
          );

        if (result?.user) {
          state.user =
            result.user;
        }

        state.captchaPassed =
          Boolean(
            result?.user?.captchaPassed
          );

        state.termsAccepted =
          Boolean(
            result?.user?.termsAccepted
          );

        return result;

      } catch (secondError) {
        throw error;
      }
    }
  }


  async function loadPoints() {
    const result =
      await api(
        '/api/points/me'
      );

    state.points =
      Number(result.points) || 0;

    state.estimatedCryptoValue =
      Number(
        result.estimatedCryptoValue
      ) || 0;

    state.rate =
      Number(result.rate) ||
      1000;

    state.streak =
      Number(result.streak) || 0;

    state.canCheckIn =
      result.canCheckIn !== false;

    state.spinChances =
      Number(result.spinChances) || 0;

    state.totalCheckins =
      Number(result.totalCheckins) || 0;

    updateHeader();

    return result;
  }


  function setupTerms() {
    const accept =
      $('#hideTerms');

    if (!accept) {
      return;
    }

    accept.addEventListener(
      'click',
      async () => {
        accept.disabled = true;

        try {
          await api(
            '/api/auth/accept-terms',
            {
              method: 'POST',
              body: {}
            }
          );

          state.termsAccepted =
            true;

          hideOverlay(
            'termsOverlay'
          );

          haptic('success');

          toast(
            'شرایط با موفقیت پذیرفته شد.',
            'success'
          );

        } catch (error) {
          toast(
            error.message ||
            'ثبت شرایط انجام نشد.',
            'error'
          );

          accept.disabled = false;
        }
      }
    );
  }


  function setupCaptcha() {
    const button =
      $('#submitCaptcha');

    const input =
      $('#captchaAnswer');

    if (!button) {
      return;
    }

    button.addEventListener(
      'click',
      async () => {
        const answer =
          String(
            input?.value || ''
          ).trim();

        if (!answer) {
          setCaptchaError(
            'پاسخ را وارد کنید.'
          );
          return;
        }

        button.disabled = true;

        try {
          /*
           * Endpoint فعلی backend صرفاً verified=true
           * را قبول می‌کند و CAPTCHA واقعی نیست.
           */
          await api(
            '/api/auth/captcha',
            {
              method: 'POST',
              body: {
                verified: true,
                answer
              }
            }
          );

          state.captchaPassed =
            true;

          hideOverlay(
            'captchaOverlay'
          );

          haptic('success');

          toast(
            'تأیید با موفقیت انجام شد.',
            'success'
          );

          await continueAfterAuth();

        } catch (error) {
          setCaptchaError(
            error.message ||
            'تأیید انجام نشد.'
          );

          haptic('error');

        } finally {
          button.disabled = false;
        }
      }
    );
  }


  function setCaptchaError(message) {
    const element =
      $('#captchaError');

    if (!element) {
      return;
    }

    element.textContent =
      message || '';

    element.classList.toggle(
      'show',
      Boolean(message)
    );
  }


  async function continueAfterAuth() {
    if (!state.termsAccepted) {
      showOverlay(
        'termsOverlay'
      );
      return;
    }

    if (!state.captchaPassed) {
      showOverlay(
        'captchaOverlay'
      );
      return;
    }

    await loadPoints();

    renderHome();
  }


  // =========================================================
  // Initialization
  // =========================================================

  async function initialize() {
    if (state.initialized) {
      return;
    }

    state.initialized = true;

    applyTheme(
      getTheme()
    );

    bindNavigation();
    setupTerms();
    setupCaptcha();

    try {
      if (!getInitData()) {
        throw new Error(
          'این برنامه باید از داخل Telegram اجرا شود.'
        );
      }

      const authResult =
        await authenticate();

      if (authResult?.user) {
        state.user =
          authResult.user;
      }

      /*
       * بعضی نسخه‌های auth ممکن است وضعیت را
       * در root response برگردانند.
       */
      state.captchaPassed =
        Boolean(
          authResult?.captchaPassed ??
          authResult?.user?.captchaPassed
        );

      state.termsAccepted =
        Boolean(
          authResult?.termsAccepted ??
          authResult?.user?.termsAccepted
        );

      updateHeader();

      if (!state.termsAccepted) {
        showOverlay(
          'termsOverlay'
        );
        return;
      }

      if (!state.captchaPassed) {
        showOverlay(
          'captchaOverlay'
        );
        return;
      }

      await loadPoints();

      renderHome();

    } catch (error) {
      console.error(
        'App initialization failed:',
        error
      );

      const content =
        $('#content');

      if (content) {
        content.innerHTML = `
          <section class="emptyState appErrorState">
            <div class="emptyIcon">⚠️</div>

            <h2>
              اتصال به برنامه برقرار نشد
            </h2>

            <p>
              ${escapeHTML(
                error.message ||
                'لطفاً برنامه را دوباره باز کنید.'
              )}
            </p>

            <button
              id="reloadApp"
              class="primaryButton"
            >
              تلاش دوباره
            </button>
          </section>
        `;

        $('#reloadApp')
          ?.addEventListener(
            'click',
            () => {
              window.location.reload();
            }
          );
      }
    }
  }


  // =========================================================
  // Telegram events
  // =========================================================

  function setupTelegramEvents() {
    if (!tg) {
      return;
    }

    try {
      tg.onEvent?.(
        'themeChanged',
        () => {
          if (
            localStorage.getItem(
              THEME_KEY
            ) === null
          ) {
            const telegramTheme =
              tg.colorScheme;

            applyTheme(
              telegramTheme === 'light'
                ? 'light'
                : 'dark'
            );
          }
        }
      );

      tg.onEvent?.(
        'viewportChanged',
        () => {
          document.documentElement.style
            .setProperty(
              '--tg-viewport-height',
              `${tg.viewportHeight || window.innerHeight}px`
            );
        }
      );

    } catch (error) {
      console.warn(
        'Telegram events setup failed:',
        error
      );
    }
  }


  // =========================================================
  // Utilities
  // =========================================================

  function delay(ms) {
    return new Promise(
      resolve =>
        setTimeout(
          resolve,
          ms
        )
    );
  }


  // =========================================================
  // Start
  // =========================================================

  setupTelegramEvents();

  document.addEventListener(
    'DOMContentLoaded',
    initialize
  );

})();