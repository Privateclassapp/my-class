/* accounts.js — student account management and owner-only teacher admin. */
(function () {
  'use strict';

  var Pages = window.Pages = window.Pages || {};
  var studentState = { loading: false, loaded: false, error: null, accounts: [] };
  var teacherState = { loading: false, loaded: false, error: null, teachers: [] };

  function t(key, vars) { return I18n.t(key, vars); }
  function esc(value) { return UI.escapeHtml(value); }
  function date(value) {
    var iso = String(value || '').slice(0, 10);
    return Jalali.isValidISO(iso) ? Fmt.formatDate(iso, I18n.lang) : t('accounts.never');
  }
  function isOwner() {
    var user = window.Auth && Auth.user();
    return !!(user && user.role === 'owner');
  }
  function canManage() {
    return !!(window.Auth && Auth.valid());
  }
  function apiCall(action, payload) {
    return Auth.call(action, payload, { timeout: 45000, forcePrimary: true });
  }
  function userError(message) {
    var err = new Error(message);
    err.userMessage = message;
    return err;
  }
  function errText(err) {
    var code = err && err.code;
    if (code === 'USERNAME_TAKEN') return t('accounts.errUsernameTaken');
    if (code === 'INVALID_USERNAME') return t('accounts.errUsername');
    if (code === 'ACCOUNT_EXISTS') return t('accounts.errExists');
    if (code === 'SYNC_REQUIRED') return t('accounts.errSyncRequired');
    if (code === 'STUDENT_NOT_FOUND') return t('accounts.errStudentNotFound');
    if (code === 'NOT_FOUND') return t('accounts.errNotFound');
    if (code === 'INVALID_STATUS') return t('accounts.errGeneric');
    if (code === 'AUTH_REQUIRED' || code === 'AUTH_EXPIRED' || code === 'ACCOUNT_DISABLED') return t('accounts.errAuth');
    if (code === 'NOT_CONFIGURED') return t('cloud.notConfigured');
    if (code === 'NETWORK_ERROR' || code === 'TIMEOUT' || code === 'OFFLINE') return t('accounts.errOffline');
    return t('accounts.errGeneric');
  }
  function studentAppUrl() {
    try {
      return new URL('student/', window.location.href).href;
    } catch (_) {
      return 'student/';
    }
  }
  function accountById(list, id) {
    return (list || []).find(function (account) { return account.id === id; }) || null;
  }
  function updateAccount(state, account) {
    if (!account || !account.id) return;
    for (var i = 0; i < state.accounts.length; i++) {
      if (state.accounts[i].id === account.id) {
        state.accounts[i] = Object.assign({}, state.accounts[i], account);
        return;
      }
    }
    state.accounts.push(account);
  }
  function updateTeacher(state, account) {
    if (!account || !account.id) return;
    for (var i = 0; i < state.teachers.length; i++) {
      if (state.teachers[i].id === account.id) {
        state.teachers[i] = Object.assign({}, state.teachers[i], account);
        return;
      }
    }
    state.teachers.push(account);
  }

  function copyText(text) {
    function fallback() {
      UI.alert({ title: t('accounts.shareLabel'), message: text });
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        UI.toast(t('accounts.copied'), 'success');
      }, fallback);
      return;
    }
    fallback();
  }

  function copyButton(selector) {
    return '<button type="button" class="btn ghost btn-sm" ' + selector + '>' + UI.icon('copy', 16) + ' ' + esc(t('accounts.copy')) + '</button>';
  }

  function secretDialog(title, username, password) {
    var share = password
      ? t('accounts.shareBody', { url: studentAppUrl(), username: username, password: password })
      : t('accounts.shareBodyNoPassword', { url: studentAppUrl(), username: username });
    var body = '<div class="secret-box">' +
      (password ? '<p class="hint">' + esc(t('accounts.passwordOnce')) + '</p>' : '') +
      '<div class="secret-row"><span>' + esc(t('accounts.username')) + '</span><code dir="ltr">' + esc(username) + '</code></div>' +
      (password ? '<div class="secret-row"><span>' + esc(t('auth.password')) + '</span><code dir="ltr">' + esc(password) + '</code></div>' : '') +
      '<label class="field"><span>' + esc(t('accounts.shareLabel')) + '</span>' +
        '<textarea class="input secret-share" readonly rows="4" dir="ltr">' + esc(share) + '</textarea></label>' +
      '<div class="modal-actions">' + copyButton('data-copy-share') + '</div>' +
    '</div>';
    return UI.dialog({
      title: title,
      body: body,
      actions: [{ label: t('common.close'), value: true, variant: 'primary' }],
      onMount: function (el) {
        var btn = el.querySelector('[data-copy-share]');
        if (btn) btn.addEventListener('click', function () { copyText(share); });
      }
    });
  }

  function loadStudents(force) {
    if (studentState.loading) return;
    if (studentState.loaded && !force) return;
    studentState.loading = true;
    studentState.error = null;
    apiCall('teacherListStudentAccounts', {}).then(function (data) {
      studentState.accounts = data && Array.isArray(data.accounts) ? data.accounts : [];
      studentState.loaded = true;
    }).catch(function (err) {
      studentState.error = errText(err);
      studentState.loaded = true;
    }).then(function () {
      studentState.loading = false;
      App.rerender();
    });
  }

  function loadTeachers(force) {
    if (teacherState.loading) return;
    if (teacherState.loaded && !force) return;
    teacherState.loading = true;
    teacherState.error = null;
    apiCall('adminListTeachers', {}).then(function (data) {
      teacherState.teachers = data && Array.isArray(data.teachers) ? data.teachers : [];
      teacherState.loaded = true;
    }).catch(function (err) {
      teacherState.error = errText(err);
      teacherState.loaded = true;
    }).then(function () {
      teacherState.loading = false;
      App.rerender();
    });
  }

  function statusBadge(status) {
    return status === 'disabled'
      ? UI.badge(t('accounts.statusDisabled'), 'neutral')
      : UI.badge(t('accounts.statusActive'), 'success');
  }

  function pageHead(title, subtitle) {
    return '<div class="page-head"><div><h2 class="page-title">' + esc(title) + '</h2>' +
      '<p class="page-sub">' + esc(subtitle) + '</p></div></div>';
  }

  function loadingCard() {
    return '<section class="card"><p class="hint">' + esc(t('accounts.loading')) + '</p></section>';
  }

  function errorCard(message, action) {
    return '<section class="card">' +
      '<p class="hint hint-warn">' + esc(message) + '</p>' +
      '<div class="settings-actions"><button type="button" class="btn ghost" ' + action + '>' +
        UI.icon('refresh', 16) + ' ' + esc(t('common.retry')) + '</button></div>' +
    '</section>';
  }

  function noAuthCard() {
    return '<div class="page">' + pageHead(t('accounts.title'), t('accounts.noAuth')) +
      '<section class="card"><p class="hint hint-warn">' + esc(t('accounts.noAuth')) + '</p></section></div>';
  }

  function forbiddenCard() {
    return '<div class="page">' + pageHead(t('accounts.teacherTitle'), t('accounts.ownerOnly')) +
      '<section class="card"><p class="hint hint-warn">' + esc(t('accounts.ownerOnly')) + '</p></section></div>';
  }

  function accountActions(account) {
    return '<div class="account-actions">' +
      '<button type="button" class="btn ghost btn-sm" data-reset="' + esc(account.id) + '">' +
        UI.icon('refresh', 16) + ' ' + esc(t('accounts.resetPassword')) + '</button>' +
      '<button type="button" class="btn ghost btn-sm" data-toggle="' + esc(account.id) + '" data-status="' +
        (account.status === 'active' ? 'disabled' : 'active') + '">' +
        UI.icon(account.status === 'active' ? 'lock' : 'unlock', 16) + ' ' +
        esc(account.status === 'active' ? t('accounts.disable') : t('accounts.enable')) + '</button>' +
      '<button type="button" class="btn ghost btn-sm" data-share="' + esc(account.id) + '">' +
        UI.icon('copy', 16) + ' ' + esc(t('accounts.copyShare')) + '</button>' +
    '</div>';
  }

  function studentRow(student, account, focused) {
    var meta = account
      ? '<span class="account-username" dir="ltr">' + esc(account.username) + '</span>' +
        '<span class="account-meta">' + esc(t('accounts.lastLogin', { date: account.lastLoginAt ? date(account.lastLoginAt) : t('accounts.never') })) + '</span>'
      : '<span class="account-meta">' + esc(t('accounts.noAccount')) + '</span>';
    var action = account
      ? statusBadge(account.status) + accountActions(account)
      : '<button type="button" class="btn primary btn-sm" data-create="' + esc(student.id) + '">' +
          UI.icon('plus', 16) + ' ' + esc(t('accounts.create')) + '</button>';
    return '<article class="account-row' + (focused ? ' is-focus' : '') + '">' +
      '<div class="account-main">' +
        UI.avatar(student.name) +
        '<div class="account-info"><strong>' + esc(student.name) + '</strong>' + meta + '</div>' +
      '</div>' +
      '<div class="account-side">' + action + '</div>' +
    '</article>';
  }

  function unknownStudentRow(account) {
    return '<article class="account-row">' +
      '<div class="account-main">' + UI.icon('alert', 20) +
        '<div class="account-info"><strong dir="ltr">' + esc(account.username) + '</strong>' +
          '<span class="account-meta">' + esc(t('accounts.studentMissing')) + '</span></div></div>' +
      '<div class="account-side">' + statusBadge(account.status) + accountActions(account) + '</div>' +
    '</article>';
  }

  function suggestedUsername(student) {
    var base = String(student.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!base) base = String(Date.now()).slice(-6);
    return ('student' + base).slice(0, 24);
  }

  function openCreateStudent(student) {
    UI.formDialog({
      title: t('accounts.createStudentTitle') + ' — ' + student.name,
      submitLabel: t('accounts.createSubmit'),
      body:
        '<label class="field"><span>' + esc(t('accounts.username')) + '</span>' +
          '<input class="input" name="username" dir="ltr" autocomplete="off" spellcheck="false" required value="' + esc(suggestedUsername(student)) + '">' +
          '<span class="hint">' + esc(t('accounts.usernameHint')) + '</span></label>',
      onSubmit: function (fd) {
        var username = String(fd.get('username') || '').trim().toLowerCase();
        if (!username) throw userError(t('accounts.usernameRequired'));
        return apiCall('teacherCreateStudentAccount', { username: username, studentId: student.id }).catch(function (err) {
          throw userError(errText(err));
        });
      }
    }).then(function (result) {
      if (!result || !result.account) return;
      updateAccount(studentState, result.account);
      UI.toast(t('accounts.created'), 'success');
      App.rerender();
      secretDialog(t('accounts.passwordTitle'), result.account.username, result.password);
    });
  }

  function resetPassword(account) {
    UI.confirm({
      title: t('accounts.resetPassword'),
      message: t('accounts.confirmReset', { username: account.username }),
      confirmLabel: t('common.confirm')
    }).then(function (ok) {
      if (!ok) return;
      return apiCall('teacherResetStudentPassword', { accountId: account.id }).then(function (result) {
        if (!result || !result.account) return;
        updateAccount(studentState, result.account);
        UI.toast(t('accounts.passwordReset'), 'success');
        App.rerender();
        secretDialog(t('accounts.passwordTitle'), result.account.username, result.password);
      }).catch(function (err) {
        UI.toast(errText(err), 'error');
      });
    });
  }

  function setStatus(account, status) {
    if (status === 'disabled') {
      UI.confirm({
        title: t('accounts.disable'),
        message: t('accounts.confirmDisable', { username: account.username }),
        confirmLabel: t('accounts.disable'),
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        return apiCall('teacherSetStudentAccountStatus', { accountId: account.id, status: status }).then(function (result) {
          if (result && result.account) updateAccount(studentState, result.account);
          UI.toast(t('accounts.statusChanged'), 'success');
          App.rerender();
        }).catch(function (err) {
          UI.toast(errText(err), 'error');
        });
      });
      return;
    }
    apiCall('teacherSetStudentAccountStatus', { accountId: account.id, status: status }).then(function (result) {
      if (result && result.account) updateAccount(studentState, result.account);
      UI.toast(t('accounts.statusChanged'), 'success');
      App.rerender();
    }).catch(function (err) {
      UI.toast(errText(err), 'error');
    });
  }

  function openCreateTeacher() {
    UI.formDialog({
      title: t('accounts.createTeacherTitle'),
      submitLabel: t('accounts.createSubmit'),
      body:
        '<label class="field"><span>' + esc(t('accounts.username')) + '</span>' +
          '<input class="input" name="username" dir="ltr" autocomplete="off" spellcheck="false" required>' +
          '<span class="hint">' + esc(t('accounts.usernameHint')) + '</span></label>' +
        '<label class="field"><span>' + esc(t('accounts.displayName')) + '</span>' +
          '<input class="input" name="displayName" autocomplete="off">' +
          '<span class="hint">' + esc(t('accounts.displayNameHint')) + '</span></label>',
      onSubmit: function (fd) {
        var username = String(fd.get('username') || '').trim().toLowerCase();
        var displayName = String(fd.get('displayName') || '').trim();
        if (!username) throw userError(t('accounts.usernameRequired'));
        return apiCall('adminCreateTeacher', { username: username, displayName: displayName }).catch(function (err) {
          throw userError(errText(err));
        });
      }
    }).then(function (result) {
      if (!result || !result.account) return;
      updateTeacher(teacherState, result.account);
      UI.toast(t('accounts.created'), 'success');
      App.rerender();
      secretDialog(t('accounts.passwordTitle'), result.account.username, result.password);
    });
  }

  function resetTeacherPassword(account) {
    UI.confirm({
      title: t('accounts.resetPassword'),
      message: t('accounts.confirmReset', { username: account.username }),
      confirmLabel: t('common.confirm')
    }).then(function (ok) {
      if (!ok) return;
      return apiCall('adminResetTeacherPassword', { accountId: account.id }).then(function (result) {
        if (!result || !result.account) return;
        updateTeacher(teacherState, result.account);
        UI.toast(t('accounts.passwordReset'), 'success');
        App.rerender();
        secretDialog(t('accounts.passwordTitle'), result.account.username, result.password);
      }).catch(function (err) {
        UI.toast(errText(err), 'error');
      });
    });
  }

  function setTeacherStatus(account, status) {
    if (status === 'disabled') {
      UI.confirm({
        title: t('accounts.disable'),
        message: t('accounts.confirmDisable', { username: account.username }),
        confirmLabel: t('accounts.disable'),
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        return apiCall('adminSetTeacherStatus', { accountId: account.id, status: status }).then(function (result) {
          if (result && result.account) updateTeacher(teacherState, result.account);
          UI.toast(t('accounts.statusChanged'), 'success');
          App.rerender();
        }).catch(function (err) {
          UI.toast(errText(err), 'error');
        });
      });
      return;
    }
    apiCall('adminSetTeacherStatus', { accountId: account.id, status: status }).then(function (result) {
      if (result && result.account) updateTeacher(teacherState, result.account);
      UI.toast(t('accounts.statusChanged'), 'success');
      App.rerender();
    }).catch(function (err) {
      UI.toast(errText(err), 'error');
    });
  }

  function bindStudentActions(view) {
    view.querySelectorAll('[data-create]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var student = App.getStudent(btn.getAttribute('data-create'));
        if (student) openCreateStudent(student);
      });
    });
    view.querySelectorAll('[data-reset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var account = accountById(studentState.accounts, btn.getAttribute('data-reset'));
        if (account) resetPassword(account);
      });
    });
    view.querySelectorAll('[data-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var account = accountById(studentState.accounts, btn.getAttribute('data-toggle'));
        if (account) setStatus(account, btn.getAttribute('data-status'));
      });
    });
    view.querySelectorAll('[data-share]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var account = accountById(studentState.accounts, btn.getAttribute('data-share'));
        if (account) secretDialog(t('accounts.shareLabel'), account.username, '');
      });
    });
    var retry = view.querySelector('[data-retry-accounts]');
    if (retry) retry.addEventListener('click', function () { loadStudents(true); });
  }

  Pages.accounts = function (params, query) {
    if (!canManage()) {
      return { title: t('accounts.title'), back: '#/settings', nav: 'more', content: noAuthCard() };
    }
    var focusId = query && query.get ? query.get('student') : null;
    loadStudents(false);
    var students = App.data ? App.data.students.slice() : [];
    var accounts = studentState.accounts;
    var rows = [];
    var shown = {};
    if (focusId) {
      students.sort(function (a, b) {
        if (a.id === focusId) return -1;
        if (b.id === focusId) return 1;
        return 0;
      });
    }
    students.forEach(function (student) {
      var account = accounts.find(function (a) { return a.studentId === student.id; }) || null;
      if (account) shown[account.id] = true;
      rows.push(studentRow(student, account, student.id === focusId));
    });
    accounts.forEach(function (account) {
      if (!shown[account.id]) rows.push(unknownStudentRow(account));
    });
    var content = '<div class="page">' +
      pageHead(t('accounts.title'), t('accounts.subtitle')) +
      (studentState.error ? errorCard(studentState.error, 'data-retry-accounts') :
        !studentState.loaded ? loadingCard() :
        rows.length ? '<div class="account-list">' + rows.join('') + '</div>' :
        '<section class="card">' + UI.emptyState('users', t('accounts.title'), t('accounts.noStudents'), '') + '</section>') +
    '</div>';
    return {
      title: t('accounts.title'),
      back: '#/settings',
      nav: 'more',
      content: content,
      onMount: bindStudentActions
    };
  };

  function teacherRow(account) {
    return '<article class="account-row">' +
      '<div class="account-main">' +
        UI.avatar(account.displayName || account.username) +
        '<div class="account-info"><strong>' + esc(account.displayName || account.username) + '</strong>' +
          '<span class="account-username" dir="ltr">' + esc(account.username) + '</span>' +
          '<span class="account-meta">' + esc(t('accounts.studentAccounts', { count: Fmt.formatNumber(account.studentAccountCount || 0, I18n.lang) })) + '</span>' +
          '<span class="account-meta">' + esc(t('accounts.teacherLastSync', { date: account.lastSyncAt ? date(account.lastSyncAt) : t('accounts.never') })) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="account-side">' + statusBadge(account.status) +
        '<div class="account-actions">' +
          '<button type="button" class="btn ghost btn-sm" data-teacher-reset="' + esc(account.id) + '">' +
            UI.icon('refresh', 16) + ' ' + esc(t('accounts.resetPassword')) + '</button>' +
          '<button type="button" class="btn ghost btn-sm" data-teacher-toggle="' + esc(account.id) + '" data-status="' +
            (account.status === 'active' ? 'disabled' : 'active') + '">' +
            UI.icon(account.status === 'active' ? 'lock' : 'unlock', 16) + ' ' +
            esc(account.status === 'active' ? t('accounts.disable') : t('accounts.enable')) + '</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function bindTeacherActions(view) {
    view.querySelectorAll('[data-teacher-reset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var account = accountById(teacherState.teachers, btn.getAttribute('data-teacher-reset'));
        if (account) resetTeacherPassword(account);
      });
    });
    view.querySelectorAll('[data-teacher-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var account = accountById(teacherState.teachers, btn.getAttribute('data-teacher-toggle'));
        if (account) setTeacherStatus(account, btn.getAttribute('data-status'));
      });
    });
    var create = view.querySelector('[data-create-teacher]');
    if (create) create.addEventListener('click', function () { openCreateTeacher(); });
    var retry = view.querySelector('[data-retry-teachers]');
    if (retry) retry.addEventListener('click', function () { loadTeachers(true); });
  }

  Pages.admin = function () {
    if (!isOwner()) {
      return { title: t('accounts.teacherTitle'), back: '#/settings', nav: 'more', content: forbiddenCard() };
    }
    loadTeachers(false);
    var content = '<div class="page">' +
      pageHead(t('accounts.teacherTitle'), t('accounts.teacherSubtitle')) +
      '<div class="settings-actions"><button type="button" class="btn primary" data-create-teacher>' +
        UI.icon('plus', 17) + ' ' + esc(t('accounts.create')) + '</button></div>' +
      (teacherState.error ? errorCard(teacherState.error, 'data-retry-teachers') :
        !teacherState.loaded ? loadingCard() :
        teacherState.teachers.length ? '<div class="account-list">' + teacherState.teachers.map(teacherRow).join('') + '</div>' :
        '<section class="card">' + UI.emptyState('users', t('accounts.teacherTitle'), t('accounts.noTeachers'), '') + '</section>') +
    '</div>';
    return {
      title: t('accounts.teacherTitle'),
      back: '#/settings',
      nav: 'more',
      content: content,
      onMount: bindTeacherActions
    };
  };

  window.Accounts = {
    reset: function () {
      studentState = { loading: false, loaded: false, error: null, accounts: [] };
      teacherState = { loading: false, loaded: false, error: null, teachers: [] };
    }
  };
})();
