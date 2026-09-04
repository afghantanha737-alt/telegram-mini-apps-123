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

function haptic(type = 'light') {
  try {
    if (tg.HapticFeedback) {
      if (type === 'success') {
        tg.HapticFeedback.notificationOccurred('success');
      } else if (type === 'error') {
        tg.HapticFeedback.notificationOccurred('error');
      } else if (type === 'warning') {
        tg.HapticFeedback.notificationOccurred('warning');
      } else {
        tg.HapticFeedback.impactOccurred(type);
      }
    }
  } catch (e) {}
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

    let data;

    try {
      data = await res.json();
    } catch (e) {
      return {
        error: 'پاسخ نامعتبر از سرور دریافت شد'
      };
    }

    if (!res.ok && !data.error) {
      data.error = 'خطایی در ارتباط با سرور رخ داد';
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);

    return {
      error: 'اتصال به سرور برقرار نشد'
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
  if (value === null || value === undefined) return '';

  return String(value)
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
   LUCKY SPINNER
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
          (startAngle * Math.PI) / 180
        );

    const y1 =
      cy -
      r *
        Math.cos(
          (startAngle * Math.PI) / 180
        );

    const x2 =
      cx +
      r *
        Math.sin(
          (endAngle * Math.PI) / 180
        );

    const y2 =
      cy -
      r *
        Math.cos(
          (endAngle * Math.PI) / 180
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
      r *
        0.6 *
        Math.sin(
          (midAngle * Math.PI) / 180
        );

    const ly =
      cy -
      r *
        0.6 *
        Math.cos(
          (midAngle * Math.PI) / 180
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
        <tspan
          x="${lx}"
          dy="-4"
        >
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

let wheelRotation = 0;

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
    haptic('error');
    toast(data.error);

    btn.disabled = false;
    btn.innerText = '🎡 SPIN NOW';

    return;
  }

  if (
    !data.segments ||
    !Array.isArray(data.segments) ||
    typeof data.segmentIndex !== 'number'
  ) {
    toast('اطلاعات چرخش نامعتبر است');

    btn.disabled = false;
    btn.innerText = '🎡 SPIN NOW';

    return;
  }

  const n = data.segments.length;

  const anglePer = 360 / n;

  const targetAngle =
    data.segmentIndex * anglePer +
    anglePer / 2;

  const finalRotation =
    wheelRotation +
    5 * 360 +
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
      currentUser.points =
        Number(data.points || 0);
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
    throw new Error(data.error);
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

  if (!overlay) return;

  overlay.style.display = 'flex';

  if (questionEl) {
    questionEl.innerText =
      question + ' = ?';
  }

  if (errorEl) {
    errorEl.innerText = '';
  }

  if (answerEl) {
    answerEl.value = '';
    setTimeout(() => answerEl.focus(), 100);
  }
}

function hideCaptcha() {
  const overlay =
    document.getElementById('captchaOverlay');

  if (overlay) {
    overlay.style.display = 'none';
  }
}

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

async function submitCaptcha() {
  const answerEl =
    document.getElementById('captchaAnswer');

  const errorEl =
    document.getElementById('captchaError');

  const answer =
    answerEl?.value?.trim() || '';

  if (!answer) {
    if (errorEl) {
      errorEl.innerText =
        'جواب را وارد کن';
    }

    return;
  }

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

  if (errorEl) {
    errorEl.innerText =
      'جواب اشتباه بود، دوباره امتحان کن';
  }

  if (data.captchaQuestion) {
    showCaptcha(data.captchaQuestion);
  }
}

/* =========================================================
   HEADER
========================================================= */

function updateHeader() {
  const name =
    currentUser?.firstName ||
    'دوست من';

  const greetName =
    document.getElementById('greetName');

  const pointsDisplay =
    document.getElementById('pointsDisplay');

  const avatar =
    document.getElementById('avatar');

  if (greetName) {
    greetName.innerText =
      `سلام ${name} 👋`;
  }

  if (pointsDisplay) {
    pointsDisplay.innerText =
      `${formatPoints(currentUser?.points || 0)} پوینت`;
  }

  if (avatar) {
    avatar.innerText =
      (name[0] || 'A').toUpperCase();
  }
}

/* =========================================================
   TAB NAVIGATION
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
   HOME — PREMIUM DASHBOARD
========================================================= */

async function renderHome() {
  const content =
    document.getElementById('content');

  if (!content) return;

  content.innerHTML = `
    <div class="homeLoading">
      <div class="skeleton homeSkeletonHero"></div>

      <div class="homeSkeletonGrid">
        <div class="skeleton homeSkeletonSmall"></div>
        <div class="skeleton homeSkeletonSmall"></div>
      </div>

      <div class="skeleton homeSkeletonSection"></div>
    </div>
  `;

  try {
    const data = await api(
      '/api/points/me?initData=' +
        encodeURIComponent(initData)
    );

    if (data.error) {
      throw new Error(data.error);
    }

    const points =
      Number(data.points || 0);

    const level =
      Math.floor(points / 500) + 1;

    const currentLevelPoints =
      points % 500;

    const progress =
      Math.min(
        100,
        (currentLevelPoints / 500) * 100
      );

    const pointsToNextLevel =
      points === 0
        ? 500
        : 500 - currentLevelPoints;

    const streak =
      Number(data.streak || 0);

    const totalCheckins =
      Number(data.totalCheckins || 0);

    content.innerHTML = `
      <!-- HERO BALANCE -->

      <section class="homeHero reveal">

        <div class="heroGlow"></div>

        <div class="homeHeroTop">

          <div>
            <div class="heroEyebrow">
              موجودی شما
            </div>

            <div class="heroBalance">
              ${formatPoints(points)}
            </div>

            <div class="heroCurrency">
              POINTS
            </div>
          </div>

          <div class="heroCoin">
            <span>✦</span>
          </div>

        </div>

        <div class="levelArea">

          <div class="levelTop">

            <div class="levelName">
              LEVEL ${level}
            </div>

            <div class="levelProgressText">
              ${Math.round(progress)}%
            </div>

          </div>

          <div class="levelTrack">
            <div
              class="levelTrackFill"
              style="width:${progress}%"
            ></div>
          </div>

          <div class="levelBottom">

            <span>
              ${formatPoints(currentLevelPoints)} / 500
            </span>

            <span>
              ${formatPoints(pointsToNextLevel)}
              پوینت تا Level ${level + 1}
            </span>

          </div>

        </div>

      </section>


      <!-- QUICK STATS -->

      <section class="homeStats reveal">

        <button
          type="button"
          class="homeStatCard"
          onclick="setActiveTab('daily'); renderDailyCheck();"
        >

          <div class="homeStatIcon streakIcon">
            🔥
          </div>

          <div class="homeStatInfo">

            <span class="homeStatLabel">
              Streak
            </span>

            <strong>
              ${formatPoints(streak)}
              <small>روز</small>
            </strong>

          </div>

          <span class="homeStatArrow">
            ›
          </span>

        </button>


        <button
          type="button"
          class="homeStatCard"
          onclick="setActiveTab('daily'); renderDailyCheck();"
        >

          <div class="homeStatIcon dailyIcon">
            🎁
          </div>

          <div class="homeStatInfo">

            <span class="homeStatLabel">
              Daily Reward
            </span>

            <strong>
              ${data.canCheckIn ? '+2' : '✓'}
              <small>
                ${data.canCheckIn ? 'پوینت' : 'گرفته شد'}
              </small>
            </strong>

          </div>

          <span class="homeStatArrow">
            ›
          </span>

        </button>

      </section>


      <!-- WELCOME -->

      <section class="homeWelcome reveal">

        <div class="homeWelcomeIcon">
          ✨
        </div>

        <div class="homeWelcomeContent">

          <h2>
            آماده‌ای پوینت جمع کنی؟
          </h2>

          <p>
            هر روز برگرد، تسک انجام بده و با دعوت دوستان پاداشت رو بیشتر کن.
          </p>

        </div>

      </section>


      <!-- EARN MORE -->

      <section class="homeSection reveal">

        <div class="homeSectionHeader">

          <div>

            <span class="sectionEyebrow">
              EARN MORE
            </span>

            <h3>
              راه‌های کسب پوینت
            </h3>

          </div>

        </div>


        <div class="earningList">

          <button
            type="button"
            class="earningItem"
            onclick="setActiveTab('daily'); renderDailyCheck();"
          >

            <div class="earningIcon earningGold">
              🎡
            </div>

            <div class="earningContent">

              <strong>
                جایزه روزانه
              </strong>

              <span>
                هر روز Check-in کن و شانس Spin بگیر
              </span>

            </div>

            <div class="earningArrow">
              ›
            </div>

          </button>


          <button
            type="button"
            class="earningItem"
            onclick="setActiveTab('tasks'); renderTasks();"
          >

            <div class="earningIcon earningPurple">
              ✓
            </div>

            <div class="earningContent">

              <strong>
                انجام تسک‌ها
              </strong>

              <span>
                تسک‌های فعال را انجام بده و پوینت بگیر
              </span>

            </div>

            <div class="earningArrow">
              ›
            </div>

          </button>


          <button
            type="button"
            class="earningItem"
            onclick="setActiveTab('profile'); renderProfile();"
          >

            <div class="earningIcon earningBlue">
              👥
            </div>

            <div class="earningContent">

              <strong>
                دعوت دوستان
              </strong>

              <span>
                دوستانت را دعوت کن و تیم خودت را بساز
              </span>

            </div>

            <div class="earningArrow">
              ›
            </div>

          </button>

        </div>

      </section>


      <!-- USER JOURNEY -->

      <section class="homeSection reveal">

        <div class="homeSectionHeader">

          <div>

            <span class="sectionEyebrow">
              YOUR JOURNEY
            </span>

            <h3>
              فعالیت شما
            </h3>

          </div>

        </div>


        <div class="journeyCard">

          <div class="journeyRow">

            <div class="journeyIcon">
              🔥
            </div>

            <div class="journeyText">

              <strong>
                مجموع Check-in
              </strong>

              <span>
                روزهایی که برگشتی
              </span>

            </div>

            <div class="journeyValue">
              ${formatPoints(totalCheckins)}
            </div>

          </div>


          <div class="journeyDivider"></div>


          <div class="journeyRow">

            <div class="journeyIcon">
              ⭐
            </div>

            <div class="journeyText">

              <strong>
                سطح فعلی
              </strong>

              <span>
                با 500 پوینت وارد سطح بعد شو
              </span>

            </div>

            <div class="journeyValue">
              ${level}
            </div>

          </div>

        </div>

      </section>


      <!-- START GUIDE -->

      <section class="homeInfo reveal">

        <div class="homeInfoIcon">
          💡
        </div>

        <div>

          <strong>
            چطور شروع کنم؟
          </strong>

          <p>
            اول جایزه روزانه‌ات را بگیر، بعد تسک‌ها را انجام بده و در نهایت دوستانت را دعوت کن.
          </p>

        </div>

      </section>


      <!-- TERMS -->

      <button
        type="button"
        class="homeTerms"
        onclick="showTerms()"
      >
        قوانین و شرایط استفاده
      </button>
    `;

    requestAnimationFrame(() => {
      content
        .querySelectorAll('.reveal')
        .forEach((element, index) => {
          setTimeout(() => {
            element.classList.add('visible');
          }, index * 55);
        });
    });

  } catch (error) {
    console.error(
      'Home render error:',
      error
    );

    content.innerHTML = `
      <div class="emptyState">

        <div class="emptyStateIcon">
          ⚠️
        </div>

        <div class="emptyStateTitle">
          دریافت اطلاعات ناموفق بود
        </div>

        <div class="emptyStateText">
          اتصال اینترنت را بررسی کن و دوباره تلاش کن.
        </div>

        <button
          type="button"
          class="action"
          style="margin-top:16px;"
          onclick="renderHome()"
        >
          تلاش دوباره
        </button>

      </div>
    `;
  }
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

        <div class="emptyStateIcon">
          ⚠️
        </div>

        <div class="emptyStateTitle">
          خطا در دریافت اطلاعات
        </div>

        <div class="emptyStateText">
          ${escapeHTML(data.error)}
        </div>

        <button
          type="button"
          class="action"
          style="margin-top:16px;"
          onclick="renderDailyCheck()"
        >
          تلاش دوباره
        </button>

      </div>
    `;

    return;
  }

  const streakInCycle =
    Math.min(
      Number(data.streak || 0),
      7
    );

  const canSpin =
    Number(data.spinChances || 0) > 0;

  let streakItems = '';

  for (let i = 1; i <= 7; i++) {
    const done =
      i <= streakInCycle;

    const isGiftDay =
      i === 7;

    streakItems += `
      <div class="streakItem">

        <div
          class="streakCircle
          ${done ? 'done' : ''}
          ${isGiftDay && !done ? 'gift' : ''}"
        >
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

      <div
        class="muted"
        style="margin-top:6px;font-size:11px;"
      >
        Tap the button to spin
      </div>


      <div class="chancesRow">

        <div class="chancesLeft">
          🎫 Available Chances:
          ${data.spinChances || 0}
        </div>

        <div
          class="muted"
          style="font-size:10px;"
        >
          Complete 7-day check-in for +1 chance
        </div>

      </div>

    </div>


    <div class="card">

      <div class="cardTitle">

        <span class="emoji">
          🔥
        </span>

        7-Day Streak

        <span
          class="muted"
          style="margin-right:auto;font-weight:400;"
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

        <span class="emoji">
          🎁
        </span>

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
          haptic('error');
          toast(res.error);

          btn.disabled = false;

          return;
        }

        if (currentUser) {
          currentUser.points =
            Number(res.points || 0);
        }

        updateHeader();

        haptic('success');

        toast(
          res.earnedSpin
            ? '🎉 هفت روز کامل شد! یه چرخش رایگان گرفتی'
            : `${res.bonus || 2}+ پوینت گرفتی! 🎉`
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

        <div class="emptyStateIcon">
          ⚠️
        </div>

        <div class="emptyStateTitle">
          خطا در دریافت تسک‌ها
        </div>

        <div class="emptyStateText">
          ${escapeHTML(data.error)}
        </div>

        <button
          type="button"
          class="action"
          style="margin-top:16px;"
          onclick="renderTasks()"
        >
          تلاش دوباره
        </button>

      </div>
    `;

    return;
  }

  const tasks =
    data.tasks || [];

  if (tasks.length === 0) {
    content.innerHTML = `
      <div class="emptyState">

        <span class="emoji">
          🗒️
        </span>

        فعلا تسکی وجود نداره

        <br>

        بعدا دوباره سر بزن

      </div>
    `;

    return;
  }

  content.innerHTML =
    tasks
      .map(task => {

        const taskId =
          escapeHTML(task._id);

        const title =
          escapeHTML(task.title);

        const description =
          escapeHTML(
            task.description || ''
          );

        const link =
          escapeHTML(
            task.link || ''
          );

        return `
          <div class="card">

            <div class="taskRow">

              <div class="taskIcon">
                ${taskIconFor(task.link)}
              </div>

              <div class="taskInfo">

                <div class="title">
                  ${title}
                </div>

                <div class="desc">
                  ${description}
                </div>

                <div class="rewardBadge">
                  +${formatPoints(task.pointsReward)}
                  پوینت
                </div>

              </div>

            </div>


            ${
              link
                ? `
                  <a
                    href="${link}"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="display:block;margin-top:10px;"
                  >
                    <button
                      class="secondary"
                      style="width:100%;"
                    >
                      باز کردن لینک
                    </button>
                  </a>
                `
                : ''
            }


            <div style="margin-top:8px;">

              <button
                class="action"
                ${
                  task.completed
                    ? 'disabled'
                    : ''
                }
                onclick="completeTask('${taskId}')"
              >
                ${
                  task.completed
                    ? 'انجام شده ✅'
                    : 'انجام دادم'
                }
              </button>

            </div>

          </div>
        `;
      })
      .join('');
}

async function completeTask(taskId) {
  const data = await api(
    `/api/tasks/${encodeURIComponent(taskId)}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({
        initData
      })
    }
  );

  if (data.error) {
    haptic('error');
    toast(data.error);

    return;
  }

  if (currentUser) {
    currentUser.points =
      Number(data.points || 0);
  }

  updateHeader();

  haptic('success');

  toast(
    'پوینت اضافه شد! 🎉'
  );

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
    skeletonHTML(3);

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

        <div class="emptyStateIcon">
          ⚠️
        </div>

        <div class="emptyStateTitle">
          دریافت اطلاعات ناموفق بود
        </div>

        <button
          type="button"
          class="action"
          style="margin-top:16px;"
          onclick="renderProfile()"
        >
          تلاش دوباره
        </button>

      </div>
    `;

    return;
  }

  const botUsername =
    'AmirAFG123_bot';

  const appShortName =
    'app';

  const referralCode =
    referralData.referralCode || '';

  const link =
    `https://t.me/${botUsername}/${appShortName}?startapp=${referralCode}`;

  const firstName =
    currentUser?.firstName ||
    'دوست من';

  content.innerHTML = `
    <div
      class="card"
      style="text-align:center;"
    >

      <div
        id="profileAvatar"
        style="
          width:64px;
          height:64px;
          border-radius:50%;
          background:linear-gradient(135deg,#8B5CF6,#F5B942);
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:26px;
          font-weight:800;
          margin:0 auto 10px;
        "
      >
        ${(firstName[0] || 'A').toUpperCase()}
      </div>

      <div
        style="font-weight:800;font-size:16px;"
      >
        ${escapeHTML(firstName)}
      </div>

      <div class="muted">
        آیدی عددی:
        ${escapeHTML(currentUser?.telegramId || '-')}
      </div>

      <div class="muted">
        موجودی:
        ${formatPoints(pointsData.points)}
        پوینت
      </div>

    </div>


    <div
      class="card"
      style="text-align:center;"
    >

      <div style="font-size:34px;">
        👥
      </div>

      <div
        style="
          font-size:26px;
          font-weight:800;
          margin:4px 0;
        "
      >
        ${formatPoints(referralData.invitedCount)}
      </div>

      <div class="muted">
        نفر با لینک تو عضو شدن
      </div>

    </div>


    <div class="card">

      <div class="cardTitle">

        <span class="emoji">
          🔗
        </span>

        لینک اختصاصی تو

      </div>

      <input
        readonly
        value="${escapeHTML(link)}"
        onclick="this.select()"
      />

      <button
        class="action"
        id="shareBtn"
      >
        اشتراک‌گذاری لینک
      </button>

    </div>


    <div class="card">

      <div class="cardTitle">

        <span class="emoji">
          📜
        </span>

        اطلاعات و قوانین

      </div>

      <div
        class="termsLink"
        onclick="showTerms()"
      >
        قوانین و شرایط استفاده
      </div>

    </div>
  `;

  const shareBtn =
    document.getElementById('shareBtn');

  if (shareBtn) {
    shareBtn.addEventListener(
      'click',
      async () => {

        try {
          if (navigator.share) {

            await navigator.share({
              url: link,
              title:
                'بیا این ربات رو ببین'
            });

          } else if (
            navigator.clipboard
          ) {

            await navigator.clipboard.writeText(
              link
            );

            toast(
              'لینک کپی شد 📋'
            );

          } else {

            toast(
              'لینک آماده اشتراک‌گذاری است'
            );
          }

        } catch (error) {
          console.log(
            'Share cancelled',
            error
          );
        }
      }
    );
  }
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

        <div class="emptyStateIcon">
          ⚠️
        </div>

        <div class="emptyStateTitle">
          دریافت اطلاعات کیف پول ناموفق بود
        </div>

        <button
          type="button"
          class="action"
          style="margin-top:16px;"
          onclick="renderWallet()"
        >
          تلاش دوباره
        </button>

      </div>
    `;

    return;
  }

  const leaderRows =
    (leaderData.top || [])
      .map(user => {

        const rank =
          Number(user.rank || 0);

        const rankIcon =
          rank <= 3
            ? ['🥇', '🥈', '🥉'][rank - 1]
            : rank;

        return `
          <div
            class="leaderRow ${user.isMe ? 'me' : ''}"
          >

            <div class="leaderRank">
              ${rankIcon}
            </div>

            <div class="leaderName">
              ${escapeHTML(user.name)}
            </div>

            <div class="leaderPoints">
              ${formatPoints(user.points)}
            </div>

          </div>
        `;
      })
      .join('') ||
    `
      <div class="emptyState">
        <span class="emoji">
          🏁
        </span>

        هنوز کسی توی جدول نیست
      </div>
    `;

  const estimatedValue =
    Number(
      pointsData.estimatedCryptoValue || 0
    );

  content.innerHTML = `
    <div
      class="card"
      style="text-align:center;"
    >

      <div class="muted">
        موجودی فعلی
      </div>

      <div
        style="
          font-size:30px;
          font-weight:800;
          margin:6px 0;
        "
      >
        ${formatPoints(pointsData.points)}
        💎
      </div>

      <div class="muted">
        ≈ ${estimatedValue.toFixed(4)}
        Gram
      </div>

    </div>


    <div class="card">

      <div class="cardTitle">

        <span class="emoji">
          📤
        </span>

        درخواست برداشت

      </div>

      <input
        id="withdrawAmount"
        type="number"
        inputmode="numeric"
        placeholder="مقدار پوینت"
      />

      <input
        id="walletAddress"
        placeholder="آدرس Gram تان را از کیف پول تون‌کیپر واریز کنید"
      />

      <button
        class="action"
        id="withdrawBtn"
      >
        ثبت درخواست برداشت
      </button>

    </div>


    <div class="card">

      <div class="cardTitle">

        <span class="emoji">
          🏆
        </span>

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

  if (!pointsAmount) {
    toast(
      'مقدار پوینت را وارد کن'
    );

    return;
  }

  if (!walletAddress) {
    toast(
      'آدرس کیف پول را وارد کن'
    );

    return;
  }

  const btn =
    document.getElementById(
      'withdrawBtn'
    );

  if (btn) {
    btn.disabled = true;
    btn.innerText =
      'در حال ثبت درخواست...';
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
    haptic('error');

    toast(data.error);

    if (btn) {
      btn.disabled = false;
      btn.innerText =
        'ثبت درخواست برداشت';
    }

    return;
  }

  haptic('success');

  toast(
    'درخواست برداشت ثبت شد ✅'
  );

  if (currentUser) {
    currentUser.points =
      Math.max(
        0,
        Number(currentUser.points || 0) -
          pointsAmount
      );
  }

  updateHeader();

  renderWallet();
}

