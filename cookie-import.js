// ===========================================================================
//  cookie-import.js — copy auth cookies from the user's system browser
//  (Edge / Chrome) into the app's session, so the panels are logged in
//  without retyping passwords.
//
//  macOS only. Uses built-ins: /usr/bin/sqlite3, the `security` CLI, Node crypto.
//  Same idea as `yt-dlp --cookies-from-browser`. Best-effort & fragile:
//   - Google/Gemini cookies are device-bound → won't authenticate.
//   - Reading the Keychain key triggers a one-time "Allow" prompt.
// ===========================================================================

const { session } = require('electron');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOME = os.homedir();

// Prefer macOS's own sqlite3 (PATH may point at another build, e.g. Android SDK).
const SQLITE = fs.existsSync('/usr/bin/sqlite3') ? '/usr/bin/sqlite3' : 'sqlite3';

const BROWSERS = {
  edge: {
    dir: path.join(HOME, 'Library/Application Support/Microsoft Edge'),
    keychainService: 'Microsoft Edge Safe Storage',
    keychainAccount: 'Microsoft Edge',
  },
  chrome: {
    dir: path.join(HOME, 'Library/Application Support/Google/Chrome'),
    keychainService: 'Chrome Safe Storage',
    keychainAccount: 'Chrome',
  },
};

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
function findCookieDbs(browserDir) {
  if (!fs.existsSync(browserDir)) return [];
  const profiles = fs
    .readdirSync(browserDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => n === 'Default' || /^Profile \d+$/.test(n));
  const dbs = [];
  for (const p of profiles) {
    // Newer Chromium puts Cookies under <profile>/Network/Cookies; older directly.
    for (const rel of ['Network/Cookies', 'Cookies']) {
      const f = path.join(browserDir, p, rel);
      if (fs.existsSync(f)) {
        dbs.push(f);
        break;
      }
    }
  }
  return dbs;
}

function getKeychainKey(b) {
  // Triggers the macOS "allow access" prompt.
  const password = execFileSync(
    'security',
    ['find-generic-password', '-w', '-s', b.keychainService, '-a', b.keychainAccount],
    { encoding: 'utf8' },
  ).trim();
  return crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}

function decryptValue(buf, key, host) {
  const prefix = buf.slice(0, 3).toString('latin1');
  if (prefix !== 'v10' && prefix !== 'v11') {
    return buf.toString('utf8'); // not encrypted
  }
  const iv = Buffer.alloc(16, ' ');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  let dec = Buffer.concat([decipher.update(buf.slice(3)), decipher.final()]);
  // Strip PKCS#7 padding manually.
  const pad = dec[dec.length - 1];
  if (pad > 0 && pad <= 16) dec = dec.slice(0, dec.length - pad);
  // Newer Chromium prepends sha256(host) (32 bytes) to the plaintext.
  const h = crypto.createHash('sha256').update(host).digest();
  if (dec.length >= 32 && dec.slice(0, 32).equals(h)) dec = dec.slice(32);
  return dec.toString('utf8');
}

function sameSiteFromInt(n) {
  switch (Number(n)) {
    case 0: return 'no_restriction';
    case 1: return 'lax';
    case 2: return 'strict';
    default: return 'unspecified';
  }
}

// Read a Cookies DB (copied to temp) and return parsed rows for our domains.
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

async function importCookies(browser) {
  const b = BROWSERS[browser];
  if (!b) throw new Error('Unknown browser: ' + browser);

  const dbs = findCookieDbs(b.dir);
  if (!dbs.length) {
    throw new Error(`No ${browser} profile/cookies found. Is ${browser} installed and used?`);
  }

  const key = getKeychainKey(b); // may throw if user denies the Keychain prompt

  // Pick the SINGLE best profile (most distinct sites, then most cookies) so we
  // don't merge conflicting sessions from different profiles.
  const errors = [];
  let best = null;
  for (const db of dbs) {
    let rows;
    try {
      rows = readRows(db);
    } catch (e) {
      errors.push(`read ${path.basename(path.dirname(db))}: ${e.message}`);
      continue;
    }
    const sites = new Set(rows.map((r) => siteFor(r.host)).filter(Boolean));
    const score = sites.size * 10000 + rows.length;
    if (!best || score > best.score) {
      best = { db, rows, score, profile: path.basename(path.dirname(db)) };
    }
  }

  const perSite = { claude: 0, deepseek: 0, qwen: 0, gemini: 0 };
  const ses = session.fromPartition('persist:multiai');
  if (!best) return { perSite, errors, profile: null };

  for (const r of best.rows) {
    const site = siteFor(r.host);
    if (!site) continue;
    let value;
    try {
      value = decryptValue(r.blob, key, r.host);
    } catch (e) {
      continue; // skip undecryptable cookie
    }
    if (!value) continue;

    const cleanHost = r.host.replace(/^\./, '');
    const cookie = {
      url: `https://${cleanHost}${r.path}`,
      name: r.name,
      value,
      domain: r.host,
      path: r.path,
      secure: r.secure,
      httpOnly: r.httpOnly,
      sameSite: sameSiteFromInt(r.samesite),
    };
    if (r.expires_utc > 0) {
      cookie.expirationDate = r.expires_utc / 1e6 - 11644473600; // Chrome epoch → Unix
    }

    try {
      await ses.cookies.set(cookie);
      perSite[site] += 1;
    } catch (e) {
      // Some cookies (e.g. __Host- with mismatched flags) are rejected — fine.
    }
  }

  return { perSite, errors, profile: best.profile };
}

module.exports = { importCookies };
