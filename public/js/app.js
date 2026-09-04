/* =========================================================
   PREMIUM TELEGRAM MINI APP
   Main Application Logic
   ========================================================= */

const tg = window.Telegram.WebApp;

tg.expand();
tg.ready();

try {
  tg.setHeaderColor && tg.setHeaderColor('#050609');
  tg.setBackgroundColor && tg.setBackgroundColor('#050609');
} catch (e) {}

const initData = tg.initData;
const startParam = tg.initDataUnsafe?.start_param || null;

let currentUser = null;
let wheelRotation = 0;

/* =========================================================
   THEME
   ========================================================= */

function applyTheme(theme) {
  const selectedTheme = theme === 'light' ? 'light' : 'dark';

  document.documentElement.dataset.theme = selectedTheme;
  localStorage.setItem('miniAppTheme', selectedTheme);

  try {
    if (selectedTheme === 'light') {
      tg.setHeaderColor && tg.setHeaderColor('#f5f6f8');
      tg.setBackgroundColor && tg.setBackgroundColor('#f5f6f8');
    } else {
      tg.setHeaderColor && tg.setHeaderColor('#050609');
      tg.setBackgroundColor && tg.setBackgroundColor('#050609');
    }
  } catch (e) {}

  updateThemeUI();
}

function getTheme() {
  return localStorage.getItem('miniAppTheme') || 'dark';
}

function toggleTheme() {
  const nextTheme = getTheme() === 'dark' ? 'light' : 'dark';

  applyTheme(nextTheme);

  if (typeof haptic === 'function') {
    haptic('light');
  }

  toast(
    nextTheme === 'light'
      ? '☀️ حالت سفید فعال شد'
      : '🌙 حالت سیاه فعال شد'
  );
}

function updateThemeUI() {
  const theme = getTheme();

  const label = document.getElementById('themeLabel');
  const icon = document.getElementById('themeIcon');
  const toggle = document.getElementById('themeToggle');

  if (label) {
    label.innerText =
      theme === 'light' ? 'حالت سفید' : 'حالت سیاه';
  }

  if (icon) {
    icon.innerText = theme === 'light' ? '☀️' : '🌙';
  }

  if (toggle) {
    toggle.setAttribute(
      'aria-label',
      theme === 'light'
        ? 'تغییر به حالت سیاه'
        : 'تغییر به حالت سفید'
    );
  }
}

/* Apply saved theme immediately */
applyTheme(getTheme());


/* =========================================================
   HAPTIC
   ========================================================= */

function haptic(type = 'light') {
  try {
    if (!tg.HapticFeedback) return;

    if (type === 'success') {
      tg.HapticFeedback.notificationOccurred('success');
      return;
    }

    if (type === 'error') {
      tg.HapticFeedback.notificationOccurred('error');
      return;
    }

    if (type === 'warning') {
      tg.HapticFeedback.notificationOccurred('warning');
      return;
    }

    tg.HapticFeedback.impactOccurred(type);
  } catch (e) {}
}


/* =========================================================
   HELPERS
   ========================================================= */

function toast(msg) {
  const box = document.getElementById('toast');

  if (!box) return;

  const el = document.createElement('div');

  el.className = 'toastMsg';
  el.innerText = msg;

  box.innerHTML = '';
  box.appendChild(el);

  setTimeout(() => {
    if (box.contains(el)) {
      box.removeChild(el);
    }
  }, 2600);
}


async function api(path, options = {}) {
  try {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const data = await res.json();

    if (!res.ok && !data.error) {
      data.error = 'خطایی در ارتباط با سرور رخ داد';
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);

    return {
      error: 'اتصال به سرور برقرار نشد. دوباره تلاش کن.'
    };
  }
}


function skeletonHTML(n = 3) {
  return Array(n)
    .fill('<div class="skeleton"></div>')
    .join('');
}


function formatPoints(value) {
  return Number(value || 0).toLocaleString('fa-IR');
}


function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/* =========================================================
   TASK ICON
   ========================================================= */

function taskIconFor(link) {
  if (!link) return '🎯';

  if (
    link.includes('youtube') ||
    link.includes('youtu.be')
  ) {
    return '▶️';
  }

  if (
    link.includes('t.me/+') ||
    link.includes('joinchat')
  ) {
    return '👥';
  }

  if (link.includes('t.me')) {
    return '📢';
  }

  if (link.includes('instagram')) {
    return '📸';
  }

  return '🔗';
}