/* =========================================================
   TAB ROUTES
========================================================= */

const tabs = {
  home: renderHome,
  tasks: renderTasks,
  daily: renderDailyCheck,
  wallet: renderWallet,
  profile: renderProfile
};

/* =========================================================
   TAB EVENTS
========================================================= */

document
  .querySelectorAll('#tabbar button')
  .forEach(button => {

    button.addEventListener(
      'click',
      () => {

        const tab =
          button.dataset.tab;

        if (!tabs[tab]) return;

        setActiveTab(tab);

        tabs[tab]();

      }
    );

  });

/* =========================================================
   TELEGRAM EVENTS
========================================================= */

try {
  tg.onEvent &&
    tg.onEvent(
      'themeChanged',
      () => {
        // Telegram theme changed.
        // CSS remains responsible for the visual system.
      }
    );

  tg.onEvent &&
    tg.onEvent(
      'viewportChanged',
      () => {
        // Telegram viewport changed.
        // The CSS uses safe-area / responsive sizing.
      }
    );
} catch (e) {}

/* =========================================================
   INITIALIZATION
========================================================= */

(async function init() {
  try {
    const data =
      await enterApp();

    if (!data.captchaPassed) {

      showCaptcha(
        data.captchaQuestion
      );

      return;
    }

    setActiveTab('home');

    renderHome();

  } catch (error) {

    console.error(
      'App initialization error:',
      error
    );

    const content =
      document.getElementById('content');

    if (content) {
      content.innerHTML = `
        <div class="emptyState">

          <div class="emptyStateIcon">
            ⚠️
          </div>

          <div class="emptyStateTitle">
            اجرای برنامه ناموفق بود
          </div>

          <div class="emptyStateText">
            ${escapeHTML(
              error?.message ||
              'لطفاً دوباره تلاش کن.'
            )}
          </div>

          <button
            type="button"
            class="action"
            style="margin-top:16px;"
            onclick="location.reload()"
          >
            اجرای دوباره
          </button>

        </div>
      `;
    }
  }
})();