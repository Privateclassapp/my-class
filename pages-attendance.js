/* pages-attendance.js — one screen for taking class or private attendance. */
(function () {
  'use strict';

  var Pages = window.Pages = window.Pages || {};

  function t(key, vars) { return I18n.t(key, vars); }
  function esc(value) { return UI.escapeHtml(value); }
  function date(iso, style) { return iso ? Fmt.formatDate(iso, I18n.lang, style) : '—'; }
  function today() { return Jalali.todayISO(); }
  function num(value) { return Fmt.formatNumber(value, I18n.lang); }

  function resetDraft() {
    if (App.attState) App.attState.draft = null;
  }

  function sessionKeyFor(state) {
    if (state.mode === 'private') return DB.sessionKey('private', null, state.studentId, state.date);
    return DB.sessionKey('class', state.classId, null, state.date);
  }

  function findSession(state) {
    var key = sessionKeyFor(state);
    var found = App.data.sessions.find(function (s) { return s.sessionKey === key; });
    if (found) return found;
    return App.data.sessions.find(function (s) {
      return s.date === state.date && s.ownerType === state.mode &&
        (state.mode === 'class' ? s.classId === state.classId : s.studentId === state.studentId);
    }) || null;
  }

  function attendanceRows(session) {
    if (!session) return [];
    return App.data.attendance.filter(function (a) { return a.sessionId === session.id; });
  }

  function modelLabel(model) {
    return t('model.' + (model === 'session' || model === 'month' ? model : 'term'));
  }

  function typeLabel(type) {
    return t(type === 'group' ? 'type.group' : type === 'semi' ? 'type.semi' : 'type.private');
  }

  function scheduledClasses(iso) {
    var wd = Jalali.weekdaySat0(iso);
    return App.data.classes.filter(function (c) {
      return !c.archived && Array.isArray(c.schedule) && c.schedule.some(function (s) { return Number(s.day) === wd; });
    }).sort(function (a, b) {
      function firstTime(c) {
        var rows = c.schedule.filter(function (s) { return Number(s.day) === wd; });
        return rows.length ? String(rows[0].time || '') : '';
      }
      return firstTime(a).localeCompare(firstTime(b));
    });
  }

  function quickClassesHtml(iso) {
    var list = scheduledClasses(iso);
    if (!list.length) return '';
    var chips = list.map(function (c) {
      var times = c.schedule.filter(function (s) { return Number(s.day) === Jalali.weekdaySat0(iso); })
        .map(function (s) { return s.time ? Fmt.formatTime(s.time, I18n.lang) : ''; }).filter(Boolean).join('، ');
      return '<button type="button" class="quick-class" data-quick-class="' + esc(c.id) + '">' +
        '<span class="quick-class-icon">' + UI.icon('class', 17) + '</span>' +
        '<span><strong>' + esc(c.name) + '</strong><small>' + esc(times || t('classes.noSchedule')) + '</small></span>' +
      '</button>';
    }).join('');
    return '<div class="quick-section"><div class="section-title-row"><h3>' + esc(t('attendance.todayScheduled')) + '</h3></div>' +
      '<div class="quick-classes">' + chips + '</div></div>';
  }

  function selectionCard(state) {
    var classes = App.data.classes.slice().sort(function (a, b) {
      if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
      return String(a.name).localeCompare(String(b.name), 'fa');
    });
    var students = App.data.students.slice().sort(function (a, b) {
      if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
      return String(a.name).localeCompare(String(b.name), 'fa');
    });
    var classOptions = classes.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (state.classId === c.id ? ' selected' : '') + '>' +
        esc(c.name) + (c.archived ? ' (' + esc(t('common.archived')) + ')' : '') + '</option>';
    }).join('');
    var studentOptions = students.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (state.studentId === s.id ? ' selected' : '') + '>' +
        esc(s.name) + (s.archived ? ' (' + esc(t('common.archived')) + ')' : '') + '</option>';
    }).join('');
    var classEmpty = classes.length ? '' : '<p class="hint">' + esc(t('attendance.noClassesHint')) + '</p>';
    var studentEmpty = students.length ? '' : '<p class="hint">' + esc(t('attendance.noStudentsHint')) + '</p>';
    return '<section class="card attendance-select">' +
      '<div class="field"><span>' + esc(t('attendance.date')) + '</span>' +
        '<input type="hidden" name="attendanceDate" value="' + esc(state.date) + '">' +
        '<button type="button" class="input date-field" data-date-input="attendanceDate">' + esc(date(state.date, 'weekday')) + '</button></div>' +
      '<div class="segmented" role="group">' +
        '<button type="button" class="segment' + (state.mode === 'class' ? ' is-active' : '') + '" data-mode="class">' + UI.icon('class', 17) + ' ' + esc(t('attendance.modeClass')) + '</button>' +
        '<button type="button" class="segment' + (state.mode === 'private' ? ' is-active' : '') + '" data-mode="private">' + UI.icon('user', 17) + ' ' + esc(t('attendance.modePrivate')) + '</button>' +
      '</div>' +
      (state.mode === 'class'
        ? '<label class="field"><span>' + esc(t('attendance.chooseClass')) + '</span><select class="input" data-class-select>' +
            '<option value="">' + esc(t('common.select')) + '</option>' + classOptions + '</select>' + classEmpty + '</label>'
        : '<label class="field"><span>' + esc(t('attendance.chooseStudent')) + '</span><select class="input" data-student-select>' +
            '<option value="">' + esc(t('common.select')) + '</option>' + studentOptions + '</select>' + studentEmpty + '</label>') +
    '</section>';
  }

  function classInfoCard(cls, state) {
    var count = Billing.activeCountAt(App.data.enrollments, cls.id, state.date);
    var scheduled = Array.isArray(cls.schedule) && cls.schedule.some(function (s) { return Number(s.day) === Jalali.weekdaySat0(state.date); });
    return '<section class="card compact-card session-info">' +
      '<div class="section-head"><h3>' + esc(cls.name) + '</h3>' +
        '<span class="badge badge-' + (cls.type === 'group' ? 'violet' : 'amber') + '">' + esc(typeLabel(cls.type)) + '</span></div>' +
      '<div class="info-line">' + UI.icon('term', 15) + ' ' + esc(t('attendance.classInfo', { type: typeLabel(cls.type), model: modelLabel(cls.priceModel) })) + '</div>' +
      '<div class="info-line">' + UI.icon('users', 15) + ' ' + esc(t('classes.activeCount', { count: num(count) })) + '</div>' +
      (scheduled ? '' : '<p class="hint hint-warn">' + esc(t('attendance.notScheduled')) + '</p>') +
    '</section>';
  }

  function privateInfoCard(student, state) {
    var plan = student.privatePlan;
    var active = plan && Billing.planActive(plan, state.date);
    return '<section class="card compact-card session-info">' +
      '<div class="section-head"><h3>' + esc(student.name) + '</h3>' +
        '<span class="badge badge-teal">' + esc(t('attendance.privateLesson')) + '</span></div>' +
      (plan ? '<div class="info-line">' + UI.icon('term', 15) + ' ' + esc(modelLabel(plan.model)) + ' · ' + esc(Fmt.formatMoney(Billing.privateFeeAt(plan, state.date), I18n.lang)) + '</div>' +
        '<div class="info-line">' + UI.icon('check', 15) + ' ' + esc(active ? t('attendance.privatePlanActive') : t('students.privatePlanInactive')) + '</div>' : '') +
      (!active ? '<div class="banner banner-warn small-banner">' + UI.icon('alert', 17) + '<div><strong>' + esc(t('attendance.noPlanWarning')) + '</strong><p>' + esc(t('attendance.noPlanWarningHint')) + '</p></div></div>' : '') +
    '</section>';
  }

  function statusButtons(studentId, current) {
    return '<div class="att-controls" role="group" aria-label="' + esc(t('attendance.summary')) + '">' +
      ['present', 'late', 'absent'].map(function (status) {
        return '<button type="button" class="att-btn att-' + status + (current === status ? ' is-active' : '') + '" data-set-status="' + status + '" data-student-id="' + esc(studentId) + '">' +
          (status === 'present' ? UI.icon('check', 16) : status === 'late' ? UI.icon('clock', 16) : UI.icon('x', 16)) +
          '<span>' + esc(t('status.' + status)) + '</span></button>';
      }).join('') +
    '</div>';
  }

  function rosterRow(student, status, note) {
    return '<div class="att-row' + (status ? '' : ' is-unmarked') + '" data-att-row="' + esc(student.id) + '">' +
      UI.avatar(student.name) +
      '<div class="row-main"><span class="row-title">' + esc(student.name) + '</span>' +
        '<span class="row-sub">' + esc(note || '') + '</span></div>' +
      statusButtons(student.id, status) +
    '</div>';
  }

  function draftFor(state, session, rows) {
    if (!state.draft || state.draft.key !== sessionKeyFor(state)) {
      state.draft = { key: sessionKeyFor(state), statuses: {}, ids: {}, created: {} };
      rows.forEach(function (row) {
        state.draft.statuses[row.studentId] = row.status;
        state.draft.ids[row.studentId] = row.id;
        state.draft.created[row.studentId] = row.createdAt || '';
      });
    }
    return state.draft;
  }

  function summaryHtml(roster, draft) {
    var counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
    roster.forEach(function (s) {
      var st = draft.statuses[s.id];
      if (st === 'present') counts.present++;
      else if (st === 'late') counts.late++;
      else if (st === 'absent') counts.absent++;
      else counts.unmarked++;
    });
    return '<div class="att-summary" data-att-summary>' +
      '<span class="pill pill-present">' + esc(t('status.present')) + ' <strong data-att-count-present>' + num(counts.present) + '</strong></span>' +
      '<span class="pill pill-late">' + esc(t('status.late')) + ' <strong data-att-count-late>' + num(counts.late) + '</strong></span>' +
      '<span class="pill pill-absent">' + esc(t('status.absent')) + ' <strong data-att-count-absent>' + num(counts.absent) + '</strong></span>' +
      '<span class="pill pill-neutral" data-att-unmarked' + (counts.unmarked ? '' : ' hidden') + '>' + esc(t('attendance.unmarked', { count: num(counts.unmarked) })) + '</span>' +
    '</div>';
  }

  function refreshDraftUI(view, roster) {
    var draft = App.attState.draft;
    if (!draft) return;
    view.querySelectorAll('[data-att-row]').forEach(function (row) {
      var id = row.getAttribute('data-att-row');
      var status = draft.statuses[id];
      row.classList.toggle('is-unmarked', !status);
      row.querySelectorAll('[data-set-status]').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-set-status') === status);
      });
    });
    var counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
    roster.forEach(function (s) {
      var st = draft.statuses[s.id];
      if (st === 'present') counts.present++;
      else if (st === 'late') counts.late++;
      else if (st === 'absent') counts.absent++;
      else counts.unmarked++;
    });
    var p = view.querySelector('[data-att-count-present]');
    var l = view.querySelector('[data-att-count-late]');
    var a = view.querySelector('[data-att-count-absent]');
    var u = view.querySelector('[data-att-unmarked]');
    if (p) p.textContent = num(counts.present);
    if (l) l.textContent = num(counts.late);
    if (a) a.textContent = num(counts.absent);
    if (u) {
      u.textContent = t('attendance.unmarked', { count: num(counts.unmarked) });
      u.hidden = !counts.unmarked;
    }
  }

  function buildRoster(state, cls, student, session) {
    var rows = attendanceRows(session);
    var byStudent = {};
    rows.forEach(function (r) { byStudent[r.studentId] = r; });
    var roster = [];
    var seen = {};
    if (state.mode === 'class' && cls) {
      var enrollments = Billing.activeEnrollmentsAt(App.data.enrollments, cls.id, state.date);
      enrollments.forEach(function (e) {
        if (seen[e.studentId]) return;
        seen[e.studentId] = true;
        var s = App.getStudent(e.studentId);
        if (!s) return;
        roster.push({ student: s, note: typeLabel(s.type) + (s.level ? ' · ' + s.level : ''), active: true });
      });
      rows.forEach(function (r) {
        if (seen[r.studentId]) return;
        var s = App.getStudent(r.studentId);
        if (!s) return;
        seen[r.studentId] = true;
        roster.push({ student: s, note: t('classes.enrollmentEnded'), active: false });
      });
    } else if (student) {
      roster.push({
        student: student,
        note: student.privatePlan ? modelLabel(student.privatePlan.model) : t('attendance.noPlan'),
        active: true
      });
    }
    roster.sort(function (a, b) {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return String(a.student.name).localeCompare(String(b.student.name), 'fa');
    });
    return roster;
  }

  function canceledBanner(session, cls, student) {
    var mode = session.canceled === 'counted' ? t('attendance.countedBanner') : t('attendance.makeupBanner');
    return '<div class="banner banner-warn">' + UI.icon('alert', 20) +
      '<div><strong>' + esc(t('attendance.canceledBanner')) + '</strong><p>' + esc(mode) + '</p>' +
      (session.cancelReason ? '<p class="hint">' + esc(session.cancelReason) + '</p>' : '') +
      '<p class="hint">' + esc(cls ? cls.name : (student ? student.name : '')) + ' · ' + esc(date(session.date)) + '</p></div>' +
    '</div>' +
    '<div class="inline-actions">' +
      '<button type="button" class="btn ghost" data-undo-cancel>' + UI.icon('refresh', 17) + ' ' + esc(t('attendance.undoCancel')) + '</button>' +
      '<button type="button" class="btn ghost danger-text" data-delete-session>' + UI.icon('trash', 17) + ' ' + esc(t('attendance.deleteSession')) + '</button>' +
    '</div>';
  }

  function sessionActions(session) {
    return '<div class="inline-actions">' +
      '<button type="button" class="btn ghost danger-text" data-cancel-session>' + UI.icon('x', 17) + ' ' + esc(t('attendance.cancelSession')) + '</button>' +
      (session ? '<button type="button" class="btn ghost danger-text" data-delete-session>' + UI.icon('trash', 17) + ' ' + esc(t('attendance.deleteSession')) + '</button>' : '') +
    '</div>';
  }

  function openCancelDialog(state, session, cls, student) {
    var existing = session;
    var key = sessionKeyFor(state);
    var body =
      '<p class="hint">' + esc(t('attendance.cancelHint')) + '</p>' +
      '<label class="choice"><input type="radio" name="cancelMode" value="counted" checked>' +
        '<span><strong>' + esc(t('attendance.cancelCounted')) + '</strong><small>' + esc(t('attendance.cancelCountedHint')) + '</small></span></label>' +
      '<label class="choice"><input type="radio" name="cancelMode" value="makeup">' +
        '<span><strong>' + esc(t('attendance.cancelMakeup')) + '</strong><small>' + esc(t('attendance.cancelMakeupHint')) + '</small></span></label>' +
      '<label class="field"><span>' + esc(t('attendance.cancelReason')) + '</span>' +
        '<input class="input" name="reason" maxlength="200"></label>';
    return UI.formDialog({
      title: t('attendance.cancelSession'),
      body: body,
      submitLabel: t('attendance.confirmCancel'),
      danger: true,
      onSubmit: async function (fd) {
        var mode = String(fd.get('cancelMode') || 'counted');
        if (mode !== 'makeup') mode = 'counted';
        var reason = String(fd.get('reason') || '').trim();
        var rec = existing ? Object.assign({}, existing) : {
          id: DB.uid(),
          ownerType: state.mode,
          classId: state.mode === 'class' ? state.classId : null,
          studentId: state.mode === 'private' ? state.studentId : null,
          date: state.date,
          sessionKey: key,
          createdAt: DB.now()
        };
        rec.canceled = 'none';
        await DB.setSessionCanceled(rec, mode, reason);
        await App.reloadData();
        resetDraft();
        UI.toast(t('attendance.cancellationSaved'), 'success');
        App.rerender();
        return true;
      }
    });
  }

  Pages.attendance = function () {
    var state = App.attState;
    if (!state) {
      state = App.attState = { date: today(), mode: 'class', classId: null, studentId: null, draft: null };
    }
    if (!state.date || !Jalali.isValidISO(state.date)) state.date = today();
    if (state.mode !== 'private') state.mode = 'class';
    var cls = state.mode === 'class' && state.classId ? App.getClass(state.classId) : null;
    var student = state.mode === 'private' && state.studentId ? App.getStudent(state.studentId) : null;
    if (state.mode === 'class' && state.classId && !cls) state.classId = null;
    if (state.mode === 'private' && state.studentId && !student) state.studentId = null;

    var content = '<div class="page attendance-page">' + selectionCard(state);

    if (state.mode === 'class' && !cls) {
      content += quickClassesHtml(state.date) +
        '<div class="select-prompt">' + UI.emptyState('clipboard', t('attendance.selectPrompt'), t('attendance.selectClassFirst'),
          App.data.classes.length ? '' : '<button type="button" class="btn primary" data-new-class>' + UI.icon('plus', 18) + ' ' + esc(t('classes.add')) + '</button>') + '</div>';
    } else if (state.mode === 'private' && !student) {
      content += '<div class="select-prompt">' + UI.emptyState('user', t('attendance.selectPrompt'), t('attendance.selectStudentFirst'),
        App.data.students.length ? '' : '<button type="button" class="btn primary" data-new-student>' + UI.icon('plus', 18) + ' ' + esc(t('students.add')) + '</button>') + '</div>';
    } else {
      var session = findSession(state);
      var rows = attendanceRows(session);
      var roster = buildRoster(state, cls, student, session);
      if (state.mode === 'class') content += classInfoCard(cls, state);
      else content += privateInfoCard(student, state);

      if (session && session.canceled && session.canceled !== 'none') {
        content += canceledBanner(session, cls, student);
      } else {
        if (session && rows.length) content += '<p class="hint">' + esc(t('attendance.alreadyRecorded')) + '</p>';
        if (!roster.length) {
          content += UI.emptyState('users', t('attendance.noActiveStudents'), t('classes.noRosterHint'), '');
        } else {
          var draft = draftFor(state, session, rows);
          var rosterStudents = roster.map(function (r) { return r.student; });
          var rowsHtml = roster.map(function (r) {
            return rosterRow(r.student, draft.statuses[r.student.id], r.note);
          }).join('');
          content += '<section class="card attendance-card">' +
            '<div class="att-tools">' +
              '<button type="button" class="btn ghost btn-sm" data-all-present>' + UI.icon('check', 16) + ' ' + esc(t('attendance.markAllPresent')) + '</button>' +
              '<button type="button" class="btn ghost btn-sm" data-remaining-absent>' + UI.icon('x', 16) + ' ' + esc(t('attendance.markRemainingAbsent')) + '</button>' +
            '</div>' +
            summaryHtml(rosterStudents, draft) +
            '<div class="att-list">' + rowsHtml + '</div>' +
            '<div class="att-save">' +
              '<button type="button" class="btn primary btn-block" data-save-attendance>' + UI.icon('check', 18) + ' ' + esc(t('attendance.saveAttendance')) + '</button>' +
            '</div>' +
          '</section>';
        }
        content += sessionActions(session);
      }
    }
    content += '</div>';

    return {
      title: t('attendance.title'),
      nav: 'attendance',
      content: content,
      onMount: function (view) {
        UI.bindDateFields(view);
        var dateInput = view.querySelector('input[name="attendanceDate"]');
        if (dateInput) {
          dateInput.addEventListener('change', function () {
            state.date = dateInput.value;
            resetDraft();
            App.rerender();
          });
        }
        view.querySelectorAll('[data-mode]').forEach(function (b) {
          b.addEventListener('click', function () {
            state.mode = b.getAttribute('data-mode');
            resetDraft();
            App.rerender();
          });
        });
        var classSel = view.querySelector('[data-class-select]');
        if (classSel) classSel.addEventListener('change', function () {
          state.classId = classSel.value || null;
          resetDraft();
          App.rerender();
        });
        var studentSel = view.querySelector('[data-student-select]');
        if (studentSel) studentSel.addEventListener('change', function () {
          state.studentId = studentSel.value || null;
          resetDraft();
          App.rerender();
        });
        view.querySelectorAll('[data-quick-class]').forEach(function (b) {
          b.addEventListener('click', function () {
            state.mode = 'class';
            state.classId = b.getAttribute('data-quick-class');
            resetDraft();
            App.rerender();
          });
        });
        var newClass = view.querySelector('[data-new-class]');
        if (newClass) newClass.addEventListener('click', function () { App.navigate('#/classes/new'); });
        var newStudent = view.querySelector('[data-new-student]');
        if (newStudent) newStudent.addEventListener('click', function () { App.navigate('#/students/new'); });

        var activeSession = findSession(state);
        var activeCls = state.mode === 'class' && state.classId ? App.getClass(state.classId) : null;
        var activeStudent = state.mode === 'private' && state.studentId ? App.getStudent(state.studentId) : null;
        var activeRoster = (activeCls || activeStudent) ? buildRoster(state, activeCls, activeStudent, activeSession) : [];
        var rosterStudents = activeRoster.map(function (r) { return r.student; });
        var draft = state.draft;

        function setStatus(studentId, status) {
          if (!draft) return;
          draft.statuses[studentId] = status;
          refreshDraftUI(view, rosterStudents);
        }

        view.querySelectorAll('[data-set-status]').forEach(function (b) {
          b.addEventListener('click', function () {
            setStatus(b.getAttribute('data-student-id'), b.getAttribute('data-set-status'));
          });
        });
        var allPresent = view.querySelector('[data-all-present]');
        if (allPresent) allPresent.addEventListener('click', function () {
          if (!draft) return;
          rosterStudents.forEach(function (s) { draft.statuses[s.id] = 'present'; });
          refreshDraftUI(view, rosterStudents);
        });
        var remainingAbsent = view.querySelector('[data-remaining-absent]');
        if (remainingAbsent) remainingAbsent.addEventListener('click', function () {
          if (!draft) return;
          rosterStudents.forEach(function (s) { if (!draft.statuses[s.id]) draft.statuses[s.id] = 'absent'; });
          refreshDraftUI(view, rosterStudents);
        });
        var saveBtn = view.querySelector('[data-save-attendance]');
        if (saveBtn) saveBtn.addEventListener('click', async function () {
          if (!draft) return;
          var missing = rosterStudents.filter(function (s) { return !draft.statuses[s.id]; });
          if (missing.length) {
            UI.toast(t('attendance.unmarked', { count: num(missing.length) }), 'error');
            return;
          }
          saveBtn.disabled = true;
          try {
            var key = sessionKeyFor(state);
            var rec = activeSession ? Object.assign({}, activeSession) : {
              id: DB.uid(),
              ownerType: state.mode,
              classId: state.mode === 'class' ? state.classId : null,
              studentId: state.mode === 'private' ? state.studentId : null,
              date: state.date,
              sessionKey: key,
              canceled: 'none',
              cancelReason: '',
              createdAt: DB.now()
            };
            rec.sessionKey = key;
            rec.canceled = 'none';
            rec.cancelReason = '';
            rec.updatedAt = DB.now();
            var newRows = rosterStudents.map(function (s) {
              return {
                id: draft.ids[s.id] || DB.uid(),
                sessionId: rec.id,
                studentId: s.id,
                status: draft.statuses[s.id],
                createdAt: draft.created[s.id] || DB.now(),
                updatedAt: DB.now()
              };
            });
            await DB.saveAttendanceSession(rec, newRows);
            await App.reloadData();
            resetDraft();
            UI.toast(t('attendance.saved'), 'success');
            App.rerender();
          } catch (err) {
            UI.toast(err && err.userMessage ? err.userMessage : t('error.generic'), 'error');
            saveBtn.disabled = false;
          }
        });
        var cancelBtn = view.querySelector('[data-cancel-session]');
        if (cancelBtn) cancelBtn.addEventListener('click', function () {
          openCancelDialog(state, activeSession, activeCls, activeStudent);
        });
        var undoBtn = view.querySelector('[data-undo-cancel]');
        if (undoBtn) undoBtn.addEventListener('click', async function () {
          if (!activeSession) return;
          var ok = await UI.confirm({ title: t('attendance.undoCancel'), message: t('attendance.undoCancelHint'), danger: true, confirmLabel: t('common.confirm') });
          if (!ok) return;
          await DB.deleteSession(activeSession.id);
          await App.reloadData();
          resetDraft();
          App.rerender();
        });
        view.querySelectorAll('[data-delete-session]').forEach(function (b) {
          b.addEventListener('click', async function () {
            if (!activeSession) return;
            var ok = await UI.confirm({ title: t('attendance.deleteSessionConfirm'), message: t('attendance.deleteSessionHint'), danger: true, confirmLabel: t('common.delete') });
            if (!ok) return;
            await DB.deleteSession(activeSession.id);
            await App.reloadData();
            resetDraft();
            UI.toast(t('attendance.sessionDeleted'), 'success');
            App.rerender();
          });
        });
      }
    };
  };
})();