/* =========================================================
   WHEEL
   ========================================================= */

const WHEEL_SEGMENTS = [2, 3, 5, 7, 10, 15, 25];

const FLAG_COLORS = [
  '#111111',
  '#D32011',
  '#046A38'
];


function wheelSVG() {
  const n = WHEEL_SEGMENTS.length;
  const anglePer = 360 / n;

  const cx = 100;
  const cy = 100;
  const r = 88;

  let paths = '';
  let labels = '';

  for (let i = 0; i < n; i++) {
    const startAngle = i * anglePer;
    const endAngle = startAngle + anglePer;

    const x1 =
      cx +
      r *
        Math.sin(
          startAngle * Math.PI / 180
        );

    const y1 =
      cy -
      r *
        Math.cos(
          startAngle * Math.PI / 180
        );

    const x2 =
      cx +
      r *
        Math.sin(
          endAngle * Math.PI / 180
        );

    const y2 =
      cy -
      r *
        Math.cos(
          endAngle * Math.PI / 180
        );

    paths += `
      <path
        d="M${cx},${cy}
           L${x1},${y1}
           A${r},${r} 0 0,1 ${x2},${y2}
           Z"
        fill="${FLAG_COLORS[i % 3]}"
        stroke="#D4AF37"
        stroke-width="1.5"
      />
    `;

    const midAngle =
      startAngle + anglePer / 2;

    const lx =
      cx +
      (r * 0.6) *
        Math.sin(
          midAngle * Math.PI / 180
        );

    const ly =
      cy -
      (r * 0.6) *
        Math.cos(
          midAngle * Math.PI / 180
        );

    labels += `
      <text
        x="${lx}"
        y="${ly}"
        fill="#fff"
        font-size="16"
        font-weight="800"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        <tspan x="${lx}" dy="-4">
          ${WHEEL_SEGMENTS[i]}
        </tspan>

        <tspan
          x="${lx}"
          dy="13"
          font-size="8"
          font-weight="500"
        >
          Points
        </tspan>
      </text>
    `;
  }

  return `
    <svg
      id="wheelSvg"
      viewBox="0 0 200 200"
      width="230"
      height="230"
      aria-label="Lucky Spinner"
    >
      <circle
        cx="100"
        cy="100"
        r="97"
        fill="none"
        stroke="#D4AF37"
        stroke-width="7"
      />

      <g
        id="wheelGroup"
        style="transform-origin: 100px 100px;"
      >
        ${paths}
        ${labels}
      </g>

      <circle
        cx="100"
        cy="100"
        r="18"
        fill="#111"
        stroke="#D4AF37"
        stroke-width="3"
      />

      <text
        x="100"
        y="106"
        font-size="18"
        text-anchor="middle"
      >
        ⭐
      </text>
    </svg>
  `;
}


/* =========================================================
   SPIN
   ========================================================= */

async function doSpin() {
  const btn = document.getElementById('spinBtn');

  if (!btn) return;

  btn.disabled = true;
  btn.innerText = 'در حال چرخش...';

  haptic('medium');

  const data = await api('/api/points/spin', {
    method: 'POST',
    body: JSON.stringify({
      initData
    })
  });

  if (data.error) {
    toast(data.error);
    haptic('error');

    btn.disabled = false;
    btn.innerText = '🎡 SPIN NOW';

    return;
  }

  const n =
    data.segments?.length ||
    WHEEL_SEGMENTS.length;

  const anglePer = 360 / n;

  const targetAngle =
    data.segmentIndex * anglePer +
    anglePer / 2;

  const finalRotation =
    wheelRotation +
    (5 * 360) +
    (360 - targetAngle) -
    (wheelRotation % 360);

  wheelRotation = finalRotation;

  const wheelGroup =
    document.getElementById('wheelGroup');

  if (wheelGroup) {
    wheelGroup.style.transition =
      'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';

    wheelGroup.style.transform =
      `rotate(${finalRotation}deg)`;
  }

  setTimeout(() => {
    if (currentUser) {
      currentUser.points = data.points;
    }

    updateHeader();

    haptic('success');

    toast(
      `🎉 ${formatPoints(data.won)} پوینت بردی!`
    );

    renderDailyCheck();
  }, 4200);
}


/* =========================================================
   AUTH
   ========================================================= */

