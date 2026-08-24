<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telegram Mini Apps 123</title>

  <script src="https://telegram.org/js/telegram-web-app.js"></script>

  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: Arial, sans-serif;
      background: #f4f7fb;
      color: #222;
      min-height: 100vh;
    }

    .app {
      min-height: 100vh;
      padding-bottom: 85px;
    }

    .top {
      padding: 20px 16px 10px;
      display: flex;
      justify-content: flex-end;
    }

    select {
      border: none;
      background: white;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      outline: none;
    }

    .home {
      text-align: center;
      padding: 35px 20px;
    }

    .profile-image {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      object-fit: cover;
      background: #ddd;
      margin-bottom: 20px;
      border: 4px solid white;
      box-shadow: 0 4px 15px rgba(0,0,0,0.12);
    }

    .default-avatar {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: #229ed9;
      color: white;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 42px;
      margin: 0 auto 20px;
    }

    h1 {
      font-size: 25px;
      margin-bottom: 10px;
    }

    .welcome {
      font-size: 18px;
      margin-bottom: 8px;
    }

    .username {
      color: #777;
      font-size: 15px;
    }

    .card {
      background: white;
      margin: 30px auto;
      padding: 20px;
      max-width: 420px;
      border-radius: 18px;
      box-shadow: 0 4px 18px rgba(0,0,0,0.07);
    }

    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 72px;
      background: white;
      display: flex;
      justify-content: space-around;
      align-items: center;
      box-shadow: 0 -3px 15px rgba(0,0,0,0.08);
      z-index: 100;
    }

    .nav-button {
      border: none;
      background: transparent;
      font-size: 13px;
      color: #777;
      cursor: pointer;
      padding: 8px 12px;
    }

    .nav-button.active {
      color: #229ed9;
      font-weight: bold;
    }

    .nav-icon {
      display: block;
      font-size: 22px;
      margin-bottom: 3px;
    }

    .page {
      display: none;
      text-align: center;
      padding: 50px 20px;
    }

    .page.active {
      display: block;
    }
  </style>
</head>

<body>

  <div class="app">

    <!-- Language -->
    <div class="top">
      <select id="language" onchange="changeLanguage()">
        <option value="fa">دری</option>
        <option value="ps">پښتو</option>
        <option value="en">English</option>
      </select>
    </div>

    <!-- Home -->
    <section id="home" class="page active">
      <div class="home">

        <img id="profileImage"
             class="profile-image"
             src=""
             alt="Profile">

        <div id="defaultAvatar" class="default-avatar">
          👤
        </div>

        <h1 id="welcomeTitle">سلام، خوش آمدی!</h1>

        <div class="welcome" id="welcomeText">
          به Telegram Mini Apps خوش آمدی
        </div>

        <div class="username" id="userName">
          کاربر مهمان
        </div>

        <div class="card">
          <p id="homeMessage">
            این صفحه اصلی مینی‌اپ شماست.
          </p>
        </div>

      </div>
    </section>

    <!-- Referral -->
    <section id="referral" class="page">
      <h1>Referral</h1>
      <p>بخش دعوت دوستان به‌زودی فعال می‌شود.</p>
    </section>

    <!-- Tasks -->
    <section id="tasks" class="page">
      <h1>Tasks</h1>
      <p>بخش وظایف به‌زودی فعال می‌شود.</p>
    </section>

    <!-- Profile -->
    <section id="profile" class="page">
      <h1>Profile</h1>
      <p id="profileName">پروفایل کاربر</p>
    </section>

  </div>

  <!-- Bottom Navigation -->
  <nav class="bottom-nav">

    <button class="nav-button active" onclick="showPage('home', this)">
      <span class="nav-icon">🏠</span>
      <span id="navHome">Home</span>
    </button>

    <button class="nav-button" onclick="showPage('referral', this)">
      <span class="nav-icon">👥</span>
      <span id="navReferral">Referral</span>
    </button>

    <button class="nav-button" onclick="showPage('tasks', this)">
      <span class="nav-icon">📋</span>
      <span id="navTasks">Tasks</span>
    </button>

    <button class="nav-button" onclick="showPage('profile', this)">
      <span class="nav-icon">👤</span>
      <span id="navProfile">Profile</span>
    </button>

  </nav>

  <script>
    // Telegram Mini App
    const tg = window.Telegram.WebApp;

    tg.ready();
    tg.expand();

    // Get Telegram user
    const user = tg.initDataUnsafe?.user;

    const profileImage = document.getElementById("profileImage");
    const defaultAvatar = document.getElementById("defaultAvatar");
    const userName = document.getElementById("userName");
    const profileName = document.getElementById("profileName");

    if (user) {

      // Name
      const fullName =
        ((user.first_name || "") + " " + (user.last_name || "")).trim();

      userName.textContent = fullName || "کاربر تلگرام";
      profileName.textContent = fullName || "کاربر تلگرام";

      // Username
      if (user.username) {
        userName.textContent =
          fullName + "  @" + user.username;
      }

      // Profile photo
      if (user.photo_url) {
        profileImage.src = user.photo_url;
        profileImage.style.display = "block";
        defaultAvatar.style.display = "none";
      } else {
        profileImage.style.display = "none";
        defaultAvatar.style.display = "flex";
      }

    } else {

      profileImage.style.display = "none";
      defaultAvatar.style.display = "flex";
      userName.textContent = "کاربر مهمان";
      profileName.textContent = "کاربر مهمان";
    }


    // Navigation
    function showPage(pageId, button) {

      document.querySelectorAll(".page").forEach(function(page) {
        page.classList.remove("active");
      });

      document.getElementById(pageId).classList.add("active");

      document.querySelectorAll(".nav-button").forEach(function(btn) {
        btn.classList.remove("active");
      });

      button.classList.add("active");

      window.scrollTo(0, 0);
    }


    // Language
    function changeLanguage() {

      const language =
        document.getElementById("language").value;

      const title =
        document.getElementById("welcomeTitle");

      const welcome =
        document.getElementById("welcomeText");

      const message =
        document.getElementById("homeMessage");

      if (language === "fa") {

        document.documentElement.lang = "fa";
        document.documentElement.dir = "rtl";

        title.textContent = "سلام، خوش آمدی!";
        welcome.textContent =
          "به Telegram Mini Apps خوش آمدی";
        message.textContent =
          "این صفحه اصلی مینی‌اپ شماست.";

      }

      else if (language === "ps") {

        document.documentElement.lang = "ps";
        document.documentElement.dir = "rtl";

        title.textContent = "سلام، ښه راغلاست!";
        welcome.textContent =
          "Telegram Mini Apps ته ښه راغلاست";
        message.textContent =
          "دا ستاسو د میني اپ اصلي پاڼه ده.";

      }

      else {

        document.documentElement.lang = "en";
        document.documentElement.dir = "ltr";

        title.textContent = "Hello, Welcome!";
        welcome.textContent =
          "Welcome to Telegram Mini Apps";
        message.textContent =
          "This is the home page of your Mini App.";
      }
    }
  </script>

</body>
</html>