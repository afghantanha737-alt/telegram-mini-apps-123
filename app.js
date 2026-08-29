const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const initData = tg.initData; // رشته خامی که برای تایید هویت به سرور فرستاده می‌شود
const startParam = tg.initDataUnsafe?.start_param || null;

let currentUser = null;

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  return res.json();
}

async function enterApp() {
  const data = await api('/api/auth/enter', {
    method: 'POST',
    body: JSON.stringify({ initData, startParam })
  });
  currentUser = data.user;
  updatePointsDisplay();
}

function updatePointsDisplay() {
  document.getElementById('pointsDisplay').innerText =
    (currentUser ? currentUser.points : 0) + ' پوینت';
}

function setActiveTab(tab) {
  document.querySelectorAll('#tabbar button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
}

async function renderHome() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="card">
      <p>سلام ${currentUser?.firstName || ''} 👋</p>
      <p>با انجام تسک‌ها و دعوت دوستان پوینت جمع کن و اونو به کریپتو تبدیل کن.</p>
    </div>`;
}

async function renderTasks() {
  const content = document.getElementById('content');
  content.innerHTML = '<p>در حال بارگذاری...</p>';
  const data = await api('/api/tasks?initData=' + encodeURIComponent(initData));
  const tasks = data.tasks || [];

  content.innerHTML = tasks.map(t => `
    <div class="card">
      <strong>${t.title}</strong>
      <p>${t.description || ''}</p>
      ${t.link ? `<p><a href="${t.link}" target="_blank">لینک تسک</a></p>` : ''}
      <p>پاداش: ${t.pointsReward} پوینت</p>
      <button class="action" ${t.completed ? 'disabled' : ''} onclick="completeTask('${t._id}')">
        ${t.completed ? 'انجام شده ✅' : 'انجام دادم'}
      </button>
    </div>
  `).join('') || '<p>فعلا تسکی وجود ندارد.</p>';
}

async function completeTask(taskId) {
  const data = await api(`/api/tasks/${taskId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ initData })
  });
  if (data.error) {
    tg.showAlert(data.error);
    return;
  }
  currentUser.points = data.points;
  updatePointsDisplay();
  renderTasks();
}

async function renderReferral() {
  const content = document.getElementById('content');
  content.innerHTML = '<p>در حال بارگذاری...</p>';
  const data = await api('/api/referral/me?initData=' + encodeURIComponent(initData));

  const botUsername = 'YOUR_BOT_USERNAME'; // اسم یوزرنیم ربات را اینجا جایگزین کن
  const link = `https://t.me/${botUsername}?startapp=${data.referralCode}`;

  content.innerHTML = `
    <div class="card">
      <p>تعداد دعوت‌شده‌ها: ${data.invitedCount}</p>
      <p>لینک اختصاصی تو:</p>
      <input readonly value="${link}" onclick="this.select()">
      <button class="action" onclick="navigator.share ? navigator.share({url:'${link}'}) : tg.showAlert('لینک کپی شد')">اشتراک‌گذاری</button>
    </div>`;
}

async function renderPoints() {
  const content = document.getElementById('content');
  content.innerHTML = '<p>در حال بارگذاری...</p>';
  const data = await api('/api/points/me?initData=' + encodeURIComponent(initData));

  content.innerHTML = `
    <div class="card">
      <p>موجودی: ${data.points} پوینت</p>
      <p>معادل تقریبی کریپتو: ${data.estimatedCryptoValue}</p>
    </div>
    <div class="card">
      <p>درخواست برداشت</p>
      <input id="withdrawAmount" type="number" placeholder="مقدار پوینت">
      <input id="walletAddress" placeholder="آدرس کیف پول">
      <button class="action" onclick="requestWithdraw()">ثبت درخواست برداشت</button>
    </div>`;
}

async function requestWithdraw() {
  const pointsAmount = Number(document.getElementById('withdrawAmount').value);
  const walletAddress = document.getElementById('walletAddress').value;

  const data = await api('/api/points/withdraw', {
    method: 'POST',
    body: JSON.stringify({ initData, pointsAmount, walletAddress })
  });

  if (data.error) {
    tg.showAlert(data.error);
    return;
  }
  tg.showAlert('درخواست برداشت ثبت شد و بعد از بررسی پردازش می‌شود.');
  currentUser.points -= pointsAmount;
  updatePointsDisplay();
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