async function enterApp() {
  const data = await api('/api/auth/enter', {
    method: 'POST',
    body: JSON.stringify({
      initData,
      startParam
    })
  });

  if (data.error) {
    toast(data.error);
    return data;
  }

  currentUser = data.user;

  updateHeader();

  return data;
}


/* =========================================================
   CAPTCHA
   ========================================================= */

function showCaptcha(question) {
  const overlay =
    document.getElementById('captchaOverlay');

  const questionEl =
    document.getElementById('captchaQuestion');

  const errorEl =
    document.getElementById('captchaError');

  const answerEl =
    document.getElementById('captchaAnswer');

  if (overlay) {
    overlay.style.display = 'flex';
  }

  if (questionEl) {
    questionEl.innerText =
      `${question} = ?`;
  }

  if (errorEl) {
    errorEl.innerText = '';
  }

  if (answerEl) {
    answerEl.value = '';

    setTimeout(() => {
      answerEl.focus();
    }, 100);
  }
}


function hideCaptcha() {
  const overlay =
    document.getElementById('captchaOverlay');

  if (overlay) {
    overlay.style.display = 'none';
  }
}


async function submitCaptcha() {
  const answerEl =
    document.getElementById('captchaAnswer');

  const answer =
    answerEl?.value || '';

  const data = await api('/api/auth/captcha', {
    method: 'POST',
    body: JSON.stringify({
      initData,
      answer
    })
  });

  if (data.success) {
    hideCaptcha();

    haptic('success');

    setActiveTab('home');
    renderHome();

    return;
  }

  haptic('error');

  const errorEl =
    document.getElementById('captchaError');

  if (errorEl) {
    errorEl.innerText =
      'جواب اشتباه بود، دوباره امتحان کن';
  }

  showCaptcha(data.captchaQuestion);
}


/* =========================================================
   TERMS
   ========================================================= */

function showTerms() {
  const overlay =
    document.getElementById('termsOverlay');

  if (overlay) {
    overlay.style.display = 'flex';
  }
}


function hideTerms() {
  const overlay =
    document.getElementById('termsOverlay');

  if (overlay) {
    overlay.style.display = 'none';
  }
}


/* =========================================================
   HEADER
   ========================================================= */

function updateHeader() {
  const name =
    currentUser?.firstName ||
    'دوست من';

  const greet =
    document.getElementById('greetName');

  const points =
    document.getElementById('pointsDisplay');

  const avatar =
    document.getElementById('avatar');

  if (greet) {
    greet.innerText =
      `سلام ${name} 👋`;
  }

  if (points) {
    points.innerText =
      `${formatPoints(currentUser?.points)} پوینت`;
  }

  if (avatar) {
    avatar.innerText =
      (name[0] || 'A').toUpperCase();
  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setActiveTab(tab) {
  document
    .querySelectorAll('#tabbar button')
    .forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.tab === tab
      );
    });
}


/* =========================================================
   HOME
   ========================================================= */

