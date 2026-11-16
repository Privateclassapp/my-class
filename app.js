/* app.js — startup, PIN gate, router, home, settings and exports. */
(function () {
  'use strict';

  var Pages = window.Pages = window.Pages || {};
  var APP_VERSION = '1.1.0';
  var LOCK_KEY = 'my-class-lock-until';
  var LOCK_MS = 30000;
  var MAX_ATTEMPTS = 5;

  var App = window.App = {
    version: APP_VERSION,
    settings: null,
    data: null,
    billing: null,
    unlocked: false,
    gateState: null,
    route: null,
    currentPage: null,
    attState: null,
    studentFilter: 'active',
    studentSearch: '',
    classFilter: 'active',
    classSearch: '',
    moneyFilter: 'all',
    moneySearch: '',
    notesFilter: 'all',
    deferredInstallPrompt: null,
    swRegistration: null,
    attempts: 0,
    lockUntil: 0,
    lockTimer: null,
    lockError: '',
    wasOffline: false,
    swUpdateShown: false,
    eventsBound: false
  };

  function t(key, vars) { return I18n.t(key, vars); }
  function esc(value) { return UI.escapeHtml(value); }
  function today() { return Jalali.todayISO(); }
  function pad2(n) { return String(n).padStart(2, '0'); }

  App.normalizeSearch = function (value) {
    var s = Fmt.toEnDigits(String(value == null ? '' : value)).toLowerCase();
    return s
      .replace(/[يى]/g, 'ی')
      .replace(/[ك]/g, 'ک')
      .replace(/[\u200c\u200e\u200f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  App.getStudent = function (id) {
    return App.data ? App.data.students.find(function (s) { return s.id === id; }) || null : null;
  };

  App.getClass = function (id) {
    return App.data ? App.data.classes.find(function (c) { return c.id === id; }) || null : null;
  };

  App.reloadData = async function () {
    App.data = await DB.loadData();
    App.billing = Billing.computeAll(App.data, { today: Jalali.todayISO() });
    return App.data;
  };

  App.saveSettings = async function (patch) {
    App.settings = await DB.updateSettings(patch);
    return App.settings;
  };

  App.navigate = function (hash) {
    if (!hash) hash = '#/home';
    if (location.hash === hash) {
      if (App.unlocked) App.render();
    } else {
      location.hash = hash;
    }
  };

  App.rerender = function () {
    if (App.unlocked) App.render();
  };

  App.openAttendance = function (options) {
    options = options || {};
    App.attState = {
      date: options.date && Jalali.isValidISO(options.date) ? options.date : today(),
      mode: options.mode === 'private' ? 'private' : 'class',
      classId: options.classId || null,
      studentId: options.studentId || null,
      draft: null
    };
    App.navigate('#/attendance');
  };

  App.lock = function () {
    if (!App.unlocked) return;
    App.unlocked = false;
    App.data = null;
    App.billing = null;
    if (App.attState) App.attState.draft = null;
    if (window.Sync) Sync.lock();
    closeDialogs();
    clearShell();
    document.getElementById('gate').hidden = false;
    document.getElementById('app').hidden = true;
    showLock();
    UI.toast(t('gate.locked'), 'info');
  };

  App.install = async function () {
    if (!App.deferredInstallPrompt) {
      UI.alert({ title: t('settings.installTitle'), message: t('settings.installHint') });
      return;
    }
    var prompt = App.deferredInstallPrompt;
    App.deferredInstallPrompt = null;
    try {
      prompt.prompt();
      await prompt.userChoice;
    } catch (_) {}
  };

  function closeDialogs() {
    document.querySelectorAll('dialog').forEach(function (d) { d.remove(); });
  }

  function clearShell() {
    var view = document.getElementById('view');
    var header = document.getElementById('appHeader');
    var nav = document.getElementById('bottomNav');
    if (view) view.innerHTML = '';
    if (header) header.innerHTML = '';
    if (nav) nav.innerHTML = '';
  }

  function readLockUntil() {
    try {
      var value = Number(localStorage.getItem(LOCK_KEY) || 0);
      return isFinite(value) && value > Date.now() ? value : 0;
    } catch (_) {
      return 0;
    }
  }

  function setLockUntil(value) {
    try {
      if (value) localStorage.setItem(LOCK_KEY, String(value));
      else localStorage.removeItem(LOCK_KEY);
    } catch (_) {}
  }

  function clearLockTimer() {
    if (App.lockTimer) {
      clearInterval(App.lockTimer);
      App.lockTimer = null;
    }
  }

  function startLockTimer() {
    clearLockTimer();
    App.lockTimer = setInterval(function () {
      var remaining = Math.ceil((App.lockUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        App.lockUntil = 0;
        App.lockError = '';
        setLockUntil(0);
        clearLockTimer();
        renderLock();
        return;
      }
      var el = document.querySelector('[data-lock-countdown]');
      if (el) el.textContent = t('gate.lockedFor', { seconds: Fmt.formatNumber(remaining, I18n.lang) });
    }, 500);
  }

  function boot() {
    I18n.apply();
    UI.applyTheme('auto');
    bindGlobalEvents();
    registerSW();
    updateNetBanner();
    DB.open().then(function () {
      return DB.getSettings();
    }).then(function (settings) {
      App.settings = settings || null;
      if (!settings || !settings.setupComplete || !settings.pinHash) {
        var lang = settings && settings.language === 'en' ? 'en' : 'fa';
        I18n.setLanguage(lang);
        UI.applyTheme(settings && settings.theme ? settings.theme : 'auto');
        showSetup(lang);
      } else {
        I18n.setLanguage(settings.language === 'en' ? 'en' : 'fa');
        UI.applyTheme(settings.theme || 'auto');
        showLock();
      }
    }).catch(function (err) {
      console.error(err);
      showGateError(err);
    });
  }

  function showGateError(err) {
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    if (app) app.hidden = true;
    if (!gate) return;
    gate.hidden = false;
    var message = err && err.code === 'DB_UNAVAILABLE' ? t('error.dbUnavailable') : t('error.generic');
    gate.innerHTML = '<div class="gate-card">' +
      '<div class="brand-mark">' + UI.icon('book', 34) + '</div>' +
      '<h1>' + esc(t('app.name')) + '</h1>' +
      '<p class="gate-sub">' + esc(message) + '</p>' +
      '<button type="button" class="btn primary btn-block" data-retry>' + esc(t('common.retry')) + '</button>' +
    '</div>';
    var retry = gate.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', function () { location.reload(); });
  }

  function showSetup(lang) {
    App.unlocked = false;
    App.data = null;
    App.billing = null;
    if (App.attState) App.attState.draft = null;
    App.gateState = { step: 'language', lang: lang === 'en' ? 'en' : 'fa' };
    I18n.setLanguage(App.gateState.lang);
    UI.applyTheme(App.settings && App.settings.theme ? App.settings.theme : 'auto');
    closeDialogs();
    clearShell();
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    gate.hidden = false;
    app.hidden = true;
    renderSetup();
  }

  App.showSetup = showSetup;

  function renderSetup() {
    var gate = document.getElementById('gate');
    var state = App.gateState || { step: 'language', lang: 'fa' };
    if (state.step === 'language') {
      gate.innerHTML = '<div class="gate-card">' +
        '<div class="brand-mark">' + UI.icon('book', 34) + '</div>' +
        '<p class="eyebrow">' + esc(t('app.tagline')) + '</p>' +
        '<h1>' + esc(t('gate.welcome')) + '</h1>' +
        '<p class="gate-sub">' + esc(t('gate.subtitle')) + '</p>' +
        '<h2 class="gate-section-title">' + esc(t('gate.chooseLanguage')) + '</h2>' +
        '<div class="language-choice">' +
          '<button type="button" class="language-btn' + (state.lang === 'fa' ? ' is-active' : '') + '" data-lang="fa">' +
            '<strong>فارسی</strong><small>راست‌به‌چپ</small></button>' +
          '<button type="button" class="language-btn' + (state.lang === 'en' ? ' is-active' : '') + '" data-lang="en">' +
            '<strong>English</strong><small>Left to right</small></button>' +
        '</div>' +
        '<p class="hint">' + esc(t('gate.languageHint')) + '</p>' +
        '<button type="button" class="btn primary btn-block" data-continue>' + esc(t('gate.continue')) + '</button>' +
      '</div>';
      gate.querySelectorAll('[data-lang]').forEach(function (b) {
        b.addEventListener('click', function () {
          App.gateState.lang = b.getAttribute('data-lang');
          I18n.setLanguage(App.gateState.lang);
          renderSetup();
        });
      });
      gate.querySelector('[data-continue]').addEventListener('click', function () {
        App.gateState.step = 'pin';
        renderSetup();
      });
      return;
    }

    gate.innerHTML = '<div class="gate-card">' +
      '<div class="brand-mark">' + UI.icon('book', 34) + '</div>' +
      '<p class="eyebrow">' + esc(t('app.name')) + '</p>' +
      '<h1>' + esc(t('gate.pinTitle')) + '</h1>' +
      '<p class="gate-sub">' + esc(t('gate.pinSubtitle')) + '</p>' +
      '<form class="gate-form" novalidate>' +
        '<label class="field"><span>' + esc(t('gate.pinLabel')) + '</span>' +
          '<input class="input pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9۰-۹]{4,6}" maxlength="6" autocomplete="new-password" required></label>' +
        '<label class="field"><span>' + esc(t('gate.pinConfirm')) + '</span>' +
          '<input class="input pin-input" name="pin2" type="password" inputmode="numeric" pattern="[0-9۰-۹]{4,6}" maxlength="6" autocomplete="new-password" required></label>' +
        '<p class="form-error" role="alert" hidden></p>' +
        '<button type="submit" class="btn primary btn-block">' + esc(t('gate.pinCreate')) + '</button>' +
      '</form>' +
      '<p class="gate-warning">' + UI.icon('alert', 16) + ' ' + esc(t('gate.pinWarning')) + '</p>' +
      '<button type="button" class="link-btn" data-back-language>' + esc(t('gate.changeLanguage')) + '</button>' +
    '</div>';

    var form = gate.querySelector('.gate-form');
    var errorEl = gate.querySelector('.form-error');
    var submitBtn = form.querySelector('button[type="submit"]');
    gate.querySelector('[data-back-language]').addEventListener('click', function () {
      App.gateState.step = 'language';
      renderSetup();
    });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      errorEl.hidden = true;
      var fd = new FormData(form);
      var pin = String(fd.get('pin') || '');
      var pin2 = String(fd.get('pin2') || '');
      if (!Pin.isValid(pin)) {
        errorEl.textContent = t('validation.pinLength');
        errorEl.hidden = false;
        return;
      }
      if (Pin.normalize(pin) !== Pin.normalize(pin2)) {
        errorEl.textContent = t('validation.pinMismatch');
        errorEl.hidden = false;
        return;
      }
      if (!Pin.isSupported()) {
        errorEl.textContent = t('gate.cryptoUnavailable');
        errorEl.hidden = false;
        return;
      }
      submitBtn.disabled = true;
      try {
        var record = await Pin.create(pin);
        var saved = await DB.saveSettings(Object.assign({
          key: 'settings',
          language: App.gateState.lang,
          theme: 'auto',
          setupComplete: true,
          createdAt: DB.now(),
          lastBackupAt: null
        }, record));
        App.settings = saved;
        await enterApp();
      } catch (err) {
        console.error(err);
        errorEl.textContent = err && err.userMessage ? err.userMessage : t('error.generic');
        errorEl.hidden = false;
        submitBtn.disabled = false;
      }
    });
    setTimeout(function () {
      var input = gate.querySelector('input[name="pin"]');
      if (input) input.focus();
    }, 60);
  }

  function showLock() {
    clearLockTimer();
    App.unlocked = false;
    App.lockUntil = readLockUntil();
    App.lockError = '';
    var gate = document.getElementById('gate');
    var app = document.getElementById('app');
    gate.hidden = false;
    app.hidden = true;
    renderLock();
  }

  function renderLock() {
    var gate = document.getElementById('gate');
    var remaining = Math.max(0, Math.ceil((App.lockUntil - Date.now()) / 1000));
    var locked = remaining > 0;
    gate.innerHTML = '<div class="gate-card lock-card">' +
      '<div class="brand-mark">' + UI.icon('lock', 32) + '</div>' +
      '<p class="eyebrow">' + esc(t('app.name')) + '</p>' +
      '<h1>' + esc(t('gate.enterPin')) + '</h1>' +
      '<p class="gate-sub">' + esc(t('app.tagline')) + '</p>' +
      '<form class="gate-form lock-form" novalidate>' +
        '<label class="field"><span>' + esc(t('gate.pinLabel')) + '</span>' +
          '<input class="input pin-input" name="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password"' + (locked ? ' disabled' : '') + ' required></label>' +
        (locked ? '<p class="lockout" data-lock-countdown>' + esc(t('gate.lockedFor', { seconds: Fmt.formatNumber(remaining, I18n.lang) })) + '</p>' : '') +
        '<p class="form-error" role="alert"' + (App.lockError ? '' : ' hidden') + '>' + esc(App.lockError || '') + '</p>' +
        (App.attempts ? '<p class="hint">' + esc(t('gate.attemptsLeft', { count: Fmt.formatNumber(MAX_ATTEMPTS - App.attempts, I18n.lang) })) + '</p>' : '') +
        '<button type="submit" class="btn primary btn-block"' + (locked ? ' disabled' : '') + '>' + esc(t('gate.unlock')) + '</button>' +
      '</form>' +
      '<p class="gate-warning">' + UI.icon('alert', 16) + ' ' + esc(t('gate.pinNoRecovery')) + '</p>' +
      '<button type="button" class="link-btn" data-lock-language>' + esc(I18n.lang === 'fa' ? 'English' : 'فارسی') + '</button>' +
    '</div>';

    if (locked) startLockTimer();
    var form = gate.querySelector('.lock-form');
    var submitBtn = form.querySelector('button[type="submit"]');
    gate.querySelector('[data-lock-language]').addEventListener('click', async function () {
      var next = I18n.lang === 'fa' ? 'en' : 'fa';
      I18n.setLanguage(next);
      App.lockError = '';
      if (App.settings) {
        try { App.settings = await DB.updateSettings({ language: next }); } catch (_) {}
      }
      renderLock();
    });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (App.lockUntil > Date.now()) return;
      var fd = new FormData(form);
      var pin = String(fd.get('pin') || '');
      if (!pin) {
        App.lockError = t('gate.enterPin');
        renderLock();
        return;
      }
      submitBtn.disabled = true;
      try {
        var ok = await Pin.verify(pin, App.settings);
        if (ok) {
          App.attempts = 0;
          App.lockUntil = 0;
          App.lockError = '';
          setLockUntil(0);
          clearLockTimer();
          App.settings = await DB.getSettings();
          await enterApp();
          return;
        }
        App.attempts++;
        App.lockError = t('gate.wrongPin');
        if (App.attempts >= MAX_ATTEMPTS) {
          App.attempts = 0;
          App.lockUntil = Date.now() + LOCK_MS;
          setLockUntil(App.lockUntil);
          App.lockError = t('gate.tooMany');
        }
        renderLock();
      } catch (err) {
        console.error(err);
        App.lockError = t('error.generic');
        renderLock();
      }
    });
    setTimeout(function () {
      if (!locked) {
        var input = gate.querySelector('input[name="pin"]');
        if (input) input.focus();
      }
    }, 60);
  }

  async function enterApp() {
    try {
      clearLockTimer();
      App.unlocked = true;
      App.gateState = null;
      App.lockError = '';
      document.getElementById('gate').hidden = true;
      document.getElementById('app').hidden = false;
      await App.reloadData();
      if (window.Sync) await Sync.init();
      if (!location.hash || location.hash === '#' || location.hash === '#/') {
        history.replaceState(null, '', '#/home');
      }
      App.render();
    } catch (err) {
      console.error(err);
      App.unlocked = false;
      showGateError(err);
    }
  }

  function parseRoute() {
    var raw = location.hash || '';
    raw = raw.replace(/^#\/?/, '');
    var split = raw.split('?');
    var segments = [];
    try {
      segments = split[0].split('/').filter(Boolean).map(function (part) { return decodeURIComponent(part); });
    } catch (_) {
      segments = split[0].split('/').filter(Boolean);
    }
    return { segments: segments, query: new URLSearchParams(split[1] || '') };
  }

  function resolveRoute(route) {
    var s = route.segments;
    if (!s.length || s[0] === 'home') return { page: 'home', nav: 'home', params: {} };
    if (s[0] === 'students') {
      if (!s[1]) return { page: 'studentsList', nav: 'students', params: {} };
      if (s[1] === 'new') return { page: 'studentForm', nav: 'students', params: { mode: 'new' } };
      if (s[2] === 'edit') return { page: 'studentForm', nav: 'students', params: { mode: 'edit', id: s[1] } };
      return { page: 'studentDetail', nav: 'students', params: { id: s[1] } };
    }
    if (s[0] === 'attendance') return { page: 'attendance', nav: 'attendance', params: {} };
    if (s[0] === 'money') return { page: 'money', nav: 'money', params: {} };
    if (s[0] === 'more') return { page: 'more', nav: 'more', params: {} };
    if (s[0] === 'classes') {
      if (!s[1]) return { page: 'classesList', nav: 'more', params: {} };
      if (s[1] === 'new') return { page: 'classForm', nav: 'more', params: { mode: 'new' } };
      if (s[2] === 'edit') return { page: 'classForm', nav: 'more', params: { mode: 'edit', id: s[1] } };
      return { page: 'classDetail', nav: 'more', params: { id: s[1] } };
    }
    if (s[0] === 'notes') return { page: 'notesPage', nav: 'more', params: {} };
    if (s[0] === 'settings') return { page: 'settings', nav: 'more', params: {} };
    return { page: 'notFound', nav: 'home', params: {} };
  }

  App.render = function () {
    if (!App.unlocked) return;
    var route = parseRoute();
    var resolved = resolveRoute(route);
    var pageFn = Pages[resolved.page];
    var page;
    try {
      if (!pageFn) throw new Error('Page not found: ' + resolved.page);
      page = pageFn(resolved.params, route.query);
      if (!page) throw new Error('Empty page: ' + resolved.page);
      if (page.content === undefined) page.content = '';
    } catch (err) {
      console.error(err);
      page = {
        title: t('common.error'),
        nav: resolved.nav || 'home',
        content: '<div class="page">' + UI.emptyState('alert', t('common.error'), t('error.generic'),
          '<button type="button" class="btn primary" data-retry-page>' + esc(t('common.retry')) + '</button>') + '</div>'
      };
      setTimeout(function () {
        var btn = document.querySelector('[data-retry-page]');
        if (btn) btn.addEventListener('click', function () { App.render(); });
      }, 0);
    }
    App.route = route;
    App.currentPage = page;
    renderHeader(page);
    renderNav(page.nav || resolved.nav || 'home');
    var view = document.getElementById('view');
    view.innerHTML = page.content;
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    document.title = page.title ? page.title + ' — ' + t('app.name') : t('app.title');
    if (page.onMount) {
      try { page.onMount(view); } catch (err) {
        console.error(err);
        UI.toast(t('error.generic'), 'error');
      }
    }
  };

  function renderHeader(page) {
    var header = document.getElementById('appHeader');
    var back = page.back
      ? '<button type="button" class="icon-btn header-back" data-back aria-label="' + esc(t('common.back')) + '">' + UI.icon('back', 22) + '</button>'
      : '<span class="header-slot" aria-hidden="true"></span>';
    header.innerHTML = back +
      '<div class="header-title"><span class="header-kicker">' + esc(t('app.name')) + '</span><h1>' + esc(page.title || t('app.name')) + '</h1></div>' +
      '<button type="button" class="icon-btn header-lock" data-lock aria-label="' + esc(t('gate.lock')) + '">' + UI.icon('lock', 20) + '</button>';
    var backBtn = header.querySelector('[data-back]');
    if (backBtn) backBtn.addEventListener('click', function () { App.navigate(page.back); });
    var lockBtn = header.querySelector('[data-lock]');
    if (lockBtn) lockBtn.addEventListener('click', async function () {
      var ok = await UI.confirm({ title: t('gate.lock'), message: t('gate.lockConfirm'), confirmLabel: t('gate.lock'), cancelLabel: t('common.cancel') });
      if (ok) App.lock();
    });
  }

  function renderNav(active) {
    var nav = document.getElementById('bottomNav');
    nav.setAttribute('aria-label', t('nav.main'));
    var items = [
      ['home', '#/home', t('nav.home'), 'home'],
      ['students', '#/students', t('nav.students'), 'users'],
      ['attendance', '#/attendance', t('nav.attendance'), 'clipboard'],
      ['money', '#/money', t('nav.money'), 'wallet'],
      ['more', '#/more', t('nav.more'), 'more']
    ];
    nav.innerHTML = items.map(function (item) {
      return '<button type="button" class="nav-item' + (active === item[0] ? ' is-active' : '') + '" data-nav="' + item[0] + '" data-route="' + item[1] + '"' + (active === item[0] ? ' aria-current="page"' : '') + '>' +
        '<span class="nav-icon">' + UI.icon(item[3], 21) + '</span><span>' + esc(item[2]) + '</span></button>';
    }).join('');
    nav.querySelectorAll('[data-route]').forEach(function (b) {
      b.addEventListener('click', function () { App.navigate(b.getAttribute('data-route')); });
    });
  }

  function sessionForClass(cls, iso) {
    var key = DB.sessionKey('class', cls.id, null, iso);
    return App.data.sessions.find(function (s) { return s.sessionKey === key; }) ||
      App.data.sessions.find(function (s) { return s.ownerType === 'class' && s.classId === cls.id && s.date === iso; }) || null;
  }

  function sessionsForSession(session) {
    return session ? App.data.attendance.filter(function (a) { return a.sessionId === session.id; }) : [];
  }

  function scheduledOn(cls, iso) {
    var wd = Jalali.weekdaySat0(iso);
    return (Array.isArray(cls.schedule) ? cls.schedule : []).filter(function (s) { return Number(s.day) === wd; });
  }

  function todayClassesList() {
    var iso = today();
    return App.data.classes.filter(function (c) { return !c.archived && scheduledOn(c, iso).length; })
      .sort(function (a, b) {
        function first(c) {
          var rows = scheduledOn(c, iso);
          return rows.length ? String(rows[0].time || '') : '';
        }
        return first(a).localeCompare(first(b));
      });
  }

  function modelLabel(model) {
    return t('model.' + (model === 'session' || model === 'month' ? model : 'term'));
  }

  Pages.home = function () {
    var iso = today();
    var activeStudents = App.data.students.filter(function (s) { return !s.archived; });
    var activeClasses = App.data.classes.filter(function (c) { return !c.archived; });
    var outstanding = 0;
    var debtors = [];
    activeStudents.forEach(function (s) {
      var summary = App.billing.byId[s.id];
      if (summary && summary.balance > 0) {
        outstanding += summary.balance;
        debtors.push({ student: s, summary: summary });
      }
    });
    debtors.sort(function (a, b) { return b.summary.balance - a.summary.balance; });
    var classesToday = todayClassesList();
    var noData = activeStudents.length === 0 && activeClasses.length === 0;
    var needsSetup = activeStudents.length === 0 || activeClasses.length === 0;

    var stats = '<div class="home-stats">' +
      '<button type="button" class="home-stat" data-go="students"><span class="home-stat-icon">' + UI.icon('users', 20) + '</span>' +
        '<strong>' + esc(Fmt.formatNumber(activeStudents.length, I18n.lang)) + '</strong><span>' + esc(t('home.statsStudents')) + '</span></button>' +
      '<button type="button" class="home-stat" data-go="classes"><span class="home-stat-icon">' + UI.icon('class', 20) + '</span>' +
        '<strong>' + esc(Fmt.formatNumber(activeClasses.length, I18n.lang)) + '</strong><span>' + esc(t('home.statsClasses')) + '</span></button>' +
      '<button type="button" class="home-stat' + (outstanding ? ' has-debt' : '') + '" data-go="money"><span class="home-stat-icon">' + UI.icon('wallet', 20) + '</span>' +
        '<strong>' + esc(Fmt.formatMoney(outstanding, I18n.lang)) + '</strong><span>' + esc(t('home.statsOutstanding')) + '</span></button>' +
    '</div>';

    var gettingStarted = needsSetup ? '<section class="card getting-started">' +
      '<div class="section-head"><h2 class="section-title">' + esc(t('home.getStarted')) + '</h2>' + UI.icon('star', 22) + '</div>' +
      '<p class="muted">' + esc(t('home.getStartedHint')) + '</p>' +
      '<ol class="steps">' +
        '<li><span class="step-num">۱</span><div><strong>' + esc(t('home.stepStudents')) + '</strong>' +
          (activeStudents.length ? '<span class="step-done">' + UI.icon('check', 15) + '</span>' : '<button type="button" class="btn primary btn-sm" data-add-student>' + esc(t('home.addFirstStudent')) + '</button>') + '</div></li>' +
        '<li><span class="step-num">۲</span><div><strong>' + esc(t('home.stepClasses')) + '</strong>' +
          (activeClasses.length ? '<span class="step-done">' + UI.icon('check', 15) + '</span>' : '<button type="button" class="btn primary btn-sm" data-add-class>' + esc(t('home.addFirstClass')) + '</button>') + '</div></li>' +
        '<li><span class="step-num">۳</span><div><strong>' + esc(t('home.stepAttendance')) + '</strong>' +
          '<button type="button" class="btn ghost btn-sm" data-take-attendance>' + esc(t('home.takeAttendance')) + '</button></div></li>' +
      '</ol>' +
    '</section>' : '';

    var quick = '<section class="card">' +
      '<div class="section-head"><h3>' + esc(t('home.quickActions')) + '</h3></div>' +
      '<div class="quick-actions">' +
        '<button type="button" class="quick-action" data-take-attendance><span>' + UI.icon('clipboard', 22) + '</span><strong>' + esc(t('home.takeAttendance')) + '</strong><small>' + esc(t('home.takeAttendanceHint')) + '</small></button>' +
        '<button type="button" class="quick-action" data-add-student><span>' + UI.icon('plus', 22) + '</span><strong>' + esc(t('students.add')) + '</strong><small>' + esc(t('home.stepStudents')) + '</small></button>' +
        '<button type="button" class="quick-action" data-go="money"><span>' + UI.icon('wallet', 22) + '</span><strong>' + esc(t('money.title')) + '</strong><small>' + esc(t('money.balanceHint')) + '</small></button>' +
      '</div>' +
    '</section>';

    var todayRows = classesToday.map(function (cls) {
      var session = sessionForClass(cls, iso);
      var att = sessionsForSession(session);
      var recorded = !!session && (session.canceled !== 'none' || att.length > 0);
      var canceled = session && session.canceled && session.canceled !== 'none';
      var times = scheduledOn(cls, iso).map(function (s) { return s.time ? Fmt.formatTime(s.time, I18n.lang) : ''; }).filter(Boolean).join('، ');
      var count = Billing.activeCountAt(App.data.enrollments, cls.id, iso);
      return '<button type="button" class="today-row" data-open-class="' + esc(cls.id) + '">' +
        '<span class="today-time">' + (times ? esc(times) : UI.icon('clock', 16)) + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(cls.name) + '</span>' +
          '<span class="row-sub">' + esc(t('classes.activeCount', { count: Fmt.formatNumber(count, I18n.lang) })) + ' · ' + esc(modelLabel(cls.priceModel)) + '</span></span>' +
        '<span class="row-end">' + (canceled ? UI.badge(session.canceled === 'counted' ? t('status.counted') : t('status.makeup'), 'amber') :
          recorded ? UI.badge(t('home.recorded'), 'success') : UI.badge(t('home.notRecorded'), 'neutral')) + UI.icon('chevron-left', 17, 'row-chevron') + '</span>' +
      '</button>';
    }).join('');

    var todayCard = '<section class="card">' +
      '<div class="section-head"><h3>' + esc(t('home.todayClasses')) + '</h3><span class="section-note">' + esc(Fmt.formatDate(iso, I18n.lang, 'weekday')) + '</span></div>' +
      (todayRows ? '<div class="today-list">' + todayRows + '</div>' :
        UI.emptyState('calendar', t('home.noClassesToday'), t('home.noClassesTodayHint'),
          '<button type="button" class="btn ghost btn-sm" data-add-class>' + UI.icon('plus', 16) + ' ' + esc(t('classes.add')) + '</button>')) +
    '</section>';

    var debtorRows = debtors.slice(0, 5).map(function (item) {
      return '<button type="button" class="debtor-row" data-debtor="' + esc(item.student.id) + '">' +
        UI.avatar(item.student.name) +
        '<span class="row-main"><span class="row-title">' + esc(item.student.name) + '</span>' +
          '<span class="row-sub">' + esc(item.student.phone ? Fmt.formatPhone(item.student.phone, I18n.lang) : t('students.noPhone')) + '</span></span>' +
        '<span class="row-end"><strong class="money-owes">' + esc(Fmt.formatMoney(item.summary.balance, I18n.lang)) + '</strong>' + UI.icon('chevron-left', 17, 'row-chevron') + '</span>' +
      '</button>';
    }).join('');

    var debtCard = '<section class="card">' +
      '<div class="section-head"><h3>' + esc(t('home.owesTitle')) + '</h3>' +
        '<button type="button" class="btn ghost btn-sm" data-go="money">' + esc(t('home.viewAll')) + '</button></div>' +
      (debtorRows ? '<div class="debtor-list">' + debtorRows + '</div>' :
        '<div class="paid-up">' + UI.icon('check', 22) + '<span><strong>' + esc(t('home.everyonePaid')) + '</strong><small>' + esc(t('home.noDebtors')) + '</small></span></div>') +
    '</section>';

    return {
      title: t('home.title'),
      nav: 'home',
      content: '<div class="page home-page">' +
        '<section class="home-hero">' +
          '<div><p class="eyebrow">' + esc(Fmt.formatDate(iso, I18n.lang, 'weekday')) + '</p>' +
            '<h2>' + esc(t('home.today')) + '</h2>' +
            '<p class="muted">' + esc(t('app.tagline')) + '</p></div>' +
          '<div class="home-hero-mark">' + UI.icon('book', 34) + '</div>' +
        '</section>' +
        stats +
        (noData ? gettingStarted : gettingStarted + quick) +
        todayCard +
        debtCard +
      '</div>',
      onMount: function (view) {
        view.querySelectorAll('[data-go]').forEach(function (b) {
          b.addEventListener('click', function () {
            var target = b.getAttribute('data-go');
            App.navigate(target === 'students' ? '#/students' : target === 'classes' ? '#/classes' : '#/money');
          });
        });
        view.querySelectorAll('[data-add-student]').forEach(function (b) {
          b.addEventListener('click', function () { App.navigate('#/students/new'); });
        });
        view.querySelectorAll('[data-add-class]').forEach(function (b) {
          b.addEventListener('click', function () { App.navigate('#/classes/new'); });
        });
        view.querySelectorAll('[data-take-attendance]').forEach(function (b) {
          b.addEventListener('click', function () {
            var first = classesToday[0];
            App.openAttendance({ mode: 'class', classId: first ? first.id : null, date: iso });
          });
        });
        view.querySelectorAll('[data-open-class]').forEach(function (b) {
          b.addEventListener('click', function () {
            App.openAttendance({ mode: 'class', classId: b.getAttribute('data-open-class'), date: iso });
          });
        });
        view.querySelectorAll('[data-debtor]').forEach(function (b) {
          b.addEventListener('click', function () {
            App.navigate('#/students/' + encodeURIComponent(b.getAttribute('data-debtor')) + '?tab=money');
          });
        });
      }
    };
  };

  Pages.more = function () {
    var classCount = App.data.classes.filter(function (c) { return !c.archived; }).length;
    var noteCount = App.data.notes.length;
    return {
      title: t('nav.more'),
      nav: 'more',
      content: '<div class="page">' +
        '<div class="page-head"><div><h2 class="page-title">' + esc(t('nav.more')) + '</h2>' +
          '<p class="page-sub">' + esc(t('settings.subtitle')) + '</p></div></div>' +
        '<section class="menu-section">' +
          '<h3 class="menu-heading">' + esc(t('settings.admin')) + '</h3>' +
          '<div class="menu-list">' +
            '<button type="button" class="menu-row" data-go="classes"><span class="menu-icon">' + UI.icon('class', 21) + '</span>' +
              '<span class="row-main"><span class="row-title">' + esc(t('classes.title')) + '</span><span class="row-sub">' + esc(t('classes.classCount', { count: Fmt.formatNumber(classCount, I18n.lang) })) + '</span></span>' +
              UI.icon('chevron-left', 18, 'row-chevron') + '</button>' +
            '<button type="button" class="menu-row" data-go="notes"><span class="menu-icon">' + UI.icon('notes', 21) + '</span>' +
              '<span class="row-main"><span class="row-title">' + esc(t('notes.title')) + '</span><span class="row-sub">' + esc(t('notes.entries', { count: Fmt.formatNumber(noteCount, I18n.lang) })) + '</span></span>' +
              UI.icon('chevron-left', 18, 'row-chevron') + '</button>' +
            '<button type="button" class="menu-row" data-go="settings"><span class="menu-icon">' + UI.icon('settings', 21) + '</span>' +
              '<span class="row-main"><span class="row-title">' + esc(t('settings.title')) + '</span><span class="row-sub">' + esc(t('settings.subtitle')) + '</span></span>' +
              UI.icon('chevron-left', 18, 'row-chevron') + '</button>' +
          '</div>' +
        '</section>' +
        '<section class="menu-section">' +
          '<h3 class="menu-heading">' + esc(t('settings.helpSection')) + '</h3>' +
          '<div class="menu-list">' +
            '<button type="button" class="menu-row" data-install><span class="menu-icon">' + UI.icon('install', 21) + '</span>' +
              '<span class="row-main"><span class="row-title">' + esc(t('settings.installTitle')) + '</span><span class="row-sub">' + esc(t('settings.installHint')) + '</span></span>' +
              UI.icon('chevron-left', 18, 'row-chevron') + '</button>' +
            '<button type="button" class="menu-row" data-lock-now><span class="menu-icon">' + UI.icon('lock', 21) + '</span>' +
              '<span class="row-main"><span class="row-title">' + esc(t('settings.lockNow')) + '</span><span class="row-sub">' + esc(t('settings.pinSameSession')) + '</span></span>' +
              UI.icon('chevron-left', 18, 'row-chevron') + '</button>' +
          '</div>' +
        '</section>' +
        '<section class="card about-card">' +
          '<div class="brand-line">' + UI.icon('book', 22) + '<strong>' + esc(t('app.name')) + '</strong><span class="badge badge-neutral">v' + esc(APP_VERSION) + '</span></div>' +
          '<p class="muted">' + esc(t('settings.madeForTeacher')) + '</p>' +
          '<p class="hint">' + esc(t('settings.noServer')) + '</p>' +
        '</section>' +
      '</div>',
      onMount: function (view) {
        view.querySelectorAll('[data-go]').forEach(function (b) {
          b.addEventListener('click', function () {
            var target = b.getAttribute('data-go');
            App.navigate(target === 'classes' ? '#/classes' : target === 'notes' ? '#/notes' : '#/settings');
          });
        });
        var install = view.querySelector('[data-install]');
        if (install) install.addEventListener('click', function () { App.install(); });
        var lock = view.querySelector('[data-lock-now]');
        if (lock) lock.addEventListener('click', async function () {
          var ok = await UI.confirm({ title: t('settings.lockNow'), message: t('gate.lockConfirm'), confirmLabel: t('gate.lock') });
          if (ok) App.lock();
        });
      }
    };
  };

  Pages.settings = function () {
    var settings = App.settings || {};
    var lastBackup = settings.lastBackupAt ? dateFromTimestamp(settings.lastBackupAt) : t('settings.never');
    var lang = I18n.lang;
    var theme = settings.theme || 'auto';
    var sync = window.Sync ? Sync.status() : null;
    var cloudConfigured = !!(sync && sync.configured);
    var cloudConnected = !!(sync && sync.meta && sync.meta.connected);
    var cloudAuthenticated = !!(sync && sync.authenticated);
    var cloudEmail = (sync && (sync.meta.email || sync.email)) || '';
    var cloudLastSync = sync && sync.meta.lastSyncedAt ? dateFromTimestamp(sync.meta.lastSyncedAt) : t('cloud.never');
    var cloudFolder = sync && sync.meta.folderId ? 'https://drive.google.com/drive/folders/' + encodeURIComponent(sync.meta.folderId) : '';
    var cloudMissing = (sync && sync.missing) || [];
    var pendingProofs = window.Sync && Sync.pendingProofs ? Sync.pendingProofs().length : 0;
    var cloudPortals = sync && sync.meta && sync.meta.portals ? Object.keys(sync.meta.portals).filter(function (id) {
      var entry = sync.meta.portals[id];
      return !!(entry && entry.sharedEmail);
    }).length : 0;
    var cloudError = (sync && (sync.lastError || (sync.meta && sync.meta.lastError))) || '';
    return {
      title: t('settings.title'),
      back: '#/more',
      nav: 'more',
      content: '<div class="page settings-page">' +
        '<div class="page-head"><div><h2 class="page-title">' + esc(t('settings.title')) + '</h2>' +
          '<p class="page-sub">' + esc(t('settings.subtitle')) + '</p></div></div>' +

        '<section class="card settings-section">' +
          '<div class="section-head"><h3>' + UI.icon('sun', 19) + ' ' + esc(t('settings.appearance')) + '</h3></div>' +
          '<div class="field"><span>' + esc(t('settings.language')) + '</span>' +
            '<div class="segmented">' +
              '<button type="button" class="segment' + (lang === 'fa' ? ' is-active' : '') + '" data-set-lang="fa">فارسی</button>' +
              '<button type="button" class="segment' + (lang === 'en' ? ' is-active' : '') + '" data-set-lang="en">English</button>' +
            '</div></div>' +
          '<div class="field"><span>' + esc(t('settings.theme')) + '</span>' +
            '<div class="segmented three">' +
              '<button type="button" class="segment' + (theme === 'auto' ? ' is-active' : '') + '" data-set-theme="auto">' + esc(t('settings.themeAuto')) + '</button>' +
              '<button type="button" class="segment' + (theme === 'light' ? ' is-active' : '') + '" data-set-theme="light">' + esc(t('settings.themeLight')) + '</button>' +
              '<button type="button" class="segment' + (theme === 'dark' ? ' is-active' : '') + '" data-set-theme="dark">' + esc(t('settings.themeDark')) + '</button>' +
            '</div></div>' +
          '<p class="hint">' + esc(t('settings.languageHint')) + '</p>' +
        '</section>' +

        '<section class="card settings-section cloud-section">' +
          '<div class="section-head"><h3>' + UI.icon('cloud', 19) + ' ' + esc(t('cloud.title')) + '</h3>' +
            (cloudConnected ? UI.badge(t('cloud.connectedBadge'), 'success') : UI.badge(t('cloud.disconnected'), 'neutral')) + '</div>' +
          '<p class="hint">' + esc(t('cloud.subtitle')) + '</p>' +
          (!cloudConfigured
            ? '<p class="hint hint-warn">' + esc(t('cloud.notConfigured')) + '</p>' +
              (cloudMissing.length ? '<p class="hint">' + esc(t('cloud.configMissing', { fields: cloudMissing.join(', ') })) + '</p>' : '') +
              '<p class="hint">' + esc(t('cloud.setupHint')) + '</p>'
            : '<div class="cloud-status">' +
                '<span class="cloud-dot' + (cloudConnected && cloudAuthenticated ? ' is-online' : '') + '"></span>' +
                '<strong>' + esc(cloudConnected ? (cloudEmail ? t('cloud.connectedAs', { email: cloudEmail }) : t('cloud.connectedNeedsAuth')) : t('cloud.ready')) + '</strong>' +
              '</div>' +
              '<p class="hint">' + esc(t('cloud.lastSync', { date: cloudLastSync })) + '</p>' +
              (cloudConnected && cloudPortals ? '<p class="hint">' + esc(t('cloud.portalCount', { count: Fmt.formatNumber(cloudPortals, I18n.lang) })) + '</p>' : '') +
              (cloudConnected ? '<p class="hint">' + esc(t('cloud.shareHint')) + '</p>' : '') +
              (pendingProofs ? '<p class="hint hint-warn">' + esc(t('cloud.proofsPending', { count: Fmt.formatNumber(pendingProofs, I18n.lang) })) + '</p>' : '')) +
          (cloudError ? '<p class="hint hint-warn">' + esc(t('cloud.error')) + ': ' + esc(cloudError) + '</p>' : '') +
          '<label class="switch-row"><input type="checkbox" data-cloud-auto' + (sync && sync.meta && sync.meta.autoSync ? ' checked' : '') + (cloudConnected ? '' : ' disabled') + '><span>' + esc(t('cloud.autoSync')) + '</span></label>' +
          '<p class="hint">' + esc(t('cloud.autoSyncHint')) + '</p>' +
          '<div class="settings-actions">' +
            '<button type="button" class="btn primary" data-cloud-connect' + (cloudConfigured ? '' : ' disabled') + '>' + UI.icon('cloud', 17) + ' ' + esc(cloudConnected ? t('cloud.reconnect') : t('cloud.connect')) + '</button>' +
            '<button type="button" class="btn ghost" data-cloud-sync' + (cloudConnected ? '' : ' disabled') + '>' + UI.icon('refresh', 17) + ' ' + esc(t('cloud.syncNow')) + '</button>' +
            '<button type="button" class="btn ghost" data-cloud-publish' + (cloudConnected ? '' : ' disabled') + '>' + UI.icon('upload', 17) + ' ' + esc(t('cloud.publish')) + '</button>' +
            (cloudConnected ? '<button type="button" class="btn ghost danger-text" data-cloud-disconnect>' + UI.icon('x', 17) + ' ' + esc(t('cloud.disconnect')) + '</button>' : '') +
            (cloudFolder ? '<a class="btn ghost" href="' + esc(cloudFolder) + '" target="_blank" rel="noopener">' + UI.icon('drive', 17) + ' ' + esc(t('cloud.openDrive')) + '</a>' : '') +
          '</div>' +
          '<p class="hint">' + esc(t('cloud.driveScopeHint')) + '</p>' +
        '</section>' +

        '<section class="card settings-section">' +
          '<div class="section-head"><h3>' + UI.icon('class', 19) + ' ' + esc(t('settings.admin')) + '</h3></div>' +
          '<p class="hint">' + esc(t('settings.adminOnly')) + '</p>' +
          '<div class="settings-actions">' +
            '<button type="button" class="btn ghost" data-go-classes>' + UI.icon('class', 17) + ' ' + esc(t('settings.manageClasses')) + '</button>' +
            '<button type="button" class="btn ghost" data-go-notes>' + UI.icon('notes', 17) + ' ' + esc(t('settings.manageNotes')) + '</button>' +
          '</div>' +
        '</section>' +

        '<section class="card settings-section">' +
          '<div class="section-head"><h3>' + UI.icon('lock', 19) + ' ' + esc(t('settings.securitySection')) + '</h3></div>' +
          '<div class="settings-actions">' +
            '<button type="button" class="btn ghost" data-change-pin>' + UI.icon('lock', 17) + ' ' + esc(t('settings.changePin')) + '</button>' +
            '<button type="button" class="btn ghost" data-lock-now>' + UI.icon('lock', 17) + ' ' + esc(t('settings.lockNow')) + '</button>' +
          '</div>' +
          '<p class="hint">' + esc(t('settings.pinSameSession')) + '</p>' +
          '<p class="hint hint-warn">' + esc(t('settings.pinWarning')) + '</p>' +
        '</section>' +

        '<section class="card settings-section">' +
          '<div class="section-head"><h3>' + UI.icon('download', 19) + ' ' + esc(t('settings.backupSection')) + '</h3></div>' +
          '<p class="hint">' + esc(t('settings.backupHint')) + '</p>' +
          '<div class="backup-meta"><span>' + esc(t('settings.lastBackup')) + '</span><strong>' + esc(lastBackup) + '</strong></div>' +
          '<div class="settings-actions">' +
            '<button type="button" class="btn primary" data-export-backup>' + UI.icon('download', 17) + ' ' + esc(t('settings.exportBackup')) + '</button>' +
            '<button type="button" class="btn ghost" data-import-backup>' + UI.icon('upload', 17) + ' ' + esc(t('settings.importBackup')) + '</button>' +
          '</div>' +
          '<input type="file" accept="application/json,.json" data-import-file hidden>' +
          '<p class="hint">' + esc(t('settings.exportBackupHint')) + '</p>' +
          '<p class="hint">' + esc(t('settings.importHint')) + '</p>' +
          '<div class="divider"></div>' +
          '<div class="section-head"><h3>' + esc(t('settings.exportCsv')) + '</h3></div>' +
          '<div class="settings-actions">' +
            '<button type="button" class="btn ghost" data-csv-attendance>' + UI.icon('download', 17) + ' ' + esc(t('settings.attendanceCsv')) + '</button>' +
            '<button type="button" class="btn ghost" data-csv-payments>' + UI.icon('download', 17) + ' ' + esc(t('settings.paymentsCsv')) + '</button>' +
          '</div>' +
          '<p class="hint">' + esc(t('settings.csvHint')) + '</p>' +
        '</section>' +

        '<section class="card settings-section">' +
          '<div class="section-head"><h3>' + UI.icon('install', 19) + ' ' + esc(t('settings.installTitle')) + '</h3></div>' +
          '<p class="hint">' + esc(t('settings.installHint')) + '</p>' +
          '<div class="settings-actions">' +
            '<button type="button" class="btn ghost" data-install>' + UI.icon('install', 17) + ' ' + esc(t('settings.installButton')) + '</button>' +
            '<button type="button" class="btn ghost" data-persist>' + UI.icon('check', 17) + ' ' + esc(t('settings.storagePersist')) + '</button>' +
          '</div>' +
          '<p class="hint">' + esc(t('settings.storagePersistHint')) + '</p>' +
          '<p class="hint hint-success">' + esc(t('settings.offlineReady')) + '</p>' +
        '</section>' +

        '<section class="card settings-section">' +
          '<div class="section-head"><h3>' + UI.icon('info', 19) + ' ' + esc(t('settings.dataSection')) + '</h3></div>' +
          '<div class="backup-meta"><span>' + esc(t('settings.dataSize')) + '</span><strong data-data-size>—</strong></div>' +
          '<p class="hint">' + esc(t('settings.storageNote')) + '</p>' +
          '<p class="hint">' + esc(t('settings.dataLocal')) + '</p>' +
          '<p class="hint">' + esc(t('settings.version')) + ': ' + esc(APP_VERSION) + '</p>' +
        '</section>' +

        '<section class="card settings-section danger-zone">' +
          '<div class="section-head"><h3>' + UI.icon('alert', 19) + ' ' + esc(t('settings.danger')) + '</h3></div>' +
          '<p class="hint">' + esc(t('settings.deleteAllHint')) + '</p>' +
          '<button type="button" class="btn danger" data-delete-all>' + UI.icon('trash', 17) + ' ' + esc(t('settings.deleteAll')) + '</button>' +
        '</section>' +

        '<section class="card settings-section about-card">' +
          '<div class="brand-line">' + UI.icon('book', 22) + '<strong>' + esc(t('app.name')) + '</strong><span class="badge badge-neutral">v' + esc(APP_VERSION) + '</span></div>' +
          '<p class="muted">' + esc(t('settings.madeForTeacher')) + '</p>' +
          '<p class="hint">' + esc(t('settings.noServer')) + '</p>' +
          '<p class="hint">' + esc(t('settings.helpHint')) + '</p>' +
          '<p class="hint">Vazirmatn (OFL) · jalaali-js (MIT)</p>' +
        '</section>' +
      '</div>',
      onMount: function (view) {
        view.querySelectorAll('[data-set-lang]').forEach(function (b) {
          b.addEventListener('click', async function () {
            var next = b.getAttribute('data-set-lang');
            if (next === I18n.lang) return;
            I18n.setLanguage(next);
            await App.saveSettings({ language: next });
            UI.toast(t('settings.languageChanged'), 'success');
            App.rerender();
          });
        });
        view.querySelectorAll('[data-set-theme]').forEach(function (b) {
          b.addEventListener('click', async function () {
            var next = b.getAttribute('data-set-theme');
            await App.saveSettings({ theme: next });
            UI.applyTheme(next);
            UI.toast(t('settings.themeChanged'), 'success');
            App.rerender();
          });
        });
        view.querySelectorAll('[data-cloud-connect]').forEach(function (b) {
          b.addEventListener('click', function () { connectDrive(); });
        });
        view.querySelectorAll('[data-cloud-sync]').forEach(function (b) {
          b.addEventListener('click', function () { syncDrive(); });
        });
        view.querySelectorAll('[data-cloud-publish]').forEach(function (b) {
          b.addEventListener('click', function () { publishDrive(); });
        });
        view.querySelectorAll('[data-cloud-disconnect]').forEach(function (b) {
          b.addEventListener('click', function () { disconnectDrive(); });
        });
        var cloudAuto = view.querySelector('[data-cloud-auto]');
        if (cloudAuto) cloudAuto.addEventListener('change', async function () {
          try {
            await Sync.setAutoSync(cloudAuto.checked);
            UI.toast(cloudAuto.checked ? t('cloud.autoSyncOnToast') : t('cloud.autoSyncOffToast'), 'success');
          } catch (err) {
            console.error(err);
            cloudAuto.checked = !cloudAuto.checked;
            UI.toast(t('cloud.error'), 'error');
          }
        });
        view.querySelectorAll('[data-go-classes]').forEach(function (b) {
          b.addEventListener('click', function () { App.navigate('#/classes'); });
        });
        view.querySelectorAll('[data-go-notes]').forEach(function (b) {
          b.addEventListener('click', function () { App.navigate('#/notes'); });
        });
        view.querySelectorAll('[data-change-pin]').forEach(function (b) {
          b.addEventListener('click', function () { openChangePinDialog(); });
        });
        view.querySelectorAll('[data-lock-now]').forEach(function (b) {
          b.addEventListener('click', async function () {
            var ok = await UI.confirm({ title: t('settings.lockNow'), message: t('gate.lockConfirm'), confirmLabel: t('gate.lock') });
            if (ok) App.lock();
          });
        });
        view.querySelectorAll('[data-export-backup]').forEach(function (b) {
          b.addEventListener('click', function () { exportBackup(); });
        });
        var importBtn = view.querySelector('[data-import-backup]');
        var importFile = view.querySelector('[data-import-file]');
        if (importBtn && importFile) {
          importBtn.addEventListener('click', function () { importFile.click(); });
          importFile.addEventListener('change', function () {
            if (importFile.files && importFile.files[0]) {
              handleImportFile(importFile.files[0]).finally(function () { importFile.value = ''; });
            }
          });
        }
        view.querySelectorAll('[data-csv-attendance]').forEach(function (b) {
          b.addEventListener('click', function () { exportAttendanceCsv(); });
        });
        view.querySelectorAll('[data-csv-payments]').forEach(function (b) {
          b.addEventListener('click', function () { exportPaymentsCsv(); });
        });
        view.querySelectorAll('[data-install]').forEach(function (b) {
          b.addEventListener('click', function () { App.install(); });
        });
        var persist = view.querySelector('[data-persist]');
        if (persist) persist.addEventListener('click', async function () {
          var granted = await DB.requestPersistence();
          UI.toast(granted ? t('settings.persistenceGranted') : t('settings.persistenceDenied'), granted ? 'success' : 'info', 4200);
        });
        view.querySelectorAll('[data-delete-all]').forEach(function (b) {
          b.addEventListener('click', function () { deleteAllData(); });
        });
        updateDataSize(view);
      }
    };
  };

  Pages.notFound = function () {
    return {
      title: t('common.notFound'),
      back: '#/home',
      nav: 'home',
      content: '<div class="page">' + UI.emptyState('alert', t('common.notFound'), t('error.notFound'),
        '<button type="button" class="btn primary" data-go-home>' + esc(t('nav.home')) + '</button>') + '</div>',
      onMount: function (view) {
        var b = view.querySelector('[data-go-home]');
        if (b) b.addEventListener('click', function () { App.navigate('#/home'); });
      }
    };
  };

  function dateFromTimestamp(timestamp) {
    var iso = String(timestamp || '').slice(0, 10);
    return Jalali.isValidISO(iso) ? Fmt.formatDate(iso, I18n.lang) : t('settings.never');
  }

  function cloudErrorKey(err) {
    if (!err) return 'cloud.error';
    if (err.code === 'NOT_CONFIGURED') return 'cloud.notConfigured';
    if (err.code === 'AUTH_REQUIRED' || err.code === 'AUTH_FAILED') return 'cloud.authRequired';
    if (err.code === 'NO_EMAIL') return 'cloud.noEmail';
    if (err.code === 'SYNC_CONFLICT') return 'cloud.conflict';
    return 'cloud.error';
  }

  function showCloudError(err) {
    console.error(err);
    var key = cloudErrorKey(err);
    var message = t(key);
    if (key === 'cloud.error' && err && err.message) message += '\n' + err.message;
    UI.alert({ title: t('cloud.error'), message: message });
  }

  async function connectDrive() {
    if (!window.Sync) return;
    try {
      var result = await Sync.connect();
      if (result && result.needsChoice) {
        var choice = await UI.dialog({
          title: t('cloud.remoteFound'),
          message: '',
          body: '<p class="hint">' + esc(t('cloud.remoteHint')) + '</p><p class="hint">' + esc(t('cloud.localHint')) + '</p>',
          actions: [
            { label: t('cloud.useRemote'), value: 'remote', variant: 'primary' },
            { label: t('cloud.useLocal'), value: 'local', variant: 'ghost' }
          ]
        });
        if (!choice) return;
        await Sync.connect({ strategy: choice });
        UI.toast(choice === 'remote' ? t('cloud.pullSuccess') : t('cloud.pushSuccess'), 'success');
      } else {
        UI.toast(t('cloud.connected'), 'success');
      }
      await App.reloadData();
      App.rerender();
    } catch (err) {
      showCloudError(err);
    }
  }

  async function syncDrive() {
    if (!window.Sync) return;
    try {
      var result = await Sync.syncNow({ interactive: true });
      if (result && result.mode === 'inbox' && result.count) {
        UI.toast(t('cloud.inboxRead', { count: Fmt.formatNumber(result.count, I18n.lang) }), 'success');
      } else {
        UI.toast(t('cloud.syncSuccess'), 'success');
      }
      await App.reloadData();
      App.rerender();
    } catch (err) {
      if (err && err.code === 'SYNC_CONFLICT') {
        var choice = await UI.dialog({
          title: t('cloud.conflict'),
          body: '<p class="hint">' + esc(t('cloud.conflictHint')) + '</p>',
          actions: [
            { label: t('cloud.forcePull'), value: 'pull', variant: 'primary' },
            { label: t('cloud.pushAnyway'), value: 'push', variant: 'danger' }
          ]
        });
        if (!choice) return;
        try {
          if (choice === 'pull') await Sync.pull();
          else {
            await Sync.push(true);
            await Sync.publishPortals();
          }
          await App.reloadData();
          UI.toast(choice === 'pull' ? t('cloud.pullSuccess') : t('cloud.pushSuccess'), 'success');
          App.rerender();
        } catch (err2) {
          showCloudError(err2);
        }
        return;
      }
      showCloudError(err);
    }
  }

  async function publishDrive() {
    if (!window.Sync) return;
    try {
      var result = await Sync.publishPortals({ interactive: true });
      await App.reloadData();
      UI.toast(t('cloud.publishSuccess') + (result && result.published ? ' · ' + Fmt.formatNumber(result.published, I18n.lang) : ''), 'success');
      App.rerender();
    } catch (err) {
      showCloudError(err);
    }
  }

  async function disconnectDrive() {
    if (!window.Sync) return;
    var ok = await UI.confirm({
      title: t('cloud.disconnect'),
      message: t('cloud.disconnectConfirm'),
      confirmLabel: t('cloud.disconnect'),
      danger: true
    });
    if (!ok) return;
    try {
      await Sync.disconnect();
      UI.toast(t('cloud.disconnectedToast'), 'success');
      App.rerender();
    } catch (err) {
      showCloudError(err);
    }
  }

  function openChangePinDialog() {
    return UI.formDialog({
      title: t('settings.changePin'),
      submitLabel: t('settings.changePin'),
      body:
        '<label class="field"><span>' + esc(t('settings.currentPin')) + '</span>' +
          '<input class="input pin-input" name="currentPin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" required></label>' +
        '<label class="field"><span>' + esc(t('settings.newPin')) + '</span>' +
          '<input class="input pin-input" name="newPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" required></label>' +
        '<label class="field"><span>' + esc(t('settings.confirmPin')) + '</span>' +
          '<input class="input pin-input" name="confirmPin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" required></label>' +
        '<p class="hint hint-warn">' + esc(t('settings.pinWarning')) + '</p>',
      onSubmit: async function (fd) {
        if (!Pin.isSupported()) throw userError(t('gate.cryptoUnavailable'));
        var current = String(fd.get('currentPin') || '');
        var next = String(fd.get('newPin') || '');
        var confirm = String(fd.get('confirmPin') || '');
        if (!Pin.isValid(next)) throw userError(t('validation.pinLength'));
        if (Pin.normalize(next) !== Pin.normalize(confirm)) throw userError(t('validation.pinMismatch'));
        var ok = await Pin.verify(current, App.settings);
        if (!ok) throw userError(t('gate.wrongPin'));
        var record = await Pin.create(next);
        App.settings = await DB.updateSettings(record);
        UI.toast(t('settings.pinChanged'), 'success');
        return true;
      }
    });
  }

  async function exportBackup() {
    try {
      var payload = await DB.exportAll();
      var filename = 'my-class-backup-' + Jalali.todayISO() + '.json';
      if (!UI.download(filename, JSON.stringify(payload, null, 2), 'application/json')) return;
      App.settings = await DB.updateSettings({ lastBackupAt: DB.now() });
      UI.toast(t('settings.exportSuccess'), 'success');
      App.rerender();
    } catch (err) {
      console.error(err);
      UI.toast(t('error.download'), 'error');
    }
  }

  function readFileText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('read')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  async function handleImportFile(file) {
    var text;
    try {
      text = await readFileText(file);
    } catch (err) {
      UI.alert({ title: t('settings.importBackup'), message: t('error.fileRead') });
      return;
    }
    var payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      UI.alert({ title: t('settings.importBackup'), message: t('settings.importInvalid') });
      return;
    }
    var check = DB.validateBackup(payload);
    if (!check.ok) {
      UI.alert({
        title: t('settings.importBackup'),
        message: check.error === 'version' ? t('settings.importVersion') : t('settings.importInvalid')
      });
      return;
    }
    var ok = await UI.confirm({
      title: t('settings.importConfirm'),
      message: t('settings.importConfirmText'),
      confirmLabel: t('settings.importBackup'),
      danger: true
    });
    if (!ok) return;
    try {
      var result = await DB.importReplace(payload);
      App.settings = result.settings;
      I18n.setLanguage(App.settings.language === 'en' ? 'en' : 'fa');
      UI.applyTheme(App.settings.theme || 'auto');
      await App.reloadData();
      UI.toast(t('settings.importSuccess'), 'success');
      App.navigate('#/home');
    } catch (err) {
      console.error(err);
      UI.alert({ title: t('settings.importBackup'), message: t('settings.importInvalid') });
    }
  }

  function csvJalali(iso) {
    var j = Jalali.gToJ(iso);
    if (!j) return iso || '';
    return j.jy + '/' + pad2(j.jm) + '/' + pad2(j.jd);
  }

  function csvCell(value) {
    var s = String(value == null ? '' : value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (/^[=+\-@\t]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function downloadCsv(filename, rows) {
    var content = '\uFEFF' + rows.map(function (row) {
      return row.map(csvCell).join(',');
    }).join('\r\n') + '\r\n';
    if (!UI.download(filename, content, 'text/csv;charset=utf-8')) return;
    UI.toast(t('settings.exportSuccess'), 'success');
  }

  function exportAttendanceCsv() {
    var studentsById = {};
    App.data.students.forEach(function (s) { studentsById[s.id] = s; });
    var classesById = {};
    App.data.classes.forEach(function (c) { classesById[c.id] = c; });
    var rows = [];
    var sessions = App.data.sessions.slice().sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    sessions.forEach(function (session) {
      var canceled = session.canceled && session.canceled !== 'none';
      var attendance = App.data.attendance.filter(function (a) { return a.sessionId === session.id; });
      var classRec = session.ownerType === 'class' ? classesById[session.classId] : null;
      var privateStudent = session.ownerType === 'private' ? studentsById[session.studentId] : null;
      var planName = session.ownerType === 'class' ? (classRec ? classRec.name : '') : t('money.privatePlan');
      var kind = session.ownerType === 'class' ? t('csv.typeClass') : t('csv.typePrivate');
      var countsTerm = false;
      if (session.ownerType === 'class' && classRec) countsTerm = classRec.priceModel === 'term';
      if (session.ownerType === 'private' && privateStudent && privateStudent.privatePlan) countsTerm = privateStudent.privatePlan.model === 'term';

      if (canceled) {
        var targets = [];
        if (session.ownerType === 'class') {
          Billing.activeEnrollmentsAt(App.data.enrollments, session.classId, session.date).forEach(function (e) {
            var s = studentsById[e.studentId];
            if (s) targets.push(s);
          });
        } else if (privateStudent) {
          targets.push(privateStudent);
        }
        targets.forEach(function (student) {
          rows.push([
            csvJalali(session.date),
            session.date,
            student.name,
            Fmt.toEnDigits(student.phone || ''),
            planName,
            kind,
            t('status.canceled') + ' — ' + (session.canceled === 'counted' ? t('status.counted') : t('status.makeup')),
            session.canceled === 'counted' ? t('csv.yes') : t('csv.no'),
            session.cancelReason || ''
          ]);
        });
        return;
      }

      attendance.forEach(function (a) {
        var student = studentsById[a.studentId];
        if (!student) return;
        rows.push([
          csvJalali(session.date),
          session.date,
          student.name,
          Fmt.toEnDigits(student.phone || ''),
          planName,
          kind,
          t('status.' + a.status),
          countsTerm ? t('csv.yes') : t('csv.no'),
          ''
        ]);
      });
    });
    rows.sort(function (a, b) { return a[1].localeCompare(b[1]) || String(a[2]).localeCompare(String(b[2]), 'fa'); });
    var header = [
      t('csv.dateJalali'), t('csv.dateISO'), t('csv.student'), t('csv.phone'),
      t('csv.plan'), t('csv.kind'), t('csv.status'), t('csv.counted'), t('csv.note')
    ];
    downloadCsv('attendance-' + Jalali.todayISO() + '.csv', [header].concat(rows));
  }

  function exportPaymentsCsv() {
    var studentsById = {};
    App.data.students.forEach(function (s) { studentsById[s.id] = s; });
    var rows = App.data.payments.slice().sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    }).map(function (p) {
      var student = studentsById[p.studentId];
      return [
        csvJalali(p.date),
        p.date,
        student ? student.name : '',
        student ? Fmt.toEnDigits(student.phone || '') : '',
        String(p.amount),
        p.note || ''
      ];
    });
    var header = [t('csv.dateJalali'), t('csv.dateISO'), t('csv.student'), t('csv.phone'), t('csv.amount'), t('csv.note')];
    downloadCsv('payments-' + Jalali.todayISO() + '.csv', [header].concat(rows));
  }

  async function deleteAllData() {
    var ok = await UI.confirm({
      title: t('settings.deleteStep1'),
      message: t('settings.deleteStep1Text'),
      confirmLabel: t('settings.deleteAll'),
      danger: true
    });
    if (!ok) return;
    var confirmed = await UI.promptWord({
      title: t('settings.deleteStep2'),
      message: t('settings.deleteStep2Text'),
      label: t('settings.typeDelete'),
      expected: t('settings.deleteWord'),
      confirmLabel: t('settings.deleteForever')
    });
    if (!confirmed) return;
    if (window.Sync && Sync.reset) Sync.reset();
    try {
      await DB.clearAllData();
    } catch (err) {
      console.error(err);
      UI.toast(t('error.generic'), 'error');
      return;
    }
    try { localStorage.removeItem(LOCK_KEY); } catch (_) {}
    App.settings = null;
    App.data = null;
    App.billing = null;
    App.unlocked = false;
    closeDialogs();
    I18n.setLanguage('fa');
    UI.applyTheme('auto');
    showSetup('fa');
  }

  async function updateDataSize(view) {
    var el = view.querySelector('[data-data-size]');
    if (!el) return;
    try {
      if (!navigator.storage || !navigator.storage.estimate) {
        el.textContent = '—';
        return;
      }
      var estimate = await navigator.storage.estimate();
      var mb = (estimate.usage || 0) / (1024 * 1024);
      el.textContent = Fmt.formatNumber(Math.round(mb * 100) / 100, I18n.lang) + ' MB';
    } catch (_) {
      el.textContent = '—';
    }
  }

  function userError(message) {
    var e = new Error(message);
    e.userMessage = message;
    return e;
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      App.swRegistration = reg;
    }).catch(function (err) {
      console.warn('Service worker registration failed', err);
    });
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'sw-updated' && !App.swUpdateShown) {
        App.swUpdateShown = true;
        if (App.unlocked) UI.toast(t('toast.updateReady'), 'info', 6000);
      }
    });
  }

  function updateNetBanner() {
    var banner = document.getElementById('netBanner');
    if (!banner) return;
    var online = navigator.onLine;
    if (!online) {
      banner.hidden = false;
      banner.textContent = t('toast.offline');
      banner.classList.add('show');
    } else {
      banner.classList.remove('show');
      banner.hidden = true;
    }
  }

  function bindGlobalEvents() {
    if (App.eventsBound) return;
    App.eventsBound = true;
    window.addEventListener('hashchange', function () {
      if (App.unlocked) App.render();
    });
    window.addEventListener('online', function () {
      updateNetBanner();
      if (App.wasOffline) UI.toast(t('toast.online'), 'success');
      App.wasOffline = false;
    });
    window.addEventListener('offline', function () {
      App.wasOffline = true;
      updateNetBanner();
      UI.toast(t('toast.offline'), 'info');
    });
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      App.deferredInstallPrompt = e;
      if (!App.installPromptShown) {
        App.installPromptShown = true;
        if (App.unlocked) UI.toast(t('toast.installReady'), 'info', 4200);
      }
    });
    window.addEventListener('appinstalled', function () {
      App.deferredInstallPrompt = null;
      UI.toast(t('toast.installReady'), 'success');
    });
    App.wasOffline = !navigator.onLine;
  }

  boot();
})();
