const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();
try { tg.setHeaderColor && tg.setHeaderColor('#6c5ce7'); } catch (e) {}

const initData = tg.initData;
const startParam = tg.initDataUnsafe?.start_param || null;

let currentUser = null;

function toast(msg) {
  const box = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = 'toastMsg';
  el.innerText = msg;
  box.innerHTML = '';
  box.appendChild(el);
  setTimeout(() => { if (box.contains(el)) box.removeChild(el); }, 2600);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  return res.json();
}

function skeletonHTML(n = 3) {
  return Array(n).fill('<div class="skeleton"></div>').join('');
}

function taskIconFor(link) {
  if (!link) return '🎯';
  if (link.includes('youtube') || link.includes('youtu.be')) return '▶️';
  if (link.includes('t.me/+') || link.includes('joinchat')) return '👥';
  if (link.includes('t.me')) return '📢';
  if (link.includes('instagram')) return '📸';
  return '🔗';
}

const WHEEL_SEGMENTS = [2, 3, 5, 7, 10, 15, 25];
const FLAG_COLORS = ['#111111', '#D32011', '#046A38'];

function wheelSVG() {
  const n = WHEEL_SEGMENTS.length;
  const anglePer = 360 / n;
  const cx = 100, cy = 100, r = 88;
  let paths = '';
  let labels = '';

  for (let i = 0; i < n; i++) {
    const startAngle = i * anglePer;
    const endAngle = startAngle + anglePer;
    const x1 = cx + r * Math.sin(startAngle * Math.PI / 180);
    const y1 = cy - r * Math.cos(startAngle * Math.PI / 180);
    const x2 = cx + r * Math.sin(endAngle * Math.PI / 180);
    const y2 = cy - r * Math.cos(endAngle * Math.PI / 180);
    paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z" fill="${FLAG_COLORS[i % 3]}" stroke="#D4AF37" stroke-width="1.5"/>`;

    const midAngle = startAngle + anglePer / 2;
    const lx = cx + (r * 0.6) * Math.sin(midAngle * Math.PI / 180);
    const ly = cy - (r * 0.6) * Math.cos(midAngle * Math.PI / 180);
    labels += `<text x="${lx}" y="${ly}" fill="#fff" font-size="16" font-weight="800" text-anchor="middle" dominant-baseline="middle">
      <tspan x="${lx}" dy="-4">${WHEEL_SEGMENTS[i]}</tspan>
      <tspan x="${lx}" dy="13" font-size="8" font-weight="500">Points</tspan>
    </text>`;
  }

  return `<svg id="wheelSvg" viewBox="0 0 200 200" width="230" height="230">
    <circle cx="100" cy="100" r="97" fill="none" stroke="#D4AF37" stroke-width="7"/>
    <g id="wheelGroup" style="transform-origin: 100px 100px;">${paths}${labels}</g>
    <circle cx="100" cy="100" r="18" fill="#111" stroke="#D4AF37" stroke-width="3"/>
    <text x="100" y="106" font-size="18" text-anchor="middle">⭐</text>
  </svg>`;
}

let wheelRotation = 0;

async function doSpin() {
  const btn = document.getElementById('spinBtn');
  btn.disabled = true;
  btn.innerText = 'در حال چرخش...';

  const data = await api('/api/points/spin', {
    method: 'POST',
    body: JSON.stringify({ initData })
  });

  if (data.error) {
    toast(data.error);
    btn.disabled = false;
    btn.innerText = '🎡 SPIN NOW';
    return;
  }

  const n = data.segments.length;
  const anglePer = 360 / n;
  const targetAngle = data.segmentIndex * anglePer + anglePer / 2;
  const finalRotation = wheelRotation + (5 * 360) + (360 - targetAngle) - (wheelRotation % 360);
  wheelRotation = finalRotation;

  const wheelGroup = document.getElementById('wheelGroup');
  wheelGroup.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
  wheelGroup.style.transform = `rotate(${finalRotation}deg)`;

  setTimeout(() => {
    currentUser.points = data.points;
    updateHeader();
    toast(`🎉 ${data.won} پوینت بردی!`);
    renderDailyCheck();
  }, 4200);
}

async function enterApp() {
  const data = await api('/api/auth/enter', {
    method: 'POST',
    body: JSON.stringify({ initData, startParam })
  });
  currentUser = data.user;
  updateHeader();
  return data;
}