async function renderHome() {
  const content =
    document.getElementById('content');

  if (!content) return;

  content.innerHTML = `
    <div class="homeLoading">
      <div class="homeSkeletonHero"></div>

      <div class="homeSkeletonGrid">
        <div class="homeSkeletonSmall"></div>
        <div class="homeSkeletonSmall"></div>
      </div>

      <div class="homeSkeletonSection"></div>
    </div>
  `;

  const data = await api(
    '/api/points/me?initData=' +
    encodeURIComponent(initData)
  );

  if (data.error) {
    content.innerHTML = `
      <div class="emptyState">
        <span class="emoji">⚠️</span>
        ${escapeHTML(data.error)}
      </div>
    `;

    return;
  }

  const points =
    Number(data.points || 0);

  const level =
    Math.floor(points / 500) + 1;

  const currentLevelPoints =
    points % 500;

  const progress =
    (currentLevelPoints / 500) * 100;

  const remaining =
    500 - currentLevelPoints;

  content.innerHTML = `
    <section class="homeHero reveal">
      <div class="heroGlow"></div>

      <div class="homeHeroTop">
        <div>
          <div class="heroEyebrow">
            موجودی فعلی
          </div>

          <div class="heroBalance">
            ${formatPoints(points)}
            <span class="heroCurrency">
              POINTS
            </span>
          </div>
        </div>

        <div class="heroCoin">
          💎
        </div>
      </div>

      <div class="levelArea">
        <div class="levelTop">
          <span>
            Level ${level}
          </span>

          <span>
            ${formatPoints(currentLevelPoints)} / 500
          </span>
        </div>

        <div class="levelTrack">
          <div
            class="levelTrackFill"
            style="width:${progress}%"
          ></div>
        </div>

        <div class="levelBottom">
          <span class="levelName">
            سطح ${level}
          </span>

          <span class="levelProgressText">
            ${formatPoints(remaining)}
            پوینت تا سطح بعد
          </span>
        </div>
      </div>
    </section>


    <section class="homeStats reveal">
      <button
        class="homeStatCard"
        data-home-tab="daily"
      >
        <div class="homeStatIcon streakIcon">
          🔥
        </div>

        <div class="homeStatInfo">
          <span class="homeStatLabel">
            Streak
          </span>

          <strong>
            ${formatPoints(data.streak || 0)}
            روز
          </strong>
        </div>

        <span class="homeStatArrow">
          ←
        </span>
      </button>


      <button
        class="homeStatCard"
        data-home-tab="daily"
      >
        <div class="homeStatIcon dailyIcon">
          🎁
        </div>

        <div class="homeStatInfo">
          <span class="homeStatLabel">
            Daily Check
          </span>

          <strong>
            ${data.canCheckIn ? '+2' : '✓'}
          </strong>
        </div>

        <span class="homeStatArrow">
          ←
        </span>
      </button>
    </section>


    <section class="homeWelcome reveal">
      <div class="homeWelcomeIcon">
        ✨
      </div>

      <div class="homeWelcomeContent">
        <strong>
          به مینی‌اپ خوش اومدی
        </strong>

        <p>
          تسک انجام بده، دوستانت رو دعوت کن
          و هر روز جایزه بگیر.
        </p>
      </div>
    </section>


    <section class="homeSection reveal">
      <div class="homeSectionHeader">
        <div>
          <span class="sectionEyebrow">
            EARN MORE
          </span>

          <h3>
            چطور پوینت جمع کنم؟
          </h3>
        </div>
      </div>

      <div class="earningList">

        <button
          class="earningItem"
          data-home-tab="tasks"
        >
          <div class="earningIcon earningPurple">
            ✓
          </div>

          <div class="earningContent">
            <strong>
              انجام تسک‌ها
            </strong>

            <span>
              با انجام تسک‌ها پوینت بگیر
            </span>
          </div>

          <span class="earningArrow">
            ←
          </span>
        </button>


        <button
          class="earningItem"
          data-home-tab="profile"
        >
          <div class="earningIcon earningGold">
            👥
          </div>

          <div class="earningContent">
            <strong>
              دعوت دوستان
            </strong>

            <span>
              دوستانت را دعوت کن و جایزه بگیر
            </span>
          </div>

          <span class="earningArrow">
            ←
          </span>
        </button>


        <button
          class="earningItem"
          data-home-tab="daily"
        >
          <div class="earningIcon earningBlue">
            🎡
          </div>

          <div class="earningContent">
            <strong>
              Lucky Spinner
            </strong>

            <span>
              هر روز Check-in کن و Spin بگیر
            </span>
          </div>

          <span class="earningArrow">
            ←
          </span>
        </button>

      </div>
    </section>


    <section class="journeyCard reveal">
      <div class="journeyRow">
        <div class="journeyIcon">
          🎯
        </div>

        <div class="journeyText">
          <strong>
            مسیر تو
          </strong>

          <span>
            ادامه بده تا به سطح بعدی برسی
          </span>
        </div>

        <div class="journeyValue">
          ${level}
        </div>
      </div>

      <div class="journeyDivider"></div>

      <div class="journeyRow">
        <div class="journeyIcon">
          💎
        </div>

        <div class="journeyText">
          <strong>
            مجموع پوینت
          </strong>

          <span>
            موجودی فعلی حساب
          </span>
        </div>

        <div class="journeyValue">
          ${formatPoints(points)}
        </div>
      </div>
    </section>


    <section class="homeInfo reveal">
      <div class="homeInfoIcon">
        💡
      </div>

      <div>
        <strong>
          یک نکته
        </strong>

        <p>
          هر روز وارد برنامه شو تا Streak خودت
          را حفظ کنی و شانس Spin بیشتری بگیری.
        </p>
      </div>
    </section>


    <div class="homeTerms">
      <button
        class="termsLink"
        onclick="showTerms()"
      >
        قوانین و شرایط استفاده
      </button>
    </div>
  `;

  document
    .querySelectorAll('[data-home-tab]')
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const tab =
            button.dataset.homeTab;

          setActiveTab(tab);

          if (tabs[tab]) {
            tabs[tab]();
          }
        }
      );
    });

  requestAnimationFrame(() => {
    document
      .querySelectorAll('.reveal')
      .forEach(el => {
        el.classList.add('visible');
      });
  });
}


