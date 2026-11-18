/* pages-money.js — student balances, payment history and payment dialogs. */
(function () {
  'use strict';

  var Pages = window.Pages = window.Pages || {};

  function t(key, vars) { return I18n.t(key, vars); }
  function esc(value) { return UI.escapeHtml(value); }
  function money(value) { return Fmt.formatMoney(value, I18n.lang); }
  function date(iso, style) { return iso ? Fmt.formatDate(iso, I18n.lang, style) : '—'; }
  function today() { return Jalali.todayISO(); }
  function num(value) { return Fmt.formatNumber(value, I18n.lang); }

  function summaryOf(id) {
    return App.billing && App.billing.byId ? App.billing.byId[id] : null;
  }

  function statusClass(summary) {
    if (!summary || summary.balance === 0) return 'paid';
    return summary.balance > 0 ? 'owes' : 'credit';
  }

  function statusBadge(summary) {
    var s = statusClass(summary);
    if (s === 'owes') return UI.badge(t('status.owes'), 'danger');
    if (s === 'credit') return UI.badge(t('status.credit'), 'info');
    return UI.badge(t('status.paid'), 'success');
  }

  function balanceText(summary) {
    if (!summary || summary.balance === 0) return t('money.paidUp');
    return money(Math.abs(summary.balance));
  }

  function studentSearchText(student) {
    return App.normalizeSearch([student.name, student.phone, student.level].join(' '));
  }

  function studentName(id) {
    var student = App.data.students.find(function (s) { return s.id === id; });
    return student ? student.name : t('common.unknown');
  }

  function pendingProofs() {
    return window.Sync && Sync.pendingProofs ? Sync.pendingProofs().slice().sort(function (a, b) {
      return String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''));
    }) : [];
  }

  function proofRowsHtml() {
    return pendingProofs().map(function (proof) {
      return '<div class="proof-row">' +
        '<span class="proof-icon">' + UI.icon('eye', 19) + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(studentName(proof.studentId)) + '</span>' +
          '<span class="row-sub">' + esc(money(proof.amount)) + ' · ' + esc(date(proof.date)) + '</span>' +
          (proof.note ? '<span class="row-sub proof-note">' + esc(proof.note) + '</span>' : '') +
        '</span>' +
        '<button type="button" class="btn primary btn-sm" data-review-proof="' + esc(proof.id) + '">' + esc(t('cloud.proofReview')) + '</button>' +
      '</div>';
    }).join('');
  }

  function allStudentsSorted() {
    return App.data.students.slice().sort(function (a, b) {
      var aSummary = summaryOf(a.id);
      var bSummary = summaryOf(b.id);
      var aOwes = aSummary && aSummary.balance > 0 ? 0 : 1;
      var bOwes = bSummary && bSummary.balance > 0 ? 0 : 1;
      if (aOwes !== bOwes) return aOwes - bOwes;
      if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
      return String(a.name).localeCompare(String(b.name), 'fa');
    });
  }

  Pages.money = function () {
    var filter = App.moneyFilter || 'all';
    var search = App.moneySearch || '';
    var students = allStudentsSorted();
    var rows = students.filter(function (s) {
      var summary = summaryOf(s.id);
      if (filter === 'owes') return summary && summary.balance > 0;
      if (filter === 'credit') return summary && summary.balance < 0;
      return true;
    }).map(function (student) {
      var summary = summaryOf(student.id);
      var sub = [];
      if (student.phone) sub.push(Fmt.formatPhone(student.phone, I18n.lang));
      if (student.level) sub.push(esc(student.level));
      if (!sub.length) sub.push(t('type.' + (student.type || 'private')));
      return '<button type="button" class="list-row money-row" data-student="' + esc(student.id) + '" data-search="' + esc(studentSearchText(student)) + '">' +
        UI.avatar(student.name) +
        '<span class="row-main"><span class="row-title">' + esc(student.name) + (student.archived ? ' ' + UI.badge(t('students.archivedBadge'), 'neutral') : '') + '</span>' +
          '<span class="row-sub">' + sub.join(' · ') + '</span></span>' +
        '<span class="row-end money-end">' +
          '<span class="money-amount money-' + statusClass(summary) + '">' + esc(balanceText(summary)) + '</span>' +
          statusBadge(summary) +
        '</span>' +
      '</button>';
    }).join('');
    var active = App.data.students.filter(function (s) { return !s.archived; });
    var outstanding = active.reduce(function (sum, s) {
      var summary = summaryOf(s.id);
      return sum + (summary && summary.balance > 0 ? summary.balance : 0);
    }, 0);
    var owesCount = active.filter(function (s) {
      var summary = summaryOf(s.id);
      return summary && summary.balance > 0;
    }).length;
    var pending = pendingProofs();
    var noStudents = App.data.students.length === 0;
    var empty = noStudents
      ? UI.emptyState('users', t('money.noStudents'), t('home.stepStudents'),
          '<button type="button" class="btn primary" data-add-student>' + UI.icon('plus', 18) + ' ' + esc(t('students.add')) + '</button>')
      : UI.emptyState('search', t('money.noFilterResults'), t('students.noResultsHint'), '');

    return {
      title: t('money.title'),
      nav: 'money',
      content: '<div class="page">' +
        '<div class="page-head"><div><h2 class="page-title">' + esc(t('money.title')) + '</h2>' +
          '<p class="page-sub">' + esc(t('money.studentsOwes', { count: num(owesCount) })) + '</p></div>' +
          '<button type="button" class="btn primary btn-sm" data-add-payment>' + UI.icon('plus', 18) + ' ' + esc(t('money.addPayment')) + '</button></div>' +
        '<section class="outstanding-card">' +
          '<div><p class="eyebrow">' + esc(t('money.outstandingTotal')) + '</p>' +
            '<strong>' + esc(money(outstanding)) + '</strong>' +
            '<p class="hint">' + esc(t('money.balanceHint')) + '</p></div>' +
          '<div class="outstanding-icon">' + UI.icon('wallet', 30) + '</div>' +
        '</section>' +
        (pending.length ? '<section class="card proof-review-card">' +
          '<div class="section-head"><h3>' + UI.icon('eye', 19) + ' ' + esc(t('cloud.pendingProofs')) + ' ' + UI.badge(Fmt.formatNumber(pending.length, I18n.lang), 'amber') + '</h3></div>' +
          '<div class="proof-list">' + proofRowsHtml() + '</div>' +
        '</section>' : '') +
        '<div class="search-bar">' + UI.icon('search', 19) +
          '<input type="search" class="search-input" data-money-search placeholder="' + esc(t('money.searchPlaceholder')) + '" value="' + esc(search) + '" autocomplete="off">' +
        '</div>' +
        '<div class="chips" role="group">' +
          '<button type="button" class="chip' + (filter === 'all' ? ' is-active' : '') + '" data-filter="all">' + esc(t('money.filterAll')) + '</button>' +
          '<button type="button" class="chip' + (filter === 'owes' ? ' is-active' : '') + '" data-filter="owes">' + esc(t('money.filterOwes')) + '</button>' +
          '<button type="button" class="chip' + (filter === 'credit' ? ' is-active' : '') + '" data-filter="credit">' + esc(t('money.filterCredit')) + '</button>' +
        '</div>' +
        '<div class="list" data-money-list>' + rows + '</div>' +
        '<div class="search-empty" data-search-empty hidden>' + empty + '</div>' +
        (rows ? '' : '<div class="list-empty">' + empty + '</div>') +
      '</div>',
      onMount: function (view) {
        var input = view.querySelector('[data-money-search]');
        var list = view.querySelector('[data-money-list]');
        var searchEmpty = view.querySelector('[data-search-empty]');
        var listEmpty = view.querySelector('.list-empty');
        function applySearch() {
          var q = App.normalizeSearch(input.value);
          App.moneySearch = input.value;
          var visible = 0;
          list.querySelectorAll('[data-student]').forEach(function (row) {
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
        view.querySelectorAll('[data-filter]').forEach(function (b) {
          b.addEventListener('click', function () {
            App.moneyFilter = b.getAttribute('data-filter');
            App.rerender();
          });
        });
        view.querySelectorAll('[data-add-payment]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.openPaymentDialog({}); });
        });
        view.querySelectorAll('[data-review-proof]').forEach(function (b) {
          b.addEventListener('click', function () { Pages.openProofDialog(b.getAttribute('data-review-proof')); });
        });
        var addStudent = view.querySelector('[data-add-student]');
        if (addStudent) addStudent.addEventListener('click', function () { App.navigate('#/students/new'); });
        list.querySelectorAll('[data-student]').forEach(function (row) {
          row.addEventListener('click', function () {
            App.navigate('#/students/' + encodeURIComponent(row.getAttribute('data-student')) + '?tab=money');
          });
        });
      }
    };
  };

  Pages.openPaymentDialog = function (opts) {
    opts = opts || {};
    var payment = opts.paymentId ? App.data.payments.find(function (p) { return p.id === opts.paymentId; }) : null;
    var students = allStudentsSorted();
    if (!students.length) {
      UI.alert({ title: t('money.addPayment'), message: t('money.noStudents') });
      return Promise.resolve(false);
    }
    var selectedId = payment ? payment.studentId : (opts.studentId || students[0].id);
    var options = students.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === selectedId ? ' selected' : '') + '>' +
        esc(s.name) + (s.archived ? ' (' + esc(t('common.archived')) + ')' : '') + '</option>';
    }).join('');
    var body =
      '<label class="field"><span>' + esc(t('money.paymentFor')) + '</span><select class="input" name="studentId">' + options + '</select></label>' +
      '<label class="field"><span>' + esc(t('money.amountToman')) + ' <em>*</em></span>' +
        '<input class="input money-input" name="amount" data-money inputmode="numeric" dir="ltr" value="' + (payment ? esc(Fmt.formatNumber(payment.amount, I18n.lang)) : '') + '" placeholder="' + esc(t('money.amountPlaceholder')) + '"></label>' +
      '<div class="field"><span>' + esc(t('money.paymentDate')) + '</span>' +
        '<input type="hidden" name="date" value="' + esc(payment ? payment.date : today()) + '">' +
        '<button type="button" class="input date-field" data-date-input="date">' + esc(date(payment ? payment.date : today())) + '</button></div>' +
      '<label class="field"><span>' + esc(t('money.note')) + '</span>' +
        '<input class="input" name="note" maxlength="200" value="' + esc(payment ? payment.note : '') + '" placeholder="' + esc(t('money.notePlaceholder')) + '"></label>';
    return UI.formDialog({
      title: payment ? t('money.editPayment') : t('money.addPayment'),
      body: body,
      submitLabel: t('money.savePayment'),
      onSubmit: async function (fd) {
        var studentId = String(fd.get('studentId') || '');
        var amount = Fmt.parseAmount(fd.get('amount'));
        var d = String(fd.get('date') || '');
        if (!studentId) throw userError(t('money.selectStudent'));
        if (amount === null || amount <= 0) throw userError(t('money.invalidAmount'));
        if (!Jalali.isValidISO(d)) throw userError(t('validation.invalidDate'));
        var rec = Object.assign({}, payment || {}, {
          id: payment ? payment.id : DB.uid(),
          studentId: studentId,
          amount: amount,
          date: d,
          note: String(fd.get('note') || '').trim(),
          createdAt: payment && payment.createdAt ? payment.createdAt : DB.now(),
          updatedAt: DB.now()
        });
        await DB.put('payments', rec);
        await App.reloadData();
        UI.toast(payment ? t('money.paymentUpdated') : t('money.paymentSaved'), 'success');
        App.rerender();
        return true;
      }
    });
  };

  Pages.openProofDialog = async function (proofId) {
    var proof = (App.data.proofs || []).find(function (p) { return p.id === proofId; });
    if (!proof || proof.status !== 'pending') {
      UI.alert({ title: t('cloud.proofReview'), message: t('cloud.noProofs') });
      return;
    }
    if (!window.Sync) {
      UI.alert({ title: t('cloud.error'), message: t('cloud.authRequired') });
      return;
    }
    var body = '<div class="proof-dialog">' +
      '<div class="proof-preview" data-proof-preview><p class="hint">' + esc(t('cloud.previewLoading')) + '</p></div>' +
      '<dl class="proof-facts">' +
        '<div><dt>' + esc(t('students.name')) + '</dt><dd>' + esc(studentName(proof.studentId)) + '</dd></div>' +
        '<div><dt>' + esc(t('cloud.proofAmount')) + '</dt><dd>' + esc(money(proof.amount)) + '</dd></div>' +
        '<div><dt>' + esc(t('cloud.proofDate')) + '</dt><dd>' + esc(date(proof.date)) + '</dd></div>' +
        (proof.note ? '<div><dt>' + esc(t('cloud.proofNote')) + '</dt><dd>' + esc(proof.note) + '</dd></div>' : '') +
      '</dl></div>';
    var choice = await UI.dialog({
      title: t('cloud.proofReview'),
      body: body,
      size: 'wide',
      actions: [
        { label: t('cloud.proofReject'), value: 'reject', variant: 'ghost' },
        { label: t('cloud.proofApprove'), value: 'approve', variant: 'primary' },
        { label: t('common.close'), value: null, variant: 'ghost' }
      ],
      onMount: function (el) {
        var wrap = el.querySelector('[data-proof-preview]');
        if (!wrap || !window.Sync || !Sync.getReceiptImage) {
          if (wrap) wrap.innerHTML = '<p class="hint">' + esc(t('cloud.proofMissing')) + '</p>';
          return;
        }
        Sync.getReceiptImage(proof).then(function (blob) {
          var url = URL.createObjectURL(blob);
          var img = document.createElement('img');
          img.alt = t('cloud.proofReview');
          img.src = url;
          wrap.innerHTML = '';
          wrap.appendChild(img);
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        }).catch(function (err) {
          console.error(err);
          wrap.innerHTML = '<p class="hint">' + esc(t('cloud.previewFailed')) + '</p>';
        });
      }
    });
    if (choice === 'approve') await approveProofDialog(proof);
    else if (choice === 'reject') await rejectProofDialog(proof);
  };

  async function approveProofDialog(proof) {
    var result = await UI.formDialog({
      title: t('cloud.proofApprove'),
      body:
        '<label class="field"><span>' + esc(t('cloud.proofAmount')) + ' <em>*</em></span>' +
          '<input class="input money-input" name="amount" data-money inputmode="numeric" dir="ltr" value="' + esc(Fmt.formatNumber(proof.amount, I18n.lang)) + '"></label>' +
        '<div class="field"><span>' + esc(t('cloud.proofDate')) + '</span>' +
          '<input type="hidden" name="date" value="' + esc(proof.date) + '">' +
          '<button type="button" class="input date-field" data-date-input="date">' + esc(date(proof.date)) + '</button></div>' +
        '<label class="field"><span>' + esc(t('cloud.reviewNote')) + '</span>' +
          '<input class="input" name="reviewNote" maxlength="500" placeholder="' + esc(t('cloud.reviewNotePlaceholder')) + '"></label>',
      submitLabel: t('cloud.proofApprove'),
      onSubmit: async function (fd) {
        var amount = Fmt.parseAmount(fd.get('amount'));
        var d = String(fd.get('date') || '');
        if (amount === null || amount <= 0) throw userError(t('money.invalidAmount'));
        if (!Jalali.isValidISO(d)) throw userError(t('validation.invalidDate'));
        await Sync.reviewProof(proof.id, 'approve', {
          amount: amount,
          date: d,
          note: proof.note,
          reviewNote: String(fd.get('reviewNote') || '').trim()
        });
        await App.reloadData();
        UI.toast(t('cloud.proofApproved'), 'success');
        App.rerender();
        return true;
      }
    });
    return result;
  }

  async function rejectProofDialog(proof) {
    var result = await UI.formDialog({
      title: t('cloud.proofReject'),
      body: '<label class="field"><span>' + esc(t('cloud.reviewNote')) + '</span>' +
        '<input class="input" name="reviewNote" maxlength="500" placeholder="' + esc(t('cloud.reviewNotePlaceholder')) + '"></label>',
      submitLabel: t('cloud.proofReject'),
      danger: true,
      onSubmit: async function (fd) {
        await Sync.reviewProof(proof.id, 'reject', {
          reviewNote: String(fd.get('reviewNote') || '').trim()
        });
        await App.reloadData();
        UI.toast(t('cloud.proofRejected'), 'success');
        App.rerender();
        return true;
      }
    });
    return result;
  }

  Pages.deletePayment = async function (paymentId) {
    var ok = await UI.confirm({
      title: t('money.deletePayment'),
      message: t('money.deletePaymentConfirm') + '\n\n' + t('money.deletePaymentHint'),
      danger: true,
      confirmLabel: t('common.delete')
    });
    if (!ok) return;
    await DB.deletePayment(paymentId);
    await App.reloadData();
    UI.toast(t('money.paymentDeleted'), 'success');
    App.rerender();
  };

  function userError(message) {
    var e = new Error(message);
    e.userMessage = message;
    return e;
  }
})();
