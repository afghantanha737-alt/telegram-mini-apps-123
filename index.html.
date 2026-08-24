<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Telegram Mini App</title>

  <script src="https://telegram.org/js/telegram-web-app.js"></script>

  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      font-family: Arial, sans-serif;
      background: #f5f7fb;
      color: #17202a;
      min-height: 100vh;
    }

    .app {
      max-width: 520px;
      margin: auto;
      min-height: 100vh;
      padding-bottom: 95px;
    }

    /* Header */

    .header {
      background: linear-gradient(135deg, #229ed9, #147db0);
      color: white;
      padding: 25px 20px 70px;
      border-radius: 0 0 35px 35px;
      position: relative;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 20px;
      font-weight: bold;
    }

    .language {
      border: 0;
      background: rgba(255,255,255,0.18);
      color: white;
      padding: 9px 12px;
      border-radius: 12px;
      outline: none;
    }

    .language option {
      color: #222;
    }

    /* User card */

    .user-card {
      background: white;
      margin: -45px 18px 0;
      border-radius: 24px;
      padding: 22px;
      position: relative;
      box-shadow: 0 10px 30px rgba(0,0,0,0.10);
      text-align: center;
    }

    .avatar {
      width: 90px;
      height: 90px;
      border-radius: 50%;
      object-fit: cover;
      border: 5px solid white;
      box-shadow: 0 5px 20px rgba(0,0,0,0.15);
      margin-top: -60px;
      background: #e9eef3;
    }

    .avatar-placeholder {
      width: 90px;
      height: 90px;
      border-radius: 50%;
      margin: -60px auto 0;
      background: #229ed9;
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 38px;
      border: 5px solid white;
      box-shadow: 0 5px 20px rgba(0,0,0,0.15);
    }

    .welcome {
      margin-top: 15px;
      font-size: 15px;
      color: #7a8793;
    }

    .name {
      font-size: 23px;
      font-weight: bold;
      margin-top: 6px;
    }

    .username {
      color: #229ed9;
      margin-top: 5px;
      font-size: 14px;
    }

    /* Content */

    .content {
      padding: 22px 18px;
    }

    .section-title {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 15px;
    }

    .info-card {
      background: white;
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.06);
      margin-bottom: 18px;
    }

    .info-title {
      font-size: 17px;
      font-weight: bold;
      margin-bottom: 8px;
    }

    .info-text {
      color: #7a8793;
      line-height: 1.8;
      font-size: 14px;
    }

    /* Stats */

    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 15px;
    }

    .stat {
      background: white;
      padding: 16px 8px;
      border-radius: 18px;
      text-align: center;
      box-shadow: 0 5px 18px rgba(0,0,0,0.05);
    }

    .stat-number {
      font-size: 21px;
      font-weight: bold;
      color: #229ed9;
    }

    .stat-label {
      font-size: 12px;
      color: #7a8793;
      margin-top: 5px;
    }

    /* Pages */

    .page {
      display: none;
    }

    .page.active {
      display: block;
    }

    .simple-page {
      padding: 35px 20px;
      text-align: center;
    }

    .simple-icon {
      font-size: 55px;
      margin-bottom: 15px;
    }

    .simple-page h2 {
      margin-bottom: 10px;
    }

    .simple-page p {
      color: #7a8793;
      line-height: 1.8;
    }

    /* Bottom navigation */

    .bottom-nav {
      position: fixed;
      bottom: 12px;
      left: 12px;
      right: 12px;
      max-width: 496px;
      margin: auto;
      height: 72px;
      background: rgba(255,255,255,0.96);
      backdrop-filter: blur(15px);
      border-radius: 24px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      box-shadow: 0 8px 30px rgba(0,0,0,0.14);
      z-index: 1000;
    }

    .nav-btn {
      border: none;
      background: transparent;
      color: #8b96a3;
      font-size: 11px;
      cursor: pointer;
      border-radius: 20px;
    }

    .nav-btn .icon {
      display: block;
      font-size: 22px;
      margin-bottom: 4px;
    }

    .nav-btn.active {
      color: #229ed9;
      font-weight: bold;
    }

    .nav-btn.active .icon {
      transform: scale(1.08);
    }

    @media (min-width: 600px) {
      .bottom-nav {
        left: 50%;
        right: auto;
        width: 496px;
        transform: translateX(-50%);
      }
    }
  </style>
</head>

<body>