/* =========================================================
   DAILY CHECK
   ========================================================= */

async function renderDailyCheck() {
  const content =
    document.getElementById('content');

  if (!content) return;

  content.innerHTML =
    skeletonHTML(2);

  const data = await api(
    '/api/points/me?initData=' +
    encodeURIComponent(initData)
  );

  if (data.error) {
    content.innerHTML = `
      <div class="emptyState">
        <span class="emoji">⚠️</span>
        ${escapeHTML(data.error)}
      </div>
    `;

    return;
  }

  const streakInCycle =
    Math.min(data.streak || 0, 7);

  const canSpin =
    (data.spinChances || 0) > 0;

  let streakItems = '';

  for (let i = 1; i <= 7; i++) {
    const done =
      i <= streakInCycle;

    const isGiftDay =
      i === 7;

    streakItems += `
      <div class="streakItem">

        <div class="
          streakCircle
          ${done ? 'done' : ''}
          ${isGiftDay && !done ? 'gift' : ''}
        ">
          ${
            done
              ? '✓'
              : isGiftDay
                ? '🎁'
                : i
          }
        </div>

        <div class="streakLabel">
          ${i}
        </div>

        <div class="streakPts">
          ${isGiftDay ? '+2+Spin' : '+2'}
        </div>

      </div>
    `;
  }

  content.innerHTML = `
    <div class="luckyCard">

      <div class="luckyTitle">
        🎡 Lucky Spinner 🇦🇫
      </div>

      <div class="luckySubtitle">
        Spin &amp; Win Points
      </div>

      <div class="statsRow">

        <div class="statBox points">
          <div class="label">
            My Points
          </div>

          <div class="value">
            ${formatPoints(data.points)}
          </div>
        </div>


        <div class="statBox checkin">
          <div class="label">
            Today
          </div>

          <div class="value">
            ${data.canCheckIn ? '+2' : '✓'}
          </div>
        </div>


        <div class="statBox streak">
          <div class="label">
            Streak
          </div>

          <div class="value">
            ${streakInCycle} Days
          </div>
        </div>

      </div>


      <div class="wheelWrap">
        <div class="wheelPointer"></div>
        ${wheelSVG()}
      </div>


      <button
        class="spinNowBtn"
        id="spinBtn"
        onclick="doSpin()"
        ${canSpin ? '' : 'disabled'}
      >
        🎯 SPIN NOW
      </button>

      <div class="spinHint">
        Tap the button to spin
      </div>


      <div class="chancesRow">
        <div class="chancesLeft">
          🎫 Available Chances:
          ${data.spinChances || 0}
        </div>

        <div class="muted tiny">
          Complete 7-day check-in
          for +1 chance
        </div>
      </div>

    </div>


    <div class="card">

      <div class="cardTitle">
        <span class="emoji">🔥</span>

        7-Day Streak

        <span
          class="muted streakTotal"
        >
          🏆 Total:
          ${data.totalCheckins || 0}
          Days
        </span>
      </div>

      <div class="streakGrid">
        ${streakItems}
      </div>

      <button
        class="action"
        id="checkinBtn"
        ${data.canCheckIn ? '' : 'disabled'}
      >
        ${
          data.canCheckIn
            ? 'دریافت جایزه امروز (۲+) 🎁'
            : 'امروز گرفتی، فردا دوباره بیا ✅'
        }
      </button>

    </div>


    <div class="card howItWorks">

      <div class="cardTitle">
        <span class="emoji">🎁</span>
        How it works?
      </div>

      <div class="muted">
        Check-in daily to earn 2 Points.
        <br>
        Complete 7 days to get 1 spin chance.
      </div>

    </div>
  `;

  const btn =
    document.getElementById('checkinBtn');

  if (btn) {
    btn.addEventListener(
      'click',
      async () => {

        btn.disabled = true;

        const res = await api(
          '/api/points/daily-checkin',
          {
            method: 'POST',
            body: JSON.stringify({
              initData
            })
          }
        );

        if (res.error) {
          toast(res.error);
          haptic('error');

          btn.disabled = false;

          return;
        }

        if (currentUser) {
          currentUser.points =
            res.points;
        }

        updateHeader();

        haptic('success');

        toast(
          res.earnedSpin
            ? '🎉 هفت روز کامل شد! یه چرخش رایگان گرفتی'
            : `${res.bonus}+ پوینت گرفتی! 🎉`
        );

        renderDailyCheck();
      }
    );
  }
}


