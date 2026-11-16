/* jalali.js — small, dependency-free date helpers.
   Dates are stored as Gregorian ISO strings (YYYY-MM-DD).
   The Persian/Jalali calendar is used only for display and input. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./jalaali-vendor.js'));
  } else {
    root.Jalali = factory(root.jalaali);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (jalaali) {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // Parse YYYY-MM-DD as a local date at noon (avoids timezone/DST edge cases).
  function parseISO(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
    var p = iso.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0);
    if (d.getFullYear() !== p[0] || d.getMonth() !== p[1] - 1 || d.getDate() !== p[2]) return null;
    return d;
  }

  function toISO(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function todayISO() {
    return toISO(new Date());
  }

  function isValidISO(iso) {
    return parseISO(iso) !== null;
  }

  function compareISO(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function addDays(iso, days) {
    var d = parseISO(iso);
    if (!d) return null;
    d.setDate(d.getDate() + days);
    return toISO(d);
  }

  function gToJ(iso) {
    var d = parseISO(iso);
    if (!d) return null;
    var j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return { jy: j.jy, jm: j.jm, jd: j.jd };
  }

  function jToG(jy, jm, jd) {
    if (!jalaali.isValidJalaaliDate(jy, jm, jd)) return null;
    var g = jalaali.toGregorian(jy, jm, jd);
    return toISO(new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0, 0));
  }

  function jMonthLength(jy, jm) {
    return jalaali.jalaaliMonthLength(jy, jm);
  }

  function isValidJ(jy, jm, jd) {
    return jalaali.isValidJalaaliDate(jy, jm, jd);
  }

  function isLeapJ(jy) {
    return jalaali.isLeapJalaaliYear(jy);
  }

  // 0 = Saturday ... 6 = Friday (Persian week order).
  function weekdaySat0(iso) {
    var d = parseISO(iso);
    if (!d) return null;
    return (d.getDay() + 1) % 7;
  }

  // First column for a Jalali month grid (0 = Saturday).
  function firstWeekdayColumn(jy, jm) {
    var iso = jToG(jy, jm, 1);
    return iso ? weekdaySat0(iso) : 0;
  }

  function jMonthKey(iso) {
    var j = gToJ(iso);
    return j ? j.jy + '-' + pad2(j.jm) : null;
  }

  function jMonthKeyFrom(jy, jm) {
    return jy + '-' + pad2(jm);
  }

  function parseJMonthKey(key) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
    if (!m) return null;
    return { jy: Number(m[1]), jm: Number(m[2]) };
  }

  function addJMonths(jy, jm, delta) {
    var total = jy * 12 + (jm - 1) + delta;
    return { jy: Math.floor(total / 12), jm: (total % 12 + 12) % 12 + 1 };
  }

  function todayJ() {
    return gToJ(todayISO());
  }

  return {
    parseISO: parseISO,
    toISO: toISO,
    todayISO: todayISO,
    isValidISO: isValidISO,
    compareISO: compareISO,
    addDays: addDays,
    gToJ: gToJ,
    jToG: jToG,
    jMonthLength: jMonthLength,
    isValidJ: isValidJ,
    isLeapJ: isLeapJ,
    weekdaySat0: weekdaySat0,
    firstWeekdayColumn: firstWeekdayColumn,
    jMonthKey: jMonthKey,
    jMonthKeyFrom: jMonthKeyFrom,
    parseJMonthKey: parseJMonthKey,
    addJMonths: addJMonths,
    todayJ: todayJ
  };
});
