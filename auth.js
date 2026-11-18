(function (root) {
  'use strict';

  var SESSION_KEY = 'my-class-session-v2';
  var TEACHER_ROLES = ['owner', 'teacher'];

  function makeError(code, message) {
    var err = new Error(message || code);
    err.code = code;
    return err;
  }

  function storage() {
    try {
      return root.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  function normalizeSession(value) {
    if (!value || typeof value !== 'object') return null;
    var user = value.user;
    if (!value.token || typeof value.token !== 'string' || !user || typeof user !== 'object' || !user.id) return null;
    if (TEACHER_ROLES.indexOf(user.role) < 0) return null;
    var expiresAtMs = Number(value.expiresAtMs);
    if (!isFinite(expiresAtMs) || expiresAtMs <= 0) return null;
    return {
      token: value.token,
      expiresAt: value.expiresAt || new Date(expiresAtMs).toISOString(),
      expiresAtMs: expiresAtMs,
      user: {
        id: String(user.id || ''),
        username: String(user.username || ''),
        role: user.role,
        displayName: String(user.displayName || user.username || ''),
        teacherId: String(user.teacherId || ''),
        status: user.status || 'active'
      }
    };
  }

  function read() {
    var store = storage();
    if (!store) return null;
    var text;
    try { text = store.getItem(SESSION_KEY); } catch (_) { return null; }
    if (!text) return null;
    var parsed = null;
    try { parsed = JSON.parse(text); } catch (_) {}
    var session = normalizeSession(parsed);
    if (!session) {
      try { store.removeItem(SESSION_KEY); } catch (_) {}
      return null;
    }
    return session;
  }

  function save(session) {
    var next = normalizeSession(session);
    if (!next) throw makeError('INVALID_SESSION', 'Invalid session.');
    var store = storage();
    if (!store) throw makeError('STORAGE_UNAVAILABLE', 'Browser storage is unavailable.');
    try {
      store.setItem(SESSION_KEY, JSON.stringify(next));
    } catch (_) {
      throw makeError('STORAGE_UNAVAILABLE', 'Browser storage is unavailable.');
    }
    return next;
  }

  function clear() {
    var store = storage();
    if (!store) return;
    try { store.removeItem(SESSION_KEY); } catch (_) {}
  }

  function expired(session) {
    return !!(session && Number(session.expiresAtMs) <= Date.now());
  }

  function hasSession() {
    return !!read();
  }

  function valid() {
    var session = read();
    return !!session && !expired(session);
  }

  function current() {
    return read();
  }

  function user() {
    var session = read();
    return session ? session.user : null;
  }

  function login(username, password) {
    if (!root.Api || !root.Api.isConfigured()) {
      return Promise.reject(makeError('NOT_CONFIGURED', 'The backend URL is not configured.'));
    }
    var name = String(username == null ? '' : username).trim().toLowerCase();
    var pass = String(password == null ? '' : password);
    if (!name || !pass) return Promise.reject(makeError('AUTH_FAILED', 'Invalid username or password.'));
    return root.Api.call('authLogin', { username: name, password: pass }, { timeout: 45000 }).then(function (data) {
      if (!data || !data.token || !data.user || !data.user.id || TEACHER_ROLES.indexOf(data.user.role) < 0) {
        if (data && data.token) {
          root.Api.call('authLogout', { token: data.token }).catch(function () {});
        }
        throw makeError('TEACHER_ONLY', 'This account is not a teacher account.');
      }
      return save({
        token: data.token,
        expiresAt: data.expiresAt,
        expiresAtMs: data.expiresAtMs || (Date.now() + 7 * 24 * 60 * 60 * 1000),
        user: data.user
      });
    });
  }

  function call(action, payload, options) {
    var session = read();
    if (!session) return Promise.reject(makeError('AUTH_REQUIRED', 'Sign in required.'));
    if (expired(session)) return Promise.reject(makeError('AUTH_EXPIRED', 'Session expired. Sign in again.'));
    var body = Object.assign({}, payload || {}, { token: session.token });
    return root.Api.call(action, body, options).catch(function (err) {
      if (err && (err.code === 'AUTH_REQUIRED' || err.code === 'ACCOUNT_DISABLED')) clear();
      throw err;
    });
  }

  function logout() {
    var session = read();
    clear();
    if (!session || !root.Api || !root.Api.isConfigured()) return Promise.resolve();
    return root.Api.call('authLogout', { token: session.token }, { timeout: 10000 }).catch(function () {});
  }

  function status() {
    var session = read();
    return {
      hasSession: !!session,
      valid: !!session && !expired(session),
      expired: expired(session),
      session: session,
      user: session ? session.user : null
    };
  }

  root.Auth = {
    SESSION_KEY: SESSION_KEY,
    current: current,
    user: user,
    hasSession: hasSession,
    valid: valid,
    expired: expired,
    status: status,
    login: login,
    logout: logout,
    call: call,
    clear: clear
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