/* =========================================================
   TASKS
   ========================================================= */

async function renderTasks() {
  const content =
    document.getElementById('content');

  if (!content) return;

  content.innerHTML =
    skeletonHTML(4);

  const data = await api(
    '/api/tasks?initData=' +
    encodeURIComponent(initData)
  );

  if (data.error) {
    content.innerHTML = `
      <div class="emptyState">
        <span class="emoji">⚠️</span>
        ${escapeHTML(data.error)}
      </div>
    `;

    return;
  }

  const tasks =
    data.tasks || [];

  if (tasks.length === 0) {
    content.innerHTML = `
      <div class="emptyState">
        <span class="emoji">🗒️</span>

        فعلا تسکی وجود نداره

        <br>

        بعدا دوباره سر بزن
      </div>
    `;

    return;
  }

  content.innerHTML =
    tasks.map(task => `
      <div class="card taskCard">

        <div class="taskRow">

          <div class="taskIcon">
            ${taskIconFor(task.link)}
          </div>

          <div class="taskInfo">

            <div class="title">
              ${escapeHTML(task.title)}
            </div>

            <div class="desc">
              ${escapeHTML(task.description || '')}
            </div>

            <div class="rewardBadge">
              +${formatPoints(task.pointsReward)}
              پوینت
            </div>

          </div>

        </div>


        ${
          task.link
            ? `
              <a
                href="${escapeHTML(task.link)}"
                target="_blank"
                rel="noopener noreferrer"
                class="taskLink"
              >
                <button
                  class="secondary"
                  type="button"
                >
                  باز کردن لینک
                </button>
              </a>
            `
            : ''
        }


        <div class="taskAction">
          <button
            class="action"
            ${task.completed ? 'disabled' : ''}
            onclick="completeTask('${task._id}')"
          >
            ${
              task.completed
                ? 'انجام شده ✅'
                : 'انجام دادم'
            }
          </button>
        </div>

      </div>
    `)
    .join('');
}


