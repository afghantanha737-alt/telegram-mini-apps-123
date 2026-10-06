(function () {
  'use strict';
  document.documentElement.classList.add('maintenance-gate-pending');
  const showMaintenance = () => {
    const lang = localStorage.getItem('gramup-maintenance-language') || 'fa';
    window.location.replace('/maintenance.html?lang=' + encodeURIComponent(lang));
  };
  const allowApp = () => document.documentElement.classList.remove('maintenance-gate-pending');

  async function checkAccess() {
    try {
      const telegram = window.Telegram && window.Telegram.WebApp;
      if (telegram && typeof telegram.ready === 'function') telegram.ready();
      const initData = telegram && typeof telegram.initData === 'string' ? telegram.initData : '';
      const response = await fetch('/api/maintenance/access', {
        cache: 'no-store',
        headers: initData ? { 'X-Telegram-Init-Data': initData } : {}
      });
      if (response.status === 423) return showMaintenance();
      if (!response.ok) return showMaintenance();
      const data = await response.json();
      if (data.maintenance === true && data.allowed !== true) return showMaintenance();
      return allowApp();
    } catch {
      return showMaintenance();
    }
  }

  checkAccess();
})();
