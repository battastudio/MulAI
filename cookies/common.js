// ===========================================================================
//  cookies/common.js — platform-agnostic shared pieces: browser dir tables,
//  site matching, cookie-DB discovery/reading (system `sqlite3`), and the
//  AES-128-CBC value decrypt used by mac + linux. Node stdlib only.
// ===========================================================================

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOME = os.homedir();

// Prefer the OS's own sqlite3 on unix (PATH may point at another build, e.g.
// the Android SDK). On Windows there is no system sqlite3, so rely on PATH.
// ponytail: Windows requires `sqlite3` on PATH. Ceiling: import fails cleanly
// if absent. Upgrade: bundle a sqlite3 binary or use a native reader module.
const SQLITE = process.platform !== 'win32' && fs.existsSync('/usr/bin/sqlite3')
  ? '/usr/bin/sqlite3'
  : 'sqlite3';

// Per-platform "User Data" root for each supported browser.
const DIRS = {
  darwin: {
    edge: path.join(HOME, 'Library/Application Support/Microsoft Edge'),
    chrome: path.join(HOME, 'Library/Application Support/Google/Chrome'),
  },
  win32: {
    edge: path.join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/User Data'),
    chrome: path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data'),
  },
  linux: {
    edge: path.join(HOME, '.config/microsoft-edge'),
    chrome: path.join(HOME, '.config/google-chrome'),
  },
};

function browserDir(browser) {
  return (DIRS[process.platform] || {})[browser];
}

// Which host_key suffix belongs to which panel (for the summary + cookie url).
const SITE_MATCHERS = [
  { site: 'claude', test: (h) => h.endsWith('claude.ai') },
  { site: 'deepseek', test: (h) => h.endsWith('deepseek.com') },
  { site: 'qwen', test: (h) => h.endsWith('qwen.ai') },
  { site: 'gemini', test: (h) => h.endsWith('google.com') },
];

function siteFor(host) {
  const m = SITE_MATCHERS.find((s) => s.test(host));
  return m ? m.site : null;
}

// Find every "Cookies" SQLite file across Default + Profile N folders.
function findCookieDbs(browserDirPath) {
  if (!browserDirPath || !fs.existsSync(browserDirPath)) return [];
  const profiles = fs
    .readdirSync(browserDirPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => n === 'Default' || /^Profile \d+$/.test(n));
  const dbs = [];
  for (const p of profiles) {
    // Newer Chromium puts Cookies under <profile>/Network/Cookies; older directly.
    for (const rel of ['Network/Cookies', 'Cookies']) {
      const f = path.join(browserDirPath, p, rel);
      if (fs.existsSync(f)) {
        dbs.push(f);
        break;
      }
    }
  }
  return dbs;
}

function sameSiteFromInt(n) {
  switch (Number(n)) {
    case 0: return 'no_restriction';
    case 1: return 'lax';
    case 2: return 'strict';
    default: return 'unspecified';
  }
}

// Chrome stores expiry as µs since 1601-01-01; convert to Unix seconds.
function chromeEpochToUnix(expiresUtc) {
  return expiresUtc / 1e6 - 11644473600;
}

// Read a Cookies DB (copied to temp so a running browser's lock doesn't block us).
function readRows(dbFile) {
  const tmp = path.join(os.tmpdir(), `mai-cookies-${process.pid}-${Math.floor(performance.now())}.db`);
  fs.copyFileSync(dbFile, tmp);
  try {
    const sql =
      "SELECT host_key, name, hex(encrypted_value), path, is_secure, is_httponly, expires_utc, samesite " +
      "FROM cookies WHERE host_key LIKE '%claude.ai' OR host_key LIKE '%deepseek.com' " +
      "OR host_key LIKE '%qwen.ai' OR host_key LIKE '%google.com';";
    const out = execFileSync(SQLITE, ['-separator', '\t', tmp, sql], { encoding: 'utf8' });
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [host, name, hex, cpath, secure, httponly, expires, samesite] = line.split('\t');
        return {
          host,
          name,
          blob: Buffer.from(hex, 'hex'),
          path: cpath || '/',
          secure: secure === '1',
          httpOnly: httponly === '1',
          expires_utc: Number(expires),
          samesite,
        };
      });
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

// AES-128-CBC value decrypt (Chromium "v10"/"v11" blobs on mac + linux).
function decryptCbc(buf, key, host) {
  const prefix = buf.slice(0, 3).toString('latin1');
  if (prefix !== 'v10' && prefix !== 'v11') return buf.toString('utf8'); // not encrypted
  const iv = Buffer.alloc(16, ' ');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  let dec = Buffer.concat([decipher.update(buf.slice(3)), decipher.final()]);
  const pad = dec[dec.length - 1]; // strip PKCS#7 padding manually
  if (pad > 0 && pad <= 16) dec = dec.slice(0, dec.length - pad);
  const h = crypto.createHash('sha256').update(host).digest(); // newer Chromium prepends sha256(host)
  if (dec.length >= 32 && dec.slice(0, 32).equals(h)) dec = dec.slice(32);
  return dec.toString('utf8');
}

module.exports = { SQLITE, SITE_MATCHERS, browserDir, siteFor, findCookieDbs, sameSiteFromInt, chromeEpochToUnix, readRows, decryptCbc };
if (require.main === module) {
  const assert = require('node:assert');
  assert.strictEqual(siteFor('foo.claude.ai'), 'claude');
  assert.strictEqual(siteFor('accounts.google.com'), 'gemini');
  assert.strictEqual(siteFor('example.com'), null);
  assert.strictEqual(sameSiteFromInt(2), 'strict');
  assert.strictEqual(sameSiteFromInt(9), 'unspecified');
  assert.strictEqual(chromeEpochToUnix(11644473600 * 1e6), 0);
  assert.strictEqual(decryptCbc(Buffer.from('raw'), Buffer.alloc(16), 'h'), 'raw');
  console.log('common.js selftest OK');
}
