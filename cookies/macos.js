// ===========================================================================
//  cookies/macos.js — macOS key derivation + value decrypt.
//  Key: read the browser's "Safe Storage" password from the Keychain, then
//  PBKDF2(1003, 16, sha1, 'saltysalt'). Value: AES-128-CBC (shared helper).
// ===========================================================================

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const common = require('./common');

// Keychain service/account per browser ("Safe Storage" generic-password entries).
const KEYCHAIN = {
  edge: { service: 'Microsoft Edge Safe Storage', account: 'Microsoft Edge' },
  chrome: { service: 'Chrome Safe Storage', account: 'Chrome' },
};

function getKey(browser) {
  const kc = KEYCHAIN[browser];
  if (!kc) throw new Error('Unknown browser: ' + browser);
  // Triggers the macOS "allow access" prompt.
  const password = execFileSync(
    'security',
    ['find-generic-password', '-w', '-s', kc.service, '-a', kc.account],
    { encoding: 'utf8' },
  ).trim();
  return crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}

function decryptValue(buf, key, host) {
  return common.decryptCbc(buf, key, host);
}

module.exports = { getKey, decryptValue };

if (require.main === module) {
  const assert = require('node:assert');
  const key = crypto.pbkdf2Sync('pw', 'saltysalt', 1003, 16, 'sha1');
  const iv = Buffer.alloc(16, ' ');
  const enc = (plain, host) => {
    const c = crypto.createCipheriv('aes-128-cbc', key, iv);
    let body = Buffer.from(plain);
    if (host) body = Buffer.concat([crypto.createHash('sha256').update(host).digest(), body]);
    return Buffer.concat([Buffer.from('v10'), c.update(body), c.final()]);
  };
  assert.strictEqual(decryptValue(enc('hello'), key, 'x'), 'hello');
  assert.strictEqual(decryptValue(enc('sess=abc', 'claude.ai'), key, 'claude.ai'), 'sess=abc');
  assert.strictEqual(decryptValue(Buffer.from('plain'), key, 'x'), 'plain'); // unencrypted passthrough
  console.log('macos.js selftest OK');
}
