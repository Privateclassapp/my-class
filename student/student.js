(function () {
  'use strict';

  var LS = {
    lang: 'my-class-student-lang',
    theme: 'my-class-student-theme',
    files: 'my-class-student-files-v1',
    portal: 'my-class-student-portal-v1',
    inbox: 'my-class-student-inbox-v1',
    queue: 'my-class-student-queue-v1',
    lastSync: 'my-class-student-last-sync-v1'
  };

  var ICONS = {
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M4 20.5V5.5M8 7h8M8 11h6"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
    moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    wallet: '<path d="M4 7h16v12H4z"/><path d="M4 7V5h13v2M16 12h4v3h-4z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
    notes: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    cloud: '<path d="M17.5 19H7a5 5 0 0 1-.8-9.9A7 7 0 0 1 19.6 11 4 4 0 0 1 17.5 19Z"/>',
    alert: '<path d="M12 3 2 21h20Z"/><path d="M12 9v5M12 18h.01"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>'
  };

  var state = {
    portal: null,
    inbox: null,
    files: null,
    queue: [],
    email: '',
    signedIn: false,
    busy: false,
    offline: !navigator.onLine,
    tab: 'home',
    error: '',
    lastSync: ''
  };

  var app = document.getElementById('studentApp');
  var toastRoot = document.getElementById('toastRoot');

  function t(key, vars) {
    return I18n.t(key, vars);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, size) {
    var path = ICONS[name] || ICONS.alert;
    return '<svg class="sp-icon" viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" aria-hidden="true">' + path + '</svg>';
  }

  function money(value) {
    return Fmt.formatMoney(value, I18n.lang);
  }

  function num(value) {
    return Fmt.formatNumber(value, I18n.lang);
  }

  function date(value) {
    if (!value) return '—';
    return Fmt.formatDate(String(value).slice(0, 10), I18n.lang);
  }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function remove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function makeError(code, message) {
    var err = new Error(message || code);
    err.code = code;
    return err;
  }

  function errorText(key) {
    return t(key);
  }

  function messageFor(err) {
    if (!err) return t('sp.errorGeneric');
    if (err.code === 'NOT_CONFIGURED') return t('sp.notConfigured');
    if (err.code === 'AUTH_REQUIRED' || err.code === 'AUTH_FAILED') return t('sp.authRequired');
    if (err.code === 'PICKER_CANCELLED') return t('sp.pickerCancelled');
    if (err.code === 'INVALID_JSON') return t('sp.portalLoadError');
    if (err.status === 404 || err.status === 403) return t('sp.shareMissing');
    if (err.code === 'sp.imageTooLarge' || err.code === 'sp.imageInvalid' || err.code === 'sp.imageReadError') return err.message;
    if (!navigator.onLine) return t('sp.offlineNotice');
    return err.message || t('sp.errorGeneric');
  }

  function toast(message, kind) {
    if (!toastRoot || !message) return;
    var el = document.createElement('div');
    el.className = 'sp-toast' + (kind ? ' is-' + kind : '');
    el.textContent = message;
    toastRoot.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 3600);
  }

  function currentTab() {
    var hash = String(location.hash || '').replace(/^#\/?/, '');
    return ['home', 'money', 'attendance', 'grades', 'notes', 'proofs'].indexOf(hash) >= 0 ? hash : 'home';
  }

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    write(LS.theme, theme || 'auto');
  }

  function applyLang(lang) {
    I18n.setLanguage(lang);
    write(LS.lang, I18n.lang);
    document.title = t('sp.title');
  }

  function setError(message) {
    state.error = message || '';
  }

  function saveCache() {
    write(LS.files, state.files);
    write(LS.portal, state.portal);
    write(LS.inbox, state.inbox);
    write(LS.queue, state.queue);
    write(LS.lastSync, state.lastSync);
  }

  function clearCache() {
    remove(LS.files);
    remove(LS.portal);
    remove(LS.inbox);
    remove(LS.queue);
    remove(LS.lastSync);
  }

  function statusBadge(balance) {
    if (balance > 0) return '<span class="sp-badge is-danger">' + esc(t('status.owes')) + '</span>';
    if (balance < 0) return '<span class="sp-badge is-info">' + esc(t('status.credit')) + '</span>';
    return '<span class="sp-badge is-success">' + esc(t('status.paid')) + '</span>';
  }

  function proofBadge(status) {
    if (status === 'approved') return '<span class="sp-badge is-success">' + esc(t('sp.proofApproved')) + '</span>';
    if (status === 'rejected') return '<span class="sp-badge is-danger">' + esc(t('sp.proofRejected')) + '</span>';
    return '<span class="sp-badge is-warn">' + esc(t('sp.proofPending')) + '</span>';
  }

  function attendanceBadge(status) {
    var map = {
      present: ['is-success', 'status.present'],
      late: ['is-warn', 'status.late'],
      absent: ['is-danger', 'status.absent'],
      canceled: ['is-info', 'status.canceled']
    };
    var item = map[status] || ['is-info', 'common.unknown'];
    return '<span class="sp-badge ' + item[0] + '">' + esc(t(item[1])) + '</span>';
  }

  function balanceText(balance) {
    if (balance > 0) return money(balance);
    if (balance < 0) return '− ' + money(Math.abs(balance));
    return t('sp.settled');
  }

  function attendancePercent(attendance) {
    if (!attendance) return '—';
    return Fmt.formatPercent(attendance.percentage, I18n.lang);
  }

  function pendingProofCount() {
    var pending = state.queue.length;
    if (state.portal && Array.isArray(state.portal.proofs)) {
      pending += state.portal.proofs.filter(function (proof) { return proof.status === 'pending'; }).length;
    }
    return pending;
  }

  function headerHtml() {
    var teacher = state.portal && state.portal.teacherName ? state.portal.teacherName : t('sp.teacher');
    var theme = document.documentElement.getAttribute('data-theme') || 'auto';
    return '<header class="sp-header">' +
      '<div class="sp-brand">' +
        '<span class="sp-brand-mark">' + icon('book', 21) + '</span>' +
        '<span class="sp-brand-text"><strong>' + esc(t('sp.title')) + '</strong><span>' + esc(teacher) + '</span></span>' +
      '</div>' +
      '<div class="sp-header-actions">' +
        '<button type="button" class="sp-lang-btn" data-action="lang" aria-label="' + esc(t('sp.language')) + '">' + (I18n.lang === 'fa' ? 'EN' : 'FA') + '</button>' +
        '<button type="button" class="sp-icon-btn" data-action="theme" aria-label="' + esc(t('sp.theme')) + '" title="' + esc(t('sp.theme')) + '">' + icon(theme === 'dark' ? 'sun' : 'moon') + '</button>' +
        (state.portal ? '<button type="button" class="sp-icon-btn" data-action="refresh" aria-label="' + esc(t('sp.homeRefresh')) + '" title="' + esc(t('sp.homeRefresh')) + '"' + (state.busy ? ' disabled' : '') + '>' + icon('refresh') + '</button>' : '') +
        (state.portal ? '<button type="button" class="sp-icon-btn" data-action="signout" aria-label="' + esc(t('sp.homeSignOut')) + '" title="' + esc(t('sp.homeSignOut')) + '">' + icon('logout') + '</button>' : '') +
      '</div>' +
    '</header>';
  }

  function authHtml() {
    var configured = window.Drive && Drive.configured();
    return '<main class="sp-main sp-auth">' +
      '<section class="sp-auth-card">' +
        '<div class="sp-auth-mark">' + icon('book', 32) + '</div>' +
        '<h1>' + esc(t('sp.title')) + '</h1>' +
        '<p>' + esc(t('sp.signInHint')) + '</p>' +
        (state.error ? '<div class="sp-banner is-error" style="margin-top:12px">' + esc(state.error) + '</div>' : '') +
        '<div class="sp-actions">' +
          (configured
            ? '<button type="button" class="sp-btn is-primary" data-action="signin"' + (state.busy ? ' disabled' : '') + '>' + icon('cloud') + ' ' + esc(state.busy ? t('sp.homeLoading') : t('sp.signIn')) + '</button>'
            : '<div class="sp-banner is-warn" style="text-align:start">' + esc(t('sp.notConfigured')) + '<br>' + esc(t('sp.configHint')) + '</div>') +
        '</div>' +
        '<p class="sp-auth-note">' + esc(t('sp.noServer')) + '</p>' +
      '</section>' +
    '</main>';
  }

  function appHtml() {
    var offline = state.offline;
    var tabs = [
      ['home', 'sp.dashboard'],
      ['money', 'sp.financial'],
      ['attendance', 'sp.attendanceShort'],
      ['grades', 'sp.gradeShort'],
      ['notes', 'sp.noteShort'],
      ['proofs', 'sp.proofShort']
    ];
    return '<main class="sp-main">' +
      (offline ? '<div class="sp-banner is-warn">' + icon('cloud', 16) + ' ' + esc(t('sp.offlineNotice')) + '</div>' : '') +
      (state.busy ? '<div class="sp-banner">' + icon('refresh', 16) + ' ' + esc(t('sp.homeLoading')) + '</div>' : '') +
      (!state.signedIn && !offline ? '<div class="sp-banner is-warn">' + icon('cloud', 16) + '<span>' + esc(t('sp.noToken')) + ' <button type="button" class="sp-btn is-primary" style="margin-top:6px" data-action="signin">' + esc(t('sp.signIn')) + '</button></span></div>' : '') +
      (state.error ? '<div class="sp-banner is-error">' + icon('alert', 16) + '<span>' + esc(state.error) + ' <button type="button" class="sp-btn" style="margin-top:6px" data-action="refresh">' + esc(t('sp.tryAgain')) + '</button></span></div>' : '') +
      '<nav class="sp-tabs" aria-label="' + esc(t('sp.more')) + '">' +
        tabs.map(function (item) {
          return '<button type="button" class="sp-tab' + (state.tab === item[0] ? ' is-active' : '') + '" data-tab="' + item[0] + '">' + esc(t(item[1])) + '</button>';
        }).join('') +
      '</nav>' +
      sectionHtml() +
    '</main>';
  }

  function sectionHtml() {
    if (!state.portal) return '';
    if (state.tab === 'money') return moneyHtml();
    if (state.tab === 'attendance') return attendanceHtml();
    if (state.tab === 'grades') return gradesHtml();
    if (state.tab === 'notes') return notesHtml();
    if (state.tab === 'proofs') return proofsHtml();
    return homeHtml();
  }

  function homeHtml() {
    var portal = state.portal;
    var summary = portal.summary || {};
    var balance = Number(summary.balance) || 0;
    var att = summary.attendance;
    var pending = pendingProofCount();
    var plans = (portal.classes || []).length + (portal.privatePlan ? 1 : 0);
    var last = state.lastSync ? t('sp.lastSync', { date: date(state.lastSync) }) : t('sp.notSynced');
    var pendingProofs = (portal.proofs || []).filter(function (proof) { return proof.status === 'pending'; });
    var plansHtml = planCardsHtml();
    return '<section class="sp-hero">' +
        '<div class="sp-hero-top">' +
          '<div><p class="sp-eyebrow">' + esc(t('sp.homeWelcome', { name: portal.student.name })) + '</p>' +
          '<h1>' + esc(portal.student.name) + '</h1></div>' +
          '<div>' + statusBadge(balance) + '</div>' +
        '</div>' +
        '<div class="sp-hero-balance">' + esc(balanceText(balance)) + ' <small>' + esc(balance === 0 ? t('status.paid') : balance > 0 ? t('status.owes') : t('status.credit')) + '</small></div>' +
        '<div class="sp-hero-stats">' +
          '<div class="sp-hero-stat"><span>' + esc(t('sp.homeAttendance')) + '</span><strong>' + esc(attendancePercent(att)) + '</strong></div>' +
          '<div class="sp-hero-stat"><span>' + esc(t('sp.homeClasses')) + '</span><strong>' + esc(num(plans)) + '</strong></div>' +
          '<div class="sp-hero-stat"><span>' + esc(t('sp.homePendingProofs')) + '</span><strong>' + esc(num(pending)) + '</strong></div>' +
        '</div>' +
      '</section>' +
      '<div class="sp-banner">' + icon('refresh', 16) + ' ' + esc(last) + '</div>' +
      '<section class="sp-card">' +
        '<div class="sp-section-head"><h2>' + esc(t('sp.homeQuickActions')) + '</h2></div>' +
        '<div class="sp-actions">' +
          '<button type="button" class="sp-btn" data-tab="money">' + icon('wallet') + ' ' + esc(t('sp.homeViewMoney')) + '</button>' +
          '<button type="button" class="sp-btn" data-tab="attendance">' + icon('calendar') + ' ' + esc(t('sp.homeViewAttendance')) + '</button>' +
          '<button type="button" class="sp-btn" data-tab="grades">' + icon('star') + ' ' + esc(t('sp.homeViewGrades')) + '</button>' +
          '<button type="button" class="sp-btn" data-tab="notes">' + icon('notes') + ' ' + esc(t('sp.homeViewNotes')) + '</button>' +
          '<button type="button" class="sp-btn is-primary" data-tab="proofs">' + icon('upload') + ' ' + esc(t('sp.homeProofAction')) + '</button>' +
        '</div>' +
        '<p class="sp-sub">' + esc(t('sp.homeProofHint')) + '</p>' +
      '</section>' +
      (pendingProofs.length ? '<section class="sp-card">' +
        '<div class="sp-section-head"><h2>' + esc(t('sp.homePendingProofs')) + '</h2>' + proofBadge('pending') + '</div>' +
        '<div class="sp-list">' + pendingProofs.slice(0, 3).map(proofRowHtml).join('') + '</div>' +
        '<div class="sp-actions"><button type="button" class="sp-btn" data-tab="proofs">' + esc(t('sp.homeViewProofs')) + '</button></div>' +
      '</section>' : '') +
      '<section class="sp-card">' +
        '<div class="sp-section-head"><h2>' + esc(t('sp.homeClasses')) + '</h2></div>' +
        (plansHtml || '<div class="sp-empty">' + esc(t('sp.homeNoClasses')) + '</div>') +
      '</section>' +
      '<section class="sp-card sp-card-flat">' +
        '<div class="sp-section-head"><h3>' + esc(t('sp.about')) + '</h3></div>' +
        '<p class="sp-sub">' + esc(t('sp.noServer')) + '</p>' +
        '<p class="sp-sub">' + esc(t('sp.privacyHint')) + '</p>' +
      '</section>';
  }

  function planCardsHtml() {
    var portal = state.portal;
    var items = [];
    (portal.classes || []).forEach(function (plan) {
      items.push(planCardHtml(plan.name || t('sp.class'), plan));
    });
    if (portal.privatePlan) items.push(planCardHtml(t('sp.homePrivatePlan'), portal.privatePlan));
    return items.join('');
  }

  function planCardHtml(title, plan) {
    var progress = plan.termProgress;
    var modelKey = 'model.' + (plan.model || 'term');
    var model = I18n.has(modelKey) ? t(modelKey) : (plan.model || '');
    var pct = 0;
    if (progress && Number(progress.size) > 0) {
      pct = Math.max(0, Math.min(100, Math.round((Number(progress.counted) || 0) / Number(progress.size) * 100)));
    }
    return '<div class="sp-plan">' +
      '<div class="sp-plan-top"><strong>' + esc(title) + '</strong><span class="sp-badge is-primary">' + esc(model) + '</span></div>' +
      (plan.startDate || plan.endDate ? '<div class="sp-plan-meta">' + esc(date(plan.startDate)) + ' — ' + esc(date(plan.endDate)) + '</div>' : '') +
      (progress ? '<div class="sp-progress"><span style="width:' + pct + '%"></span></div>' +
        '<div class="sp-plan-meta">' + esc(t('sp.sessionsOfTerm', { used: num(progress.counted || 0), total: num(progress.size || 0) })) +
        (progress.termNumber ? ' · ' + esc(t('sp.termNumber', { n: num(progress.termNumber) })) : '') + '</div>' : '') +
    '</div>';
  }

  function moneyHtml() {
    var summary = state.portal.summary || {};
    var balance = Number(summary.balance) || 0;
    var charges = summary.charges || [];
    var payments = summary.payments || [];
    var proofs = state.portal.proofs || [];
    return '<section class="sp-card">' +
      '<div class="sp-section-head"><h2>' + esc(t('sp.moneySummary')) + '</h2>' + statusBadge(balance) + '</div>' +
      '<div class="sp-grid">' +
        '<div class="sp-stat"><span>' + esc(t('sp.total')) + '</span><strong>' + esc(money(summary.totalCharges)) + '</strong></div>' +
        '<div class="sp-stat"><span>' + esc(t('sp.payment')) + '</span><strong>' + esc(money(summary.totalPaid)) + '</strong></div>' +
        '<div class="sp-stat ' + (balance > 0 ? 'is-bad' : balance < 0 ? 'is-good' : '') + '"><span>' + esc(balance > 0 ? t('sp.remaining') : balance < 0 ? t('sp.overpaid') : t('sp.settled')) + '</span><strong>' + esc(balanceText(balance)) + '</strong></div>' +
      '</div>' +
    '</section>' +
    '<section class="sp-card">' +
      '<div class="sp-section-head"><h2>' + esc(t('sp.moneyCharges')) + '</h2></div>' +
      (charges.length ? '<div class="sp-list">' + charges.slice().reverse().map(function (charge) {
        return '<div class="sp-row"><span class="sp-row-main"><span class="sp-row-title">' + esc(charge.planName || charge.kind || t('sp.charge')) + '</span>' +
          '<span class="sp-row-sub">' + esc(date(charge.date)) + (charge.status ? ' · ' + esc(charge.status) : '') + '</span></span>' +
          '<span class="sp-row-end">' + esc(money(charge.amount)) + '</span></div>';
      }).join('') + '</div>' : '<div class="sp-empty">' + esc(t('sp.homeNoCharges')) + '</div>') +
    '</section>' +
    '<section class="sp-card">' +
      '<div class="sp-section-head"><h2>' + esc(t('sp.moneyPayments')) + '</h2></div>' +
      (payments.length ? '<div class="sp-list">' + payments.slice().reverse().map(function (payment) {
        return '<div class="sp-row"><span class="sp-row-main"><span class="sp-row-title">' + esc(payment.note || t('sp.payment')) + '</span>' +
          '<span class="sp-row-sub">' + esc(date(payment.date)) + '</span></span>' +
          '<span class="sp-row-end">' + esc(money(payment.amount)) + '</span></div>';
      }).join('') + '</div>' : '<div class="sp-empty">' + esc(t('sp.homeNoPayments')) + '</div>') +
    '</section>' +
    '<section class="sp-card">' +
      '<div class="sp-section-head"><h2>' + esc(t('sp.moneyProofs')) + '</h2>' +
        '<button type="button" class="sp-btn is-primary" data-tab="proofs">' + icon('upload') + ' ' + esc(t('sp.submitProof')) + '</button></div>' +
      (proofs.length || state.queue.length ? '<div class="sp-list">' + queueRowsHtml() + proofs.slice().reverse().map(proofRowHtml).join('') + '</div>' : '<div class="sp-empty">' + esc(t('sp.homeNoProofs')) + '</div>') +
    '</section>';
  }

  function attendanceHtml() {
    var att = state.portal.summary && state.portal.summary.attendance;
    var history = (state.portal.summary && state.portal.summary.history) || [];
    return '<section class="sp-card">' +
      '<div class="sp-section-head"><h2>' + esc(t('sp.attendanceStats')) + '</h2></div>' +
      (att ? '<div class="sp-grid">' +
        '<div class="sp-stat is-good"><span>' + esc(t('status.present')) + '</span><strong>' + esc(num(att.present)) + '</strong></div>' +
        '<div class="sp-stat"><span>' + esc(t('status.late')) + '</span><strong>' + esc(num(att.late)) + '</strong></div>' +
        '<div class="sp-stat is-bad"><span>' + esc(t('status.absent')) + '</span><strong>' + esc(num(att.absent)) + '</strong></div>' +
        '<div class="sp-stat"><span>' + esc(t('sp.homeAttendance')) + '</span><strong>' + esc(attendancePercent(att)) + '</strong></div>' +
      '</div>' : '<div class="sp-empty">' + esc(t('sp.homeNoAttendance')) + '</div>') +
    '</section>' +
    '<section class="sp-card">' +
      '<div class="sp-section-head"><h2>' + esc(t('sp.attendanceHistory')) + '</h2></div>' +
      (history.length ? '<div class="sp-list">' + history.slice().reverse().map(function (item) {
        return '<div class="sp-row"><span class="sp-row-main"><span class="sp-row-title">' + esc(item.planName || t('sp.class')) + '</span>' +
          '<span class="sp-row-sub">' + esc(date(item.date)) + (item.counted === false ? ' · ' + esc(t('status.makeup')) : '') + '</span></span>' +
          '<span class="sp-row-end">' + attendanceBadge(item.status) + '</span></div>';
      }).join('') + '</div>' : '<div class="sp-empty">' + esc(t('sp.noHistory')) + '</div>') +
    '</section>';
  }

  function gradesHtml() {
    var grades = state.portal.grades || [];
    var scores = grades.map(function (grade) { return grade.score; }).filter(function (score) { return typeof score === 'number' && isFinite(score); });
    var average = scores.length ? scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length : null;
    return '<section class="sp-card">' +
      '<div class="sp-section-head"><h2>' + esc(t('sp.gradesTitle')) + '</h2></div>' +
      '<div class="sp-grid">' +
        '<div class="sp-stat"><span>' + esc(t('sp.gradeAverage')) + '</span><strong>' + esc(average === null ? '—' : Fmt.formatScore(average, I18n.lang)) + '</strong></div>' +
        '<div class="sp-stat"><span>' + esc(t('sp.gradeCount')) + '</span><strong>' + esc(num(grades.length)) + '</strong></div>' +
        '<div class="sp-stat"><span>' + esc(t('sp.gradeLatest')) + '</span><strong>' + esc(grades.length ? Fmt.formatScore(grades[0].score, I18n.lang) || '—' : '—') + '</strong></div>' +
      '</div>' +
    '</section>' +
    '<section class="sp-card">' +
      '<div class="sp-section-head"><h2>' + esc(t('sp.gradesTitle')) + '</h2></div>' +
      (grades.length ? '<div class="sp-list">' + grades.map(function (grade) {
        return '<div class="sp-row"><span class="sp-row-main"><span class="sp-row-title">' + esc(grade.title || t('sp.gradeScore')) + '</span>' +
          '<span class="sp-row-sub">' + esc(date(grade.date)) + (grade.note ? ' · ' + esc(grade.note) : '') + '</span></span>' +
          '<span class="sp-row-end">' + esc(Fmt.formatScore(grade.score, I18n.lang) || '—') + '</span></div>';
      }).join('') + '</div>' : '<div class="sp-empty">' + esc(t('sp.noGrades')) + '</div>') +
    '</section>';
  }

  function notesHtml() {
    var notes = state.portal.notes || [];
    return '<section class="sp-card">' +
      '<div class="sp-section-head"><h2>' + esc(t('sp.notesTitle')) + '</h2></div>' +
      '<p class="sp-sub">' + esc(t('sp.notesHint')) + '</p>' +
      (notes.length ? notes.map(function (note) {
        return '<div class="sp-note"><div class="sp-note-head"><strong>' + esc(note.title || t('sp.noteVisible')) + '</strong><span>' + esc(date(note.date)) + '</span></div>' +
          (note.className ? '<div class="sp-row-sub">' + esc(note.className) + '</div>' : '') +
          '<p>' + esc(note.body) + '</p></div>';
      }).join('') : '<div class="sp-empty">' + esc(t('sp.noNotes')) + '</div>') +
    '</section>';
  }

  function proofsHtml() {
    var proofs = state.portal.proofs || [];
    var queue = state.queue;
    return '<section class="sp-card">' +
      '<div class="sp-section-head"><h2>' + esc(t('sp.submitProof')) + '</h2></div>' +
      '<p class="sp-sub">' + esc(t('sp.submitProofHint')) + '</p>' +
      '<form class="sp-form" data-proof-form novalidate>' +
        '<label class="sp-field"><span>' + esc(t('sp.amount')) + '</span>' +
          '<input class="sp-input" name="amount" inputmode="numeric" dir="ltr" autocomplete="off" placeholder="' + esc(t('sp.amount')) + '"></label>' +
        '<div class="sp-field"><span>' + esc(t('sp.date')) + '</span>' + dateFieldHtml(Jalali.todayISO()) + '</div>' +
        '<label class="sp-field"><span>' + esc(t('sp.note')) + '</span>' +
          '<textarea class="sp-textarea" name="note" maxlength="500" placeholder="' + esc(t('sp.notePlaceholder')) + '"></textarea></label>' +
        '<div class="sp-field"><span>' + esc(t('sp.image')) + '</span>' +
          '<div class="sp-file"><input type="file" name="image" accept="image/jpeg,image/png,image/webp" data-proof-file>' +
          '<div class="sp-preview" data-proof-preview></div></div></div>' +
        '<p class="sp-form-error" data-proof-error hidden></p>' +
        '<button type="submit" class="sp-btn is-primary sp-btn-block"' + (state.busy ? ' disabled' : '') + '>' + icon('upload') + ' ' + esc(state.busy ? t('sp.submitting') : t('sp.submit')) + '</button>' +
      '</form>' +
    '</section>' +
    (queue.length ? '<div class="sp-queue"><strong>' + esc(t('sp.offlineQueue', { count: num(queue.length) })) + '</strong>' +
      esc(t('sp.offlineQueueHint')) +
      '<div class="sp-actions"><button type="button" class="sp-btn" data-action="retry-queue">' + esc(t('sp.retryQueue')) + '</button></div></div>' : '') +
    '<section class="sp-card">' +
      '<div class="sp-section-head"><h2>' + esc(t('sp.proofs')) + '</h2></div>' +
      (proofs.length || queue.length ? '<div class="sp-list">' + queueRowsHtml() + proofs.slice().reverse().map(proofRowHtml).join('') + '</div>' : '<div class="sp-empty">' + esc(t('sp.noProofs')) + '</div>') +
    '</section>';
  }

  function queueRowsHtml() {
    return state.queue.map(function (submission) {
      return '<div class="sp-row"><span class="sp-row-main"><span class="sp-row-title">' + esc(money(submission.amount)) + ' · ' + esc(date(submission.date)) + '</span>' +
        '<span class="sp-row-sub">' + esc(t('sp.offlineQueueHint')) + '</span></span>' +
        '<span class="sp-row-end">' + proofBadge('pending') + '</span></div>';
    }).join('');
  }

  function proofRowHtml(proof) {
    var note = proof.note ? '<span class="sp-row-sub is-wrap">' + esc(proof.note) + '</span>' : '';
    var review = proof.reviewNote ? '<span class="sp-row-sub is-wrap">' + esc(t('sp.reviewNote', { note: proof.reviewNote })) + '</span>' : '';
    var link = proof.driveLink ? '<span class="sp-row-sub"><a href="' + esc(proof.driveLink) + '" target="_blank" rel="noopener">' + esc(t('sp.openInDrive')) + '</a></span>' : '';
    return '<div class="sp-row"><span class="sp-row-main"><span class="sp-row-title">' + esc(money(proof.amount)) + ' · ' + esc(date(proof.date)) + '</span>' +
      note + review + link + '</span><span class="sp-row-end">' + proofBadge(proof.status) + '</span></div>';
  }

  function dateFieldHtml(iso) {
    var j = Jalali.gToJ(iso) || Jalali.todayJ();
    var years = [];
    for (var y = j.jy - 2; y <= j.jy + 1; y++) years.push(y);
    var months = [];
    for (var m = 1; m <= 12; m++) months.push(m);
    var days = [];
    var len = Jalali.jMonthLength(j.jy, j.jm);
    for (var d = 1; d <= len; d++) days.push(d);
    return '<div class="sp-date-row" data-date-field>' +
      '<select class="sp-select" data-date-year aria-label="' + esc(t('sp.term')) + '">' + years.map(function (value) {
        return '<option value="' + value + '"' + (value === j.jy ? ' selected' : '') + '>' + esc(Fmt.localizeDigits(value, I18n.lang)) + '</option>';
      }).join('') + '</select>' +
      '<select class="sp-select" data-date-month aria-label="' + esc(t('sp.month')) + '">' + months.map(function (value) {
        return '<option value="' + value + '"' + (value === j.jm ? ' selected' : '') + '>' + esc(Fmt.monthName(value, I18n.lang)) + '</option>';
      }).join('') + '</select>' +
      '<select class="sp-select" data-date-day aria-label="' + esc(t('sp.today')) + '">' + days.map(function (value) {
        return '<option value="' + value + '"' + (value === j.jd ? ' selected' : '') + '>' + esc(Fmt.localizeDigits(value, I18n.lang)) + '</option>';
      }).join('') + '</select>' +
    '</div>';
  }

  function bindDateField(form) {
    var field = form.querySelector('[data-date-field]');
    if (!field) return;
    var year = field.querySelector('[data-date-year]');
    var month = field.querySelector('[data-date-month]');
    var day = field.querySelector('[data-date-day]');
    function fillDays() {
      var len = Jalali.jMonthLength(Number(year.value), Number(month.value));
      var selected = Math.min(Number(day.value) || 1, len);
      var html = '';
      for (var d = 1; d <= len; d++) {
        html += '<option value="' + d + '"' + (d === selected ? ' selected' : '') + '>' + esc(Fmt.localizeDigits(d, I18n.lang)) + '</option>';
      }
      day.innerHTML = html;
      day.value = String(selected);
    }
    year.addEventListener('change', fillDays);
    month.addEventListener('change', fillDays);
  }

  function readDate(form) {
    var field = form.querySelector('[data-date-field]');
    if (!field) return null;
    var year = Number(field.querySelector('[data-date-year]').value);
    var month = Number(field.querySelector('[data-date-month]').value);
    var day = Number(field.querySelector('[data-date-day]').value);
    var iso = Jalali.jToG(year, month, day);
    return iso && Jalali.isValidISO(iso) ? iso : null;
  }

  function bindProofFile(form) {
    var input = form.querySelector('[data-proof-file]');
    var preview = form.querySelector('[data-proof-preview]');
    if (!input || !preview) return;
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      preview.innerHTML = '';
      preview.classList.remove('is-visible');
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        showFormError(form, t('sp.imageInvalid'));
        input.value = '';
        return;
      }
      var url = URL.createObjectURL(file);
      var img = document.createElement('img');
      img.alt = t('sp.image');
      img.src = url;
      img.onload = function () { URL.revokeObjectURL(url); };
      preview.appendChild(img);
      preview.classList.add('is-visible');
    });
  }

  function showFormError(form, message) {
    var error = form.querySelector('[data-proof-error]');
    if (!error) return;
    error.textContent = message || '';
    error.hidden = !message;
  }

  function base64Bytes(data) {
    return Math.floor(String(data || '').length * 3 / 4);
  }

  function compressImage(file, maxBytes) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        reject(makeError('sp.imageInvalid', t('sp.imageInvalid')));
        return;
      }
      var objectUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        var scale = Math.min(1, 1600 / Math.max(img.width || 1, img.height || 1));
        var width = Math.max(1, Math.round((img.width || 1) * scale));
        var height = Math.max(1, Math.round((img.height || 1) * scale));
        var quality = 0.84;
        for (var attempt = 0; attempt < 9; attempt++) {
          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(makeError('sp.imageReadError', t('sp.imageReadError')));
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          var data = dataUrl.split(',')[1] || '';
          if (base64Bytes(data) <= maxBytes) {
            resolve({
              data: data,
              mime: 'image/jpeg',
              fileName: String(file.name || 'proof').replace(/\.[^.]+$/, '').slice(0, 160) + '.jpg'
            });
            return;
          }
          if (quality > 0.46) quality -= 0.12;
          else {
            width = Math.round(width * 0.82);
            height = Math.round(height * 0.82);
            quality = 0.8;
          }
          if (width < 280 || height < 280) break;
        }
        reject(makeError('sp.imageTooLarge', t('sp.imageTooLarge')));
      };
      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(makeError('sp.imageReadError', t('sp.imageReadError')));
      };
      img.src = objectUrl;
    });
  }

  async function submitProof(form) {
    if (state.busy) return;
    showFormError(form, '');
    var amount = Fmt.parseAmount(form.elements.amount.value);
    if (amount === null || amount <= 0) {
      showFormError(form, t('sp.amountInvalid'));
      return;
    }
    var iso = readDate(form);
    if (!iso) {
      showFormError(form, t('sp.dateInvalid'));
      return;
    }
    var note = String(form.elements.note.value || '').trim();
    if (note.length > 500) {
      showFormError(form, t('sp.noteTooLong'));
      return;
    }
    var file = form.elements.image.files && form.elements.image.files[0];
    if (!file) {
      showFormError(form, t('sp.imageRequired'));
      return;
    }
    state.busy = true;
    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      var compressed = await compressImage(file, Number(window.APP_CONFIG && APP_CONFIG.maxProofBytes) || 2097152);
      var submission = Portal.makeSubmission({
        amount: amount,
        date: iso,
        note: note,
        mime: compressed.mime,
        fileName: compressed.fileName,
        data: compressed.data
      });
      state.queue.push(submission);
      saveCache();
      render();
      try {
        await uploadQueue();
        toast(t('sp.submitted'), 'success');
      } catch (err) {
        console.error(err);
        toast(t('sp.queued'), 'success');
      }
      setError('');
    } catch (err) {
      console.error(err);
      showFormError(form, messageFor(err));
    } finally {
      state.busy = false;
      render();
    }
  }

  async function uploadQueue() {
    if (!state.queue.length) return 0;
    if (!state.portal || !state.files || !state.files.inbox) throw makeError('NO_INBOX', t('sp.noInbox'));
    await Drive.ensureToken({ interactive: false });
    var lastError = null;
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var remote = await Drive.getJsonFile(state.files.inbox.id);
        var check = Portal.validateInbox(remote.data, state.portal.studentId);
        if (!check.ok) throw makeError('INVALID_INBOX', t('sp.inboxLoadError'));
        var inbox = remote.data;
        state.queue.forEach(function (submission) {
          inbox = Portal.appendSubmission(inbox, submission);
        });
        await Drive.updateJsonFile(state.files.inbox.id, inbox, remote.etag);
        state.inbox = inbox;
        state.queue = [];
        state.lastSync = new Date().toISOString();
        saveCache();
        return 1;
      } catch (err) {
        lastError = err;
        if ((err.status === 409 || err.status === 412) && attempt === 0) continue;
        throw err;
      }
    }
    throw lastError || makeError('UPLOAD_FAILED', t('sp.proofUploadError'));
  }

  async function chooseFiles() {
    var docs = await Drive.pickFiles({ mimeTypes: 'application/json' });
    if (!docs || !docs.length) throw makeError('PICKER_CANCELLED', t('sp.pickerCancelled'));
    var portalDoc = docs.find(function (doc) { return /portal/i.test(doc.name || ''); });
    var inboxDoc = docs.find(function (doc) { return /inbox/i.test(doc.name || ''); });
    if (!portalDoc || !inboxDoc) throw makeError('WRONG_FILES', t('sp.wrongFiles'));
    state.files = {
      portal: { id: portalDoc.id, name: portalDoc.name },
      inbox: { id: inboxDoc.id, name: inboxDoc.name }
    };
    state.queue = [];
    state.inbox = null;
    state.portal = null;
    saveCache();
    await loadRemote();
  }

  async function loadRemote() {
    if (!state.files || !state.files.portal || !state.files.inbox) throw makeError('NO_FILES', t('sp.shareMissing'));
    var portalFile = await Drive.getJsonFile(state.files.portal.id);
    var portalCheck = Portal.validatePortal(portalFile.data);
    if (!portalCheck.ok) throw makeError('INVALID_PORTAL', t('sp.portalLoadError'));
    var inboxFile = await Drive.getJsonFile(state.files.inbox.id);
    var inboxCheck = Portal.validateInbox(inboxFile.data, portalFile.data.studentId);
    if (!inboxCheck.ok) throw makeError('INVALID_INBOX', t('sp.inboxLoadError'));
    state.portal = portalFile.data;
    state.inbox = inboxFile.data;
    state.lastSync = new Date().toISOString();
    saveCache();
  }

  async function refresh() {
    if (state.busy) return;
    if (!navigator.onLine) {
      setError(t('sp.offlineNotice'));
      render();
      return;
    }
    state.busy = true;
    setError('');
    render();
    try {
      await Drive.ensureToken({ interactive: true });
      state.signedIn = true;
      try { state.email = await Drive.getEmail(); } catch (_) { state.email = ''; }
      if (!state.files) await chooseFiles();
      else {
        try {
          await loadRemote();
        } catch (err) {
          if (err.status === 404 || err.status === 403) {
            state.files = null;
            saveCache();
            await chooseFiles();
          } else {
            throw err;
          }
        }
      }
      if (state.queue.length) await uploadQueue();
      toast(t('sp.portalUpdated'), 'success');
    } catch (err) {
      console.error(err);
      setError(messageFor(err));
    } finally {
      state.busy = false;
      render();
    }
  }

  async function retryQueue() {
    if (state.busy) return;
    state.busy = true;
    setError('');
    render();
    try {
      await Drive.ensureToken({ interactive: true });
      await uploadQueue();
      toast(t('sp.submitted'), 'success');
    } catch (err) {
      console.error(err);
      setError(messageFor(err));
    } finally {
      state.busy = false;
      render();
    }
  }

  async function signOut() {
    await Drive.signOut();
    state.portal = null;
    state.inbox = null;
    state.files = null;
    state.queue = [];
    state.email = '';
    state.signedIn = false;
    state.lastSync = '';
    clearCache();
    setError('');
    render();
    toast(t('sp.signedOut'), 'success');
  }

  function render() {
    if (!app) return;
    if (!state.portal) {
      app.innerHTML = headerHtml() + authHtml();
      return;
    }
    app.innerHTML = headerHtml() + appHtml();
    var form = app.querySelector('[data-proof-form]');
    if (form) {
      bindDateField(form);
      bindProofFile(form);
    }
  }

  function setTab(tab) {
    if (['home', 'money', 'attendance', 'grades', 'notes', 'proofs'].indexOf(tab) < 0) return;
    state.tab = tab;
    try { history.replaceState(null, '', '#' + tab); } catch (_) { location.hash = tab; }
    render();
  }

  function bindGlobal() {
    document.addEventListener('click', function (event) {
      var tabButton = event.target.closest('[data-tab]');
      if (tabButton && app.contains(tabButton)) {
        setTab(tabButton.getAttribute('data-tab'));
        return;
      }
      var actionButton = event.target.closest('[data-action]');
      if (!actionButton || !app.contains(actionButton)) return;
      var action = actionButton.getAttribute('data-action');
      if (action === 'lang') {
        applyLang(I18n.lang === 'fa' ? 'en' : 'fa');
        render();
      } else if (action === 'theme') {
        var current = document.documentElement.getAttribute('data-theme') || 'auto';
        var next = current === 'auto' ? 'dark' : current === 'dark' ? 'light' : 'auto';
        applyTheme(next);
        render();
      } else if (action === 'signin' || action === 'refresh') {
        refresh();
      } else if (action === 'signout') {
        signOut();
      } else if (action === 'retry-queue') {
        retryQueue();
      }
    });

    document.addEventListener('submit', function (event) {
      var form = event.target.closest('[data-proof-form]');
      if (!form || !app.contains(form)) return;
      event.preventDefault();
      submitProof(form);
    });

    window.addEventListener('hashchange', function () {
      var tab = currentTab();
      if (tab !== state.tab) {
        state.tab = tab;
        render();
      }
    });

    window.addEventListener('online', function () {
      state.offline = false;
      render();
      if (state.signedIn && state.portal) refresh();
    });

    window.addEventListener('offline', function () {
      state.offline = true;
      render();
    });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function (err) {
      console.warn('Service worker registration failed', err);
    });
  }

  function init() {
    var lang = read(LS.lang, null);
    if (lang === 'en' || lang === 'fa') I18n.lang = lang;
    I18n.apply();
    document.title = t('sp.title');
    var theme = read(LS.theme, 'auto');
    applyTheme(theme);
    state.files = read(LS.files, null);
    state.portal = read(LS.portal, null);
    state.inbox = read(LS.inbox, null);
    state.queue = read(LS.queue, []);
    state.lastSync = read(LS.lastSync, '');
    if (!Array.isArray(state.queue)) state.queue = [];
    if (state.portal && !Portal.validatePortal(state.portal).ok) state.portal = null;
    if (state.portal && state.portal.studentId && state.inbox && !Portal.validateInbox(state.inbox, state.portal.studentId).ok) state.inbox = null;
    state.tab = currentTab();
    bindGlobal();
    render();
    registerSW();
  }

  init();
})();