async function completeTask(taskId) {
  const data = await api(
    `/api/tasks/${taskId}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({
        initData
      })
    }
  );

  if (data.error) {
    toast(data.error);
    haptic('error');

    return;
  }

  if (currentUser) {
    currentUser.points =
      data.points;
  }

  updateHeader();

  haptic('success');

  toast('پوینت اضافه شد! 🎉');

  renderTasks();
}


/* =========================================================
   PROFILE
   ========================================================= */

async function renderProfile() {
  const content =
    document.getElementById('content');

  if (!content) return;

  content.innerHTML =
    skeletonHTML(4);

  const [
    pointsData,
    referralData
  ] = await Promise.all([
    api(
      '/api/points/me?initData=' +
      encodeURIComponent(initData)
    ),

    api(
      '/api/referral/me?initData=' +
      encodeURIComponent(initData)
    )
  ]);

  if (
    pointsData.error ||
    referralData.error
  ) {
    content.innerHTML = `
      <div class="emptyState">
        <span class="emoji">⚠️</span>
        خطا در دریافت اطلاعات پروفایل
      </div>
    `;

    return;
  }

  const botUsername =
    'AmirAFG123_bot';

  const appShortName =
    'app';

  const link =
    `https://t.me/${botUsername}/${appShortName}?startapp=${referralData.referralCode}`;

  const firstName =
    currentUser?.firstName ||
    'دوست من';

  const theme =
    getTheme();

  content.innerHTML = `

    <div class="profileHero">

      <div
        id="profileAvatar"
        class="profileAvatar"
      >
        ${(firstName[0] || 'A').toUpperCase()}
      </div>

      <div class="profileName">
        ${escapeHTML(firstName)}
      </div>

      <div class="profileId">
        آیدی عددی:
        ${escapeHTML(currentUser?.telegramId || '-')}
      </div>

      <div class="profileBalance">
        ${formatPoints(pointsData.points)}
        پوینت
      </div>

    </div>


    <div class="profileStats">

      <div class="profileStat">
        <span class="profileStatIcon">
          💎
        </span>

        <strong>
          ${formatPoints(pointsData.points)}
        </strong>

        <small>
          موجودی
        </small>
      </div>


      <div class="profileStat">
        <span class="profileStatIcon">
          👥
        </span>

        <strong>
          ${formatPoints(referralData.invitedCount)}
        </strong>

        <small>
          دعوت شده
        </small>
      </div>

    </div>


    <!-- APPEARANCE -->

    <div class="appearanceCard">

      <div class="appearanceInfo">

        <div
          class="appearanceIcon"
          id="themeIcon"
        >
          ${theme === 'light' ? '☀️' : '🌙'}
        </div>

        <div class="appearanceText">

          <strong>
            ظاهر برنامه
          </strong>

          <span id="themeLabel">
            ${
              theme === 'light'
                ? 'حالت سفید'
                : 'حالت سیاه'
            }
          </span>

        </div>

      </div>


      <button
        id="themeToggle"
        class="themeToggle"
        type="button"
        aria-label="${
          theme === 'light'
            ? 'تغییر به حالت سیاه'
            : 'تغییر به حالت سفید'
        }"
      >

        <span class="themeSwitchTrack">

          <span class="themeSwitchThumb">
            ${theme === 'light' ? '☀️' : '🌙'}
          </span>

        </span>

      </button>

    </div>


    <div class="card referralCard">

      <div class="cardTitle">
        <span class="emoji">👥</span>
        دعوت دوستان
      </div>

      <div class="referralBigNumber">
        ${formatPoints(referralData.invitedCount)}
      </div>

      <div class="muted">
        نفر با لینک تو عضو شدن
      </div>

    </div>


    <div class="card">

      <div class="cardTitle">
        <span class="emoji">🔗</span>
        لینک اختصاصی تو
      </div>

      <input
        readonly
        value="${escapeHTML(link)}"
        onclick="this.select()"
      >

      <button
        class="action"
        id="shareBtn"
        type="button"
      >
        اشتراک‌گذاری لینک
      </button>

    </div>


    <div class="card">

      <div class="cardTitle">
        <span class="emoji">📜</span>
        اطلاعات و قوانین
      </div>

      <button
        class="termsLink"
        onclick="showTerms()"
        type="button"
      >
        قوانین و شرایط استفاده
      </button>

    </div>
  `;


  /* Theme button */

  const themeToggle =
    document.getElementById('themeToggle');

  if (themeToggle) {
    themeToggle.addEventListener(
      'click',
      toggleTheme
    );
  }


  /* Share button */

  const shareBtn =
    document.getElementById('shareBtn');

  if (shareBtn) {
    shareBtn.addEventListener(
      'click',
      async () => {

        haptic('light');

        if (navigator.share) {
          try {
            await navigator.share({
              url: link,
              title:
                'بیا این ربات رو ببین'
            });
          } catch (e) {}
        } else {
          try {
            await navigator.clipboard.writeText(
              link
            );

            toast('لینک کپی شد 📋');
          } catch (e) {
            toast('کپی لینک انجام نشد');
          }
        }
      }
    );
  }

  updateThemeUI();
}


/* =========================================================
   WALLET
   ========================================================= */

async function renderWallet() {
  const content =
    document.getElementById('content');

  if (!content) return;

  content.innerHTML =
    skeletonHTML(3);

  const [
    pointsData,
    leaderData
  ] = await Promise.all([
    api(
      '/api/points/me?initData=' +
      encodeURIComponent(initData)
    ),

    api(
      '/api/leaderboard/top?initData=' +
      encodeURIComponent(initData)
    )
  ]);

  if (
    pointsData.error ||
    leaderData.error
  ) {
    content.innerHTML = `
      <div class="emptyState">
        <span class="emoji">⚠️</span>
        خطا در دریافت اطلاعات کیف پول
      </div>
    `;

    return;
  }

  const leaderRows =
    (leaderData.top || [])
      .map(user => `
        <div
          class="
            leaderRow
            ${user.isMe ? 'me' : ''}
          "
        >

          <div class="leaderRank">
            ${
              user.rank <= 3
                ? ['🥇', '🥈', '🥉'][user.rank - 1]
                : user.rank
            }
          </div>

          <div class="leaderName">
            ${escapeHTML(user.name)}
          </div>

          <div class="leaderPoints">
            ${formatPoints(user.points)}
          </div>

        </div>
      `)
      .join('')
    ||
    `
      <div class="emptyState">
        <span class="emoji">🏁</span>
        هنوز کسی توی جدول نیست
      </div>
    `;


  content.innerHTML = `

    <div class="walletHero">

      <div class="walletEyebrow">
        موجودی فعلی
      </div>

      <div class="walletBalance">
        ${formatPoints(pointsData.points)}
        <span>💎</span>
      </div>

      <div class="walletCrypto">
        ≈
        ${Number(
          pointsData.estimatedCryptoValue || 0
        ).toFixed(4)}
        Gram
      </div>

    </div>


    <div class="card">

      <div class="cardTitle">
        <span class="emoji">📤</span>
        درخواست برداشت
      </div>

      <input
        id="withdrawAmount"
        type="number"
        inputmode="numeric"
        placeholder="مقدار پوینت"
      >

      <input
        id="walletAddress"
        placeholder="آدرس Gram تان را از کیف پول تون‌کیپر واریز کنید"
      >

      <button
        class="action"
        id="withdrawBtn"
        type="button"
      >
        ثبت درخواست برداشت
      </button>

    </div>


    <div class="card">

      <div class="cardTitle">
        <span class="emoji">🏆</span>
        برترین‌های هفته
      </div>

      ${leaderRows}

    </div>
  `;


  const withdrawBtn =
    document.getElementById(
      'withdrawBtn'
    );

  if (withdrawBtn) {
    withdrawBtn.addEventListener(
      'click',
      requestWithdraw
    );
  }
}


/* =========================================================
   WITHDRAW
   ========================================================= */

async function requestWithdraw() {
  const amountEl =
    document.getElementById(
      'withdrawAmount'
    );

  const walletEl =
    document.getElementById(
      'walletAddress'
    );

  const pointsAmount =
    Number(amountEl?.value || 0);

  const walletAddress =
    walletEl?.value?.trim() || '';

  if (
    !pointsAmount ||
    pointsAmount <= 0
  ) {
    toast('مقدار برداشت را وارد کن');
    haptic('warning');

    return;
  }

  if (!walletAddress) {
    toast('آدرس کیف پول را وارد کن');
    haptic('warning');

    return;
  }

  const data = await api(
    '/api/points/withdraw',
    {
      method: 'POST',
      body: JSON.stringify({
        initData,
        pointsAmount,
        walletAddress
      })
    }
  );

  if (data.error) {
    toast(data.error);
    haptic('error');

    return;
  }

  toast(
    'درخواست برداشت ثبت شد ✅'
  );

  haptic('success');

  if (currentUser) {
    currentUser.points =
      Math.max(
        0,
        currentUser.points -
        pointsAmount
      );
  }

  updateHeader();

  renderWallet();
}


/* =========================================================
   TABS
   ========================================================= */

const tabs = {
  home: renderHome,
  tasks: renderTasks,
  daily: renderDailyCheck,
  wallet: renderWallet,
  profile: renderProfile
};


document
  .querySelectorAll('#tabbar button')
  .forEach(btn => {

    btn.addEventListener(
      'click',
      () => {

        const tab =
          btn.dataset.tab;

        if (!tabs[tab]) return;

        haptic('light');

        setActiveTab(tab);

        tabs[tab]();
      }
    );

  });


/* =========================================================
   CAPTCHA ENTER KEY
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
   TELEGRAM EVENTS
   ========================================================= */

try {

  tg.onEvent(
    'themeChanged',
    () => {
      /*
       * We intentionally do not overwrite
       * the user's Mini App theme selection.
       */
      updateThemeUI();
    }
  );

  tg.onEvent(
    'viewportChanged',
    () => {
      document.documentElement.style.setProperty(
        '--tg-viewport-height',
        `${tg.viewportHeight || window.innerHeight}px`
      );
    }
  );

} catch (e) {}


/* =========================================================
   INITIALIZATION
   ========================================================= */

(async function init() {

  const data =
    await enterApp();

  if (data?.error) {
    return;
  }

  if (!data?.captchaPassed) {

    showCaptcha(
      data.captchaQuestion
    );

    return;
  }

  setActiveTab('home');

  renderHome();

})();