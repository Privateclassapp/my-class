(function (root) {
  'use strict';

  var META_KEY = 'drive';
  var AUTO_SYNC_DELAY = 6000;
  var state = {
    meta: null,
    initialized: false,
    eventsBound: false,
    busy: false,
    dirty: false,
    applying: false,
    pushTimer: null,
    lastError: ''
  };

  function config() {
    return root.APP_CONFIG || {};
  }

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
      connected: false,
      email: '',
      folderId: '',
      dataFileId: '',
      dataVersion: '',
      dataRevision: 0,
      lastSyncedAt: '',
      lastPublishedAt: '',
      lastInboxAt: '',
      autoSync: true,
      portals: {},
      lastError: ''
    };
  }

  function normalizeMeta(meta) {
    var next = Object.assign(defaultMeta(), meta || {});
    next.key = META_KEY;
    next.portals = next.portals && typeof next.portals === 'object' ? next.portals : {};
    next.autoSync = next.autoSync !== false;
    return next;
  }

  function saveMeta(patch) {
    state.meta = normalizeMeta(Object.assign({}, state.meta || {}, patch || {}));
    state.meta.updatedAt = now();
    return root.DB.put('meta', state.meta).then(function () { return state.meta; });
  }

  function requireConnected() {
    if (!state.meta || !state.meta.connected || !state.meta.dataFileId) {
      throw makeError('NOT_CONNECTED', 'Google Drive is not connected');
    }
    return state.meta;
  }

  function ensureAuth(interactive) {
    return root.Drive.ensureToken({ interactive: !!interactive });
  }

  function bindEvents() {
    if (state.eventsBound || !root.addEventListener) return;
    state.eventsBound = true;
    root.addEventListener('my-class-data-changed', function () {
      if (state.applying) return;
      state.dirty = true;
      scheduleAutoSync();
    });
    root.addEventListener('online', function () {
      if (state.meta && state.meta.connected && state.meta.autoSync) scheduleAutoSync(1000);
    });
  }

  function scheduleAutoSync(delay) {
    if (!state.meta || !state.meta.connected || !state.meta.autoSync) return;
    if (!root.Drive || !root.Drive.configured()) return;
    if (state.pushTimer) clearTimeout(state.pushTimer);
    state.pushTimer = setTimeout(function () {
      state.pushTimer = null;
      syncNow({ interactive: false, silent: true }).catch(function () {});
    }, delay == null ? AUTO_SYNC_DELAY : delay);
  }

  function init() {
    if (state.initialized) return Promise.resolve(state.meta);
    state.initialized = true;
    bindEvents();
    return root.DB.get('meta', META_KEY).then(function (meta) {
      state.meta = normalizeMeta(meta);
      state.dirty = !!(state.meta.connected && state.meta.dataFileId);
      state.lastError = state.meta.lastError || '';
      return state.meta;
    }).catch(function (err) {
      state.lastError = err && err.message ? err.message : 'Could not load Drive settings';
      state.meta = normalizeMeta(null);
      return state.meta;
    });
  }

  function status() {
    var driveStatus = root.Drive && root.Drive.status ? root.Drive.status() : { configured: false, missing: [], authenticated: false, email: '' };
    return {
      configured: driveStatus.configured,
      missing: driveStatus.missing || [],
      authenticated: driveStatus.authenticated,
      email: driveStatus.email || (state.meta && state.meta.email) || '',
      meta: clone(state.meta || defaultMeta()),
      busy: state.busy,
      dirty: state.dirty,
      lastError: state.lastError
    };
  }

  function applyRemote(remote, file, folder, address) {
    var check = root.DB.validateBackup(remote.data);
    if (!check.ok) throw makeError('INVALID_REMOTE', 'Drive data is not a valid backup');
    state.applying = true;
    return root.DB.importReplace(remote.data).then(function () {
      state.applying = false;
      state.dirty = false;
      return saveMeta({
        connected: true,
        email: address || state.meta.email || '',
        folderId: folder.id,
        dataFileId: file.id,
        dataVersion: remote.version || '',
        dataRevision: Number(remote.data.revision) || 0,
        lastSyncedAt: now(),
        lastError: ''
      });
    }).then(function () {
      if (root.App && root.App.reloadData) return root.App.reloadData();
      return null;
    }).catch(function (err) {
      state.applying = false;
      throw err;
    });
  }

  function uploadLocal(file, folder, address, remoteMeta) {
    return root.DB.exportAll().then(function (payload) {
      payload.revision = Number(state.meta && state.meta.dataRevision || 0) + 1;
      payload.exportedAt = now();
      if (file) {
        return root.Drive.updateJsonFile(file.id, payload, remoteMeta && remoteMeta.etag).then(function (meta) {
          return { meta: meta, file: file, payload: payload };
        });
      }
      return root.Drive.createJsonFile(folder.id, 'data.json', payload).then(function (meta) {
        return { meta: meta, file: meta, payload: payload };
      });
    }).then(function (result) {
      state.dirty = false;
      return saveMeta({
        connected: true,
        email: address || state.meta.email || '',
        folderId: folder.id,
        dataFileId: result.file.id,
        dataVersion: result.meta.version || '',
        dataRevision: result.payload.revision,
        lastSyncedAt: now(),
        lastError: ''
      }).then(function () { return result; });
    });
  }

  function connect(options) {
    var opts = options || {};
    if (!root.Drive.configured()) return Promise.reject(makeError('NOT_CONFIGURED', 'Google Drive is not configured'));
    return root.Drive.ensureToken({ interactive: true }).then(function () {
      return root.Drive.getUserInfo();
    }).then(function (info) {
      var address = String(info.email || '').toLowerCase();
      return root.Drive.ensureFolder(config().driveFolderName || 'Class Manager').then(function (folder) {
        return root.Drive.findFile(folder.id, 'data.json').then(function (file) {
          if (!file) {
            return uploadLocal(null, folder, address, null).then(function () {
              return { mode: 'created', email: address, folderId: folder.id };
            });
          }
          return root.Drive.getFileMeta(file.id).then(function (meta) {
            if (opts.strategy === 'remote') {
              return root.Drive.getJsonFile(file.id).then(function (remote) {
                return applyRemote(remote, file, folder, address).then(function () {
                  return { mode: 'remote', email: address, folderId: folder.id };
                });
              });
            }
            if (opts.strategy === 'local') {
              return uploadLocal(file, folder, address, meta).then(function () {
                return { mode: 'local', email: address, folderId: folder.id };
              });
            }
            return root.Drive.getJsonFile(file.id).then(function (remote) {
              var check = root.DB.validateBackup(remote.data);
              return {
                needsChoice: true,
                email: address,
                folderId: folder.id,
                dataFileId: file.id,
                remoteModifiedTime: file.modifiedTime || '',
                remoteCounts: check.ok ? check.counts : null
              };
            });
          });
        });
      });
    }).catch(function (err) {
      state.lastError = err && err.message ? err.message : 'Google Drive connection failed';
      throw err;
    });
  }

  function disconnect() {
    if (state.pushTimer) {
      clearTimeout(state.pushTimer);
      state.pushTimer = null;
    }
    return root.Drive.signOut().then(function () {
      state.dirty = false;
      return saveMeta({ connected: false, lastError: '' });
    });
  }

  function lock() {
    if (state.pushTimer) {
      clearTimeout(state.pushTimer);
      state.pushTimer = null;
    }
    root.Drive.clearToken();
  }

  function reset() {
    if (state.pushTimer) {
      clearTimeout(state.pushTimer);
      state.pushTimer = null;
    }
    if (root.Drive && root.Drive.clearToken) root.Drive.clearToken();
    state.meta = normalizeMeta(null);
    state.initialized = false;
    state.busy = false;
    state.dirty = false;
    state.applying = false;
    state.lastError = '';
  }

  function pull() {
    var meta = requireConnected();
    return ensureAuth(false).then(function () {
      return root.Drive.getJsonFile(meta.dataFileId);
    }).then(function (remote) {
      return root.Drive.getFileMeta(meta.dataFileId).then(function (fileMeta) {
        var file = { id: meta.dataFileId };
        return applyRemote(remote, file, { id: meta.folderId }, meta.email).then(function () {
          return saveMeta({ dataVersion: fileMeta.version || remote.version || '' });
        });
      });
    }).then(function () {
      return { mode: 'pulled' };
    }).catch(function (err) {
      state.lastError = err && err.message ? err.message : 'Pull failed';
      throw err;
    });
  }

  function push(force) {
    var meta = requireConnected();
    return ensureAuth(false).then(function () {
      return root.Drive.getFileMeta(meta.dataFileId);
    }).then(function (remoteMeta) {
      if (!force && meta.dataVersion && remoteMeta.version && remoteMeta.version !== meta.dataVersion) {
        throw makeError('SYNC_CONFLICT', 'Drive data changed on another device');
      }
      return uploadLocal({ id: meta.dataFileId }, { id: meta.folderId }, meta.email, remoteMeta);
    }).then(function () {
      return { mode: 'pushed' };
    }).catch(function (err) {
      state.lastError = err && err.message ? err.message : 'Push failed';
      throw err;
    });
  }

  function updateJsonRetry(fileId, value) {
    return root.Drive.getFileMeta(fileId).then(function (meta) {
      return root.Drive.updateJsonFile(fileId, value, meta.etag);
    }).catch(function (err) {
      if (err && (err.status === 412 || err.status === 409)) {
        return root.Drive.getFileMeta(fileId).then(function (meta) {
          return root.Drive.updateJsonFile(fileId, value, meta.etag);
        });
      }
      throw err;
    });
  }

  function share(fileId, address, role) {
    if (!fileId || !address) return Promise.resolve(null);
    return root.Drive.ensurePermission(fileId, address, role);
  }

  function revoke(fileId, address) {
    if (!fileId || !address) return Promise.resolve(false);
    return root.Drive.removePermissionForEmail(fileId, address).catch(function (err) {
      if (err && err.status === 404) return false;
      throw err;
    });
  }

  function publishStudent(student, data, billing, teacherName) {
    var address = String(student.googleEmail || '').trim().toLowerCase();
    if (!address) return Promise.reject(makeError('NO_EMAIL', 'Student has no Google email'));
    var rootFolder = state.meta.folderId;
    var previous = state.meta.portals[student.id] || {};
    var portal = root.Portal.buildStudentPortal(data, student, billing.byId[student.id], {
      now: now(),
      teacherName: teacherName
    });
    var hash = root.Portal.hash(Object.assign({}, portal, { generatedAt: '' }));
    return root.Drive.ensureFolder('student-' + student.id, rootFolder).then(function (folder) {
      var portalPromise;
      if (previous.portalFileId && previous.hash === hash) {
        portalPromise = Promise.resolve({ id: previous.portalFileId });
      } else if (previous.portalFileId) {
        portalPromise = updateJsonRetry(previous.portalFileId, portal).catch(function (err) {
          if (err && err.status === 404) {
            return root.Drive.createJsonFile(folder.id, 'portal.json', portal);
          }
          throw err;
        });
      } else {
        portalPromise = root.Drive.findFile(folder.id, 'portal.json').then(function (existing) {
          if (existing) return updateJsonRetry(existing.id, portal);
          return root.Drive.createJsonFile(folder.id, 'portal.json', portal);
        });
      }
      return portalPromise.then(function (portalFile) {
        var inboxPromise = previous.inboxFileId
          ? Promise.resolve({ id: previous.inboxFileId })
          : root.Drive.findFile(folder.id, 'inbox.json').then(function (existing) {
            if (existing) return existing;
            return root.Drive.createJsonFile(folder.id, 'inbox.json', root.Portal.emptyInbox(student.id));
          });
        return inboxPromise.then(function (inboxFile) {
          var shares = [];
          if (previous.sharedEmail && previous.sharedEmail !== address) {
            shares.push(revoke(portalFile.id, previous.sharedEmail));
            shares.push(revoke(inboxFile.id, previous.sharedEmail));
          }
          shares.push(share(portalFile.id, address, 'reader'));
          shares.push(share(inboxFile.id, address, 'writer'));
          return Promise.all(shares).then(function () {
            var entry = {
              folderId: folder.id,
              portalFileId: portalFile.id,
              inboxFileId: inboxFile.id,
              hash: hash,
              portalVersion: portalFile.version || '',
              inboxVersion: inboxFile.version || '',
              sharedEmail: address,
              publishedAt: now()
            };
            state.meta.portals[student.id] = entry;
            return saveMeta({ portals: state.meta.portals });
          });
        });
      });
    });
  }

  function revokeStudent(studentId) {
    var entry = state.meta && state.meta.portals ? state.meta.portals[studentId] : null;
    if (!entry) return Promise.resolve(false);
    return ensureAuth(true).then(function () {
      var tasks = [];
      if (entry.sharedEmail) {
        tasks.push(revoke(entry.portalFileId, entry.sharedEmail));
        tasks.push(revoke(entry.inboxFileId, entry.sharedEmail));
      }
      return Promise.all(tasks).then(function () {
        entry.sharedEmail = '';
        entry.hash = '';
        entry.revokedAt = now();
        state.meta.portals[studentId] = entry;
        return saveMeta({ portals: state.meta.portals }).then(function () { return true; });
      });
    });
  }

  function publishPortals(options) {
    var opts = options || {};
    var meta = requireConnected();
    return ensureAuth(opts.interactive === true).then(function () {
      return root.DB.loadData();
    }).then(function (data) {
      var billing = root.Billing.computeAll(data, { today: root.Jalali.todayISO() });
      return root.DB.getSettings().then(function (settings) {
        var teacherName = config().teacherName || (settings && settings.teacherName) || '';
        var students = data.students.slice().sort(function (a, b) {
          return String(a.name || '').localeCompare(String(b.name || ''), 'fa');
        });
        var published = 0;
        var revoked = 0;
        var chain = Promise.resolve();
        students.forEach(function (student) {
          chain = chain.then(function () {
            var shouldPublish = !student.archived && student.portalEnabled === true && !!student.googleEmail;
            var entry = state.meta.portals[student.id];
            if (!shouldPublish) {
              if (entry && entry.sharedEmail) {
                return revokeStudent(student.id).then(function (done) { if (done) revoked++; });
              }
              return null;
            }
            return publishStudent(student, data, billing, teacherName).then(function () { published++; });
          });
        });
        return chain.then(function () {
          return saveMeta({
            lastPublishedAt: now(),
            lastError: '',
            portals: state.meta.portals
          }).then(function () {
            return { published: published, revoked: revoked, folderId: meta.folderId };
          });
        });
      });
    }).catch(function (err) {
      state.lastError = err && err.message ? err.message : 'Publishing failed';
      throw err;
    });
  }

  function publishOne(studentId) {
    var meta = requireConnected();
    return ensureAuth(true).then(function () {
      return Promise.all([root.DB.loadData(), root.DB.getSettings()]);
    }).then(function (result) {
      var data = result[0];
      var settings = result[1];
      var student = data.students.find(function (s) { return s.id === studentId; });
      if (!student) throw makeError('NOT_FOUND', 'Student not found');
      if (!student.googleEmail) throw makeError('NO_EMAIL', 'Student has no Google email');
      var billing = root.Billing.computeAll(data, { today: root.Jalali.todayISO() });
      var teacherName = config().teacherName || (settings && settings.teacherName) || '';
      return publishStudent(student, data, billing, teacherName).then(function () {
        return saveMeta({ lastPublishedAt: now(), portals: state.meta.portals });
      });
    }).then(function () {
      return { folderId: meta.folderId };
    });
  }

  function readInboxes() {
    var meta = requireConnected();
    return ensureAuth(false).then(function () {
      return root.DB.loadData();
    }).then(function (data) {
      var processed = 0;
      var chain = Promise.resolve();
      Object.keys(meta.portals).forEach(function (studentId) {
        var entry = meta.portals[studentId];
        if (!entry || !entry.inboxFileId || !entry.sharedEmail) return;
        var student = data.students.find(function (s) { return s.id === studentId; });
        if (!student) return;
        chain = chain.then(function () {
          return root.Drive.getJsonFile(entry.inboxFileId).then(function (remote) {
            var check = root.Portal.validateInbox(remote.data, studentId);
            if (!check.ok || !remote.data.submissions.length) return null;
            var inbox = remote.data;
            var maxBytes = Number(config().maxProofBytes) || 2097152;
            var folderPromise = null;
            var subChain = Promise.resolve();
            var before = processed;
            inbox.submissions.forEach(function (submission) {
              subChain = subChain.then(function () {
                if (!submission || !submission.id) return null;
                var exists = data.proofs.some(function (proof) {
                  return proof.submissionId === submission.id || proof.id === 'proof-' + submission.id;
                });
                if (exists) return null;
                if (typeof submission.amount !== 'number' || !isFinite(submission.amount) || submission.amount <= 0) return null;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(String(submission.date || ''))) return null;
                if (typeof submission.data !== 'string' || !submission.data) return null;
                var mime = submission.mime || 'image/jpeg';
                if (!/^image\/(jpeg|png|webp)$/.test(mime)) return null;
                var bytes;
                try { bytes = root.Drive.base64ToBytes(submission.data); } catch (_) { return null; }
                if (!bytes.length || bytes.length > maxBytes) return null;
                if (!folderPromise) {
                  folderPromise = root.Drive.ensureFolder('proofs', entry.folderId);
                }
                return folderPromise.then(function (folder) {
                  var ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
                  var name = 'proof-' + submission.id + '.' + ext;
                  return root.Drive.createFile({
                    name: name,
                    mimeType: mime,
                    parents: [folder.id],
                    appProperties: { app: 'my-class', studentId: studentId, submissionId: submission.id }
                  }, bytes, mime).then(function (file) {
                    var proof = {
                      id: 'proof-' + submission.id,
                      submissionId: submission.id,
                      studentId: studentId,
                      amount: submission.amount,
                      date: submission.date,
                      note: String(submission.note || '').slice(0, 500),
                      mime: mime,
                      fileName: name,
                      driveFileId: file.id,
                      driveLink: file.webViewLink || ('https://drive.google.com/file/d/' + file.id + '/view'),
                      status: 'pending',
                      submittedAt: submission.submittedAt || now(),
                      createdAt: now(),
                      updatedAt: now(),
                      reviewNote: ''
                    };
                    return root.DB.put('proofs', proof).then(function () {
                      data.proofs.push(proof);
                      processed++;
                    });
                  });
                });
              });
            });
            return subChain.then(function () {
              if (processed === before) return null;
              var cleaned = Object.assign({}, inbox, {
                submissions: [],
                processedAt: now(),
                updatedAt: now()
              });
              return root.Drive.updateJsonFile(entry.inboxFileId, cleaned, remote.etag).catch(function (err) {
                if (err && (err.status === 412 || err.status === 409)) return null;
                throw err;
              });
            });
          }).catch(function (err) {
            if (err && (err.status === 404 || err.code === 'INVALID_JSON')) return null;
            throw err;
          });
        });
      });
      return chain.then(function () {
        return saveMeta({ lastInboxAt: now(), portals: state.meta.portals });
      }).then(function () {
        if (processed && root.App && root.App.reloadData) return root.App.reloadData().then(function () { return processed; });
        return processed;
      });
    }).catch(function (err) {
      state.lastError = err && err.message ? err.message : 'Inbox check failed';
      throw err;
    });
  }

  function syncNow(options) {
    var opts = options || {};
    if (state.busy) return Promise.resolve({ mode: 'busy' });
    if (!state.meta || !state.meta.connected || !state.meta.dataFileId) {
      return Promise.reject(makeError('NOT_CONNECTED', 'Google Drive is not connected'));
    }
    state.busy = true;
    state.lastError = '';
    var meta = state.meta;
    return ensureAuth(!!opts.interactive).then(function () {
      return root.Drive.getFileMeta(meta.dataFileId);
    }).then(function (remoteMeta) {
      if (remoteMeta.version && meta.dataVersion && remoteMeta.version !== meta.dataVersion) {
        if (state.dirty) throw makeError('SYNC_CONFLICT', 'Drive data changed on another device');
        return root.Drive.getJsonFile(meta.dataFileId).then(function (remote) {
          return applyRemote(remote, { id: meta.dataFileId }, { id: meta.folderId }, meta.email).then(function () {
            return saveMeta({ dataVersion: remoteMeta.version, lastError: '' });
          });
        }).then(function () {
          return { mode: 'pulled' };
        });
      }
      if (state.dirty || opts.forcePush) {
        return uploadLocal({ id: meta.dataFileId }, { id: meta.folderId }, meta.email, remoteMeta).then(function () {
          return publishPortals();
        }).then(function () {
          return { mode: 'pushed' };
        });
      }
      return publishPortals().then(function () {
        return readInboxes();
      }).then(function (count) {
        if (!count) return { mode: 'idle' };
        return root.Drive.getFileMeta(meta.dataFileId).then(function (nextMeta) {
          return uploadLocal({ id: meta.dataFileId }, { id: meta.folderId }, meta.email, nextMeta);
        }).then(function () {
          return publishPortals();
        }).then(function () {
          return { mode: 'inbox', count: count };
        });
      });
    }).catch(function (err) {
      state.lastError = err && err.message ? err.message : 'Sync failed';
      if (state.meta) {
        state.meta.lastError = state.lastError;
        root.DB.put('meta', state.meta).catch(function () {});
      }
      throw err;
    }).then(function (result) {
      state.busy = false;
      return result;
    }, function (err) {
      state.busy = false;
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

  function driveFolderUrl() {
    return state.meta && state.meta.folderId ? 'https://drive.google.com/drive/folders/' + encodeURIComponent(state.meta.folderId) : '';
  }

  root.Sync = {
    init: init,
    status: status,
    connect: connect,
    disconnect: disconnect,
    lock: lock,
    reset: reset,
    pull: pull,
    push: push,
    syncNow: syncNow,
    publishPortals: publishPortals,
    publishOne: publishOne,
    revokeStudent: revokeStudent,
    readInboxes: readInboxes,
    reviewProof: reviewProof,
    pendingProofs: pendingProofs,
    getPortalMeta: getPortalMeta,
    setAutoSync: setAutoSync,
    driveFolderUrl: driveFolderUrl
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
