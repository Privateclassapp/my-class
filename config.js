(function (root) {
  'use strict';

  root.APP_CONFIG = {
    googleClientId: '',
    googleApiKey: '',
    googleProjectNumber: '',
    driveFolderName: 'Class Manager',
    teacherName: '',
    oauthScopes: 'openid email profile https://www.googleapis.com/auth/drive.file',
    maxProofBytes: 2097152
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
