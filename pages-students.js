/* pages-students.js — student list, profile, grades and lesson notes. */
(function () {
  'use strict';

  var Pages = window.Pages = window.Pages || {};

  function t(key, vars) { return I18n.t(key, vars); }
  function esc(value) { return UI.escapeHtml(value); }
  function money(value) { return Fmt.formatMoney(value, I18n.lang); }
  function date(iso, style) { return iso ? Fmt.formatDate(iso, I18n.lang, style) : '—'; }
  function today() { return Jalali.todayISO(); }

  function summaryOf(id) {
    return App.billing && App.billing.byId ? App.billing.byId[id] : null;
  }

  function typeLabel(type) {
    return t('type.' + (type === 'semi' || type === 'group' ? type : 'private'));
  }

  function modelLabel(model) {
    return t('model.' + (model === 'session' || model === 'month' ? model : 'term'));
  }

  function balanceBadge(summary) {
    if (!summary || summary.balance === 0) return UI.badge(t('status.paid'), 'success');
    if (summary.balance > 0) return UI.badge(t('status.owes'), 'danger');
    return UI.badge(t('status.credit'), 'info');
  }

  function typeBadge(type) {
    return UI.badge(typeLabel(type), type === 'private' ? 'teal' : type === 'semi' ? 'amber' : 'violet');
  }

  function planName(plan) {
    if (!plan) return '';
    if (plan.type === 'private') return t('money.privatePlan');
    return plan.name || t('money.classPlan', { name: '' });
  }

  function noteTarget(note) {
    if (note.classId) {
      var cls = App.getClass(note.classId);
      return cls ? cls.name : t('notes.class');
    }
    var student = App.getStudent(note.studentId);
    return student ? student.name : t('notes.privateStudent');
  }

  function noteTargetIcon(note) {
    return note.classId ? 'class' : 'user';
  }

  function noteVisibilityBadge(note) {
    return note.visibleToStudent
      ? UI.badge(t('cloud.visibleBadge'), 'teal')
      : UI.badge(t('cloud.privateNote'), 'neutral');
  }

  function sortNotes(notes) {
    return notes.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }

  function studentSearchText(student) {
    return App.normalizeSearch([
      student.name,
      student.phone,
      student.level,
      typeLabel(student.type)
    ].join(' '));
  }

  function paymentStatusText(summary) {
    if (!summary || summary.balance === 0) return t('money.paidUp');
    return summary.balance > 0 ? t('money.owesAmount') : t('money.creditAmount');
  }

  function paymentStatusClass(summary) {
    if (!summary || summary.balance === 0) return 'paid';
    return summary.balance > 0 ? 'owes' : 'credit';
  }

  Pages.studentsList = function () {
    var filter = App.studentFilter || 'active';
    var search = App.studentSearch || '';
    var all = App.data.students.slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'fa');
    });
    var students = all.filter(function (s) {
      if (filter === 'active') return !s.archived;
      if (filter === 'archived') return !!s.archived;
      return true;
    });
    var rows = students.map(function (student) {
      var summary = summaryOf(student.id);
      var sub = [];
      if (student.phone) sub.push(Fmt.formatPhone(student.phone, I18n.lang));
      if (student.level) sub.push(esc(student.level));
      if (!sub.length) sub.push(typeLabel(student.type));
      return '<button type="button" class="list-row' + (student.archived ? ' is-archived' : '') + '" data-student="' + esc(student.id) + '" data-search="' + esc(studentSearchText(student)) + '">' +
        UI.avatar(student.name) +
        '<span class="row-main">' +
          '<span class="row-title">' + esc(student.name) + (student.archived ? ' ' + UI.badge(t('students.archivedBadge'), 'neutral') : '') + '</span>' +
          '<span class="row-sub">' + sub.join(' · ') + '</span>' +
        '</span>' +
        '<span class="row-end">' +
          balanceBadge(summary) +
          UI.icon('chevron-left', 18, 'row-chevron') +
        '</span>' +
      '</button>';
    }).join('');

    var noStudents = all.length === 0;
    var empty = noStudents
      ? UI.emptyState('users', t('students.noStudents'), t('students.noStudentsHint'),
          '<button type="button" class="btn primary" data-add>' + UI.icon('plus', 18) + ' ' + esc(t('students.add')) + '</button>')
      : UI.emptyState('search', t('students.noResults'), t('students.noResultsHint'), '');

    var content =
      '<div class="page">' +
        '<div class="page-head">' +
          '<div><h2 class="page-title">' + esc(t('students.title')) + '</h2>' +
          '<p class="page-sub" data-list-count>' + esc(t('classes.studentsCount', { count: Fmt.formatNumber(students.length, I18n.lang) })) + '</p></div>' +
          '<button type="button" class="btn primary btn-sm" data-add>' + UI.icon('plus', 18) + ' ' + esc(t('students.add')) + '</button>' +
        '</div>' +
        '<div class="search-bar">' + UI.icon('search', 19) +
          '<input type="search" class="search-input" data-student-search placeholder="' + esc(t('students.search')) + '" value="' + esc(search) + '" autocomplete="off">' +
        '</div>' +
        '<div class="chips" role="group">' +
          '<button type="button" class="chip' + (filter === 'all' ? ' is-active' : '') + '" data-filter="all">' + esc(t('students.filterAll')) + '</button>' +
          '<button type="button" class="chip' + (filter === 'active' ? ' is-active' : '') + '" data-filter="active">' + esc(t('students.filterActive')) + '</button>' +
          '<button type="button" class="chip' + (filter === 'archived' ? ' is-active' : '') + '" data-filter="archived">' + esc(t('students.filterArchived')) + '</button>' +
        '</div>' +
        '<div class="list" data-student-list>' + rows + '</div>' +
        '<div class="search-empty" data-search-empty hidden>' + empty + '</div>' +
        (rows ? '' : '<div class="list-empty">' + empty + '</div>') +
      '</div>';

    return {
      title: t('students.title'),
      nav: 'students',
      content: content,
      onMount: function (view) {
        var searchInput = view.querySelector('[data-student-search]');
        var list = view.querySelector('[data-student-list]');
        var searchEmpty = view.querySelector('[data-search-empty]');
        var listEmpty = view.querySelector('.list-empty');
        var countEl = view.querySelector('[data-list-count]');
        function applySearch() {
          var q = App.normalizeSearch(searchInput.value);
          App.studentSearch = searchInput.value;
          var visible = 0;
          list.querySelectorAll('[data-student]').forEach(function (row) {
            var match = !q || (row.getAttribute('data-search') || '').indexOf(q) >= 0;
            row.hidden = !match;
            if (match) visible++;
          });
          if (listEmpty) listEmpty.hidden = !!q;
          searchEmpty.hidden = !q || visible > 0;
          countEl.textContent = t('classes.studentsCount', { count: Fmt.formatNumber(visible, I18n.lang) });
        }
        if (searchInput) {
          searchInput.addEventListener('input', applySearch);
          if (search) {
            searchInput.focus();
            var len = searchInput.value.length;
            try { searchInput.setSelectionRange(len, len); } catch (_) {}
            applySearch();
          }
        }
        view.querySelectorAll('[data-add]').forEach(function (b) {
          b.addEventListener('click', function () { App.navigate('#/students/new'); });
        });
        view.querySelectorAll('[data-filter]').forEach(function (b) {
          b.addEventListener('click', function () {
            App.studentFilter = b.getAttribute('data-filter');
            App.rerender();
          });
        });
        list.querySelectorAll('[data-student]').forEach(function (row) {
          row.addEventListener('click', function () {
            App.navigate('#/students/' + encodeURIComponent(row.getAttribute('data-student')));
          });
        });
      }
    };
  };

  Pages.studentForm = function (params) {
    var isNew = params.mode === 'new';
    var student = isNew ? null : App.getStudent(params.id);
    if (!isNew && !student) {
      return {
        title: t('common.notFound'),
        back: '#/students',
        nav: 'students',
        content: '<div class="page">' + UI.emptyState('alert', t('common.notFound'), t('error.notFound'), '') + '</div>'
      };
    }
    var plan = student && student.privatePlan ? student.privatePlan : null;
    var todayIso = today();
    var privateSessions = student ? App.data.sessions.filter(function (s) {
      return s.ownerType === 'private' && s.studentId === student.id;
    }).length : 0;
    var modelLocked = privateSessions > 0;
    var hasPrivate = !!plan;
    var currentFee = plan ? Billing.privateFeeAt(plan, todayIso) : null;
    var startDate = plan ? plan.startDate : todayIso;
    var active = plan ? (!plan.endDate || plan.endDate >= todayIso) : true;
    var endDateText = plan && plan.endDate ? '<p class="hint">' + esc(t('students.privateEnd')) + ': ' + esc(date(plan.endDate)) + '</p>' : '';

    var modelOptions = ['term', 'session', 'month'].map(function (m) {
      return '<option value="' + m + '"' + (plan && plan.model === m ? ' selected' : '') + '>' + esc(modelLabel(m)) + '</option>';
    }).join('');

    var content =
      '<div class="page">' +
        '<form class="page-form" novalidate data-student-form>' +
          '<section class="card form-section">' +
            '<h2 class="section-title">' + esc(t('students.detail')) + '</h2>' +
            '<label class="field"><span>' + esc(t('students.name')) + ' <em>*</em></span>' +
              '<input class="input" name="name" required autocomplete="name" value="' + esc(student ? student.name : '') + '" placeholder="' + esc(t('students.namePlaceholder')) + '">' +
            '</label>' +
            '<div class="field-grid">' +
              '<label class="field"><span>' + esc(t('students.phone')) + '</span>' +
                '<input class="input" name="phone" inputmode="tel" dir="ltr" autocomplete="tel" value="' + esc(student ? student.phone : '') + '" placeholder="' + esc(t('students.phonePlaceholder')) + '">' +
              '</label>' +
              '<label class="field"><span>' + esc(t('students.type')) + '</span>' +
                '<select class="input" name="type">' +
                  '<option value="private"' + (!student || student.type === 'private' ? ' selected' : '') + '>' + esc(t('type.private')) + '</option>' +
                  '<option value="semi"' + (student && student.type === 'semi' ? ' selected' : '') + '>' + esc(t('type.semi')) + '</option>' +
                  '<option value="group"' + (student && student.type === 'group' ? ' selected' : '') + '>' + esc(t('type.group')) + '</option>' +
                '</select>' +
              '</label>' +
            '</div>' +
            '<label class="field"><span>' + esc(t('students.level')) + '</span>' +
              '<input class="input" name="level" value="' + esc(student ? student.level : '') + '" placeholder="' + esc(t('students.levelPlaceholder')) + '">' +
            '</label>' +
            '<label class="field"><span>' + esc(t('students.notes')) + '</span>' +
              '<textarea class="input textarea" name="notes" rows="3" placeholder="' + esc(t('students.notesPlaceholder')) + '">' + esc(student ? student.notes : '') + '</textarea>' +
            '</label>' +
            '<p class="hint">' + esc(t('cloud.studentAccountHint')) + '</p>' +
          '</section>' +

          '<section class="card form-section">' +
            '<h2 class="section-title">' + esc(t('students.privatePlan')) + '</h2>' +
            '<label class="switch-row">' +
              '<input type="checkbox" name="hasPrivate"' + (hasPrivate ? ' checked' : '') + '>' +
              '<span>' + esc(t('students.privatePlanToggle')) + '</span>' +
            '</label>' +
            '<p class="hint">' + esc(t('students.privatePlanHint')) + '</p>' +
            '<div class="private-fields" data-private-fields' + (hasPrivate ? '' : ' hidden') + '>' +
              '<label class="field"><span>' + esc(t('students.privateModel')) + '</span>' +
                '<select class="input" name="privateModel"' + (modelLocked ? ' disabled' : '') + '>' + modelOptions + '</select>' +
              '</label>' +
              (modelLocked ? '<p class="hint hint-warn">' + esc(t('students.modelLocked')) + '</p>' : '') +
              '<label class="field"><span>' + esc(t('students.privateFee')) + ' <em>*</em></span>' +
                '<input class="input money-input" name="privateFee" data-money inputmode="numeric" dir="ltr" value="' + (currentFee === null ? '' : esc(Fmt.formatNumber(currentFee, I18n.lang))) + '" placeholder="' + esc(t('money.amountPlaceholder')) + '">' +
              '</label>' +
              '<div class="field"><span>' + esc(t('students.privateStart')) + ' <em>*</em></span>' +
                '<input type="hidden" name="privateStartDate" value="' + esc(startDate) + '">' +
                '<button type="button" class="input date-field" data-date-input="privateStartDate">' + esc(date(startDate)) + '</button>' +
              '</div>' +
              (plan ? '<label class="switch-row switch-row-inline"><input type="checkbox" name="privateActive"' + (active ? ' checked' : '') + '><span>' + esc(t('students.privateActive')) + '</span></label>' : '') +
              (plan ? endDateText : '') +
              '<p class="hint">' + esc(t('students.feeChangeNote')) + '</p>' +
            '</div>' +
          '</section>' +

          '<p class="form-error" role="alert" hidden></p>' +
          '<div class="sticky-actions">' +
            '<button type="button" class="btn ghost" data-cancel>' + esc(t('common.cancel')) + '</button>' +
            '<button type="submit" class="btn primary">' + esc(t('students.saveStudent')) + '</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    return {
      title: isNew ? t('students.add') : t('students.edit'),
      back: isNew ? '#/students' : '#/students/' + encodeURIComponent(params.id),
      nav: 'students',
      content: content,
      onMount: function (view) {
        var form = view.querySelector('[data-student-form]');
        var toggle = form.querySelector('[name="hasPrivate"]');
        var privateFields = form.querySelector('[data-private-fields]');
        var errorEl = form.querySelector('.form-error');
        var submitBtn = form.querySelector('button[type="submit"]');
        UI.bindDateFields(form);
        UI.bindMoneyFields(form);
        toggle.addEventListener('change', function () {
          privateFields.hidden = !toggle.checked;
        });
        form.querySelector('[data-cancel]').addEventListener('click', function () {
          App.navigate(isNew ? '#/students' : '#/students/' + encodeURIComponent(params.id));
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
          var phoneRaw = Fmt.toEnDigits(String(fd.get('phone') || '')).trim();
          if (phoneRaw && phoneRaw.replace(/\D/g, '').length < 6) {
            errorEl.textContent = t('validation.invalidPhone');
            errorEl.hidden = false;
            return;
          }
          var type = String(fd.get('type') || 'private');
          if (['private', 'semi', 'group'].indexOf(type) < 0) type = 'private';
          var next = Object.assign({}, student || {}, {
            id: student ? student.id : DB.uid(),
            name: name,
            phone: phoneRaw.replace(/\s+/g, ' '),
            type: type,
            level: String(fd.get('level') || '').trim(),
            notes: String(fd.get('notes') || '').trim(),
            archived: student ? !!student.archived : false,
            createdAt: student && student.createdAt ? student.createdAt : DB.now(),
            updatedAt: DB.now()
          });
          delete next.googleEmail;
          delete next.portalEnabled;

          var nextPlan = plan ? JSON.parse(JSON.stringify(plan)) : null;
          var wantsPrivate = toggle.checked;
          if (wantsPrivate) {
            var model = String(fd.get('privateModel') || 'term');
            if (['term', 'session', 'month'].indexOf(model) < 0) model = 'term';
            var fee = Fmt.parseAmount(fd.get('privateFee'));
            var pStart = String(fd.get('privateStartDate') || '');
            if (fee === null || fee < 0) {
              errorEl.textContent = t('validation.invalidAmount');
              errorEl.hidden = false;
              return;
            }
            if (!Jalali.isValidISO(pStart)) {
              errorEl.textContent = t('validation.invalidDate');
              errorEl.hidden = false;
              return;
            }
            if (!nextPlan) {
              nextPlan = {
                model: model,
                fee: fee,
                feeHistory: [{ effectiveFrom: pStart, fee: fee }],
                startDate: pStart,
                endDate: null,
                termSize: 10
              };
            } else {
              if (!modelLocked) nextPlan.model = model;
              nextPlan.startDate = pStart;
              if (!Array.isArray(nextPlan.feeHistory)) nextPlan.feeHistory = [];
              var oldFee = Billing.privateFeeAt(nextPlan, todayIso);
              if (fee !== oldFee) {
                nextPlan.fee = fee;
                nextPlan.feeHistory.push({ effectiveFrom: todayIso, fee: fee });
              }
              var isActive = fd.get('privateActive') === 'on';
              if (isActive) {
                nextPlan.endDate = null;
              } else if (!nextPlan.endDate || nextPlan.endDate > todayIso) {
                nextPlan.endDate = todayIso;
              }
              nextPlan.termSize = nextPlan.termSize || 10;
            }
          } else if (nextPlan) {
            if (!nextPlan.endDate || nextPlan.endDate > todayIso) nextPlan.endDate = todayIso;
          }
          next.privatePlan = nextPlan;

          submitBtn.disabled = true;
          try {
            await DB.put('students', next);
            await App.reloadData();
            UI.toast(isNew ? t('students.created') : t('students.updated'), 'success');
            App.navigate('#/students/' + encodeURIComponent(next.id));
          } catch (err) {
            errorEl.textContent = err && err.userMessage ? err.userMessage : t('error.generic');
            errorEl.hidden = false;
            submitBtn.disabled = false;
          }
        });
      }
    };
  };

  function balanceCard(student, summary) {
    var status = paymentStatusClass(summary);
    var label = paymentStatusText(summary);
    var amount = summary ? Math.abs(summary.balance) : 0;
    return '<section class="balance-card balance-' + status + '">' +
      '<div class="balance-top">' +
        '<div>' +
          '<p class="eyebrow">' + esc(t('students.balance')) + '</p>' +
          '<strong class="balance-amount">' + (summary && summary.balance === 0 ? esc(t('students.paidUp')) : esc(money(amount))) + '</strong>' +
          '<p class="balance-label">' + esc(label) + '</p>' +
        '</div>' +
        '<div class="balance-icon">' + UI.icon('wallet', 26) + '</div>' +
      '</div>' +
      '<div class="balance-actions">' +
        '<button type="button" class="btn light" data-add-payment>' + UI.icon('plus', 17) + ' ' + esc(t('money.addPayment')) + '</button>' +
        '<button type="button" class="btn ghost-light" data-tab="money">' + esc(t('money.breakdown')) + '</button>' +
      '</div>' +
    '</section>';
  }

  function privatePlanCard(student, summary) {
    var plan = student.privatePlan;
    if (!plan) {
      return '<section class="card">' +
        '<div class="section-head"><h3>' + esc(t('students.privateLessons')) + '</h3>' +
          '<button type="button" class="btn ghost btn-sm" data-edit>' + UI.icon('plus', 16) + ' ' + esc(t('common.add')) + '</button></div>' +
        '<p class="muted">' + esc(t('students.noPrivatePlan')) + '</p>' +
      '</section>';
    }
    var active = Billing.planActive(plan, today());
    var progress = summary && summary.termProgress ? summary.termProgress['private'] : null;
    var progressHtml = '';
    if (plan.model === 'term' && progress) {
      var pct = progress.size ? Math.round((progress.inTerm / progress.size) * 100) : 0;
      progressHtml = '<div class="term-line">' +
        '<div class="term-line-head"><span>' + esc(t('students.termNumber', { n: Fmt.formatNumber(progress.termNumber || 1, I18n.lang) })) + '</span>' +
        '<span>' + esc(t('students.termProgress', { used: Fmt.formatNumber(progress.inTerm, I18n.lang), total: Fmt.formatNumber(progress.size, I18n.lang) })) + '</span></div>' +
        '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
      '</div>';
    }
    return '<section class="card">' +
      '<div class="section-head"><h3>' + esc(t('students.privateLessons')) + '</h3>' +
        '<div class="section-actions">' +
          (active ? '<button type="button" class="btn ghost btn-sm" data-end-private>' + esc(t('students.endPrivate')) + '</button>' :
            '<button type="button" class="btn ghost btn-sm" data-reactivate-private>' + esc(t('students.reactivatePrivate')) + '</button>') +
          '<button type="button" class="icon-btn" data-edit aria-label="' + esc(t('common.edit')) + '">' + UI.icon('edit', 18) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="info-grid">' +
        '<div><span class="label">' + esc(t('students.privateModel')) + '</span><strong>' + esc(modelLabel(plan.model)) + '</strong></div>' +
        '<div><span class="label">' + esc(t('students.privateFee')) + '</span><strong>' + esc(money(Billing.privateFeeAt(plan, today()))) + '</strong></div>' +
        '<div><span class="label">' + esc(t('common.active')) + '</span><strong>' + esc(active ? t('students.privatePlanActive') : t('students.privatePlanInactive')) + '</strong></div>' +
      '</div>' +
      progressHtml +
      (plan.endDate ? '<p class="hint">' + esc(t('students.privateEnd')) + ': ' + esc(date(plan.endDate)) + '</p>' : '') +
    '</section>';
  }

  function classesCard(student, summary) {
    var plans = summary ? summary.plans.filter(function (p) { return p.type === 'class'; }) : [];
    if (!plans.length) {
      return '<section class="card">' +
        '<div class="section-head"><h3>' + esc(t('students.classMemberships')) + '</h3></div>' +
        '<p class="muted">' + esc(t('students.noClasses')) + '</p>' +
        '<p class="hint">' + esc(t('students.addToClassHint')) + '</p>' +
      '</section>';
    }
    var rows = plans.map(function (plan) {
      var cls = App.getClass(plan.classId);
      var progress = plan.termProgress;
      var share = cls && plan.active ? Billing.classShareAt(cls, App.data.enrollments, today()) : null;
      var sub = [];
      if (cls) sub.push(typeLabel(cls.type));
      sub.push(modelLabel(plan.model));
      if (share !== null) sub.push(t('students.classShare') + ': ' + money(share));
      if (!plan.active) sub.push(t('classes.enrollmentEnded'));
      var progressHtml = '';
      if (plan.model === 'term' && progress) {
        var pct = progress.size ? Math.round((progress.inTerm / progress.size) * 100) : 0;
        progressHtml = '<div class="mini-progress"><span style="width:' + pct + '%"></span></div>' +
          '<span class="hint">' + esc(t('students.termProgress', { used: Fmt.formatNumber(progress.inTerm, I18n.lang), total: Fmt.formatNumber(progress.size, I18n.lang) })) + '</span>';
      }
      return '<button type="button" class="mini-row" data-class="' + esc(plan.classId) + '">' +
        '<span class="mini-icon">' + UI.icon('class', 18) + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(plan.name) + '</span>' +
          '<span class="row-sub">' + esc(sub.join(' · ')) + '</span>' + progressHtml + '</span>' +
        UI.icon('chevron-left', 17, 'row-chevron') +
      '</button>';
    }).join('');
    return '<section class="card">' +
      '<div class="section-head"><h3>' + esc(t('students.classMemberships')) + '</h3></div>' +
      '<div class="mini-list">' + rows + '</div>' +
    '</section>';
  }

  function attendanceCard(summary) {
    var a = summary ? summary.attendance : null;
    if (!a || !a.normal) {
      return '<section class="card">' +
        '<div class="section-head"><h3>' + esc(t('students.attendanceOverall')) + '</h3>' +
          '<button type="button" class="btn ghost btn-sm" data-tab="attendance">' + esc(t('common.view')) + '</button></div>' +
        '<p class="muted">' + esc(t('attendance.noHistory')) + '</p>' +
      '</section>';
    }
    return '<section class="card">' +
      '<div class="section-head"><h3>' + esc(t('students.attendanceOverall')) + '</h3>' +
        '<button type="button" class="btn ghost btn-sm" data-tab="attendance">' + esc(t('common.view')) + '</button></div>' +
      '<div class="stat-row">' +
        '<div class="stat"><strong>' + esc(Fmt.formatPercent(a.percentage, I18n.lang)) + '</strong><span>' + esc(t('attendance.attendancePercent')) + '</span></div>' +
        '<div class="stat"><strong>' + esc(Fmt.formatNumber(a.attended, I18n.lang)) + '</strong><span>' + esc(t('attendance.attendedCount')) + '</span></div>' +
        '<div class="stat"><strong>' + esc(Fmt.formatNumber(a.absent, I18n.lang)) + '</strong><span>' + esc(t('status.absent')) + '</span></div>' +
      '</div>' +
      '<p class="hint">' + esc(t('attendance.canceledNoPercent')) + '</p>' +
    '</section>';
  }

  function studentAppUrl() {
    try {
      return new URL('student/', window.location.href).href;
    } catch (_) {
      return 'student/';
    }
  }

  function portalCardHtml(student) {
    var sync = window.Sync ? Sync.status() : null;
    var authenticated = !!(sync && sync.authenticated);
    var initialized = !!(sync && sync.initialized);
    var entry = window.Sync && Sync.getPortalMeta ? Sync.getPortalMeta(student.id) : null;
    var published = !!(authenticated && initialized && !student.archived && entry && entry.publishedAt);
    var status = published ? UI.badge(t('cloud.portalOn'), 'success') : UI.badge(t('cloud.portalPending'), 'amber');
    var hints = [];
    if (!authenticated) {
      hints.push(t('cloud.authRequired'));
    } else if (entry && entry.publishedAt) {
      hints.push(t('cloud.portalPublishedAt', { date: date(String(entry.publishedAt).slice(0, 10)) }));
    } else {
      hints.push(t('cloud.portalAutoPublish'));
    }
    if (student.archived) hints.push(t('cloud.portalArchivedHint'));
    var actions = [
      '<a class="btn ghost btn-sm" href="' + esc(studentAppUrl()) + '" target="_blank" rel="noopener">' +
        UI.icon('book', 16) + ' ' + esc(t('cloud.openStudentApp')) + '</a>',
      '<button type="button" class="btn ghost btn-sm" data-portal-copy>' + UI.icon('cloud', 16) + ' ' + esc(t('cloud.copyStudentLink')) + '</button>',
      '<button type="button" class="btn ghost btn-sm" data-manage-account>' + UI.icon('user', 16) + ' ' + esc(t('accounts.open')) + '</button>'
    ];
    return '<section class="card portal-card">' +
      '<div class="section-head"><h3>' + UI.icon('cloud', 18) + ' ' + esc(t('cloud.studentPortal')) + '</h3>' + status + '</div>' +
      hints.map(function (hint) { return '<p class="hint">' + esc(hint) + '</p>'; }).join('') +
      '<div class="settings-actions">' + actions.join('') + '</div>' +
    '</section>';
  }

  async function copyStudentLink() {
    var url = studentAppUrl();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        UI.toast(t('cloud.studentLinkCopied'), 'success');
        return;
      }
    } catch (_) {}
    UI.alert({ title: t('cloud.copyStudentLink'), message: url });
  }

  function overviewHtml(student, summary) {
    return balanceCard(student, summary) +
      privatePlanCard(student, summary) +
      classesCard(student, summary) +
      portalCardHtml(student) +
      attendanceCard(summary) +
      '<section class="card danger-zone">' +
        '<div class="section-head"><h3>' + esc(t('common.archive')) + '</h3></div>' +
        '<p class="hint">' + esc(t('students.archiveHint')) + '</p>' +
        '<button type="button" class="btn ghost danger-text" data-archive>' +
          UI.icon(student.archived ? 'unlock' : 'archive', 17) + ' ' +
          esc(student.archived ? t('students.unarchive') : t('common.archive')) +
        '</button>' +
      '</section>';
  }

  function attendanceTabHtml(student, summary) {
    var a = summary ? summary.attendance : null;
    var stats = '<div class="stats-grid">' +
      '<div class="stat-card"><span class="stat-icon">' + UI.icon('chart', 20) + '</span><strong>' + esc(a ? Fmt.formatPercent(a.percentage, I18n.lang) : '—') + '</strong><span>' + esc(t('attendance.attendancePercent')) + '</span></div>' +
      '<div class="stat-card"><span class="stat-icon">' + UI.icon('check', 20) + '</span><strong>' + esc(a ? Fmt.formatNumber(a.attended, I18n.lang) : '۰') + '</strong><span>' + esc(t('attendance.attendedCount')) + '</span></div>' +
      '<div class="stat-card"><span class="stat-icon">' + UI.icon('clock', 20) + '</span><strong>' + esc(a ? Fmt.formatNumber(a.late, I18n.lang) : '۰') + '</strong><span>' + esc(t('attendance.lateCount')) + '</span></div>' +
      '<div class="stat-card"><span class="stat-icon">' + UI.icon('x', 20) + '</span><strong>' + esc(a ? Fmt.formatNumber(a.absent, I18n.lang) : '۰') + '</strong><span>' + esc(t('status.absent')) + '</span></div>' +
    '</div>';

    var progressCards = '';
    if (summary) {
      summary.plans.forEach(function (plan) {
        if (!plan.termProgress) return;
        var p = plan.termProgress;
        var pct = p.size ? Math.round((p.inTerm / p.size) * 100) : 0;
        progressCards += '<div class="card compact-card">' +
          '<div class="section-head"><h3>' + esc(planName(plan)) + '</h3>' +
            '<span class="badge badge-teal">' + esc(t('attendance.termN', { n: Fmt.formatNumber(p.termNumber || 1, I18n.lang) })) + '</span></div>' +
          '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
          '<div class="progress-meta"><span>' + esc(t('attendance.sessionOfTerm', { used: Fmt.formatNumber(p.inTerm, I18n.lang), total: Fmt.formatNumber(p.size, I18n.lang) })) + '</span>' +
          '<span>' + esc(t('students.currentTerm')) + '</span></div>' +
        '</div>';
      });
    }

    var history = summary ? summary.history : [];
    var historyHtml = history.length ? history.map(function (h) {
      var sub = [];
      sub.push(h.kind === 'private' ? t('attendance.privateLesson') : (h.planName || t('attendance.classSession')));
      if (h.canceled === 'counted') sub.push(t('attendance.countedNotAttendance'));
      if (h.canceled === 'makeup') sub.push(t('attendance.canceledNotCounted'));
      return '<div class="record-row">' +
        '<div class="record-date"><strong>' + esc(date(h.date, 'short')) + '</strong><span>' + esc(Fmt.weekdayName(Jalali.weekdaySat0(h.date), I18n.lang, true)) + '</span></div>' +
        '<div class="row-main"><span class="row-title">' + esc(sub[0]) + '</span>' +
          '<span class="row-sub">' + esc(sub.slice(1).join(' · ') || t('attendance.classSession')) + '</span></div>' +
        '<div class="row-end">' + UI.statusPill(h.status, h.canceled) + '</div>' +
      '</div>';
    }).join('') : UI.emptyState('clipboard', t('attendance.noHistory'), t('attendance.history'), '');

    return stats +
      (progressCards ? '<div class="section-title-row"><h2 class="section-title">' + esc(t('attendance.termProgress')) + '</h2></div>' + progressCards : '') +
      '<section class="card"><div class="section-head"><h3>' + esc(t('attendance.history')) + '</h3></div>' +
        '<div class="record-list">' + historyHtml + '</div>' +
      '</section>';
  }

  function gradeScoreText(score) {
    return score === null || score === undefined ? t('grades.noScore') : Fmt.formatScore(score, I18n.lang);
  }

  function gradesTabHtml(student, summary) {
    var grades = App.data.grades.filter(function (g) { return g.studentId === student.id; })
      .slice().sort(function (a, b) {
        return a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
    var scored = grades.filter(function (g) { return typeof g.score === 'number' && isFinite(g.score); });
    var latest = scored.length ? scored[0].score : null;
    var avg = scored.length ? scored.reduce(function (s, g) { return s + g.score; }, 0) / scored.length : null;
    var chart = UI.chart(scored.map(function (g) { return { date: g.date, score: g.score }; }));
    var cards = grades.map(function (g) {
      return '<article class="record-card" data-grade="' + esc(g.id) + '">' +
        '<div class="record-head"><div><strong>' + esc(g.title) + '</strong>' +
          '<p class="record-meta">' + esc(date(g.date)) + '</p></div>' +
          (typeof g.score === 'number' ? '<span class="score-badge">' + esc(Fmt.formatScore(g.score, I18n.lang)) + '</span>' : '') +
        '</div>' +
        (g.note ? '<p class="record-note">' + esc(g.note) + '</p>' : '') +
        '<div class="record-actions">' +
          '<button type="button" class="btn ghost btn-xs" data-edit-grade="' + esc(g.id) + '">' + UI.icon('edit', 15) + ' ' + esc(t('common.edit')) + '</button>' +
          '<button type="button" class="btn ghost btn-xs danger-text" data-delete-grade="' + esc(g.id) + '">' + UI.icon('trash', 15) + ' ' + esc(t('common.delete')) + '</button>' +
        '</div>' +
      '</article>';
    }).join('');
    return '<div class="section-head"><h2 class="section-title">' + esc(t('grades.title')) + '</h2>' +
      '<button type="button" class="btn primary btn-sm" data-add-grade>' + UI.icon('plus', 17) + ' ' + esc(t('grades.add')) + '</button></div>' +
      (scored.length ? '<div class="stat-row">' +
        '<div class="stat"><strong>' + esc(latest === null ? '—' : Fmt.formatScore(latest, I18n.lang)) + '</strong><span>' + esc(t('grades.latest')) + '</span></div>' +
        '<div class="stat"><strong>' + esc(avg === null ? '—' : Fmt.formatScore(avg, I18n.lang)) + '</strong><span>' + esc(t('grades.average')) + '</span></div>' +
        '<div class="stat"><strong>' + esc(Fmt.formatNumber(scored.length, I18n.lang)) + '</strong><span>' + esc(t('grades.scoreNumber')) + '</span></div>' +
      '</div>' : '') +
      (chart ? '<section class="card chart-card"><div class="section-head"><h3>' + esc(t('grades.chartTitle')) + '</h3></div>' + chart + '<p class="hint">' + esc(t('grades.chartHint')) + '</p></section>' : '') +
      '<section class="card"><div class="section-head"><h3>' + esc(t('grades.history')) + '</h3></div>' +
        (cards ? '<div class="record-card-list">' + cards + '</div>' : UI.emptyState('star', t('grades.noGrades'), t('grades.noGradesHint'), '')) +
      '</section>';
  }

  function chargeLabel(charge) {
    if (charge.kind === 'term') return t('money.termCharge', { n: Fmt.formatNumber(charge.termNumber, I18n.lang) });
    if (charge.kind === 'session') return t('money.sessionCharge', { date: date(charge.date, 'short') });
    if (charge.kind === 'month') return t('money.monthCharge', { month: Fmt.formatMonthKey(charge.monthKey, I18n.lang) });
    return t('money.charges');
  }

  function moneyTabHtml(student, summary) {
    var plans = summary ? summary.plans.filter(function (p) { return p.charges.length; }) : [];
    var payments = summary ? summary.payments : [];
    var planHtml = plans.map(function (plan) {
      var charges = plan.charges.map(function (c) {
        return '<div class="charge-row">' +
          '<div class="row-main"><span class="row-title">' + esc(chargeLabel(c)) + '</span>' +
            '<span class="row-sub">' + esc(date(c.date)) + (c.status && c.status !== 'canceled' ? ' · ' + esc(t('status.' + c.status)) : '') + '</span></div>' +
          '<strong class="amount">' + esc(money(c.amount)) + '</strong>' +
        '</div>';
      }).join('');
      return '<details class="plan-details" open>' +
        '<summary><span>' + esc(planName(plan)) + '</span><strong>' + esc(money(plan.totalCharges)) + '</strong></summary>' +
        '<div class="charge-list">' + charges + '</div>' +
      '</details>';
    }).join('');
    var paymentHtml = payments.map(function (p) {
      return '<div class="payment-row" data-payment="' + esc(p.id) + '">' +
        '<span class="payment-icon">' + UI.icon('wallet', 17) + '</span>' +
        '<div class="row-main"><span class="row-title">' + esc(money(p.amount)) + '</span>' +
          '<span class="row-sub">' + esc(date(p.date)) + (p.note ? ' · ' + esc(p.note) : '') + '</span></div>' +
        '<div class="row-actions">' +
          '<button type="button" class="icon-btn" data-edit-payment="' + esc(p.id) + '" aria-label="' + esc(t('common.edit')) + '">' + UI.icon('edit', 16) + '</button>' +
          '<button type="button" class="icon-btn danger-text" data-delete-payment="' + esc(p.id) + '" aria-label="' + esc(t('common.delete')) + '">' + UI.icon('trash', 16) + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<section class="card money-summary">' +
      '<div class="section-head"><h2 class="section-title">' + esc(t('money.balance')) + '</h2>' +
        '<button type="button" class="btn primary btn-sm" data-add-payment>' + UI.icon('plus', 17) + ' ' + esc(t('money.addPayment')) + '</button></div>' +
      '<div class="money-numbers">' +
        '<div><span class="label">' + esc(t('money.totalCharges')) + '</span><strong>' + esc(money(summary ? summary.totalCharges : 0)) + '</strong></div>' +
        '<div><span class="label">' + esc(t('money.totalPaid')) + '</span><strong>' + esc(money(summary ? summary.totalPaid : 0)) + '</strong></div>' +
        '<div class="money-balance"><span class="label">' + esc(t('money.balance')) + '</span><strong class="' + paymentStatusClass(summary) + '">' + esc(summary && summary.balance === 0 ? t('money.paidUp') : money(Math.abs(summary ? summary.balance : 0))) + '</strong></div>' +
      '</div>' +
      '<p class="hint">' + esc(t('money.balanceHint')) + '</p>' +
    '</section>' +
    '<section class="card"><div class="section-head"><h3>' + esc(t('money.planBreakdown')) + '</h3></div>' +
      (planHtml || '<p class="muted">' + esc(t('money.noCharges')) + '</p>') +
      '<p class="hint">' + esc(t('money.chargesHint')) + '</p>' +
    '</section>' +
    '<section class="card"><div class="section-head"><h3>' + esc(t('money.paymentHistory')) + '</h3></div>' +
      (paymentHtml || '<p class="muted">' + esc(t('money.noPayments')) + '</p>') +
      '<p class="hint">' + esc(t('money.paymentsHint')) + '</p>' +
    '</section>';
  }

  function notesTabHtml(student) {
    var notes = sortNotes(App.data.notes.filter(function (n) {
      if (n.studentId === student.id) return true;
      if (!n.classId) return false;
      return App.data.enrollments.some(function (e) { return e.studentId === student.id && e.classId === n.classId; });
    }));
    var cards = notes.map(function (n) {
      return '<article class="note-card" data-note="' + esc(n.id) + '">' +
        '<div class="note-head">' +
          '<span class="note-target">' + UI.icon(noteTargetIcon(n), 14) + ' ' + esc(noteTarget(n)) + '</span>' +
          '<span class="note-meta">' + noteVisibilityBadge(n) + '<span class="note-date">' + esc(date(n.date)) + '</span></span>' +
        '</div>' +
        (n.title ? '<h3>' + esc(n.title) + '</h3>' : '') +
        '<p>' + esc(n.body) + '</p>' +
        '<div class="record-actions">' +
          '<button type="button" class="btn ghost btn-xs" data-edit-note="' + esc(n.id) + '">' + UI.icon('edit', 15) + ' ' + esc(t('common.edit')) + '</button>' +
          '<button type="button" class="btn ghost btn-xs danger-text" data-delete-note="' + esc(n.id) + '">' + UI.icon('trash', 15) + ' ' + esc(t('common.delete')) + '</button>' +
        '</div>' +
      '</article>';
    }).join('');
    return '<div class="section-head"><h2 class="section-title">' + esc(t('students.tabNotes')) + '</h2>' +
      '<button type="button" class="btn primary btn-sm" data-add-note>' + UI.icon('plus', 17) + ' ' + esc(t('notes.add')) + '</button></div>' +
      (cards ? '<div class="note-list">' + cards + '</div>' : UI.emptyState('notes', t('notes.noNotes'), t('notes.noNotesHint'), '')) +
      '<p class="hint">' + esc(t('notes.classNoteHint')) + '</p>';
  }

  Pages.studentDetail = function (params, query) {
    var student = App.getStudent(params.id);
    if (!student) {
      return {
        title: t('common.notFound'),
        back: '#/students',
        nav: 'students',
        content: '<div class="page">' + UI.emptyState('alert', t('common.notFound'), t('error.notFound'), '') + '</div>'
      };
    }
    var tab = query.get('tab') || 'overview';
    if (['overview', 'attendance', 'grades', 'money', 'notes'].indexOf(tab) < 0) tab = 'overview';
    var summary = summaryOf(student.id);
    var tabs = [
      ['overview', t('students.tabOverview')],
      ['attendance', t('students.tabAttendance')],
      ['grades', t('students.tabGrades')],
      ['money', t('students.tabMoney')],
      ['notes', t('students.tabNotes')]
    ];
    var tabHtml = tabs.map(function (pair) {
      return '<button type="button" class="tab' + (tab === pair[0] ? ' is-active' : '') + '" data-tab="' + pair[0] + '">' + esc(pair[1]) + '</button>';
    }).join('');
    var body = tab === 'overview' ? overviewHtml(student, summary) :
      tab === 'attendance' ? attendanceTabHtml(student, summary) :
      tab === 'grades' ? gradesTabHtml(student, summary) :
      tab === 'money' ? moneyTabHtml(student, summary) :
      notesTabHtml(student);
    var profile =
      '<section class="profile-card">' +
        '<div class="profile-top">' +
          UI.avatar(student.name).replace('class="avatar"', 'class="avatar avatar-lg"') +
          '<div class="profile-main">' +
            '<h2>' + esc(student.name) + '</h2>' +
            '<div class="profile-badges">' + typeBadge(student.type) + (student.archived ? UI.badge(t('students.archivedBadge'), 'neutral') : '') +
              (!student.archived && window.Sync && Sync.getPortalMeta && Sync.getPortalMeta(student.id) ? UI.badge(t('cloud.portalOn'), 'teal') : '') + '</div>' +
            '<div class="profile-meta">' +
              (student.phone ? '<a class="meta-link" dir="ltr" href="tel:' + esc(Fmt.toEnDigits(student.phone).replace(/[^\d+]/g, '')) + '">' + UI.icon('phone', 15) + ' ' + esc(Fmt.formatPhone(student.phone, I18n.lang)) + '</a>' : '<span class="meta-link muted">' + esc(t('students.noPhone')) + '</span>') +
              (student.level ? '<span class="meta-link">' + UI.icon('star', 15) + ' ' + esc(student.level) + '</span>' : '') +
            '</div>' +
            (student.createdAt ? '<p class="hint">' + esc(t('students.memberSince', { date: date(String(student.createdAt).slice(0, 10)) })) + '</p>' : '') +
          '</div>' +
          '<button type="button" class="icon-btn" data-edit aria-label="' + esc(t('common.edit')) + '">' + UI.icon('edit', 19) + '</button>' +
        '</div>' +
        (student.notes ? '<p class="profile-note">' + esc(student.notes) + '</p>' : '') +
      '</section>';

    return {
      title: student.name,
      back: '#/students',
      nav: 'students',
      content: '<div class="page">' + profile +
        '<div class="tabs" role="tablist">' + tabHtml + '</div>' +
        '<div class="tab-body">' + body + '</div>' +
      '</div>',
      onMount: function (view) {
        view.querySelectorAll('[data-tab]').forEach(function (b) {
          b.addEventListener('click', function () {
            App.navigate('#/students/' + encodeURIComponent(student.id) + '?tab=' + b.getAttribute('data-tab'));
          });
        });
        view.querySelectorAll('[data-edit]').forEach(function (b) {
          b.addEventListener('click', function () {
            App.navigate('#/students/' + encodeURIComponent(student.id) + '/edit');
          });
        });
        view.querySelectorAll('[data-add-payment]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.openPaymentDialog({ studentId: student.id }); });
        });
        var addGrade = view.querySelector('[data-add-grade]');
        if (addGrade) addGrade.addEventListener('click', function () { Pages.openGradeDialog(student.id); });
        view.querySelectorAll('[data-edit-grade]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.openGradeDialog(student.id, b.getAttribute('data-edit-grade')); });
        });
        view.querySelectorAll('[data-delete-grade]').forEach(function (b) {
          b.addEventListener('click', function () { deleteGrade(student.id, b.getAttribute('data-delete-grade')); });
        });
        var addNote = view.querySelector('[data-add-note]');
        if (addNote) addNote.addEventListener('click', function () { Pages.openNoteDialog({ studentId: student.id }); });
        view.querySelectorAll('[data-edit-note]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.openNoteDialog({ noteId: b.getAttribute('data-edit-note') }); });
        });
        view.querySelectorAll('[data-delete-note]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.deleteNote(b.getAttribute('data-delete-note')); });
        });
        view.querySelectorAll('[data-edit-payment]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.openPaymentDialog({ studentId: student.id, paymentId: b.getAttribute('data-edit-payment') }); });
        });
        view.querySelectorAll('[data-delete-payment]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.deletePayment(b.getAttribute('data-delete-payment')); });
        });
        view.querySelectorAll('[data-class]').forEach(function (b) {
          b.addEventListener('click', function () { App.navigate('#/classes/' + encodeURIComponent(b.getAttribute('data-class'))); });
        });
        var archiveBtn = view.querySelector('[data-archive]');
        if (archiveBtn) archiveBtn.addEventListener('click', function () {
          if (student.archived) unarchiveStudent(student); else archiveStudent(student);
        });
        var endBtn = view.querySelector('[data-end-private]');
        if (endBtn) endBtn.addEventListener('click', function () { endPrivatePlan(student); });
        var reactivateBtn = view.querySelector('[data-reactivate-private]');
        if (reactivateBtn) reactivateBtn.addEventListener('click', function () { reactivatePrivatePlan(student); });
        view.querySelectorAll('[data-portal-copy]').forEach(function (b) {
          b.addEventListener('click', function () { copyStudentLink(); });
        });
        view.querySelectorAll('[data-manage-account]').forEach(function (b) {
          b.addEventListener('click', function () {
            App.navigate('#/accounts?student=' + encodeURIComponent(student.id));
          });
        });
      }
    };
  };

  async function archiveStudent(student) {
    var ok = await UI.confirm({
      title: t('students.archiveConfirm'),
      message: t('students.archiveConfirm') + '\n\n' + t('students.archiveHint'),
      confirmLabel: t('common.archive'),
      danger: true
    });
    if (!ok) return;
    var todayIso = today();
    var next = Object.assign({}, student, { archived: true, archivedAt: DB.now(), updatedAt: DB.now() });
    await DB.put('students', next);
    var enrollments = App.data.enrollments.filter(function (e) { return e.studentId === student.id; });
    for (var i = 0; i < enrollments.length; i++) {
      var e = enrollments[i];
      if (Billing.isEnrolled(e, todayIso)) {
        await DB.put('enrollments', Object.assign({}, e, {
          endDate: !e.endDate || e.endDate > todayIso ? todayIso : e.endDate,
          updatedAt: DB.now()
        }));
      }
    }
    if (student.privatePlan && Billing.planActive(student.privatePlan, todayIso)) {
      next.privatePlan = Object.assign({}, student.privatePlan, { endDate: todayIso });
      await DB.put('students', next);
    }
    await App.reloadData();
    UI.toast(t('students.archiveSuccess'), 'success');
    App.rerender();
  }

  async function unarchiveStudent(student) {
    var next = Object.assign({}, student, { archived: false, archivedAt: null, updatedAt: DB.now() });
    await DB.put('students', next);
    await App.reloadData();
    UI.toast(t('students.unarchiveSuccess'), 'success');
    App.rerender();
  }

  async function endPrivatePlan(student) {
    if (!student.privatePlan) return;
    var ok = await UI.confirm({
      title: t('students.endPrivate'),
      message: t('students.endPrivate') + '?',
      confirmLabel: t('common.confirm'),
      danger: true
    });
    if (!ok) return;
    var plan = Object.assign({}, student.privatePlan, { endDate: today() });
    await DB.put('students', Object.assign({}, student, { privatePlan: plan, updatedAt: DB.now() }));
    await App.reloadData();
    UI.toast(t('toast.saved'), 'success');
    App.rerender();
  }

  async function reactivatePrivatePlan(student) {
    if (!student.privatePlan) return;
    var plan = Object.assign({}, student.privatePlan, { endDate: null });
    await DB.put('students', Object.assign({}, student, { privatePlan: plan, updatedAt: DB.now() }));
    await App.reloadData();
    UI.toast(t('toast.saved'), 'success');
    App.rerender();
  }

  Pages.openGradeDialog = function (studentId, gradeId) {
    var grade = gradeId ? App.data.grades.find(function (g) { return g.id === gradeId; }) : null;
    var body =
      '<label class="field"><span>' + esc(t('grades.gradeTitle')) + ' <em>*</em></span>' +
        '<input class="input" name="title" required value="' + esc(grade ? grade.title : '') + '" placeholder="' + esc(t('grades.titlePlaceholder')) + '"></label>' +
      '<label class="field"><span>' + esc(t('grades.score')) + '</span>' +
        '<input class="input" name="score" inputmode="decimal" dir="ltr" value="' + (grade && typeof grade.score === 'number' ? esc(String(grade.score)) : '') + '" placeholder="' + esc(t('grades.scorePlaceholder')) + '"></label>' +
      '<p class="hint">' + esc(t('grades.scoreHint')) + '</p>' +
      '<div class="field"><span>' + esc(t('grades.date')) + '</span>' +
        '<input type="hidden" name="date" value="' + esc(grade ? grade.date : today()) + '">' +
        '<button type="button" class="input date-field" data-date-input="date">' + esc(date(grade ? grade.date : today())) + '</button></div>' +
      '<label class="field"><span>' + esc(t('grades.note')) + '</span>' +
        '<textarea class="input textarea" name="note" rows="3" placeholder="' + esc(t('grades.notePlaceholder')) + '">' + esc(grade ? grade.note : '') + '</textarea></label>';
    return UI.formDialog({
      title: grade ? t('grades.edit') : t('grades.add'),
      body: body,
      submitLabel: t('grades.save'),
      onSubmit: async function (fd) {
        var title = String(fd.get('title') || '').trim();
        var note = String(fd.get('note') || '').trim();
        var scoreRaw = Fmt.toEnDigits(String(fd.get('score') || '')).trim();
        var score = null;
        if (scoreRaw) {
          score = Number(scoreRaw);
          if (!isFinite(score)) throw userError(t('validation.invalidScore'));
          score = Math.round(score * 100) / 100;
        }
        var d = String(fd.get('date') || '');
        if (!title) throw userError(t('grades.titleRequired'));
        if (score === null && !note) throw userError(t('validation.scoreOrNote'));
        if (!Jalali.isValidISO(d)) throw userError(t('validation.invalidDate'));
        var rec = Object.assign({}, grade || {}, {
          id: grade ? grade.id : DB.uid(),
          studentId: studentId,
          title: title,
          score: score,
          note: note,
          date: d,
          createdAt: grade && grade.createdAt ? grade.createdAt : DB.now(),
          updatedAt: DB.now()
        });
        await DB.put('grades', rec);
        await App.reloadData();
        UI.toast(t('grades.saved'), 'success');
        App.rerender();
        return true;
      }
    });
  };

  async function deleteGrade(studentId, gradeId) {
    var ok = await UI.confirm({ message: t('grades.deleteConfirm'), danger: true, confirmLabel: t('common.delete') });
    if (!ok) return;
    await DB.remove('grades', gradeId);
    await App.reloadData();
    UI.toast(t('grades.deleted'), 'success');
    App.rerender();
  }

  function targetOptions(type, selectedId) {
    var rows = [];
    if (type === 'class') {
      rows = App.data.classes.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'fa'); });
      return rows.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (selectedId === c.id ? ' selected' : '') + '>' + esc(c.name) + (c.archived ? ' (' + esc(t('common.archived')) + ')' : '') + '</option>';
      }).join('');
    }
    rows = App.data.students.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'fa'); });
    return rows.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (selectedId === s.id ? ' selected' : '') + '>' + esc(s.name) + (s.archived ? ' (' + esc(t('common.archived')) + ')' : '') + '</option>';
    }).join('');
  }

  Pages.openNoteDialog = function (opts) {
    opts = opts || {};
    var note = opts.noteId ? App.data.notes.find(function (n) { return n.id === opts.noteId; }) : null;
    var type = note ? (note.classId ? 'class' : 'student') : (opts.classId ? 'class' : 'student');
    var targetId = note ? (note.classId || note.studentId) : (opts.classId || opts.studentId || '');
    if (!targetId) {
      if (type === 'class' && App.data.classes.length) targetId = App.data.classes[0].id;
      else if (type === 'student' && App.data.students.length) targetId = App.data.students[0].id;
    }
    var body =
      '<label class="field"><span>' + esc(t('notes.targetType')) + '</span>' +
        '<select class="input" name="targetType">' +
          '<option value="class"' + (type === 'class' ? ' selected' : '') + '>' + esc(t('notes.class')) + '</option>' +
          '<option value="student"' + (type === 'student' ? ' selected' : '') + '>' + esc(t('notes.privateStudent')) + '</option>' +
        '</select></label>' +
      '<label class="field"><span>' + esc(t('notes.chooseTarget')) + ' <em>*</em></span>' +
        '<select class="input" name="targetId">' + targetOptions(type, targetId) + '</select></label>' +
      '<div class="field"><span>' + esc(t('notes.date')) + '</span>' +
        '<input type="hidden" name="date" value="' + esc(note ? note.date : today()) + '">' +
        '<button type="button" class="input date-field" data-date-input="date">' + esc(date(note ? note.date : today())) + '</button></div>' +
      '<label class="field"><span>' + esc(t('notes.noteTitle')) + '</span>' +
        '<input class="input" name="title" value="' + esc(note ? note.title : '') + '" placeholder="' + esc(t('notes.noteTitlePlaceholder')) + '"></label>' +
      '<label class="field"><span>' + esc(t('notes.body')) + ' <em>*</em></span>' +
        '<textarea class="input textarea" name="body" rows="5" required placeholder="' + esc(t('notes.bodyPlaceholder')) + '">' + esc(note ? note.body : '') + '</textarea></label>' +
      '<label class="switch-row"><input type="checkbox" name="visibleToStudent"' + (note && note.visibleToStudent ? ' checked' : '') + '><span>' + esc(t('cloud.visibleToStudent')) + '</span></label>' +
      '<p class="hint">' + esc(t('cloud.visibleToStudentHint')) + '</p>';
    return UI.formDialog({
      title: note ? t('notes.edit') : t('notes.add'),
      body: body,
      submitLabel: t('notes.save'),
      onSubmit: async function (fd) {
        var type2 = String(fd.get('targetType') || 'class');
        var id = String(fd.get('targetId') || '');
        var bodyText = String(fd.get('body') || '').trim();
        var d = String(fd.get('date') || '');
        if (!id) throw userError(t('notes.targetRequired'));
        if (!bodyText) throw userError(t('notes.bodyRequired'));
        if (!Jalali.isValidISO(d)) throw userError(t('validation.invalidDate'));
        var rec = Object.assign({}, note || {}, {
          id: note ? note.id : DB.uid(),
          date: d,
          classId: type2 === 'class' ? id : null,
          studentId: type2 === 'student' ? id : null,
          title: String(fd.get('title') || '').trim(),
          body: bodyText,
          visibleToStudent: fd.get('visibleToStudent') === 'on',
          createdAt: note && note.createdAt ? note.createdAt : DB.now(),
          updatedAt: DB.now()
        });
        await DB.put('notes', rec);
        await App.reloadData();
        UI.toast(t('notes.saved'), 'success');
        App.rerender();
        return true;
      },
      onMount: function (el) {
        var typeSel = el.querySelector('[name="targetType"]');
        var targetSel = el.querySelector('[name="targetId"]');
        typeSel.addEventListener('change', function () {
          var first = typeSel.value === 'class' ? (App.data.classes[0] || {}).id : (App.data.students[0] || {}).id;
          targetSel.innerHTML = targetOptions(typeSel.value, first || '');
        });
      }
    });
  };

  Pages.deleteNote = async function (noteId) {
    var ok = await UI.confirm({ message: t('notes.deleteConfirm'), danger: true, confirmLabel: t('common.delete') });
    if (!ok) return;
    await DB.remove('notes', noteId);
    await App.reloadData();
    UI.toast(t('notes.deleted'), 'success');
    App.rerender();
  }

  Pages.notesPage = function () {
    var filter = App.notesFilter || 'all';
    var notes = sortNotes(App.data.notes.filter(function (n) {
      if (filter === 'class') return !!n.classId;
      if (filter === 'student') return !!n.studentId;
      return true;
    }));
    var cards = notes.map(function (n) {
      return '<article class="note-card" data-note="' + esc(n.id) + '">' +
        '<div class="note-head">' +
          '<span class="note-target">' + UI.icon(noteTargetIcon(n), 14) + ' ' + esc(noteTarget(n)) + '</span>' +
          '<span class="note-meta">' + noteVisibilityBadge(n) + '<span class="note-date">' + esc(date(n.date)) + '</span></span>' +
        '</div>' +
        (n.title ? '<h3>' + esc(n.title) + '</h3>' : '') +
        '<p>' + esc(n.body) + '</p>' +
        '<div class="record-actions">' +
          '<button type="button" class="btn ghost btn-xs" data-edit-note="' + esc(n.id) + '">' + UI.icon('edit', 15) + ' ' + esc(t('common.edit')) + '</button>' +
          '<button type="button" class="btn ghost btn-xs danger-text" data-delete-note="' + esc(n.id) + '">' + UI.icon('trash', 15) + ' ' + esc(t('common.delete')) + '</button>' +
        '</div>' +
      '</article>';
    }).join('');
    return {
      title: t('notes.title'),
      back: '#/more',
      nav: 'more',
      content: '<div class="page">' +
        '<div class="page-head"><div><h2 class="page-title">' + esc(t('notes.title')) + '</h2>' +
          '<p class="page-sub">' + esc(t('notes.entries', { count: Fmt.formatNumber(notes.length, I18n.lang) })) + '</p></div>' +
          '<button type="button" class="btn primary btn-sm" data-add-note>' + UI.icon('plus', 18) + ' ' + esc(t('notes.add')) + '</button></div>' +
        '<div class="chips" role="group">' +
          '<button type="button" class="chip' + (filter === 'all' ? ' is-active' : '') + '" data-filter="all">' + esc(t('notes.filterAll')) + '</button>' +
          '<button type="button" class="chip' + (filter === 'class' ? ' is-active' : '') + '" data-filter="class">' + esc(t('notes.classNotes')) + '</button>' +
          '<button type="button" class="chip' + (filter === 'student' ? ' is-active' : '') + '" data-filter="student">' + esc(t('notes.privateNotes')) + '</button>' +
        '</div>' +
        (cards ? '<div class="note-list">' + cards + '</div>' : UI.emptyState('notes', t('notes.noNotes'), t('notes.noNotesHint'),
          '<button type="button" class="btn primary" data-add-note>' + UI.icon('plus', 18) + ' ' + esc(t('notes.add')) + '</button>')) +
      '</div>',
      onMount: function (view) {
        view.querySelectorAll('[data-add-note]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.openNoteDialog({}); });
        });
        view.querySelectorAll('[data-filter]').forEach(function (b) {
          b.addEventListener('click', function () {
            App.notesFilter = b.getAttribute('data-filter');
            App.rerender();
          });
        });
        view.querySelectorAll('[data-edit-note]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.openNoteDialog({ noteId: b.getAttribute('data-edit-note') }); });
        });
        view.querySelectorAll('[data-delete-note]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.deleteNote(b.getAttribute('data-delete-note')); });
        });
      }
    };
  };

  function userError(message) {
    var e = new Error(message);
    e.userMessage = message;
    return e;
  }
})();
