/* pages-classes.js — class list, class form and class detail. */
(function () {
  'use strict';

  var Pages = window.Pages = window.Pages || {};

  function t(key, vars) { return I18n.t(key, vars); }
  function esc(value) { return UI.escapeHtml(value); }
  function money(value) { return Fmt.formatMoney(value, I18n.lang); }
  function date(iso, style) { return iso ? Fmt.formatDate(iso, I18n.lang, style) : '—'; }
  function today() { return Jalali.todayISO(); }

  function typeLabel(type) {
    return t(type === 'group' ? 'type.group' : 'type.semi');
  }

  function modelLabel(model) {
    return t('model.' + (model === 'session' || model === 'month' ? model : 'term'));
  }

  function scheduleText(cls, short) {
    var schedule = Array.isArray(cls.schedule) ? cls.schedule : [];
    if (!schedule.length) return t('classes.noSchedule');
    return schedule.slice().sort(function (a, b) {
      return Number(a.day) - Number(b.day) || String(a.time || '').localeCompare(String(b.time || ''));
    }).map(function (item) {
      var day = Fmt.weekdayName(item.day, I18n.lang, !!short);
      return day + (item.time ? ' ' + Fmt.formatTime(item.time, I18n.lang) : '');
    }).join(' · ');
  }

  function classSearchText(cls) {
    return App.normalizeSearch([cls.name, cls.level, typeLabel(cls.type), scheduleText(cls, true)].join(' '));
  }

  function classFee(cls) {
    return Billing.classFeeAt(cls, today());
  }

  function currentShare(cls) {
    return Billing.classShareAt(cls, App.data.enrollments, today());
  }

  function activeCount(cls) {
    return Billing.activeCountAt(App.data.enrollments, cls.id, today());
  }

  function allEnrollments(cls) {
    return App.data.enrollments.filter(function (e) { return e.classId === cls.id; });
  }

  function enrollmentsSorted(cls) {
    return allEnrollments(cls).slice().sort(function (a, b) {
      var aActive = Billing.isEnrolled(a, today()) ? 0 : 1;
      var bActive = Billing.isEnrolled(b, today()) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return String(a.startDate).localeCompare(String(b.startDate));
    });
  }

  function dayOptions(selected) {
    var out = '';
    for (var i = 0; i < 7; i++) {
      out += '<option value="' + i + '"' + (Number(selected) === i ? ' selected' : '') + '>' + esc(Fmt.weekdayName(i, I18n.lang, false)) + '</option>';
    }
    return out;
  }

  function scheduleRow(item) {
    return '<div class="schedule-row" data-schedule-row>' +
      '<select class="input" name="scheduleDay" aria-label="' + esc(t('classes.day')) + '">' + dayOptions(item ? item.day : Jalali.weekdaySat0(today())) + '</select>' +
      '<input type="time" class="input" name="scheduleTime" aria-label="' + esc(t('classes.time')) + '" value="' + esc(item && item.time ? item.time : '') + '">' +
      '<button type="button" class="icon-btn danger-text" data-remove-schedule aria-label="' + esc(t('classes.removeSchedule')) + '">' + UI.icon('trash', 18) + '</button>' +
    '</div>';
  }

  Pages.classesList = function () {
    var filter = App.classFilter || 'active';
    var search = App.classSearch || '';
    var all = App.data.classes.slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'fa');
    });
    var classes = all.filter(function (c) {
      if (filter === 'active') return !c.archived;
      if (filter === 'archived') return !!c.archived;
      return true;
    });
    var cards = classes.map(function (cls) {
      var count = activeCount(cls);
      var share = count ? currentShare(cls) : 0;
      return '<button type="button" class="class-card' + (cls.archived ? ' is-archived' : '') + '" data-class="' + esc(cls.id) + '" data-search="' + esc(classSearchText(cls)) + '">' +
        '<div class="class-card-top">' +
          '<div class="class-card-title"><h3>' + esc(cls.name) + '</h3>' +
            '<p>' + esc(scheduleText(cls, true)) + '</p></div>' +
          '<div class="class-badges">' + UI.badge(typeLabel(cls.type), cls.type === 'group' ? 'violet' : 'amber') +
            (cls.archived ? UI.badge(t('classes.archivedBadge'), 'neutral') : '') + '</div>' +
        '</div>' +
        '<div class="class-card-meta">' +
          '<span>' + UI.icon('users', 15) + ' ' + esc(t('classes.studentsCount', { count: Fmt.formatNumber(count, I18n.lang) })) + '</span>' +
          '<span>' + UI.icon('wallet', 15) + ' ' + esc(t('classes.currentShare')) + ': ' + esc(share ? money(share) : '—') + '</span>' +
          '<span>' + UI.icon('term', 15) + ' ' + esc(modelLabel(cls.priceModel)) + '</span>' +
        '</div>' +
      '</button>';
    }).join('');
    var noClasses = all.length === 0;
    var empty = noClasses
      ? UI.emptyState('class', t('classes.title'), t('classes.noClassesHint'),
          '<button type="button" class="btn primary" data-add>' + UI.icon('plus', 18) + ' ' + esc(t('classes.add')) + '</button>')
      : UI.emptyState('search', t('common.noResults'), t('students.noResultsHint'), '');

    return {
      title: t('classes.title'),
      back: '#/more',
      nav: 'more',
      content: '<div class="page">' +
        '<div class="page-head"><div><h2 class="page-title">' + esc(t('classes.title')) + '</h2>' +
          '<p class="page-sub">' + esc(Fmt.formatNumber(classes.length, I18n.lang) + ' ' + t('unit.classes')) + '</p></div>' +
          '<button type="button" class="btn primary btn-sm" data-add>' + UI.icon('plus', 18) + ' ' + esc(t('classes.add')) + '</button></div>' +
        '<div class="search-bar">' + UI.icon('search', 19) +
          '<input type="search" class="search-input" data-class-search placeholder="' + esc(t('common.search')) + '…" value="' + esc(search) + '" autocomplete="off">' +
        '</div>' +
        '<div class="chips" role="group">' +
          '<button type="button" class="chip' + (filter === 'all' ? ' is-active' : '') + '" data-filter="all">' + esc(t('common.all')) + '</button>' +
          '<button type="button" class="chip' + (filter === 'active' ? ' is-active' : '') + '" data-filter="active">' + esc(t('common.active')) + '</button>' +
          '<button type="button" class="chip' + (filter === 'archived' ? ' is-active' : '') + '" data-filter="archived">' + esc(t('common.archived')) + '</button>' +
        '</div>' +
        '<div class="class-list" data-class-list>' + cards + '</div>' +
        '<div class="search-empty" data-search-empty hidden>' + empty + '</div>' +
        (cards ? '' : '<div class="list-empty">' + empty + '</div>') +
      '</div>',
      onMount: function (view) {
        var input = view.querySelector('[data-class-search]');
        var list = view.querySelector('[data-class-list]');
        var searchEmpty = view.querySelector('[data-search-empty]');
        var listEmpty = view.querySelector('.list-empty');
        function applySearch() {
          var q = App.normalizeSearch(input.value);
          App.classSearch = input.value;
          var visible = 0;
          list.querySelectorAll('[data-class]').forEach(function (row) {
            var match = !q || (row.getAttribute('data-search') || '').indexOf(q) >= 0;
            row.hidden = !match;
            if (match) visible++;
          });
          if (listEmpty) listEmpty.hidden = !!q;
          searchEmpty.hidden = !q || visible > 0;
        }
        if (input) {
          input.addEventListener('input', applySearch);
          if (search) {
            input.focus();
            var len = input.value.length;
            try { input.setSelectionRange(len, len); } catch (_) {}
            applySearch();
          }
        }
        view.querySelectorAll('[data-add]').forEach(function (b) {
          b.addEventListener('click', function () { App.navigate('#/classes/new'); });
        });
        view.querySelectorAll('[data-filter]').forEach(function (b) {
          b.addEventListener('click', function () {
            App.classFilter = b.getAttribute('data-filter');
            App.rerender();
          });
        });
        list.querySelectorAll('[data-class]').forEach(function (row) {
          row.addEventListener('click', function () { App.navigate('#/classes/' + encodeURIComponent(row.getAttribute('data-class'))); });
        });
      }
    };
  };

  Pages.classForm = function (params) {
    var isNew = params.mode === 'new';
    var cls = isNew ? null : App.getClass(params.id);
    if (!isNew && !cls) {
      return {
        title: t('common.notFound'),
        back: '#/classes',
        nav: 'more',
        content: '<div class="page">' + UI.emptyState('alert', t('common.notFound'), t('error.notFound'), '') + '</div>'
      };
    }
    var todayIso = today();
    var hasSessions = cls ? App.data.sessions.some(function (s) { return s.ownerType === 'class' && s.classId === cls.id; }) : false;
    var model = cls ? (cls.priceModel || 'term') : 'term';
    var fee = cls ? Billing.classFeeAt(cls, todayIso) : null;
    var schedule = cls && Array.isArray(cls.schedule) ? cls.schedule : [];
    var scheduleHtml = schedule.length ? schedule.map(scheduleRow).join('') : '';
    var type = cls ? cls.type : 'semi';
    var hintKey = model === 'session' ? 'classes.feeHintSession' : model === 'month' ? 'classes.feeHintMonth' : 'classes.feeHintTerm';

    var content =
      '<div class="page">' +
        '<form class="page-form" novalidate data-class-form>' +
          '<section class="card form-section">' +
            '<h2 class="section-title">' + esc(t('classes.details')) + '</h2>' +
            '<label class="field"><span>' + esc(t('classes.name')) + ' <em>*</em></span>' +
              '<input class="input" name="name" required value="' + esc(cls ? cls.name : '') + '" placeholder="' + esc(t('classes.namePlaceholder')) + '"></label>' +
            '<div class="field-grid">' +
              '<label class="field"><span>' + esc(t('classes.level')) + '</span>' +
                '<input class="input" name="level" value="' + esc(cls ? cls.level : '') + '" placeholder="' + esc(t('classes.levelPlaceholder')) + '"></label>' +
              '<label class="field"><span>' + esc(t('classes.type')) + '</span>' +
                '<select class="input" name="type">' +
                  '<option value="semi"' + (type === 'semi' ? ' selected' : '') + '>' + esc(t('classes.typeSemi')) + '</option>' +
                  '<option value="group"' + (type === 'group' ? ' selected' : '') + '>' + esc(t('classes.typeGroup')) + '</option>' +
                '</select></label>' +
            '</div>' +
          '</section>' +

          '<section class="card form-section">' +
            '<div class="section-head"><h2 class="section-title">' + esc(t('classes.schedule')) + '</h2>' +
              '<button type="button" class="btn ghost btn-sm" data-add-schedule>' + UI.icon('plus', 16) + ' ' + esc(t('classes.addSchedule')) + '</button></div>' +
            '<p class="hint">' + esc(t('classes.scheduleHint')) + '</p>' +
            '<div class="schedule-list" data-schedule-list>' + scheduleHtml + '</div>' +
          '</section>' +

          '<section class="card form-section">' +
            '<h2 class="section-title">' + esc(t('classes.model')) + '</h2>' +
            '<label class="field"><span>' + esc(t('classes.priceModel')) + '</span>' +
              '<select class="input" name="priceModel"' + (hasSessions ? ' disabled' : '') + '>' +
                '<option value="term"' + (model === 'term' ? ' selected' : '') + '>' + esc(t('model.term')) + '</option>' +
                '<option value="session"' + (model === 'session' ? ' selected' : '') + '>' + esc(t('model.session')) + '</option>' +
                '<option value="month"' + (model === 'month' ? ' selected' : '') + '>' + esc(t('model.month')) + '</option>' +
              '</select></label>' +
            (hasSessions ? '<p class="hint hint-warn">' + esc(t('classes.modelLocked')) + '</p>' : '') +
            '<label class="field"><span>' + esc(t('classes.totalFee')) + ' <em>*</em></span>' +
              '<input class="input money-input" name="totalFee" data-money inputmode="numeric" dir="ltr" value="' + (fee === null ? '' : esc(Fmt.formatNumber(fee, I18n.lang))) + '" placeholder="' + esc(t('money.amountPlaceholder')) + '"></label>' +
            '<p class="hint" data-model-hint>' + esc(t(hintKey)) + '</p>' +
            (cls ? '<div class="field"><span>' + esc(t('classes.feeFrom')) + '</span>' +
              '<input type="hidden" name="feeFrom" value="' + esc(todayIso) + '">' +
              '<button type="button" class="input date-field" data-date-input="feeFrom">' + esc(date(todayIso)) + '</button>' +
              '<p class="hint">' + esc(t('classes.feeFromHint')) + '</p></div>' : '') +
          '</section>' +

          '<p class="form-error" role="alert" hidden></p>' +
          '<div class="sticky-actions">' +
            '<button type="button" class="btn ghost" data-cancel>' + esc(t('common.cancel')) + '</button>' +
            '<button type="submit" class="btn primary">' + esc(t('common.save')) + '</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    return {
      title: isNew ? t('classes.add') : t('classes.edit'),
      back: isNew ? '#/classes' : '#/classes/' + encodeURIComponent(params.id),
      nav: 'more',
      content: content,
      onMount: function (view) {
        var form = view.querySelector('[data-class-form]');
        var list = form.querySelector('[data-schedule-list]');
        var errorEl = form.querySelector('.form-error');
        var submitBtn = form.querySelector('button[type="submit"]');
        var modelSel = form.querySelector('[name="priceModel"]');
        var hint = form.querySelector('[data-model-hint]');
        UI.bindDateFields(form);
        UI.bindMoneyFields(form);

        function updateHint() {
          var m = modelSel.value;
          hint.textContent = t(m === 'session' ? 'classes.feeHintSession' : m === 'month' ? 'classes.feeHintMonth' : 'classes.feeHintTerm');
        }
        if (!hasSessions) modelSel.addEventListener('change', updateHint);
        form.querySelector('[data-add-schedule]').addEventListener('click', function () {
          list.insertAdjacentHTML('beforeend', scheduleRow(null));
        });
        list.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-remove-schedule]');
          if (!btn) return;
          var row = btn.closest('[data-schedule-row]');
          if (row) row.remove();
        });
        form.querySelector('[data-cancel]').addEventListener('click', function () {
          App.navigate(isNew ? '#/classes' : '#/classes/' + encodeURIComponent(params.id));
        });
        form.addEventListener('submit', async function (e) {
          e.preventDefault();
          errorEl.hidden = true;
          var fd = new FormData(form);
          var name = String(fd.get('name') || '').trim();
          if (!name) {
            errorEl.textContent = t('validation.nameRequired');
            errorEl.hidden = false;
            return;
          }
          var totalFee = Fmt.parseAmount(fd.get('totalFee'));
          if (totalFee === null || totalFee < 0) {
            errorEl.textContent = t('validation.invalidAmount');
            errorEl.hidden = false;
            return;
          }
          var chosenModel = String(fd.get('priceModel') || (cls ? cls.priceModel : 'term'));
          if (hasSessions && cls) chosenModel = cls.priceModel;
          if (['term', 'session', 'month'].indexOf(chosenModel) < 0) chosenModel = 'term';
          var nextSchedule = [];
          list.querySelectorAll('[data-schedule-row]').forEach(function (row) {
            var day = Number(row.querySelector('[name="scheduleDay"]').value);
            var time = row.querySelector('[name="scheduleTime"]').value;
            if (day >= 0 && day <= 6) nextSchedule.push({ day: day, time: time || '' });
          });
          nextSchedule.sort(function (a, b) { return a.day - b.day || a.time.localeCompare(b.time); });
          var feeFrom = String(fd.get('feeFrom') || todayIso);
          if (!Jalali.isValidISO(feeFrom)) feeFrom = todayIso;

          var next = Object.assign({}, cls || {}, {
            id: cls ? cls.id : DB.uid(),
            name: name,
            level: String(fd.get('level') || '').trim(),
            type: String(fd.get('type') || 'semi') === 'group' ? 'group' : 'semi',
            schedule: nextSchedule,
            priceModel: chosenModel,
            totalFee: totalFee,
            termSize: 10,
            archived: cls ? !!cls.archived : false,
            createdAt: cls && cls.createdAt ? cls.createdAt : DB.now(),
            updatedAt: DB.now()
          });
          if (cls) {
            var history = Array.isArray(cls.feeHistory) ? cls.feeHistory.slice() : [];
            var oldFee = Billing.classFeeAt(cls, todayIso);
            if (totalFee !== oldFee) history.push({ effectiveFrom: feeFrom, totalFee: totalFee });
            next.feeHistory = history;
          } else {
            next.feeHistory = [{ effectiveFrom: '2000-01-01', totalFee: totalFee }];
          }
          submitBtn.disabled = true;
          try {
            await DB.put('classes', next);
            await App.reloadData();
            UI.toast(cls ? t('classes.updated') : t('classes.created'), 'success');
            App.navigate('#/classes/' + encodeURIComponent(next.id));
          } catch (err) {
            errorEl.textContent = err && err.userMessage ? err.userMessage : t('error.generic');
            errorEl.hidden = false;
            submitBtn.disabled = false;
          }
        });
      }
    };
  };

  function classHero(cls) {
    var count = activeCount(cls);
    var share = count ? currentShare(cls) : 0;
    return '<section class="class-hero">' +
      '<div class="class-hero-top">' +
        '<div><p class="eyebrow">' + esc(typeLabel(cls.type)) + '</p><h2>' + esc(cls.name) + '</h2>' +
          (cls.level ? '<p class="muted">' + esc(cls.level) + '</p>' : '') + '</div>' +
        '<div class="class-badges">' + (cls.archived ? UI.badge(t('classes.archivedBadge'), 'neutral') : UI.badge(t('common.active'), 'success')) + '</div>' +
      '</div>' +
      '<div class="class-hero-stats">' +
        '<div><strong>' + esc(Fmt.formatNumber(count, I18n.lang)) + '</strong><span>' + esc(t('common.active')) + '</span></div>' +
        '<div><strong>' + esc(share ? money(share) : '—') + '</strong><span>' + esc(t('classes.currentShare')) + '</span></div>' +
        '<div><strong>' + esc(money(classFee(cls))) + '</strong><span>' + esc(t('classes.totalFee')) + '</span></div>' +
      '</div>' +
      '<div class="class-hero-foot">' +
        '<span>' + UI.icon('calendar', 16) + ' ' + esc(scheduleText(cls, false)) + '</span>' +
        '<span>' + UI.icon('term', 16) + ' ' + esc(modelLabel(cls.priceModel)) + '</span>' +
      '</div>' +
      '<div class="hero-actions">' +
        '<button type="button" class="btn light" data-attendance>' + UI.icon('clipboard', 17) + ' ' + esc(t('home.takeAttendance')) + '</button>' +
        '<button type="button" class="btn ghost-light" data-edit>' + UI.icon('edit', 17) + ' ' + esc(t('common.edit')) + '</button>' +
      '</div>' +
    '</section>';
  }

  function rosterSection(cls) {
    var enrollments = enrollmentsSorted(cls);
    var rows = enrollments.map(function (e) {
      var student = App.getStudent(e.studentId);
      if (!student) return '';
      var active = Billing.isEnrolled(e, today());
      return '<div class="roster-row' + (active ? '' : ' is-ended') + '" data-enrollment="' + esc(e.id) + '">' +
        UI.avatar(student.name) +
        '<button type="button" class="row-main row-main-btn" data-student="' + esc(student.id) + '">' +
          '<span class="row-title">' + esc(student.name) + '</span>' +
          '<span class="row-sub">' + esc(t('classes.startDate')) + ': ' + esc(date(e.startDate)) +
            (e.endDate ? ' · ' + esc(t('classes.endDate')) + ': ' + esc(date(e.endDate)) : '') + '</span>' +
        '</button>' +
        '<div class="row-end">' +
          (active ? UI.badge(t('classes.enrollmentActive'), 'success') : UI.badge(t('classes.enrollmentEnded'), 'neutral')) +
          (active ? '<button type="button" class="icon-btn danger-text" data-remove-enrollment="' + esc(e.id) + '" aria-label="' + esc(t('classes.removeFromClass')) + '">' + UI.icon('x', 17) + '</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
    var activeCountNow = enrollments.filter(function (e) { return Billing.isEnrolled(e, today()); }).length;
    return '<section class="card">' +
      '<div class="section-head"><h3>' + esc(t('classes.roster')) + '</h3>' +
        '<button type="button" class="btn primary btn-sm" data-add-student>' + UI.icon('plus', 17) + ' ' + esc(t('classes.addStudent')) + '</button></div>' +
      (rows ? '<div class="roster-list">' + rows + '</div>' : UI.emptyState('users', t('classes.noRoster'), t('classes.noRosterHint'), '')) +
      (activeCountNow === 0 && rows ? '<p class="hint hint-warn">' + esc(t('classes.noActiveStudents')) + '</p>' : '') +
    '</section>';
  }

  function sessionsSection(cls) {
    var sessions = App.data.sessions.filter(function (s) { return s.ownerType === 'class' && s.classId === cls.id; })
      .slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }).slice(0, 12);
    var rows = sessions.map(function (s) {
      var att = App.data.attendance.filter(function (a) { return a.sessionId === s.id; });
      var present = att.filter(function (a) { return a.status === 'present'; }).length;
      var late = att.filter(function (a) { return a.status === 'late'; }).length;
      var absent = att.filter(function (a) { return a.status === 'absent'; }).length;
      var canceled = s.canceled && s.canceled !== 'none';
      var sub = canceled ? (s.canceled === 'counted' ? t('status.counted') : t('status.makeup')) :
        (t('status.present') + ' ' + Fmt.formatNumber(present, I18n.lang) + ' · ' + t('status.late') + ' ' + Fmt.formatNumber(late, I18n.lang) + ' · ' + t('status.absent') + ' ' + Fmt.formatNumber(absent, I18n.lang));
      return '<button type="button" class="mini-row" data-session="' + esc(s.id) + '" data-session-date="' + esc(s.date) + '">' +
        '<span class="mini-icon">' + UI.icon('calendar', 18) + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(date(s.date)) + '</span>' +
          '<span class="row-sub">' + esc(sub) + '</span></span>' +
        (canceled ? UI.badge(s.canceled === 'counted' ? t('status.counted') : t('status.makeup'), s.canceled === 'counted' ? 'amber' : 'neutral') : UI.badge(att.length ? t('home.recorded') : t('home.notRecorded'), att.length ? 'success' : 'neutral')) +
      '</button>';
    }).join('');
    return '<section class="card">' +
      '<div class="section-head"><h3>' + esc(t('classes.sessions')) + '</h3>' +
        '<button type="button" class="btn ghost btn-sm" data-attendance>' + UI.icon('plus', 16) + ' ' + esc(t('home.takeAttendance')) + '</button></div>' +
      (rows ? '<div class="mini-list">' + rows + '</div><p class="hint">' + esc(t('classes.sessionListHint')) + '</p>' : UI.emptyState('clipboard', t('classes.noSessions'), t('classes.sessionListHint'), '')) +
    '</section>';
  }

  function classNotesSection(cls) {
    var notes = App.data.notes.filter(function (n) { return n.classId === cls.id; })
      .slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    var cards = notes.slice(0, 5).map(function (n) {
      return '<article class="note-card note-card-compact" data-note="' + esc(n.id) + '">' +
        '<div class="note-head"><span class="note-date">' + esc(date(n.date)) + '</span>' +
          '<div class="record-actions">' +
            '<button type="button" class="icon-btn" data-edit-note="' + esc(n.id) + '" aria-label="' + esc(t('common.edit')) + '">' + UI.icon('edit', 15) + '</button>' +
            '<button type="button" class="icon-btn danger-text" data-delete-note="' + esc(n.id) + '" aria-label="' + esc(t('common.delete')) + '">' + UI.icon('trash', 15) + '</button>' +
          '</div>' +
        '</div>' +
        (n.title ? '<h3>' + esc(n.title) + '</h3>' : '') +
        '<p>' + esc(n.body) + '</p>' +
      '</article>';
    }).join('');
    return '<section class="card">' +
      '<div class="section-head"><h3>' + esc(t('classes.classNotes')) + '</h3>' +
        '<button type="button" class="btn primary btn-sm" data-add-note>' + UI.icon('plus', 17) + ' ' + esc(t('notes.add')) + '</button></div>' +
      (cards ? '<div class="note-list">' + cards + '</div>' : UI.emptyState('notes', t('notes.noNotes'), t('notes.classNoteHint'), '')) +
    '</section>';
  }

  Pages.classDetail = function (params) {
    var cls = App.getClass(params.id);
    if (!cls) {
      return {
        title: t('common.notFound'),
        back: '#/classes',
        nav: 'more',
        content: '<div class="page">' + UI.emptyState('alert', t('common.notFound'), t('error.notFound'), '') + '</div>'
      };
    }
    var content = '<div class="page">' + classHero(cls) +
      (cls.archived ? '<div class="banner banner-warn">' + UI.icon('archive', 18) + ' ' + esc(t('classes.archivedHint')) + '</div>' : '') +
      rosterSection(cls) +
      sessionsSection(cls) +
      classNotesSection(cls) +
      '<section class="card danger-zone">' +
        '<div class="section-head"><h3>' + esc(t('common.archive')) + '</h3></div>' +
        '<p class="hint">' + esc(t('classes.archiveHint')) + '</p>' +
        '<button type="button" class="btn ghost danger-text" data-archive>' +
          UI.icon(cls.archived ? 'unlock' : 'archive', 17) + ' ' + esc(cls.archived ? t('classes.unarchive') : t('common.archive')) +
        '</button>' +
      '</section>' +
    '</div>';

    return {
      title: cls.name,
      back: '#/classes',
      nav: 'more',
      content: content,
      onMount: function (view) {
        view.querySelectorAll('[data-edit]').forEach(function (b) {
          b.addEventListener('click', function () { App.navigate('#/classes/' + encodeURIComponent(cls.id) + '/edit'); });
        });
        view.querySelectorAll('[data-attendance]').forEach(function (b) {
          b.addEventListener('click', function () { App.openAttendance({ mode: 'class', classId: cls.id, date: today() }); });
        });
        view.querySelectorAll('[data-add-student]').forEach(function (b) {
          b.addEventListener('click', function () { openAddStudentDialog(cls); });
        });
        view.querySelectorAll('[data-student]').forEach(function (b) {
          b.addEventListener('click', function () { App.navigate('#/students/' + encodeURIComponent(b.getAttribute('data-student'))); });
        });
        view.querySelectorAll('[data-remove-enrollment]').forEach(function (b) {
          b.addEventListener('click', function () { removeEnrollment(cls, b.getAttribute('data-remove-enrollment')); });
        });
        view.querySelectorAll('[data-session-date]').forEach(function (b) {
          b.addEventListener('click', function () {
            App.openAttendance({ mode: 'class', classId: cls.id, date: b.getAttribute('data-session-date') });
          });
        });
        view.querySelectorAll('[data-add-note]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.openNoteDialog({ classId: cls.id }); });
        });
        view.querySelectorAll('[data-edit-note]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.openNoteDialog({ noteId: b.getAttribute('data-edit-note') }); });
        });
        view.querySelectorAll('[data-delete-note]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.deleteNote(b.getAttribute('data-delete-note')); });
        });
        var archiveBtn = view.querySelector('[data-archive]');
        if (archiveBtn) archiveBtn.addEventListener('click', function () {
          if (cls.archived) unarchiveClass(cls); else archiveClass(cls);
        });
      }
    };
  };

  function openAddStudentDialog(cls) {
    var todayIso = today();
    var eligible = App.data.students.filter(function (s) {
      if (s.archived) return false;
      return !App.data.enrollments.some(function (e) {
        return e.classId === cls.id && e.studentId === s.id && (!e.endDate || e.endDate >= todayIso);
      });
    }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'fa'); });
    if (!eligible.length) {
      UI.alert({ title: t('classes.addStudent'), message: t('classes.noStudentsToAdd') });
      return;
    }
    var options = eligible.map(function (s) {
      return '<option value="' + esc(s.id) + '">' + esc(s.name) + (s.level ? ' — ' + esc(s.level) : '') + '</option>';
    }).join('');
    UI.formDialog({
      title: t('classes.addStudent'),
      body: '<p class="hint">' + esc(t('classes.addStudentHint')) + '</p>' +
        '<label class="field"><span>' + esc(t('classes.selectStudent')) + '</span><select class="input" name="studentId">' + options + '</select></label>' +
        '<div class="field"><span>' + esc(t('classes.startDate')) + '</span>' +
          '<input type="hidden" name="startDate" value="' + esc(todayIso) + '">' +
          '<button type="button" class="input date-field" data-date-input="startDate">' + esc(date(todayIso)) + '</button></div>',
      submitLabel: t('common.add'),
      onSubmit: async function (fd) {
        var studentId = String(fd.get('studentId') || '');
        var startDate = String(fd.get('startDate') || '');
        if (!studentId) throw userError(t('validation.selectStudent'));
        if (!Jalali.isValidISO(startDate)) throw userError(t('validation.invalidDate'));
        var overlap = App.data.enrollments.some(function (e) {
          return e.classId === cls.id && e.studentId === studentId && (!e.endDate || e.endDate >= startDate);
        });
        if (overlap) throw userError(t('classes.studentAlreadyIn'));
        var rec = {
          id: DB.uid(),
          classId: cls.id,
          studentId: studentId,
          startDate: startDate,
          endDate: null,
          createdAt: DB.now(),
          updatedAt: DB.now()
        };
        await DB.put('enrollments', rec);
        await App.reloadData();
        UI.toast(t('toast.saved'), 'success');
        App.rerender();
        return true;
      }
    });
  }

  async function removeEnrollment(cls, enrollmentId) {
    var e = App.data.enrollments.find(function (x) { return x.id === enrollmentId; });
    if (!e) return;
    var ok = await UI.confirm({
      title: t('classes.removeFromClass'),
      message: t('classes.removeConfirm') + '\n\n' + t('classes.removeHint'),
      confirmLabel: t('classes.removeFromClass'),
      danger: true
    });
    if (!ok) return;
    if (e.startDate > today()) {
      await DB.remove('enrollments', e.id);
    } else {
      await DB.put('enrollments', Object.assign({}, e, {
        endDate: !e.endDate || e.endDate > today() ? today() : e.endDate,
        updatedAt: DB.now()
      }));
    }
    await App.reloadData();
    UI.toast(t('toast.saved'), 'success');
    App.rerender();
  }

  async function archiveClass(cls) {
    var ok = await UI.confirm({
      title: t('classes.archiveConfirm'),
      message: t('classes.archiveConfirm') + '\n\n' + t('classes.archiveHint'),
      confirmLabel: t('common.archive'),
      danger: true
    });
    if (!ok) return;
    var todayIso = today();
    await DB.put('classes', Object.assign({}, cls, { archived: true, archivedAt: DB.now(), updatedAt: DB.now() }));
    var enrollments = App.data.enrollments.filter(function (e) { return e.classId === cls.id; });
    for (var i = 0; i < enrollments.length; i++) {
      var e = enrollments[i];
      if (Billing.isEnrolled(e, todayIso)) {
        await DB.put('enrollments', Object.assign({}, e, {
          endDate: !e.endDate || e.endDate > todayIso ? todayIso : e.endDate,
          updatedAt: DB.now()
        }));
      }
    }
    await App.reloadData();
    UI.toast(t('toast.archived'), 'success');
    App.rerender();
  }

  async function unarchiveClass(cls) {
    await DB.put('classes', Object.assign({}, cls, { archived: false, archivedAt: null, updatedAt: DB.now() }));
    await App.reloadData();
    UI.toast(t('toast.unarchived'), 'success');
    App.rerender();
  }

  function userError(message) {
    var e = new Error(message);
    e.userMessage = message;
    return e;
  }
})();