function showCaptcha(question) {
  document.getElementById('captchaOverlay').style.display = 'flex';
  document.getElementById('captchaQuestion').innerText = question + ' = ?';
  document.getElementById('captchaError').innerText = '';
  document.getElementById('captchaAnswer').value = '';
}

function hideCaptcha() {
  document.getElementById('captchaOverlay').style.display = 'none';
}

function showTerms() {
  document.getElementById('termsOverlay').style.display = 'flex';
}

function hideTerms() {
  document.getElementById('termsOverlay').style.display = 'none';
}

async function submitCaptcha() {
  const answer = document.getElementById('captchaAnswer').value;
  const data = await api('/api/auth/captcha', {
    method: 'POST',
    body: JSON.stringify({ initData, answer })
  });
  if (data.success) {
    hideCaptcha();
    setActiveTab('home');
    renderHome();
    return;
  }
  document.getElementById('captchaError').innerText = 'جواب اشتباه بود، دوباره امتحان کن';
  showCaptcha(data.captchaQuestion);
}

function updateHeader() {
  const name = currentUser?.firstName || 'دوست من';
  document.getElementById('greetName').innerText = `سلام ${name} 👋`;
  document.getElementById('pointsDisplay').innerText = (currentUser ? currentUser.points.toLocaleString('fa-IR') : '۰') + ' پوینت';
  document.getElementById('avatar').innerText = (name[0] || 'A').toUpperCase();
}

function setActiveTab(tab) {
  document.querySelectorAll('#tabbar button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
}

async function renderHome() {
  const content = document.getElementById('content');
  content.innerHTML = skeletonHTML(2);

  const data = await api('/api/points/me?initData=' + encodeURIComponent(initData));
  const level = Math.floor((data.points || 0) / 500) + 1;
  const progress = ((data.points || 0) % 500) / 500 * 100;

  content.innerHTML = `
    <div class="card">
      <div class="cardTitle"><span class="emoji">🏆</span> سطح ${level}</div>
      <div class="progressWrap"><div class="progressBar" style="width:${progress}%"></div></div>
      <div class="muted">${500 - (data.points % 500)} پوینت تا سطح بعدی</div>
    </div>

    <div class="card" style="text-align:center;">
      <div style="font-size:34px;">👋</div>
      <div style="font-weight:800;font-size:16px;margin:6px 0;">به مینی‌اپ خوش اومدی</div>
      <div class="muted">از تب «Daily Check» جایزه‌ی روزانه بگیر، از «Tasks» تسک انجام بده و از «Wallet» موجودیت رو ببین.</div>
    </div>

    <div class="card">
      <div class="cardTitle"><span class="emoji">💡</span> چطور پوینت جمع کنم؟</div>
      <div class="muted">با انجام تسک‌ها و دعوت دوستان پوینت جمع کن و اونو به کریپتو تبدیل کن.</div>
      <div class="termsLink" onclick="showTerms()">قوانین و شرایط استفاده</div>
    </div>
  `;
}

async function renderDailyCheck() {
  const content = document.getElementById('content');
  content.innerHTML = skeletonHTML(2);

  const data = await api('/api/points/me?initData=' + encodeURIComponent(initData));
  const streakInCycle = Math.min(data.streak || 0, 7);
  const canSpin = (data.spinChances || 0) > 0;

  let streakItems = '';
  for (let i = 1; i <= 7; i++) {
    const done = i <= streakInCycle;
    const isGiftDay = i === 7;
    streakItems += `
      <div class="streakItem">
        <div class="streakCircle ${done ? 'done' : ''} ${isGiftDay && !done ? 'gift' : ''}">
          ${done ? '✓' : (isGiftDay ? '🎁' : i)}
        </div>
        <div class="streakLabel">${i}</div>
        <div class="streakPts">${isGiftDay ? '+2+Spin' : '+2'}</div>
      </div>`;
  }

  content.innerHTML = `
    <div class="luckyCard">
      <div class="luckyTitle">🎡 Lucky Spinner 🇦🇫</div>
      <div class="luckySubtitle">Spin &amp; Win Points</div>

      <div class="statsRow">
        <div class="statBox points">
          <div class="label">My Points</div>
          <div class="value">${data.points.toLocaleString('fa-IR')}</div>
        </div>
        <div class="statBox checkin">
          <div class="label">Today</div>
          <div class="value">${data.canCheckIn ? '+2' : '✓'}</div>
        </div>
        <div class="statBox streak">
          <div class="label">Streak</div>
          <div class="value">${streakInCycle} Days</div>
        </div>
      </div>

      <div class="wheelWrap">
        <div class="wheelPointer"></div>
        ${wheelSVG()}
      </div>

      <button class="spinNowBtn" id="spinBtn" onclick="doSpin()" ${canSpin ? '' : 'disabled'}>
        🎯 SPIN NOW
      </button>
      <div class="muted" style="margin-top:6px;font-size:11px;">Tap the button to spin</div>

      <div class="chancesRow">
        <div class="chancesLeft">🎫 Available Chances: ${data.spinChances || 0}</div>
        <div class="muted" style="font-size:10px;">Complete 7-day check-in for +1 chance</div>
      </div>
    </div>

    <div class="card">
      <div class="cardTitle"><span class="emoji">🔥</span> 7-Day Streak <span class="muted" style="margin-right:auto;font-weight:400;">🏆 Total: ${data.totalCheckins || 0} Days</span></div>
      <div class="streakGrid">${streakItems}</div>
      <button class="action" id="checkinBtn" ${data.canCheckIn ? '' : 'disabled'}>
        ${data.canCheckIn ? 'دریافت جایزه امروز (۲+) 🎁' : 'امروز گرفتی، فردا دوباره بیا ✅'}
      </button>
    </div>

    <div class="card howItWorks">
      <div class="cardTitle"><span class="emoji">🎁</span> How it works?</div>
      <div class="muted">Check-in daily to earn 2 Points.<br>Complete 7 days to get 1 spin chance.</div>
    </div>
  `;

  const btn = document.getElementById('checkinBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      const res = await api('/api/points/daily-checkin', {
        method: 'POST',
        body: JSON.stringify({ initData })
      });
      if (res.error) { toast(res.error); return; }
      currentUser.points = res.points;
      updateHeader();
      toast(res.earnedSpin ? '🎉 هفت روز کامل شد! یه چرخش رایگان گرفتی' : `${res.bonus}+ پوینت گرفتی! 🎉`);
      renderDailyCheck();
    });
  }
}

