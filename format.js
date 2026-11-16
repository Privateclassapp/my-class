/* format.js — Persian digits, money, and Jalali date labels. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./jalali.js'));
  } else {
    root.Fmt = factory(root.Jalali);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Jalali) {
  'use strict';

  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  var FA_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  var EN_MONTHS = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand'];
  var FA_WEEKDAYS = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
  var FA_WEEKDAYS_SHORT = ['ش','ی','د','س','چ','پ','ج'];
  var EN_WEEKDAYS = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
  var EN_WEEKDAYS_SHORT = ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'];

  function langOf(lang) {
    if (lang === 'fa' || lang === 'en') return lang;
    if (root.I18n && root.I18n.lang) return root.I18n.lang;
    return 'fa';
  }

  function toFaDigits(value) {
    return String(value == null ? '' : value).replace(/[0-9]/g, function (d) {
      return FA_DIGITS[Number(d)];
    });
  }

  function toEnDigits(value) {
    return String(value == null ? '' : value)
      .replace(/[۰-۹]/g, function (d) { return String(FA_DIGITS.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String(AR_DIGITS.indexOf(d)); });
  }

  function localizeDigits(value, lang) {
    return langOf(lang) === 'fa' ? toFaDigits(value) : toEnDigits(value);
  }

  function formatNumber(value, lang) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    var text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
    return langOf(lang) === 'fa' ? toFaDigits(text).replace(/\./g, '٫') : text;
  }

  function formatMoney(value, lang) {
    var n = Math.round(Number(value) || 0);
    return formatNumber(n, lang) + (langOf(lang) === 'fa' ? ' تومان' : ' Toman');
  }

  function formatMoneyPlain(value, lang) {
    return formatNumber(Math.round(Number(value) || 0), lang);
  }

  function parseAmount(value) {
    var s = toEnDigits(String(value == null ? '' : value))
      .replace(/[٬,\s]/g, '')
      .replace(/تومان|تومن|toman|tomans/gi, '')
      .replace(/٫/g, '.');
    if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? Math.round(n) : null;
  }

  function formatPercent(value, lang) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    return formatNumber(Math.round(n), lang) + (langOf(lang) === 'fa' ? '٪' : '%');
  }

  function formatScore(value, lang) {
    var n = Number(value);
    if (!isFinite(n)) return '';
    var text = String(Math.round(n * 100) / 100);
    if (langOf(lang) === 'fa') text = text.replace('.', '٫');
    return localizeDigits(text, lang);
  }

  function monthName(jm, lang) {
    var idx = Number(jm) - 1;
    return langOf(lang) === 'fa' ? (FA_MONTHS[idx] || '') : (EN_MONTHS[idx] || '');
  }

  function weekdayName(index, lang, short) {
    var i = Number(index);
    if (langOf(lang) === 'fa') return (short ? FA_WEEKDAYS_SHORT : FA_WEEKDAYS)[i] || '';
    return (short ? EN_WEEKDAYS_SHORT : EN_WEEKDAYS)[i] || '';
  }

  function formatDate(iso, lang, style) {
    var j = Jalali.gToJ(iso);
    if (!j) return '—';
    var l = langOf(lang);
    var y = localizeDigits(j.jy, l);
    var d = localizeDigits(j.jd, l);
    var m = monthName(j.jm, l);
    if (style === 'short') {
      return y + '/' + localizeDigits(String(j.jm).padStart(2, '0'), l) + '/' + localizeDigits(String(j.jd).padStart(2, '0'), l);
    }
    if (style === 'weekday') {
      var wd = weekdayName(Jalali.weekdaySat0(iso), l, false);
      return l === 'fa' ? wd + '، ' + d + ' ' + m + ' ' + y : wd + ', ' + d + ' ' + m + ' ' + y;
    }
    return l === 'fa' ? d + ' ' + m + ' ' + y : d + ' ' + m + ' ' + y;
  }

  function formatMonthKey(key, lang) {
    var p = Jalali.parseJMonthKey(key);
    if (!p) return '—';
    var l = langOf(lang);
    return monthName(p.jm, l) + ' ' + localizeDigits(p.jy, l);
  }

  function formatTime(time, lang) {
    if (!time) return '';
    return localizeDigits(String(time), lang);
  }

  function formatPhone(phone, lang) {
    return localizeDigits(String(phone || ''), lang);
  }

  function formatCount(n, lang) {
    return formatNumber(n, lang);
  }

  return {
    toFaDigits: toFaDigits,
    toEnDigits: toEnDigits,
    localizeDigits: localizeDigits,
    formatNumber: formatNumber,
    formatMoney: formatMoney,
    formatMoneyPlain: formatMoneyPlain,
    parseAmount: parseAmount,
    formatPercent: formatPercent,
    formatScore: formatScore,
    monthName: monthName,
    weekdayName: weekdayName,
    formatDate: formatDate,
    formatMonthKey: formatMonthKey,
    formatTime: formatTime,
    formatPhone: formatPhone,
    formatCount: formatCount
  };
});
