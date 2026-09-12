// ===========================================================================
//  cookies/windows.js — Windows key derivation + value decrypt.
//  Key: "Local State" -> os_crypt.encrypted_key (base64) -> strip 5-byte
//  "DPAPI" prefix -> DPAPI-unprotect = 32-byte AES key.
//  Value: v10/v11 -> AES-256-GCM; legacy -> DPAPI-unprotect.
// ===========================================================================

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const common = require('./common');

// ponytail: DPAPI via a PowerShell shell-out instead of a native binding.
// Ceiling: a process spawn per unprotect call. Upgrade: a native DPAPI addon
// (e.g. node-dpapi) only if throughput on large profiles ever matters.
function dpapiUnprotect(buf) {
  const b64 = buf.toString('base64');
  const ps =
    `$b=[Convert]::FromBase64String('${b64}');` +
    `$o=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');` +
    `[Convert]::ToBase64String($o)`;
  const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  return Buffer.from(out.trim(), 'base64');
}

function getKey(browser) {
  const dir = common.browserDir(browser);
  if (!dir) throw new Error('Unknown browser: ' + browser);
  const localState = JSON.parse(fs.readFileSync(path.join(dir, 'Local State'), 'utf8'));
  const encKey = Buffer.from(localState.os_crypt.encrypted_key, 'base64').slice(5); // strip "DPAPI"
  return dpapiUnprotect(encKey); // 32-byte AES key
}

function decryptValue(buf, key, host) {
  const prefix = buf.slice(0, 3).toString('latin1');
  if (prefix !== 'v10' && prefix !== 'v11') {
    return dpapiUnprotect(buf).toString('utf8'); // legacy pre-v10 blob
  }
  const nonce = buf.slice(3, 15); // 12-byte GCM nonce after the 3-byte prefix
  const tag = buf.slice(buf.length - 16); // 16-byte auth tag at the end
  const ciphertext = buf.slice(15, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  let dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const h = crypto.createHash('sha256').update(host).digest();
  if (dec.length >= 32 && dec.slice(0, 32).equals(h)) dec = dec.slice(32);
  return dec.toString('utf8');
}

module.exports = { getKey, decryptValue };

if (require.main === module) {
  const assert = require('node:assert');
  const key = crypto.randomBytes(32);
  const enc = (plain, host) => {
    const nonce = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, nonce);
    let body = Buffer.from(plain);
    if (host) body = Buffer.concat([crypto.createHash('sha256').update(host).digest(), body]);
    const ct = Buffer.concat([c.update(body), c.final()]);
    return Buffer.concat([Buffer.from('v10'), nonce, ct, c.getAuthTag()]);
  };
  assert.strictEqual(decryptValue(enc('hello'), key, 'x'), 'hello');
  assert.strictEqual(decryptValue(enc('sess=abc', 'google.com'), key, 'google.com'), 'sess=abc');
  // DPAPI path (getKey + legacy decrypt) needs Windows + PowerShell → untested here.
  console.log('windows.js selftest OK (GCM math only; DPAPI path is Windows-only)');
}
