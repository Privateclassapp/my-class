/* db.js — IndexedDB storage for everything in the app. */
(function (root) {
  'use strict';

  var DB_NAME = 'my-class-db';
  var DB_VERSION = 2;
  var DATA_STORES = ['students', 'classes', 'enrollments', 'sessions', 'attendance', 'grades', 'payments', 'notes', 'proofs'];
  var ALL_STORES = ['meta'].concat(DATA_STORES);
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!root.indexedDB) {
        var err = new Error('IndexedDB is not available');
        err.code = 'DB_UNAVAILABLE';
        reject(err);
        return;
      }
      var req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('students')) {
          var s = db.createObjectStore('students', { keyPath: 'id' });
          s.createIndex('archived', 'archived', { unique: false });
        }
        if (!db.objectStoreNames.contains('classes')) {
          var c = db.createObjectStore('classes', { keyPath: 'id' });
          c.createIndex('archived', 'archived', { unique: false });
        }
        if (!db.objectStoreNames.contains('enrollments')) {
          var e = db.createObjectStore('enrollments', { keyPath: 'id' });
          e.createIndex('classId', 'classId', { unique: false });
          e.createIndex('studentId', 'studentId', { unique: false });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          var se = db.createObjectStore('sessions', { keyPath: 'id' });
          se.createIndex('date', 'date', { unique: false });
          se.createIndex('classId', 'classId', { unique: false });
          se.createIndex('studentId', 'studentId', { unique: false });
          se.createIndex('sessionKey', 'sessionKey', { unique: true });
        }
        if (!db.objectStoreNames.contains('attendance')) {
          var a = db.createObjectStore('attendance', { keyPath: 'id' });
          a.createIndex('sessionId', 'sessionId', { unique: false });
          a.createIndex('studentId', 'studentId', { unique: false });
          a.createIndex('sessionStudent', ['sessionId', 'studentId'], { unique: true });
        }
        if (!db.objectStoreNames.contains('grades')) {
          var g = db.createObjectStore('grades', { keyPath: 'id' });
          g.createIndex('studentId', 'studentId', { unique: false });
          g.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('payments')) {
          var p = db.createObjectStore('payments', { keyPath: 'id' });
          p.createIndex('studentId', 'studentId', { unique: false });
          p.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('notes')) {
          var n = db.createObjectStore('notes', { keyPath: 'id' });
          n.createIndex('classId', 'classId', { unique: false });
          n.createIndex('studentId', 'studentId', { unique: false });
          n.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('proofs')) {
          var pr = db.createObjectStore('proofs', { keyPath: 'id' });
          pr.createIndex('studentId', 'studentId', { unique: false });
          pr.createIndex('status', 'status', { unique: false });
          pr.createIndex('submissionId', 'submissionId', { unique: true });
        }
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { db.close(); };
        resolve(db);
      };
      req.onerror = function () { reject(req.error || new Error('Could not open database')); };
      req.onblocked = function () { reject(new Error('Database is blocked by another tab')); };
    });
    return dbPromise;
  }

  function uid() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function now() {
    return new Date().toISOString();
  }

  function notifyDataChanged(storeNames) {
    var names = Array.isArray(storeNames) ? storeNames : [storeNames];
    if (!names.some(function (name) { return DATA_STORES.indexOf(name) >= 0; })) return;
    if (!root.dispatchEvent || typeof root.CustomEvent !== 'function') return;
    try {
      root.dispatchEvent(new root.CustomEvent('my-class-data-changed', { detail: { stores: names } }));
    } catch (_) {}
  }

  function tx(storeNames, mode, work) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t;
        try {
          t = db.transaction(storeNames, mode);
        } catch (e) {
          reject(e);
          return;
        }
        var result;
        t.oncomplete = function () {
          notifyDataChanged(storeNames);
          resolve(result);
        };
        t.onerror = function () { reject(t.error || new Error('Transaction failed')); };
        t.onabort = function () { reject(t.error || new Error('Transaction aborted')); };
        try {
          result = work(t);
        } catch (e) {
          try { t.abort(); } catch (_) {}
          reject(e);
        }
      });
    });
  }

  function requestPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function get(store, key) {
    return open().then(function (db) {
      var t = db.transaction(store, 'readonly');
      return requestPromise(t.objectStore(store).get(key));
    });
  }

  function getAll(store) {
    return open().then(function (db) {
      var t = db.transaction(store, 'readonly');
      return requestPromise(t.objectStore(store).getAll());
    });
  }

  function getAllByIndex(store, indexName, value) {
    return open().then(function (db) {
      var t = db.transaction(store, 'readonly');
      return requestPromise(t.objectStore(store).index(indexName).getAll(value));
    });
  }

  function put(store, value) {
    return tx([store], 'readwrite', function (t) {
      t.objectStore(store).put(value);
      return value;
    });
  }

  function remove(store, key) {
    return tx([store], 'readwrite', function (t) {
      t.objectStore(store).delete(key);
    });
  }

  function getSettings() {
    return get('meta', 'settings');
  }

  function saveSettings(settings) {
    var record = Object.assign({}, settings, { key: 'settings', updatedAt: now() });
    return put('meta', record).then(function () { return record; });
  }

  function updateSettings(patch) {
    return getSettings().then(function (current) {
      var merged = Object.assign({}, current || { key: 'settings' }, patch, { key: 'settings', updatedAt: now() });
      return put('meta', merged).then(function () { return merged; });
    });
  }

  function loadData() {
    return Promise.all(DATA_STORES.map(function (store) { return getAll(store); })).then(function (lists) {
      var data = {};
      DATA_STORES.forEach(function (store, i) { data[store] = lists[i]; });
      return data;
    });
  }

  function sessionKey(ownerType, classId, studentId, date) {
    return ownerType + ':' + (ownerType === 'class' ? classId : studentId) + ':' + date;
  }

  function getSessionByKey(key) {
    return getAllByIndex('sessions', 'sessionKey', key).then(function (rows) { return rows[0] || null; });
  }

  function getAttendanceForSession(sessionId) {
    return getAllByIndex('attendance', 'sessionId', sessionId);
  }

  async function saveAttendanceSession(session, rows) {
    var oldRows = await getAttendanceForSession(session.id);
    return tx(['sessions', 'attendance'], 'readwrite', function (t) {
      t.objectStore('sessions').put(session);
      var att = t.objectStore('attendance');
      oldRows.forEach(function (row) { att.delete(row.id); });
      rows.forEach(function (row) { att.put(row); });
      return session;
    });
  }

  function setSessionCanceled(session, canceled, reason) {
    return tx(['sessions', 'attendance'], 'readwrite', function (t) {
      var updated = Object.assign({}, session, {
        canceled: canceled,
        cancelReason: reason || '',
        updatedAt: now()
      });
      t.objectStore('sessions').put(updated);
      var idx = t.objectStore('attendance').index('sessionId');
      idx.openCursor(IDBKeyRange.only(session.id)).onsuccess = function (event) {
        var cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      return updated;
    });
  }

  function deleteSession(sessionId) {
    return tx(['sessions', 'attendance'], 'readwrite', function (t) {
      t.objectStore('sessions').delete(sessionId);
      var idx = t.objectStore('attendance').index('sessionId');
      idx.openCursor(IDBKeyRange.only(sessionId)).onsuccess = function (event) {
        var cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    });
  }

  function deletePayment(paymentId) {
    return tx(['payments', 'proofs'], 'readwrite', function (t) {
      t.objectStore('payments').delete(paymentId);
      var proofs = t.objectStore('proofs');
      var req = proofs.getAll();
      req.onsuccess = function () {
        req.result.forEach(function (proof) {
          if (proof.paymentId !== paymentId) return;
          proofs.put(Object.assign({}, proof, {
            paymentId: null,
            status: 'pending',
            reviewedAt: null,
            reviewNote: '',
            updatedAt: now()
          }));
        });
      };
    });
  }

  function exportAll() {
    return Promise.all([
      getSettings(),
      getAll('students'), getAll('classes'), getAll('enrollments'), getAll('sessions'),
      getAll('attendance'), getAll('grades'), getAll('payments'), getAll('notes'), getAll('proofs')
    ]).then(function (result) {
      var settings = result[0] || {};
      return {
        app: 'my-class',
        schemaVersion: DB_VERSION,
        exportedAt: now(),
        settings: {
          language: settings.language === 'en' ? 'en' : 'fa',
          theme: settings.theme || 'auto'
        },
        data: {
          students: result[1],
          classes: result[2],
          enrollments: result[3],
          sessions: result[4],
          attendance: result[5],
          grades: result[6],
          payments: result[7],
          notes: result[8],
          proofs: result[9]
        }
      };
    });
  }

  function validateBackup(payload) {
    var errors = [];
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid' };
    if (payload.schemaVersion !== 1 && payload.schemaVersion !== 2) return { ok: false, error: 'version' };
    var data = payload.data;
    if (!data || typeof data !== 'object') return { ok: false, error: 'invalid' };
    for (var i = 0; i < DATA_STORES.length; i++) {
      var storeName = DATA_STORES[i];
      if (storeName === 'proofs' && data.proofs == null) continue;
      if (!Array.isArray(data[storeName])) return { ok: false, error: 'invalid' };
    }
    function isId(v) { return typeof v === 'string' && v.length > 0 && v.length < 200; }
    function isDate(v) { return typeof v === 'string' && root.Jalali && root.Jalali.isValidISO(v); }
    var ids = { students: new Set(), classes: new Set(), enrollments: new Set(), sessions: new Set(), attendance: new Set(), grades: new Set(), payments: new Set(), notes: new Set(), proofs: new Set() };
    var sessionKeys = new Set();
    var attendancePairs = new Set();

    function isEmail(value) {
      return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    data.students.forEach(function (s) {
      if (!isId(s.id) || !s.name || typeof s.name !== 'string' || ids.students.has(s.id)) errors.push('student');
      if (s.googleEmail && !isEmail(s.googleEmail)) errors.push('student email');
      if (s.portalEnabled != null && typeof s.portalEnabled !== 'boolean') errors.push('student portal');
      ids.students.add(s.id);
    });
    data.classes.forEach(function (c) {
      if (!isId(c.id) || !c.name || typeof c.name !== 'string' || ids.classes.has(c.id)) errors.push('class');
      if (c.priceModel && ['term', 'session', 'month'].indexOf(c.priceModel) < 0) errors.push('class model');
      ids.classes.add(c.id);
    });
    data.enrollments.forEach(function (e) {
      if (!isId(e.id) || ids.enrollments.has(e.id) || !ids.students.has(e.studentId) || !ids.classes.has(e.classId) || !isDate(e.startDate)) errors.push('enrollment');
      if (e.endDate && (!isDate(e.endDate) || e.endDate < e.startDate)) errors.push('enrollment date');
      ids.enrollments.add(e.id);
    });
    data.sessions.forEach(function (s) {
      if (!isId(s.id) || ids.sessions.has(s.id) || !isDate(s.date) || ['class', 'private'].indexOf(s.ownerType) < 0) errors.push('session');
      if (s.ownerType === 'class' && !ids.classes.has(s.classId)) errors.push('session class');
      if (s.ownerType === 'private' && !ids.students.has(s.studentId)) errors.push('session student');
      if (['none', 'counted', 'makeup'].indexOf(s.canceled || 'none') < 0) errors.push('session canceled');
      if (!isId(s.sessionKey)) errors.push('session key');
      else if (sessionKeys.has(s.sessionKey)) errors.push('session key duplicate');
      sessionKeys.add(s.sessionKey);
      ids.sessions.add(s.id);
    });
    data.attendance.forEach(function (a) {
      var pair = a.sessionId + ':' + a.studentId;
      if (!isId(a.id) || ids.attendance.has(a.id) || !ids.sessions.has(a.sessionId) || !ids.students.has(a.studentId) || ['present', 'late', 'absent'].indexOf(a.status) < 0) errors.push('attendance');
      if (attendancePairs.has(pair)) errors.push('attendance duplicate');
      attendancePairs.add(pair);
      ids.attendance.add(a.id);
    });
    data.grades.forEach(function (g) {
      if (!isId(g.id) || ids.grades.has(g.id) || !ids.students.has(g.studentId) || !isDate(g.date)) errors.push('grade');
      if (g.score != null && (typeof g.score !== 'number' || !isFinite(g.score))) errors.push('grade score');
      ids.grades.add(g.id);
    });
    data.payments.forEach(function (p) {
      if (!isId(p.id) || ids.payments.has(p.id) || !ids.students.has(p.studentId) || !isDate(p.date) || typeof p.amount !== 'number' || !isFinite(p.amount) || p.amount < 0) errors.push('payment');
      ids.payments.add(p.id);
    });
    data.notes.forEach(function (n) {
      if (!isId(n.id) || ids.notes.has(n.id) || !isDate(n.date)) errors.push('note');
      if (!n.classId && !n.studentId) errors.push('note target');
      if (n.classId && !ids.classes.has(n.classId)) errors.push('note class');
      if (n.studentId && !ids.students.has(n.studentId)) errors.push('note student');
      if (n.visibleToStudent != null && typeof n.visibleToStudent !== 'boolean') errors.push('note visibility');
      ids.notes.add(n.id);
    });
    (Array.isArray(data.proofs) ? data.proofs : []).forEach(function (proof) {
      if (!isId(proof.id) || ids.proofs.has(proof.id) || !ids.students.has(proof.studentId) || !isDate(proof.date)) errors.push('proof');
      if (typeof proof.amount !== 'number' || !isFinite(proof.amount) || proof.amount < 0) errors.push('proof amount');
      if (['pending', 'approved', 'rejected'].indexOf(proof.status) < 0) errors.push('proof status');
      if (proof.paymentId && !ids.payments.has(proof.paymentId)) errors.push('proof payment');
      ids.proofs.add(proof.id);
    });
    if (errors.length) return { ok: false, error: 'invalid', details: errors.slice(0, 10) };
    var counts = {};
    DATA_STORES.forEach(function (store) { counts[store] = Array.isArray(data[store]) ? data[store].length : 0; });
    return { ok: true, counts: counts };
  }

  async function importReplace(payload) {
    var check = validateBackup(payload);
    if (!check.ok) {
      var err = new Error('Invalid backup');
      err.code = check.error;
      throw err;
    }
    var current = await getSettings();
    var incomingSettings = payload.settings || {};
    var nextSettings = Object.assign({}, current || {}, {
      key: 'settings',
      language: incomingSettings.language === 'en' ? 'en' : (incomingSettings.language === 'fa' ? 'fa' : (current && current.language) || 'fa'),
      theme: ['auto', 'light', 'dark'].indexOf(incomingSettings.theme) >= 0 ? incomingSettings.theme : (current && current.theme) || 'auto',
      setupComplete: true,
      updatedAt: now()
    });
    return tx(ALL_STORES, 'readwrite', function (t) {
      DATA_STORES.forEach(function (store) {
        t.objectStore(store).clear();
        (Array.isArray(payload.data[store]) ? payload.data[store] : []).forEach(function (record) {
          t.objectStore(store).put(record);
        });
      });
      t.objectStore('meta').put(nextSettings);
      return nextSettings;
    }).then(function (settings) {
      return { counts: check.counts, settings: settings };
    });
  }

  function clearAllData() {
    return tx(ALL_STORES, 'readwrite', function (t) {
      ALL_STORES.forEach(function (store) { t.objectStore(store).clear(); });
    });
  }

  function requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().catch(function () { return false; });
    }
    return Promise.resolve(false);
  }

  root.DB = {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    DATA_STORES: DATA_STORES,
    ALL_STORES: ALL_STORES,
    open: open,
    uid: uid,
    now: now,
    get: get,
    getAll: getAll,
    getAllByIndex: getAllByIndex,
    put: put,
    remove: remove,
    getSettings: getSettings,
    saveSettings: saveSettings,
    updateSettings: updateSettings,
    loadData: loadData,
    sessionKey: sessionKey,
    getSessionByKey: getSessionByKey,
    getAttendanceForSession: getAttendanceForSession,
    saveAttendanceSession: saveAttendanceSession,
    setSessionCanceled: setSessionCanceled,
    deleteSession: deleteSession,
    deletePayment: deletePayment,
    exportAll: exportAll,
    validateBackup: validateBackup,
    importReplace: importReplace,
    clearAllData: clearAllData,
    requestPersistence: requestPersistence
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
