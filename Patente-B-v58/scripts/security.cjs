'use strict';
const crypto = require('node:crypto');
function makeSecurityHeaders(index) {
  const guard = index.match(/<script id="bootGuard">([\s\S]*?)<\/script>/);
  if (!guard || !guard[1].trim()) throw new Error('Build the app before serving: the startup guard is missing.');
  const hash = crypto.createHash('sha256').update(guard[1]).digest('base64');
  const version = index.match(/data-app-version="([0-9]+)"/);
  if (!version) throw new Error('App version metadata is missing.');
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'content-security-policy': `default-src 'self'; script-src 'self' 'sha256-${hash}' https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://www.googleapis.com https://apis.google.com https://patente-b-arabic.firebaseapp.com; frame-src https://patente-b-arabic.firebaseapp.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
    'cross-origin-opener-policy': 'same-origin-allow-popups',
    'permissions-policy': 'camera=(), geolocation=(), microphone=()',
    'x-frame-options': 'DENY',
    'x-app-version': version[1]
  };
}
module.exports = {makeSecurityHeaders};
