/* ui.js — shared buttons, dialogs, date picker, charts and small helpers. */
(function (root) {
  'use strict';

  var iconPaths = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="m9 13 2 2 4-4"/>',
    wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/><path d="M16 12h.01"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8"/><path d="M10 12h4"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M8 7h8M8 11h6"/>',
    notes: '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    install: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/><rect x="3" y="3" width="18" height="18" rx="3"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    class: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/><path d="M8 9h8M8 13h5"/>',
    money: '<circle cx="12" cy="12" r="9"/><path d="M8 9h8M8 15h8M12 7v10"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
    term: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/><path d="M4 9h16"/>',
    cloud: '<path d="M17.5 19H7a5 5 0 0 1-.8-9.9A7 7 0 0 1 19.6 11 4 4 0 0 1 17.5 19Z"/>',
    drive: '<path d="M12 3 3 18h5l9-15Z"/><path d="M12 3h5l4 8"/><path d="M8 18l-3 3h13l3-3"/>'
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, size, extraClass) {
    var path = iconPaths[name] || iconPaths.info;
    var cls = 'icon' + (extraClass ? ' ' + extraClass : '') + (name === 'back' ? ' flip-rtl' : '');
    return '<svg class="' + cls + '" width="' + (size || 20) + '" height="' + (size || 20) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }

  function toast(message, type, timeout) {
    var host = document.getElementById('toastRoot');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.setAttribute('role', 'status');
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 250);
    }, timeout || 3200);
  }

  var modalSeq = 0;

  function makeDialog(options) {
    var dialog = document.createElement('dialog');
    dialog.className = 'modal' + (options.size ? ' modal-' + options.size : '');
    var titleId = 'modalTitle-' + (++modalSeq);
    var title = options.title ? '<h2 id="' + titleId + '">' + escapeHtml(options.title) + '</h2>' : '';
    dialog.setAttribute('aria-labelledby', options.title ? titleId : '');
    dialog.innerHTML =
      '<div class="modal-card">' +
        '<div class="modal-head">' +
          '<div>' + title + '</div>' +
          '<button type="button" class="icon-btn modal-close" aria-label="' + escapeHtml(I18n.t('common.close')) + '">' + icon('x', 20) + '</button>' +
        '</div>' +
        '<div class="modal-content">' + (options.body || '') + '</div>' +
      '</div>';
    var rootEl = document.getElementById('modalRoot');
    rootEl.appendChild(dialog);
    var closed = false;
    function close(value) {
      if (closed) return;
      closed = true;
      try { dialog.close(); } catch (_) {}
      dialog.remove();
      if (options.onClose) options.onClose(value);
    }
    dialog.addEventListener('cancel', function (e) {
      e.preventDefault();
      close(null);
    });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) close(null);
    });
    dialog.querySelector('.modal-close').addEventListener('click', function () { close(null); });
    if (options.onMount) options.onMount(dialog, close);
    dialog.showModal();
    setTimeout(function () {
      var focusable = dialog.querySelector('input:not([type="hidden"]), select, textarea, button:not(.modal-close)');
      if (focusable) focusable.focus();
    }, 30);
    return { dialog: dialog, close: close };
  }

  function dialog(options) {
    return new Promise(function (resolve) {
      var actions = (options.actions || []).map(function (a, i) {
        return '<button type="button" class="btn ' + (a.variant || 'ghost') + '" data-action="' + i + '">' + escapeHtml(a.label) + '</button>';
      }).join('');
      var ref = makeDialog({
        title: options.title,
        body: (options.body || '') +
          (actions ? '<div class="modal-actions">' + actions + '</div>' : ''),
        size: options.size,
        onMount: function (el, close) {
          el.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var action = options.actions[Number(btn.getAttribute('data-action'))];
              close(action.value === undefined ? true : action.value);
            });
          });
          if (options.onMount) options.onMount(el, close);
        },
        onClose: function (value) { resolve(value); }
      });
    });
  }

  function formDialog(options) {
    return new Promise(function (resolve) {
      var ref = makeDialog({
        title: options.title,
        size: options.size,
        body:
          '<form class="modal-form" novalidate>' +
            '<div class="modal-body">' + (options.body || '') + '<p class="form-error" role="alert" hidden></p></div>' +
            '<div class="modal-actions">' +
              '<button type="button" class="btn ghost" data-cancel>' + escapeHtml(options.cancelLabel || I18n.t('common.cancel')) + '</button>' +
              '<button type="submit" class="btn ' + (options.danger ? 'danger' : 'primary') + '">' + escapeHtml(options.submitLabel || I18n.t('common.save')) + '</button>' +
            '</div>' +
          '</form>',
        onMount: function (el, close) {
          var form = el.querySelector('form');
          var errorEl = el.querySelector('.form-error');
          var submitBtn = form.querySelector('button[type="submit"]');
          form.querySelector('[data-cancel]').addEventListener('click', function () { close(null); });
          if (UI.bindDateFields) UI.bindDateFields(form);
          if (UI.bindMoneyFields) UI.bindMoneyFields(form);
          form.addEventListener('submit', async function (e) {
            e.preventDefault();
            errorEl.hidden = true;
            submitBtn.disabled = true;
            try {
              var result = await options.onSubmit(new FormData(form), form);
              close(result === undefined ? true : result);
            } catch (err) {
              errorEl.textContent = err && err.userMessage ? err.userMessage : I18n.t('error.generic');
              errorEl.hidden = false;
              submitBtn.disabled = false;
            }
          });
          if (options.onMount) options.onMount(el, close);
        },
        onClose: function (value) { resolve(value); }
      });
    });
  }

  function confirm(options) {
    return dialog({
      title: options.title || I18n.t('common.confirm'),
      body: '<p class="confirm-text">' + escapeHtml(options.message || '') + '</p>',
      actions: [
        { label: options.cancelLabel || I18n.t('common.cancel'), value: false, variant: 'ghost' },
        { label: options.confirmLabel || I18n.t('common.confirm'), value: true, variant: options.danger ? 'danger' : 'primary' }
      ]
    }).then(function (value) { return value === true; });
  }

  function alert(options) {
    return dialog({
      title: options.title || I18n.t('common.done'),
      body: '<p class="confirm-text">' + escapeHtml(options.message || '') + '</p>',
      actions: [{ label: I18n.t('common.close'), value: true, variant: 'primary' }]
    });
  }

  function promptWord(options) {
    return formDialog({
      title: options.title,
      submitLabel: options.confirmLabel,
      danger: true,
      body:
        '<p class="confirm-text">' + escapeHtml(options.message || '') + '</p>' +
        '<label class="field"><span>' + escapeHtml(options.label || '') + '</span>' +
          '<input class="input" name="word" autocomplete="off" spellcheck="false" required>' +
        '</label>',
      onSubmit: function (fd) {
        if (String(fd.get('word') || '').trim() !== options.expected) {
          var e = new Error('word');
          e.userMessage = I18n.t('settings.deleteWordMismatch');
          throw e;
        }
        return true;
      }
    }).then(function (value) { return value === true; });
  }

  function bindDateFields(rootEl) {
    (rootEl || document).querySelectorAll('[data-date-input]').forEach(function (btn) {
      if (btn.dataset.dateBound) return;
      btn.dataset.dateBound = '1';
      var name = btn.getAttribute('data-date-input');
      var input = (rootEl || document).querySelector('input[name="' + name + '"]');
      if (!input) return;
      function refresh() {
        var iso = input.value;
        btn.textContent = iso ? Fmt.formatDate(iso, I18n.lang, 'long') : I18n.t('picker.chooseDate');
      }
      refresh();
      btn.addEventListener('click', async function () {
        var picked = await datePicker({ value: input.value || Jalali.todayISO(), title: I18n.t('picker.chooseDate') });
        if (picked) {
          input.value = picked;
          refresh();
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
  }

  function bindMoneyFields(rootEl) {
    (rootEl || document).querySelectorAll('input[data-money]').forEach(function (input) {
      if (input.dataset.moneyBound) return;
      input.dataset.moneyBound = '1';
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('dir', 'ltr');
      input.addEventListener('focus', function () {
        input.value = Fmt.toEnDigits(input.value).replace(/[^\d.]/g, '');
      });
      input.addEventListener('blur', function () {
        var n = Fmt.parseAmount(input.value);
        if (n !== null && input.value.trim() !== '') input.value = Fmt.formatNumber(n, I18n.lang);
      });
    });
  }

  function datePicker(options) {
    var initial = options && options.value && Jalali.isValidISO(options.value) ? options.value : Jalali.todayISO();
    var startJ = Jalali.gToJ(initial);
    var view = { jy: startJ.jy, jm: startJ.jm };
    var selected = initial;
    return new Promise(function (resolve) {
      var ref = makeDialog({
        title: (options && options.title) || I18n.t('picker.chooseDate'),
        size: 'date',
        body: '<div class="date-picker">' +
          '<div class="cal-toolbar">' +
            '<button type="button" class="icon-btn" data-prev aria-label="' + escapeHtml(I18n.t('picker.prevMonth')) + '">' + icon(I18n.isRTL() ? 'chevron-right' : 'chevron-left', 20) + '</button>' +
            '<div class="cal-selects">' +
              '<select class="input cal-month" aria-label="' + escapeHtml(I18n.t('picker.month')) + '"></select>' +
              '<select class="input cal-year" aria-label="' + escapeHtml(I18n.t('picker.year')) + '"></select>' +
            '</div>' +
            '<button type="button" class="icon-btn" data-next aria-label="' + escapeHtml(I18n.t('picker.nextMonth')) + '">' + icon(I18n.isRTL() ? 'chevron-left' : 'chevron-right', 20) + '</button>' +
          '</div>' +
          '<div class="cal-weekdays"></div>' +
          '<div class="cal-grid" role="grid"></div>' +
          '<div class="modal-actions cal-actions">' +
            '<button type="button" class="btn ghost" data-cancel>' + escapeHtml(I18n.t('picker.cancel')) + '</button>' +
            '<button type="button" class="btn primary" data-today>' + escapeHtml(I18n.t('picker.today')) + '</button>' +
          '</div>' +
        '</div>',
        onMount: function (el, close) {
          var monthSel = el.querySelector('.cal-month');
          var yearSel = el.querySelector('.cal-year');
          var grid = el.querySelector('.cal-grid');
          var weekdays = el.querySelector('.cal-weekdays');
          var todayJ = Jalali.todayJ();
          var minYear = Math.min(view.jy, todayJ.jy) - 20;
          var maxYear = Math.max(view.jy, todayJ.jy) + 10;

          for (var m = 1; m <= 12; m++) {
            var opt = document.createElement('option');
            opt.value = String(m);
            opt.textContent = Fmt.monthName(m, I18n.lang);
            monthSel.appendChild(opt);
          }
          for (var y = minYear; y <= maxYear; y++) {
            var yo = document.createElement('option');
            yo.value = String(y);
            yo.textContent = Fmt.localizeDigits(y, I18n.lang);
            yearSel.appendChild(yo);
          }
          weekdays.innerHTML = [0, 1, 2, 3, 4, 5, 6].map(function (i) {
            return '<span>' + escapeHtml(Fmt.weekdayName(i, I18n.lang, true)) + '</span>';
          }).join('');

          function ensureYearOptions() {
            var min = Math.min(view.jy, todayJ.jy) - 20;
            var max = Math.max(view.jy, todayJ.jy) + 10;
            if (yearSel.options.length && Number(yearSel.options[0].value) === min && Number(yearSel.options[yearSel.options.length - 1].value) === max) return;
            yearSel.innerHTML = '';
            for (var y2 = min; y2 <= max; y2++) {
              var yo2 = document.createElement('option');
              yo2.value = String(y2);
              yo2.textContent = Fmt.localizeDigits(y2, I18n.lang);
              yearSel.appendChild(yo2);
            }
          }

          function render() {
            ensureYearOptions();
            monthSel.value = String(view.jm);
            yearSel.value = String(view.jy);
            var firstCol = Jalali.firstWeekdayColumn(view.jy, view.jm);
            var len = Jalali.jMonthLength(view.jy, view.jm);
            var todayISO = Jalali.todayISO();
            var html = '';
            for (var b = 0; b < firstCol; b++) html += '<span class="cal-empty" aria-hidden="true"></span>';
            for (var d = 1; d <= len; d++) {
              var iso = Jalali.jToG(view.jy, view.jm, d);
              var classes = 'cal-day';
              if (iso === todayISO) classes += ' is-today';
              if (iso === selected) classes += ' is-selected';
              html += '<button type="button" class="' + classes + '" data-date="' + iso + '" role="gridcell">' +
                '<span>' + Fmt.localizeDigits(d, I18n.lang) + '</span></button>';
            }
            grid.innerHTML = html;
            grid.querySelectorAll('[data-date]').forEach(function (b) {
              b.addEventListener('click', function () {
                selected = b.getAttribute('data-date');
                close(selected);
              });
            });
          }
          monthSel.addEventListener('change', function () {
            view.jm = Number(monthSel.value);
            render();
          });
          yearSel.addEventListener('change', function () {
            view.jy = Number(yearSel.value);
            render();
          });
          el.querySelector('[data-prev]').addEventListener('click', function () {
            var n = Jalali.addJMonths(view.jy, view.jm, -1);
            view = n;
            render();
          });
          el.querySelector('[data-next]').addEventListener('click', function () {
            var n = Jalali.addJMonths(view.jy, view.jm, 1);
            view = n;
            render();
          });
          el.querySelector('[data-today]').addEventListener('click', function () {
            close(Jalali.todayISO());
          });
          el.querySelector('[data-cancel]').addEventListener('click', function () { close(null); });
          render();
        },
        onClose: function (value) { resolve(value || null); }
      });
    });
  }

  function badge(text, variant) {
    return '<span class="badge badge-' + (variant || 'neutral') + '">' + escapeHtml(text) + '</span>';
  }

  function statusPill(status, canceled) {
    if (status === 'canceled') {
      var label = canceled === 'counted' ? I18n.t('status.counted') : I18n.t('status.makeup');
      return '<span class="pill pill-canceled">' + escapeHtml(label) + '</span>';
    }
    var cls = status === 'present' ? 'present' : status === 'late' ? 'late' : status === 'absent' ? 'absent' : 'neutral';
    var text = status === 'present' ? I18n.t('status.present') : status === 'late' ? I18n.t('status.late') : status === 'absent' ? I18n.t('status.absent') : status;
    return '<span class="pill pill-' + cls + '">' + escapeHtml(text) + '</span>';
  }

  function emptyState(iconName, title, text, actionHtml) {
    return '<div class="empty-state">' +
      '<div class="empty-icon">' + icon(iconName || 'info', 30) + '</div>' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      '<p>' + escapeHtml(text || '') + '</p>' +
      (actionHtml ? '<div class="empty-action">' + actionHtml + '</div>' : '') +
    '</div>';
  }

  function avatar(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    var letters = parts.slice(0, 2).map(function (p) { return p.charAt(0); }).join('');
    if (!letters) letters = '?';
    return '<span class="avatar" aria-hidden="true">' + escapeHtml(letters) + '</span>';
  }

  function chart(points) {
    var data = (points || []).filter(function (p) { return p && isFinite(Number(p.score)); });
    if (!data.length) return '';
    data.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var W = 320, H = 170, left = 34, right = 14, top = 16, bottom = 30;
    var scores = data.map(function (p) { return Number(p.score); });
    var min = Math.min.apply(null, scores), max = Math.max.apply(null, scores);
    if (min === max) { min -= 1; max += 1; }
    var range = max - min;
    function x(i) { return data.length === 1 ? left + (W - left - right) / 2 : left + (i / (data.length - 1)) * (W - left - right); }
    function y(v) { return top + (1 - ((v - min) / range)) * (H - top - bottom); }
    var pts = data.map(function (p, i) { return x(i) + ',' + y(Number(p.score)); }).join(' ');
    var grid = '';
    for (var g = 0; g < 4; g++) {
      var gy = top + (g / 3) * (H - top - bottom);
      var val = max - (g / 3) * range;
      grid += '<line x1="' + left + '" y1="' + gy + '" x2="' + (W - right) + '" y2="' + gy + '" class="chart-grid"/>';
      grid += '<text x="' + (left - 6) + '" y="' + (gy + 4) + '" class="chart-label" text-anchor="end">' + escapeHtml(Fmt.formatNumber(Math.round(val * 10) / 10, I18n.lang)) + '</text>';
    }
    var dots = data.map(function (p, i) {
      return '<circle cx="' + x(i) + '" cy="' + y(Number(p.score)) + '" r="4" class="chart-dot"><title>' +
        escapeHtml(Fmt.formatDate(p.date, I18n.lang, 'long') + ' — ' + Fmt.formatScore(p.score, I18n.lang)) + '</title></circle>';
    }).join('');
    var xLabels = '';
    if (data.length === 1) {
      xLabels = '<text x="' + x(0) + '" y="' + (H - 8) + '" class="chart-label" text-anchor="middle">' + escapeHtml(Fmt.formatDate(data[0].date, I18n.lang, 'short')) + '</text>';
    } else {
      xLabels = '<text x="' + left + '" y="' + (H - 8) + '" class="chart-label" text-anchor="start">' + escapeHtml(Fmt.formatDate(data[0].date, I18n.lang, 'short')) + '</text>' +
        '<text x="' + (W - right) + '" y="' + (H - 8) + '" class="chart-label" text-anchor="end">' + escapeHtml(Fmt.formatDate(data[data.length - 1].date, I18n.lang, 'short')) + '</text>';
    }
    return '<div class="chart-wrap"><svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escapeHtml(I18n.t('grades.chartTitle')) + '">' +
      grid +
      '<polyline points="' + pts + '" class="chart-line"/>' +
      dots + xLabels +
      '</svg></div>';
  }

  function applyTheme(theme) {
    var resolved = theme;
    if (theme === 'auto' || !theme) {
      resolved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#101513' : '#0f766e');
  }

  function download(filename, content, mime) {
    try {
      var blob = new Blob([content], { type: mime || 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      return true;
    } catch (e) {
      toast(I18n.t('error.download'), 'error');
      return false;
    }
  }

  function setBusy(button, busy) {
    if (!button) return;
    button.disabled = !!busy;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = I18n.t('common.saving');
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
    }
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 200);
    };
  }

  function on(rootEl, selector, eventName, handler) {
    rootEl.addEventListener(eventName, function (e) {
      var target = e.target.closest(selector);
      if (target && rootEl.contains(target)) handler(e, target);
    });
  }

  root.UI = {
    escapeHtml: escapeHtml,
    icon: icon,
    toast: toast,
    dialog: dialog,
    formDialog: formDialog,
    confirm: confirm,
    alert: alert,
    promptWord: promptWord,
    datePicker: datePicker,
    bindDateFields: bindDateFields,
    bindMoneyFields: bindMoneyFields,
    badge: badge,
    statusPill: statusPill,
    emptyState: emptyState,
    avatar: avatar,
    chart: chart,
    applyTheme: applyTheme,
    download: download,
    setBusy: setBusy,
    debounce: debounce,
    on: on
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
