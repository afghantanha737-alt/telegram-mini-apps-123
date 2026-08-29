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

async function enterApp() {
  const data = await api('/api/auth/enter', {
    method: 'POST',
    body: JSON.stringify({ initData, startParam })
  });
  currentUser = data.user;
  updateHeader();
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

  let streakDots = '';
  for (let i = 1; i <= 7; i++) {
    streakDots += `<div class="streakDot ${i <= (data.streak % 7 || (data.streak > 0 ? 7 : 0)) ? 'filled' : ''}"></div>`;
  }

  content.innerHTML = `
    <div class="card">
      <div class="cardTitle"><span class="emoji">🏆</span> سطح ${level}</div>
      <div class="progressWrap"><div class="progressBar" style="width:${progress}%"></div></div>
      <div class="muted">${500 - (data.points % 500)} پوینت تا سطح بعدی</div>
    </div>

    <div class="card">
      <div class="cardTitle"><span class="emoji">🔥</span> جایزه‌ی روزانه (استریک: ${data.streak || 0} روز)</div>
      <div class="streakRow">${streakDots}</div>
      <button class="action" id="checkinBtn" ${data.canCheckIn ? '' : 'disabled'}>
        ${data.canCheckIn ? 'دریافت جایزه امروز 🎁' : 'امروز گرفتی، فردا دوباره بیا ✅'}
      </button>
    </div>

    <div class="card">
      <div class="cardTitle"><span class="emoji">💡</span> چطور پوینت جمع کنم؟</div>
      <div class="muted">با انجام تسک‌ها و دعوت دوستان پوینت جمع کن و اونو به کریپتو تبدیل کن.</div>
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
      toast(`${res.bonus}+ پوینت گرفتی! 🎉`);
      renderHome();
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

async function renderReferral() {
  const content = document.getElementById('content');
  content.innerHTML = skeletonHTML(2);

  const data = await api('/api/referral/me?initData=' + encodeURIComponent(initData));
  const botUsername = 'AmirAFG123_bot';
  const link = `https://t.me/${botUsername}?startapp=${data.referralCode}`;

  content.innerHTML = `
    <div class="card" style="text-align:center;">
      <div style="font-size:34px;">👥</div>
      <div style="font-size:26px;font-weight:800;margin:4px 0;">${data.invitedCount}</div>
      <div class="muted">نفر با لینک تو عضو شدن</div>
    </div>
    <div class="card">
      <div class="cardTitle"><span class="emoji">🔗</span> لینک اختصاصی تو</div>
      <input readonly value="${link}" onclick="this.select()">
      <button class="action" id="shareBtn">اشتراک‌گذاری لینک</button>
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

async function renderPoints() {
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
      <div class="muted">≈ ${pointsData.estimatedCryptoValue.toFixed(4)} واحد کریپتو</div>
    </div>

    <div class="card">
      <div class="cardTitle"><span class="emoji">📤</span> درخواست برداشت</div>
      <input id="withdrawAmount" type="number" placeholder="مقدار پوینت">
      <input id="walletAddress" placeholder="آدرس کیف پول">
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
  renderPoints();
}

const tabs = { home: renderHome, tasks: renderTasks, referral: renderReferral, points: renderPoints };

document.querySelectorAll('#tabbar button').forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveTab(btn.dataset.tab);
    tabs[btn.dataset.tab]();
  });
});

(async function init() {
  await enterApp();
  setActiveTab('home');
  renderHome();
})();