async function renderTasks() {
  const content = document.getElementById('content');
  content.innerHTML = skeletonHTML(4);

  const data = await api('/api/tasks?initData=' + encodeURIComponent(initData));
  const tasks = data.tasks || [];

  if (tasks.length === 0) {
    content.innerHTML = `<div class="emptyState"><span class="emoji">🗒️</span>فعلا تسکی وجود نداره<br>بعدا دوباره سر بزن</div>`;
    return;
  }

  content.innerHTML = tasks.map(t => `
    <div class="card">
      <div class="taskRow">
        <div class="taskIcon">${taskIconFor(t.link)}</div>
        <div class="taskInfo">
          <div class="title">${t.title}</div>
          <div class="desc">${t.description || ''}</div>
          <div class="rewardBadge">+${t.pointsReward} پوینت</div>
        </div>
      </div>
      ${t.link ? `<a href="${t.link}" target="_blank" style="display:block;margin-top:10px;"><button class="secondary" style="width:100%;">باز کردن لینک</button></a>` : ''}
      <div style="margin-top:8px;">
        <button class="action" ${t.completed ? 'disabled' : ''} onclick="completeTask('${t._id}')">
          ${t.completed ? 'انجام شده ✅' : 'انجام دادم'}
        </button>
      </div>
    </div>
  `).join('');
}

