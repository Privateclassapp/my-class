(function (root) {
  'use strict';

  var META_KEY = 'sync';
  var AUTO_SYNC_DELAY = 6000;
  var state = {
    meta: null,
    initialized: false,
    eventsBound: false,
    busy: false,
    dirty: false,
    applying: false,
    pushTimer: null,
    lastError: '',
    pendingChoice: null,
    changeSeq: 0,
    accountId: null
  };

  function now() {
    return root.DB ? root.DB.now() : new Date().toISOString();
  }

  function clone(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
  }

  function makeError(code, message) {
    var err = new Error(message || code);
    err.code = code;
    return err;
  }

  function defaultMeta() {
    return {
      key: META_KEY,
      initialized: false,
      revision: 0,
      remoteRevision: 0,
      remoteUpdatedAt: '',
      lastSyncedAt: '',
      lastPublishedAt: '',
      lastReceiptAt: '',
      autoSync: true,
      publishedCount: 0,
      portals: {},
      dirty: false,
      lastError: ''
    };
  }

  function normalizeMeta(meta) {
    var next = Object.assign(defaultMeta(), meta || {});
    next.key = META_KEY;
    next.revision = Math.max(0, Number(next.revision) || 0);
    next.remoteRevision = Math.max(0, Number(next.remoteRevision) || 0);
    next.publishedCount = Math.max(0, Number(next.publishedCount) || 0);
    next.portals = next.portals && typeof next.portals === 'object' ? next.portals : {};
    next.autoSync = next.autoSync !== false;
    next.initialized = next.initialized === true;
    next.dirty = next.dirty === true;
    return next;
  }

  function ensureAccount() {
    if (!state.accountId || !root.DB || root.DB.accountId() !== state.accountId) {
      throw makeError('ACCOUNT_CHANGED', 'The active account changed.');
    }
  }

  function saveMeta(patch) {
    ensureAccount();
    state.meta = normalizeMeta(Object.assign({}, state.meta || {}, patch || {}));
    state.meta.updatedAt = now();
    return root.DB.put('meta', state.meta).then(function () { return state.meta; });
  }

  function isOnline() {
    return !root.navigator || root.navigator.onLine !== false;
  }

  function requireSession() {
    if (!root.Auth || !root.Auth.valid()) throw makeError('AUTH_REQUIRED', 'Sign in required.');
    if (!root.Api || !root.Api.isConfigured()) throw makeError('NOT_CONFIGURED', 'The backend URL is not configured.');
    if (!isOnline()) throw makeError('OFFLINE', 'You are offline.');
  }

  function call(action, payload) {
    return root.Auth.call(action, payload || {}, { timeout: 60000, forcePrimary: true });
  }

  function reportError(err) {
    state.lastError = err && err.message ? err.message : 'Sync failed';
    if (state.meta) {
      state.meta.lastError = state.lastError;
      root.DB.put('meta', state.meta).catch(function () {});
    }
    var code = err && err.code;
    if ((code === 'AUTH_REQUIRED' || code === 'AUTH_EXPIRED' || code === 'ACCOUNT_DISABLED') &&
        root.dispatchEvent && typeof root.CustomEvent === 'function') {
      try {
        root.dispatchEvent(new root.CustomEvent('my-class-auth-expired', { detail: { code: code } }));
      } catch (_) {}
    }
  }

  function bindEvents() {
    if (state.eventsBound || !root.addEventListener) return;
    state.eventsBound = true;
    root.addEventListener('my-class-data-changed', function () {
      if (state.applying) return;
      state.dirty = true;
      state.changeSeq++;
      saveMeta({ dirty: true }).catch(function () {});
      scheduleAutoSync();
    });
    root.addEventListener('online', function () {
      if (state.meta && state.meta.initialized && state.meta.autoSync) scheduleAutoSync(1000);
    });
  }

  function scheduleAutoSync(delay) {
    if (!state.meta || !state.meta.initialized || !state.meta.autoSync) return;
    if (!state.dirty || !isOnline()) return;
    if (!root.Auth || !root.Auth.valid() || !root.Api || !root.Api.isConfigured()) return;
    if (state.pushTimer) clearTimeout(state.pushTimer);
    state.pushTimer = setTimeout(function () {
      state.pushTimer = null;
      syncNow({ silent: true }).catch(function () {});
    }, delay == null ? AUTO_SYNC_DELAY : delay);
  }

  function init() {
    if (state.initialized) return Promise.resolve(state.meta);
    state.initialized = true;
    state.accountId = root.DB.accountId() || null;
    bindEvents();
    return root.DB.get('meta', META_KEY).then(function (meta) {
      state.meta = normalizeMeta(meta);
      state.dirty = state.meta.dirty === true;
      state.lastError = state.meta.lastError || '';
      state.pendingChoice = null;
      state.changeSeq = 0;
      return state.meta;
    }).catch(function (err) {
      state.lastError = err && err.message ? err.message : 'Could not load sync settings';
      state.meta = normalizeMeta(null);
      return state.meta;
    });
  }

  function status() {
    var auth = root.Auth ? root.Auth.status() : { hasSession: false, valid: false, expired: false, user: null };
    return {
      configured: !!(root.Api && root.Api.isConfigured()),
      authenticated: auth.valid,
      expired: auth.expired,
      user: auth.user,
      online: isOnline(),
      initialized: !!(state.meta && state.meta.initialized),
      meta: clone(state.meta || defaultMeta()),
      busy: state.busy,
      dirty: state.dirty,
      lastError: state.lastError,
      needsChoice: !!state.pendingChoice
    };
  }

  function validateRemote(remote) {
    if (!remote || !remote.data) return { ok: true, empty: true, counts: null };
    var check = root.DB.validateBackup({
      app: 'my-class',
      schemaVersion: root.DB.DB_VERSION,
      data: remote.data,
      settings: {}
    });
    if (!check.ok) throw makeError('INVALID_REMOTE', 'Server data is not valid.');
    return { ok: true, empty: false, counts: check.counts };
  }

  function remotePortals(remote) {
    var entries = {};
    var publishedAt = remote && (remote.portalPublishedAt || remote.updatedAt) || '';
    var ids = remote && Array.isArray(remote.portals) ? remote.portals : [];
    ids.forEach(function (studentId) {
      if (!studentId) return;
      entries[String(studentId)] = { publishedAt: publishedAt, published: true };
    });
    return entries;
  }

  function applyRemote(remote) {
    validateRemote(remote);
    var revision = Number(remote.revision) || 0;
    var portals = remotePortals(remote);
    state.applying = true;
    return root.DB.importReplace({
      app: 'my-class',
      schemaVersion: root.DB.DB_VERSION,
      exportedAt: remote.updatedAt || now(),
      settings: {},
      data: remote.data
    }).then(function () {
      state.applying = false;
      state.dirty = false;
      state.changeSeq = 0;
      state.pendingChoice = null;
      return saveMeta({
        initialized: true,
        revision: revision,
        remoteRevision: revision,
        remoteUpdatedAt: remote.updatedAt || '',
        lastSyncedAt: now(),
        lastPublishedAt: remote.portalPublishedAt || remote.updatedAt || '',
        publishedCount: Object.keys(portals).length,
        portals: portals,
        dirty: false,
        lastError: ''
      });
    }).then(function () {
      if (root.App && root.App.reloadData) return root.App.reloadData();
      return null;
    }).then(function () {
      return { mode: 'pulled', revision: revision };
    }).catch(function (err) {
      state.applying = false;
      throw err;
    });
  }

  function buildPortals(data) {
    if (!root.Portal || !root.Billing) return [];
    var billing;
    try {
      billing = root.Billing.computeAll(data, { today: root.Jalali.todayISO() });
    } catch (_) {
      return [];
    }
    var teacherName = (root.App && root.App.settings && root.App.settings.teacherName) ||
      (root.Auth && root.Auth.user() ? root.Auth.user().displayName : '') || '';
    var generatedAt = now();
    var portals = [];
    data.students.forEach(function (student) {
      if (!student || student.archived) return;
      try {
        portals.push({
          studentId: student.id,
          portal: root.Portal.buildStudentPortal(data, student, billing.byId[student.id], {
            now: generatedAt,
            teacherName: teacherName
          })
        });
      } catch (err) {
        console.error('Could not build portal for student', student.id, err);
      }
    });
    return portals;
  }

  function pushLocal(baseRevision) {
    var startSeq = state.changeSeq;
    return Promise.all([root.DB.exportAll(), root.DB.getSettings()]).then(function (result) {
      var payload = result[0];
      var settings = result[1] || {};
      var teacherName = settings.teacherName || (root.Auth.user() ? root.Auth.user().displayName : '') || '';
      var portals = buildPortals(payload.data);
      return call('teacherPush', {
        baseRevision: baseRevision,
        data: payload.data,
        profile: { teacherName: teacherName },
        portals: portals
      }).then(function (pushed) {
        var publishedAt = now();
        var entries = {};
        var publishedIds = Array.isArray(pushed.portalStudentIds) ? pushed.portalStudentIds : [];
        publishedIds.forEach(function (studentId) {
          if (studentId) entries[String(studentId)] = { publishedAt: publishedAt, published: true };
        });
        var stillDirty = state.changeSeq !== startSeq;
        state.dirty = stillDirty;
        return saveMeta({
          initialized: true,
          revision: Number(pushed.revision) || 0,
          remoteRevision: Number(pushed.revision) || 0,
          remoteUpdatedAt: pushed.updatedAt || '',
          lastSyncedAt: publishedAt,
          lastPublishedAt: publishedAt,
          publishedCount: Number(pushed.published) || publishedIds.length,
          portals: entries,
          dirty: stillDirty,
          lastError: ''
        }).then(function (meta) {
          if (stillDirty) scheduleAutoSync();
          return { mode: 'pushed', revision: meta.revision, published: meta.publishedCount };
        });
      });
    }).catch(function (err) {
      if (err && err.code === 'SYNC_CONFLICT') {
        var details = err.details || {};
        if (state.meta) {
          state.meta.remoteRevision = Number(details.revision) || state.meta.remoteRevision;
          state.meta.remoteUpdatedAt = details.updatedAt || state.meta.remoteUpdatedAt;
        }
      }
      throw err;
    });
  }

  function markInitialized(revision) {
    return saveMeta({
      initialized: true,
      revision: Number(revision) || 0,
      remoteRevision: Number(revision) || 0,
      lastSyncedAt: now(),
      lastPublishedAt: '',
      publishedCount: 0,
      portals: {},
      dirty: false,
      lastError: ''
    });
  }

  function initializeFromRemote(remote) {
    var revision = Number(remote.revision) || 0;
    var check = validateRemote(remote);
    var hasRemote = revision > 0 && !check.empty;
    return root.DB.hasData().then(function (hasLocal) {
      if (!hasRemote) {
        if (!hasLocal) return markInitialized(0).then(function () { return { mode: 'idle' }; });
        return pushLocal(0);
      }
      if (!hasLocal) {
        return applyRemote(remote).then(function () { return { mode: 'pulled', revision: revision }; });
      }
      state.pendingChoice = {
        remoteRevision: revision,
        remoteUpdatedAt: remote.updatedAt || '',
        remoteCounts: check.counts
      };
      return {
        mode: 'choice',
        needsChoice: true,
        remoteRevision: revision,
        remoteUpdatedAt: remote.updatedAt || '',
        remoteCounts: check.counts
      };
    });
  }

  function readReceipts() {
    return Promise.all([root.DB.loadData(), root.DB.getAll('proofs')]).then(function (result) {
      var data = result[0];
      var existing = result[1];
      var students = {};
      data.students.forEach(function (student) { students[student.id] = true; });
      var seen = {};
      existing.forEach(function (proof) {
        if (proof.submissionId) seen[proof.submissionId] = true;
        if (proof.id && proof.id.indexOf('proof-') === 0) seen[proof.id.slice(6)] = true;
      });
      return call('teacherListReceipts', {}).then(function (response) {
        ensureAccount();
        var receipts = response && Array.isArray(response.receipts) ? response.receipts : [];
        var ackIds = [];
        var imported = [];
        var chain = Promise.resolve();
        receipts.forEach(function (receipt) {
          if (!receipt || !receipt.id) return;
          var id = String(receipt.id);
          if (!students[receipt.studentId]) return;
          if (seen[id]) {
            ackIds.push(id);
            return;
          }
          var amount = Number(receipt.amount);
          if (!isFinite(amount) || amount <= 0) return;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(receipt.date || ''))) return;
          var proof = {
            id: 'proof-' + id,
            submissionId: id,
            remoteId: id,
            studentId: String(receipt.studentId),
            amount: amount,
            date: String(receipt.date),
            note: String(receipt.note || '').slice(0, 500),
            mime: String(receipt.mime || 'image/jpeg'),
            fileName: String(receipt.fileName || ''),
            status: 'pending',
            submittedAt: receipt.submittedAt || now(),
            createdAt: now(),
            updatedAt: now(),
            reviewNote: ''
          };
          chain = chain.then(function () {
            return root.DB.put('proofs', proof);
          }).then(function () {
            data.proofs.push(proof);
            seen[id] = true;
            imported.push(proof);
            ackIds.push(id);
          });
        });
        state.applying = true;
        return chain.then(function () {
          state.applying = false;
          if (!imported.length) {
            if (ackIds.length) call('teacherAckReceipts', { ids: ackIds }).catch(function () {});
            return 0;
          }
          state.dirty = true;
          state.changeSeq++;
          return saveMeta({ dirty: true, lastReceiptAt: now() }).then(function () {
            if (ackIds.length) {
              return call('teacherAckReceipts', { ids: ackIds }).catch(function () {});
            }
            return null;
          }).then(function () {
            scheduleAutoSync();
            return imported.length;
          });
        }).catch(function (err) {
          state.applying = false;
          throw err;
        });
      });
    }).then(function (count) {
      if (count && root.App && root.App.reloadData) {
        return root.App.reloadData().then(function () { return count; });
      }
      return count;
    });
  }

  function conflictError(remote) {
    var err = makeError('SYNC_CONFLICT', 'Teacher data changed on another device.');
    err.details = {
      revision: Number(remote && remote.revision) || 0,
      updatedAt: remote && remote.updatedAt || ''
    };
    return err;
  }

  function syncOnce(options) {
    var opts = options || {};
    return init().then(function () {
      requireSession();
      ensureAccount();
      return call('teacherPull', {});
    }).then(function (remote) {
      var remoteRevision = Number(remote.revision) || 0;
      if (!state.meta.initialized) {
        return initializeFromRemote(remote).then(function (result) {
          if (result && result.needsChoice) return result;
          return readReceipts().then(function (count) {
            result.receipts = count;
            return result;
          });
        });
      }
      if (remoteRevision > state.meta.revision) {
        if (state.dirty) throw conflictError(remote);
        return applyRemote(remote).then(function () {
          return readReceipts();
        }).then(function (count) {
          return { mode: 'pulled', receipts: count };
        });
      }
      if (remoteRevision < state.meta.revision) {
        throw conflictError(remote);
      }
      if (state.dirty || opts.publish) {
        return pushLocal(remoteRevision).then(function (result) {
          return readReceipts().then(function (count) {
            result.receipts = count;
            return result;
          });
        });
      }
      return readReceipts().then(function (count) {
        return { mode: 'idle', receipts: count };
      });
    });
  }

  function syncNow(options) {
    var opts = options || {};
    if (state.busy) return Promise.resolve({ mode: 'busy' });
    state.busy = true;
    state.lastError = '';
    return Promise.resolve().then(function () {
      return syncOnce(opts);
    }).then(function (result) {
      state.busy = false;
      return result;
    }, function (err) {
      state.busy = false;
      reportError(err);
      throw err;
    });
  }

  function start(options) {
    if (!root.Auth || !root.Auth.valid()) return Promise.resolve({ mode: 'offline' });
    if (!root.Api || !root.Api.isConfigured()) return Promise.reject(makeError('NOT_CONFIGURED', 'The backend URL is not configured.'));
    if (!isOnline()) return Promise.resolve({ mode: 'offline' });
    return syncNow(options || {});
  }

  function applyChoice(strategy) {
    if (state.busy) return Promise.resolve({ mode: 'busy' });
    if (strategy !== 'remote' && strategy !== 'local') {
      return Promise.reject(makeError('INVALID_CHOICE', 'Invalid sync choice.'));
    }
    state.busy = true;
    state.lastError = '';
    return init().then(function () {
      requireSession();
      return call('teacherPull', {});
    }).then(function (remote) {
      state.pendingChoice = null;
      if (strategy === 'remote') {
        return applyRemote(remote).then(function () {
          return readReceipts();
        }).then(function (count) {
          return { mode: 'pulled', receipts: count };
        });
      }
      return pushLocal(Number(remote.revision) || 0).then(function (result) {
        return readReceipts().then(function (count) {
          result.receipts = count;
          return result;
        });
      });
    }).then(function (result) {
      state.busy = false;
      return result;
    }, function (err) {
      state.busy = false;
      reportError(err);
      throw err;
    });
  }

  function pull() {
    return init().then(function () {
      requireSession();
      ensureAccount();
      return call('teacherPull', {});
    }).then(function (remote) {
      return applyRemote(remote);
    }).then(function (result) {
      return readReceipts().then(function (count) {
        result.receipts = count;
        return result;
      });
    }).catch(function (err) {
      reportError(err);
      throw err;
    });
  }

  function push(force) {
    return init().then(function () {
      requireSession();
      ensureAccount();
      if (!force) return pushLocal(state.meta.revision);
      return call('teacherPull', {}).then(function (remote) {
        return pushLocal(Number(remote.revision) || 0);
      });
    }).then(function (result) {
      return readReceipts().then(function (count) {
        result.receipts = count;
        return result;
      });
    }).catch(function (err) {
      reportError(err);
      throw err;
    });
  }

  function reviewProof(proofId, action, values) {
    var opts = values || {};
    return root.DB.get('proofs', proofId).then(function (proof) {
      if (!proof) throw makeError('NOT_FOUND', 'Proof not found');
      if (proof.status !== 'pending') throw makeError('ALREADY_REVIEWED', 'Proof already reviewed');
      var amount = opts.amount == null ? proof.amount : Number(opts.amount);
      var date = opts.date || proof.date;
      if (!isFinite(amount) || amount <= 0) throw makeError('INVALID_AMOUNT', 'Invalid amount');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw makeError('INVALID_DATE', 'Invalid date');
      if (action === 'approve') {
        var payment = {
          id: root.DB.uid(),
          studentId: proof.studentId,
          amount: amount,
          date: date,
          note: String(opts.note || proof.note || '').slice(0, 200),
          proofId: proof.id,
          createdAt: now(),
          updatedAt: now()
        };
        return root.DB.put('payments', payment).then(function () {
          var next = Object.assign({}, proof, {
            status: 'approved',
            amount: amount,
            date: date,
            paymentId: payment.id,
            reviewNote: String(opts.reviewNote || '').slice(0, 500),
            reviewedAt: now(),
            updatedAt: now()
          });
          return root.DB.put('proofs', next).then(function () { return next; });
        });
      }
      if (action === 'reject') {
        var rejected = Object.assign({}, proof, {
          status: 'rejected',
          reviewNote: String(opts.reviewNote || '').slice(0, 500),
          reviewedAt: now(),
          updatedAt: now()
        });
        return root.DB.put('proofs', rejected).then(function () { return rejected; });
      }
      throw makeError('INVALID_ACTION', 'Invalid review action');
    }).then(function (proof) {
      state.dirty = true;
      state.changeSeq++;
      scheduleAutoSync();
      if (root.App && root.App.reloadData) return root.App.reloadData().then(function () { return proof; });
      return proof;
    });
  }

  function pendingProofs() {
    var proofs = root.App && root.App.data && root.App.data.proofs ? root.App.data.proofs : [];
    return proofs.filter(function (proof) { return proof.status === 'pending'; });
  }

  function getPortalMeta(studentId) {
    return state.meta && state.meta.portals ? state.meta.portals[studentId] || null : null;
  }

  function setAutoSync(enabled) {
    return saveMeta({ autoSync: !!enabled });
  }

  function publishPortals() {
    return syncNow({ publish: true });
  }

  function base64ToBlob(text, mime) {
    var binary = root.atob(String(text || ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new root.Blob([bytes], { type: mime || 'image/jpeg' });
  }

  function getReceiptImage(proofOrId) {
    var receiptId = typeof proofOrId === 'string' ? proofOrId :
      (proofOrId && (proofOrId.remoteId || proofOrId.submissionId)) || '';
    if (!receiptId) return Promise.reject(makeError('MISSING_RECEIPT', 'Receipt image is unavailable.'));
    requireSession();
    return call('teacherGetReceiptImage', { receiptId: receiptId }).then(function (result) {
      if (!result || !result.data) throw makeError('MISSING_RECEIPT', 'Receipt image is unavailable.');
      return base64ToBlob(result.data, result.mime);
    });
  }

  function deleteAll() {
    requireSession();
    return call('teacherDeleteAll', {}).then(function (result) {
      state.pendingChoice = null;
      state.dirty = false;
      return {
        revision: Number(result && result.revision) || 0,
        updatedAt: result && result.updatedAt || '',
        deletedReceipts: Number(result && result.deletedReceipts) || 0
      };
    }).catch(function (err) {
      reportError(err);
      throw err;
    });
  }

  function markClean(revision, updatedAt) {
    var rev = Number(revision) || 0;
    state.dirty = false;
    state.changeSeq = 0;
    state.pendingChoice = null;
    return saveMeta({
      initialized: true,
      revision: rev,
      remoteRevision: rev,
      remoteUpdatedAt: updatedAt || '',
      lastSyncedAt: now(),
      lastPublishedAt: '',
      lastReceiptAt: '',
      publishedCount: 0,
      portals: {},
      dirty: false,
      lastError: ''
    });
  }

  function lock() {
    if (state.pushTimer) {
      clearTimeout(state.pushTimer);
      state.pushTimer = null;
    }
  }

  function reset() {
    lock();
    state.meta = normalizeMeta(null);
    state.initialized = false;
    state.busy = false;
    state.dirty = false;
    state.applying = false;
    state.pendingChoice = null;
    state.lastError = '';
    state.changeSeq = 0;
    state.accountId = null;
  }

  root.Sync = {
    init: init,
    start: start,
    status: status,
    syncNow: syncNow,
    applyChoice: applyChoice,
    pull: pull,
    push: push,
    publishPortals: publishPortals,
    reviewProof: reviewProof,
    pendingProofs: pendingProofs,
    getPortalMeta: getPortalMeta,
    setAutoSync: setAutoSync,
    getReceiptImage: getReceiptImage,
    deleteAll: deleteAll,
    markClean: markClean,
    lock: lock,
    reset: reset
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