<div class="app">

  <!-- HOME -->
  <section id="homePage" class="page active">

    <header class="header">

      <div class="header-top">

        <div class="logo">
          Telegram Mini App
        </div>

        <select id="language" class="language" onchange="changeLanguage()">
          <option value="fa">دری</option>
          <option value="ps">پښتو</option>
          <option value="en">English</option>
        </select>

      </div>

    </header>

    <div class="user-card">

      <img id="avatar"
           class="avatar"
           style="display:none;"
           alt="Profile">

      <div id="avatarPlaceholder" class="avatar-placeholder">
        👤
      </div>

      <div id="welcome" class="welcome">
        سلام، خوش آمدی 👋
      </div>

      <div id="name" class="name">
        کاربر تلگرام
      </div>

      <div id="username" class="username">
        @TelegramUser
      </div>

    </div>

    <main class="content">

      <div class="section-title" id="homeTitle">
        خانه
      </div>

      <div class="info-card">

        <div class="info-title" id="cardTitle">
          به مینی‌اپ ما خوش آمدی 🎉
        </div>

        <div class="info-text" id="cardText">
          از اینجا می‌توانی به بخش‌های مختلف مینی‌اپ دسترسی داشته باشی.
        </div>

      </div>

      <div class="stats">

        <div class="stat">
          <div class="stat-number">0</div>
          <div class="stat-label" id="stat1">امتیاز</div>
        </div>

        <div class="stat">
          <div class="stat-number">0</div>
          <div class="stat-label" id="stat2">دعوت‌ها</div>
        </div>

        <div class="stat">
          <div class="stat-number">0</div>
          <div class="stat-label" id="stat3">وظایف</div>
        </div>

      </div>

    </main>

  </section>


  <!-- REFERRAL -->
  <section id="referralPage" class="page">

    <div class="simple-page">

      <div class="simple-icon">👥</div>

      <h2>Referral</h2>

      <p>
        دوستان خود را دعوت کن و در آینده از سیستم Referral استفاده کن.
      </p>

    </div>

  </section>


  <!-- TASKS -->
  <section id="tasksPage" class="page">

    <div class="simple-page">

      <div class="simple-icon">📋</div>

      <h2>Tasks</h2>

      <p>
        وظایف شما در این قسمت نمایش داده خواهند شد.
      </p>

    </div>

  </section>


  <!-- PROFILE -->
  <section id="profilePage" class="page">

    <div class="simple-page">

      <div class="simple-icon">👤</div>

      <h2>Profile</h2>

      <p id="profileText">
        پروفایل شما
      </p>

    </div>

  </section>


  <!-- BOTTOM MENU -->

  <nav class="bottom-nav">

    <button class="nav-btn active"
            onclick="openPage('homePage', this)">

      <span class="icon">🏠</span>
      <span id="navHome">Home</span>

    </button>

    <button class="nav-btn"
            onclick="openPage('referralPage', this)">

      <span class="icon">👥</span>
      <span id="navReferral">Referral</span>

    </button>

    <button class="nav-btn"
            onclick="openPage('tasksPage', this)">

      <span class="icon">📋</span>
      <span id="navTasks">Tasks</span>

    </button>

    <button class="nav-btn"
            onclick="openPage('profilePage', this)">

      <span class="icon">👤</span>
      <span id="navProfile">Profile</span>

    </button>

  </nav>

</div>


<script>

  /* Telegram */

  const tg = window.Telegram.WebApp;

  tg.ready();
  tg.expand();


  /* User */

  const user = tg.initDataUnsafe &&
               tg.initDataUnsafe.user;

  const avatar =
    document.getElementById("avatar");

  const placeholder =
    document.getElementById("avatarPlaceholder");

  const name =
    document.getElementById("name");

  const username =
    document.getElementById("username");

  const profileText =
    document.getElementById("profileText");


  if (user) {

    let fullName =
      ((user.first_name || "") +
      " " +
      (user.last_name || "")).trim();

    if (!fullName) {
      fullName = "کاربر تلگرام";
    }

    name.textContent = fullName;
    profileText.textContent =
      "پروفایل " + fullName;


    if (user.username) {

      username.textContent =
        "@" + user.username;

    } else {

      username.textContent =
        "کاربر تلگرام";

    }


    if (user.photo_url) {

      avatar.src = user.photo_url;

      avatar.style.display = "block";

      placeholder.style.display = "none";

    }

  }


  /* Navigation */

  function openPage(pageId, button) {

    document
      .querySelectorAll(".page")
      .forEach(function(page) {

        page.classList.remove("active");

      });


    document
      .getElementById(pageId)
      .classList.add("active");


    document
      .querySelectorAll(".nav-btn")
      .forEach(function(btn) {

        btn.classList.remove("active");

      });


    button.classList.add("active");

    window.scrollTo(0, 0);

  }


  /* Languages */

  function changeLanguage() {

    const lang =
      document.getElementById("language").value;


    const welcome =
      document.getElementById("welcome");

    const homeTitle =
      document.getElementById("homeTitle");

    const cardTitle =
      document.getElementById("cardTitle");

    const cardText =
      document.getElementById("cardText");


    if (lang === "fa") {

      document.documentElement.lang = "fa";
      document.documentElement.dir = "rtl";

      welcome.textContent =
        "سلام، خوش آمدی 👋";

      homeTitle.textContent =
        "خانه";

      cardTitle.textContent =
        "به مینی‌اپ ما خوش آمدی 🎉";

      cardText.textContent =
        "از اینجا می‌توانی به بخش‌های مختلف مینی‌اپ دسترسی داشته باشی.";

    }


    else if (lang === "ps") {

      document.documentElement.lang = "ps";
      document.documentElement.dir = "rtl";

      welcome.textContent =
        "سلام، ښه راغلاست 👋";

      homeTitle.textContent =
        "کور";

      cardTitle.textContent =
        "زموږ میني اپ ته ښه راغلاست 🎉";

      cardText.textContent =
        "له دې ځایه تاسو کولی شئ د میني اپ مختلفو برخو ته لاړ شئ.";

    }


    else {

      document.documentElement.lang = "en";
      document.documentElement.dir = "ltr";

      welcome.textContent =
        "Hello, Welcome 👋";

      homeTitle.textContent =
        "Home";

      cardTitle.textContent =
        "Welcome to our Mini App 🎉";

      cardText.textContent =
        "From here you can access different sections of the Mini App.";

    }

  }

</script>

</body>
</html>