async function completeTask(taskId) {
  const data = await api(`/api/tasks/${taskId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ initData })
  });
  if (data.error) { toast(data.error); return; }
  currentUser.points = data.points;
  updateHeader();
  toast('پوینت اضافه شد! 🎉');
  renderTasks();
}

async function renderProfile() {
  const content = document.getElementById('content');
  content.innerHTML = skeletonHTML(3);

  const [pointsData, referralData] = await Promise.all([
    api('/api/points/me?initData=' + encodeURIComponent(initData)),
    api('/api/referral/me?initData=' + encodeURIComponent(initData))
  ]);

  const botUsername = 'AmirAFG123_bot';
  const appShortName = 'app';
  const link = `https://t.me/${botUsername}/${appShortName}?startapp=${referralData.referralCode}`;

  content.innerHTML = `
    <div class="card" style="text-align:center;">
      <div id="profileAvatar" style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#6c5ce7,#3ecf8e);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;margin:0 auto 10px;">${(currentUser?.firstName || 'A')[0].toUpperCase()}</div>
      <div style="font-weight:800;font-size:16px;">${currentUser?.firstName || 'دوست من'}</div>
      <div class="muted">آیدی عددی: ${currentUser?.telegramId || '-'}</div>
      <div class="muted">موجودی: ${pointsData.points.toLocaleString('fa-IR')} پوینت</div>
    </div>

    <div class="card" style="text-align:center;">
      <div style="font-size:34px;">👥</div>
      <div style="font-size:26px;font-weight:800;margin:4px 0;">${referralData.invitedCount}</div>
      <div class="muted">نفر با لینک تو عضو شدن</div>
    </div>

    <div class="card">
      <div class="cardTitle"><span class="emoji">🔗</span> لینک اختصاصی تو</div>
      <input readonly value="${link}" onclick="this.select()">
      <button class="action" id="shareBtn">اشتراک‌گذاری لینک</button>
    </div>

    <div class="card">
      <div class="cardTitle"><span class="emoji">📜</span> اطلاعات و قوانین</div>
      <div class="termsLink" onclick="showTerms()">قوانین و شرایط استفاده</div>
    </div>
  `;

  document.getElementById('shareBtn').addEventListener('click', () => {
    if (navigator.share) {
      navigator.share({ url: link, title: 'بیا این ربات رو ببین' }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(link);
      toast('لینک کپی شد 📋');
    }
  });
}

async function renderWallet() {
  const content = document.getElementById('content');
  content.innerHTML = skeletonHTML(3);

  const [pointsData, leaderData] = await Promise.all([
    api('/api/points/me?initData=' + encodeURIComponent(initData)),
    api('/api/leaderboard/top?initData=' + encodeURIComponent(initData))
  ]);

  const leaderRows = (leaderData.top || []).map(u => `
    <div class="leaderRow ${u.isMe ? 'me' : ''}">
      <div class="leaderRank">${u.rank <= 3 ? ['🥇','🥈','🥉'][u.rank - 1] : u.rank}</div>
      <div class="leaderName">${u.name}</div>
      <div class="leaderPoints">${u.points.toLocaleString('fa-IR')}</div>
    </div>
  `).join('') || `<div class="emptyState"><span class="emoji">🏁</span>هنوز کسی توی جدول نیست</div>`;

  content.innerHTML = `
    <div class="card" style="text-align:center;">
      <div class="muted">موجودی فعلی</div>
      <div style="font-size:30px;font-weight:800;margin:6px 0;">${pointsData.points.toLocaleString('fa-IR')} 💎</div>
      <div class="muted">≈ ${pointsData.estimatedCryptoValue.toFixed(4)} Gram</div>
    </div>

    <div class="card">
      <div class="cardTitle"><span class="emoji">📤</span> درخواست برداشت</div>
      <input id="withdrawAmount" type="number" placeholder="مقدار پوینت">
      <input id="walletAddress" placeholder="آدرس Gram تان را از کیف پول تون‌کیپر واریز کنید">
      <button class="action" id="withdrawBtn">ثبت درخواست برداشت</button>
    </div>

    <div class="card">
      <div class="cardTitle"><span class="emoji">🏆</span> برترین‌های هفته</div>
      ${leaderRows}
    </div>
  `;

  document.getElementById('withdrawBtn').addEventListener('click', requestWithdraw);
}

async function requestWithdraw() {
  const pointsAmount = Number(document.getElementById('withdrawAmount').value);
  const walletAddress = document.getElementById('walletAddress').value;

  const data = await api('/api/points/withdraw', {
    method: 'POST',
    body: JSON.stringify({ initData, pointsAmount, walletAddress })
  });

  if (data.error) { toast(data.error); return; }
  toast('درخواست برداشت ثبت شد ✅');
  currentUser.points -= pointsAmount;
  updateHeader();
  renderWallet();
}

const tabs = { home: renderHome, tasks: renderTasks, daily: renderDailyCheck, wallet: renderWallet, profile: renderProfile };

document.querySelectorAll('#tabbar button').forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveTab(btn.dataset.tab);
    tabs[btn.dataset.tab]();
  });
});

(async function init() {
  const data = await enterApp();
  if (!data.captchaPassed) {
    showCaptcha(data.captchaQuestion);
    return;
  }
  setActiveTab('home');
  renderHome();
})();