// ===========================================================================
//  cookies/linux.js — Linux key derivation + value decrypt.
//  Key: libsecret storage password via `secret-tool`, else the well-known
//  default 'peanuts'; PBKDF2(1, 16, sha1, 'saltysalt'). Value: AES-128-CBC.
// ===========================================================================

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const common = require('./common');

// libsecret "application" attribute per browser for `secret-tool lookup`.
const APP = { chrome: 'chrome', edge: 'chromium' };

function getKey(browser) {
  let password;
  try {
    password = execFileSync(
      'secret-tool',
      ['lookup', 'application', APP[browser] || 'chrome'],
      { encoding: 'utf8' },
    );
  } catch (_) {
    // ponytail: no libsecret/keyring available → fall back to Chromium's
    // well-known default password. Ceiling: only decrypts profiles stored with
    // the "basic" (no-keyring) backend. Upgrade: detect + query the actual
    // keyring backend (kwallet/gnome-keyring) the profile was encrypted with.
    password = 'peanuts';
  }
  return crypto.pbkdf2Sync(password, 'saltysalt', 1, 16, 'sha1');
}

function decryptValue(buf, key, host) {
  return common.decryptCbc(buf, key, host);
}

module.exports = { getKey, decryptValue };

if (require.main === module) {
  const assert = require('node:assert');
  const key = crypto.pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
  const iv = Buffer.alloc(16, ' ');
  const enc = (plain, host) => {
    const c = crypto.createCipheriv('aes-128-cbc', key, iv);
    let body = Buffer.from(plain);
    if (host) body = Buffer.concat([crypto.createHash('sha256').update(host).digest(), body]);
    return Buffer.concat([Buffer.from('v11'), c.update(body), c.final()]);
  };
  assert.strictEqual(decryptValue(enc('hello'), key, 'x'), 'hello');
  assert.strictEqual(decryptValue(enc('sess=abc', 'qwen.ai'), key, 'qwen.ai'), 'sess=abc');
  assert.strictEqual(decryptValue(Buffer.from('plain'), key, 'x'), 'plain'); // unencrypted passthrough
  console.log('linux.js selftest OK');
}
