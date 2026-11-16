(function (root) {
  'use strict';

  var DRIVE = 'https://www.googleapis.com/drive/v3';
  var UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  var GIS_URL = 'https://accounts.google.com/gsi/client';
  var PICKER_URL = 'https://apis.google.com/js/api.js';
  var FILE_FIELDS = 'id,name,mimeType,version,etag,modifiedTime,size,webViewLink,trashed,parents';
  var token = null;
  var tokenExpiry = 0;
  var email = null;
  var tokenClient = null;
  var signInPromise = null;
  var pickerPromise = null;

  function config() {
    return root.APP_CONFIG || {};
  }

  function makeError(code, message) {
    var err = new Error(message || code);
    err.code = code;
    return err;
  }

  function authRequired() {
    return makeError('AUTH_REQUIRED', 'Google authorization is required');
  }

  function configured() {
    var c = config();
    return !!(c.googleClientId && c.googleApiKey && c.googleProjectNumber);
  }

  function missingConfig() {
    var c = config();
    var missing = [];
    if (!c.googleClientId) missing.push('googleClientId');
    if (!c.googleApiKey) missing.push('googleApiKey');
    if (!c.googleProjectNumber) missing.push('googleProjectNumber');
    return missing;
  }

  function loadScript(src, id) {
    return new Promise(function (resolve, reject) {
      var existing = document.getElementById(id);
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') resolve();
        else {
          existing.addEventListener('load', function () { resolve(); }, { once: true });
          existing.addEventListener('error', function () { reject(makeError('SCRIPT_FAILED', 'Could not load ' + src)); }, { once: true });
        }
        return;
      }
      var script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = function () {
        script.setAttribute('data-loaded', '1');
        resolve();
      };
      script.onerror = function () {
        reject(makeError('SCRIPT_FAILED', 'Could not load ' + src));
      };
      document.head.appendChild(script);
    });
  }

  function loadGis() {
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    return loadScript(GIS_URL, 'google-identity-services');
  }

  function loadPickerApi() {
    if (root.google && root.google.picker && root.gapi) return Promise.resolve();
    if (pickerPromise) return pickerPromise;
    pickerPromise = loadScript(PICKER_URL, 'google-picker-api').then(function () {
      return new Promise(function (resolve, reject) {
        if (!root.gapi) {
          reject(makeError('PICKER_FAILED', 'Google Picker is unavailable'));
          return;
        }
        root.gapi.load('picker', {
          callback: resolve,
          onerror: function () { reject(makeError('PICKER_FAILED', 'Google Picker could not load')); }
        });
      });
    }).catch(function (err) {
      pickerPromise = null;
      throw err;
    });
    return pickerPromise;
  }

  function signIn(options) {
    if (signInPromise) return signInPromise;
    if (!configured()) return Promise.reject(makeError('NOT_CONFIGURED', 'Google Drive is not configured'));
    var opts = options || {};
    signInPromise = loadGis().then(function () {
      return new Promise(function (resolve, reject) {
        var settled = false;
        function finish(err, value) {
          if (settled) return;
          settled = true;
          signInPromise = null;
          if (err) reject(err);
          else resolve(value);
        }
        try {
          tokenClient = root.google.accounts.oauth2.initTokenClient({
            client_id: config().googleClientId,
            scope: config().oauthScopes || 'openid email profile https://www.googleapis.com/auth/drive.file',
            callback: function (response) {
              if (response && response.error) {
                finish(makeError('AUTH_FAILED', response.error_description || response.error));
                return;
              }
              token = response.access_token;
              tokenExpiry = Date.now() + (Number(response.expires_in || 3600) - 60) * 1000;
              email = null;
              finish(null, token);
            },
            error_callback: function (response) {
              finish(makeError('AUTH_FAILED', response && response.message ? response.message : 'Google sign-in failed'));
            }
          });
          tokenClient.requestAccessToken({ prompt: opts.prompt === undefined ? '' : opts.prompt });
        } catch (err) {
          finish(makeError('AUTH_FAILED', err && err.message ? err.message : 'Google sign-in failed'));
        }
      });
    }).catch(function (err) {
      signInPromise = null;
      throw err;
    });
    return signInPromise;
  }

  function ensureToken(options) {
    if (token && Date.now() < tokenExpiry) return Promise.resolve(token);
    if (options && options.interactive) return signIn(options);
    return Promise.reject(authRequired());
  }

  function clearToken() {
    token = null;
    tokenExpiry = 0;
    email = null;
  }

  function signOut() {
    var current = token;
    clearToken();
    if (current && root.google && root.google.accounts && root.google.accounts.oauth2 && root.google.accounts.oauth2.revoke) {
      try {
        root.google.accounts.oauth2.revoke(current, function () {});
      } catch (_) {}
    }
    return Promise.resolve();
  }

  function request(url, options) {
    var opts = options || {};
    return ensureToken({ interactive: false }).then(function (accessToken) {
      var headers = Object.assign({}, opts.headers || {});
      headers.Authorization = 'Bearer ' + accessToken;
      if (opts.body && typeof opts.body === 'string' && !headers['Content-Type']) {
        headers['Content-Type'] = opts.contentType || 'application/json';
      }
      return fetch(url, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body
      });
    }).then(function (response) {
      if (response.status === 401) {
        clearToken();
        throw authRequired();
      }
      if (!response.ok) {
        return response.text().then(function (text) {
          var message = text || ('Drive request failed (' + response.status + ')');
          try {
            var parsed = JSON.parse(text);
            if (parsed && parsed.error && parsed.error.message) message = parsed.error.message;
          } catch (_) {}
          var err = makeError('DRIVE_HTTP', message);
          err.status = response.status;
          throw err;
        });
      }
      if (opts.raw) return response;
      if (response.status === 204) return null;
      return response.json();
    });
  }

  function getUserInfo() {
    return request('https://www.googleapis.com/oauth2/v3/userinfo').then(function (info) {
      email = info && info.email ? info.email : '';
      return info || {};
    });
  }

  function getEmail() {
    if (email) return Promise.resolve(email);
    return getUserInfo().then(function (info) { return info.email || ''; });
  }

  function escapeQuery(value) {
    return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function getFileMeta(fileId) {
    return request(DRIVE + '/files/' + encodeURIComponent(fileId) +
      '?fields=' + encodeURIComponent(FILE_FIELDS) + '&supportsAllDrives=true', { raw: true })
      .then(function (response) {
        return response.json().then(function (meta) {
          meta.etag = response.headers.get('etag') || response.headers.get('ETag') || '';
          return meta;
        });
      });
  }

  function findFile(folderId, name, mimeType) {
    var q = "name = '" + escapeQuery(name) + "' and trashed = false";
    if (folderId) q += " and '" + escapeQuery(folderId) + "' in parents";
    if (mimeType) q += " and mimeType = '" + escapeQuery(mimeType) + "'";
    var url = DRIVE + '/files?q=' + encodeURIComponent(q) +
      '&fields=' + encodeURIComponent('files(' + FILE_FIELDS + ')') +
      '&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true';
    return request(url).then(function (result) {
      return result && result.files && result.files.length ? result.files[0] : null;
    });
  }

  function listFiles(folderId) {
    var q = "'" + escapeQuery(folderId) + "' in parents and trashed = false";
    var url = DRIVE + '/files?q=' + encodeURIComponent(q) +
      '&fields=' + encodeURIComponent('files(' + FILE_FIELDS + ')') +
      '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true';
    return request(url).then(function (result) { return (result && result.files) || []; });
  }

  function ensureFolder(name, parentId) {
    return findFile(parentId || null, name, 'application/vnd.google-apps.folder').then(function (existing) {
      if (existing) return existing;
      var meta = { name: name, mimeType: 'application/vnd.google-apps.folder' };
      if (parentId) meta.parents = [parentId];
      return request(DRIVE + '/files?fields=' + encodeURIComponent(FILE_FIELDS) + '&supportsAllDrives=true', {
        method: 'POST',
        body: JSON.stringify(meta)
      });
    });
  }

  function base64ToBytes(value) {
    var text = String(value || '');
    var comma = text.indexOf(',');
    if (text.indexOf(';base64,') >= 0 && comma >= 0) text = text.slice(comma + 1);
    var binary = atob(text);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function multipartBody(meta, content, mimeType) {
    var boundary = 'my-class-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    var head = '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: ' + (mimeType || 'application/octet-stream') + '\r\n\r\n';
    var tail = '\r\n--' + boundary + '--';
    var body;
    if (typeof content === 'string') {
      body = head + content + tail;
    } else {
      var bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
      body = new Blob([head, bytes, tail]);
    }
    return { body: body, contentType: 'multipart/related; boundary=' + boundary };
  }

  function createFile(meta, content, mimeType) {
    var multipart = multipartBody(meta, content, mimeType);
    return request(UPLOAD + '/files?uploadType=multipart&fields=' + encodeURIComponent(FILE_FIELDS) + '&supportsAllDrives=true', {
      method: 'POST',
      body: multipart.body,
      headers: { 'Content-Type': multipart.contentType }
    });
  }

  function createJsonFile(folderId, name, value, appProperties) {
    var meta = {
      name: name,
      mimeType: 'application/json',
      appProperties: appProperties || { app: 'my-class' }
    };
    if (folderId) meta.parents = [folderId];
    return createFile(meta, JSON.stringify(value, null, 2), 'application/json');
  }

  function updateFile(fileId, content, mimeType, options) {
    var opts = options || {};
    var headers = { 'Content-Type': mimeType || 'application/octet-stream' };
    if (opts.etag) headers['If-Match'] = opts.etag;
    return request(UPLOAD + '/files/' + encodeURIComponent(fileId) +
      '?uploadType=media&fields=' + encodeURIComponent(FILE_FIELDS) + '&supportsAllDrives=true', {
      method: 'PATCH',
      body: content,
      headers: headers
    });
  }

  function updateJsonFile(fileId, value, etag) {
    return updateFile(fileId, JSON.stringify(value, null, 2), 'application/json', { etag: etag });
  }

  function getFileText(fileId) {
    return request(DRIVE + '/files/' + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true', { raw: true })
      .then(function (response) { return response.text(); });
  }

  function getFileBlob(fileId) {
    return request(DRIVE + '/files/' + encodeURIComponent(fileId) + '?alt=media&supportsAllDrives=true', { raw: true })
      .then(function (response) { return response.blob(); });
  }

  function getJsonFile(fileId) {
    return Promise.all([getFileMeta(fileId), getFileText(fileId)]).then(function (result) {
      var meta = result[0];
      var data;
      try {
        data = JSON.parse(result[1]);
      } catch (_) {
        throw makeError('INVALID_JSON', 'Drive file is not valid JSON');
      }
      return {
        data: data,
        meta: meta,
        etag: meta.etag || '',
        version: meta.version || '',
        modifiedTime: meta.modifiedTime || ''
      };
    });
  }

  function listPermissions(fileId) {
    return request(DRIVE + '/files/' + encodeURIComponent(fileId) +
      '/permissions?fields=' + encodeURIComponent('permissions(id,type,role,emailAddress)') +
      '&supportsAllDrives=true').then(function (result) {
      return (result && result.permissions) || [];
    });
  }

  function ensurePermission(fileId, address, role) {
    return listPermissions(fileId).then(function (permissions) {
      var wanted = String(address || '').toLowerCase();
      var existing = permissions.find(function (p) {
        return p.emailAddress && String(p.emailAddress).toLowerCase() === wanted;
      });
      if (existing) {
        if (existing.role === role) return existing;
        return request(DRIVE + '/files/' + encodeURIComponent(fileId) + '/permissions/' +
          encodeURIComponent(existing.id) + '?fields=id,type,role,emailAddress&supportsAllDrives=true', {
          method: 'PATCH',
          body: JSON.stringify({ role: role })
        });
      }
      return request(DRIVE + '/files/' + encodeURIComponent(fileId) +
        '/permissions?sendNotificationEmail=false&fields=id,type,role,emailAddress&supportsAllDrives=true', {
        method: 'POST',
        body: JSON.stringify({ type: 'user', role: role, emailAddress: address })
      });
    });
  }

  function removePermissionForEmail(fileId, address) {
    return listPermissions(fileId).then(function (permissions) {
      var wanted = String(address || '').toLowerCase();
      var existing = permissions.find(function (p) {
        return p.emailAddress && String(p.emailAddress).toLowerCase() === wanted;
      });
      if (!existing) return false;
      return request(DRIVE + '/files/' + encodeURIComponent(fileId) + '/permissions/' +
        encodeURIComponent(existing.id) + '?supportsAllDrives=true', { method: 'DELETE' })
        .then(function () { return true; });
    });
  }

  function pickFiles(options) {
    var opts = options || {};
    return ensureToken({ interactive: true }).then(function () {
      return loadPickerApi();
    }).then(function () {
      return new Promise(function (resolve, reject) {
        if (!root.google || !root.google.picker) {
          reject(makeError('PICKER_FAILED', 'Google Picker is unavailable'));
          return;
        }
        var pickerApi = root.google.picker;
        var mimeTypes = opts.mimeTypes || 'application/json';
        var view = new pickerApi.DocsView(pickerApi.ViewId.DOCS);
        view.setIncludeFolders(false);
        view.setSelectFolderEnabled(false);
        view.setMimeTypes(mimeTypes);
        var sharedView = new pickerApi.DocsView(pickerApi.ViewId.DOCS);
        sharedView.setIncludeFolders(false);
        sharedView.setSelectFolderEnabled(false);
        sharedView.setOwnedByMe(false);
        sharedView.setMimeTypes(mimeTypes);
        var builder = new pickerApi.PickerBuilder()
          .addView(view)
          .addView(sharedView)
          .setOAuthToken(token)
          .setDeveloperKey(config().googleApiKey)
          .setAppId(config().googleProjectNumber)
          .setCallback(function (data) {
            if (!data) return;
            if (data.action === pickerApi.Action.PICKED) resolve(data.docs || []);
            else if (data.action === pickerApi.Action.CANCEL) resolve([]);
          });
        if (pickerApi.Feature && pickerApi.Feature.MULTISELECT_ENABLED) {
          builder.enableFeature(pickerApi.Feature.MULTISELECT_ENABLED);
        }
        try {
          builder.build().setVisible(true);
        } catch (err) {
          reject(makeError('PICKER_FAILED', err && err.message ? err.message : 'Google Picker failed'));
        }
      });
    });
  }

  function status() {
    return {
      configured: configured(),
      missing: missingConfig(),
      authenticated: !!(token && Date.now() < tokenExpiry),
      email: email || '',
      tokenExpiry: tokenExpiry
    };
  }

  root.Drive = {
    configured: configured,
    missingConfig: missingConfig,
    signIn: signIn,
    ensureToken: ensureToken,
    signOut: signOut,
    clearToken: clearToken,
    getUserInfo: getUserInfo,
    getEmail: getEmail,
    getFileMeta: getFileMeta,
    findFile: findFile,
    listFiles: listFiles,
    ensureFolder: ensureFolder,
    createFile: createFile,
    createJsonFile: createJsonFile,
    updateFile: updateFile,
    updateJsonFile: updateJsonFile,
    getFileText: getFileText,
    getFileBlob: getFileBlob,
    getJsonFile: getJsonFile,
    ensurePermission: ensurePermission,
    removePermissionForEmail: removePermissionForEmail,
    pickFiles: pickFiles,
    base64ToBytes: base64ToBytes,
    status: status
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
