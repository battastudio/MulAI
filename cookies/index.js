// ===========================================================================
//  cookies/index.js — public entry. Copies auth cookies from the user's system
//  browser (Edge / Chrome) into the app's electron session, so panels are
//  logged in without retyping passwords. Same idea as
//  `yt-dlp --cookies-from-browser`; best-effort & fragile.
//
//  Platform-neutral: key derivation + value decrypt are dispatched to the
//  ./macos, ./windows or ./linux backend by process.platform.
// ===========================================================================

const path = require('node:path');
const common = require('./common');

const PLATFORM_MODULE = { darwin: './macos', win32: './windows', linux: './linux' };

function platformBackend() {
  const mod = PLATFORM_MODULE[process.platform];
  if (!mod) throw new Error('Unsupported platform: ' + process.platform);
  return require(mod);
}

// Pick the SINGLE best profile (most distinct sites, then most cookies) so we
// don't merge conflicting sessions from different profiles.
function pickBest(candidates) {
  let best = null;
  for (const c of candidates) {
    const sites = new Set(c.rows.map((r) => common.siteFor(r.host)).filter(Boolean));
    const score = sites.size * 10000 + c.rows.length;
    if (!best || score > best.score) best = { ...c, score };
  }
  return best;
}

async function importCookies(browser) {
  const { session } = require('electron'); // guarded: --selftest runs on plain node
  const dir = common.browserDir(browser);
  if (!dir) throw new Error('Unknown browser: ' + browser);

  const dbs = common.findCookieDbs(dir);
  if (!dbs.length) {
    throw new Error(`No ${browser} profile/cookies found. Is ${browser} installed and used?`);
  }

  const backend = platformBackend();
  const key = backend.getKey(browser); // may throw (denied prompt / missing keyring)

  const errors = [];
  const candidates = [];
  for (const db of dbs) {
    try {
      candidates.push({ rows: common.readRows(db), profile: path.basename(path.dirname(db)) });
    } catch (e) {
      errors.push(`read ${path.basename(path.dirname(db))}: ${e.message}`);
    }
  }

  const best = pickBest(candidates);
  const perSite = { claude: 0, deepseek: 0, qwen: 0, gemini: 0 };
  const ses = session.fromPartition('persist:multiai');
  if (!best) return { perSite, errors, profile: null };

  for (const r of best.rows) {
    const site = common.siteFor(r.host);
    if (!site) continue;
    let value;
    try {
      value = backend.decryptValue(r.blob, key, r.host);
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
      sameSite: common.sameSiteFromInt(r.samesite),
    };
    if (r.expires_utc > 0) cookie.expirationDate = common.chromeEpochToUnix(r.expires_utc);

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

if (require.main === module) {
  const assert = require('node:assert');
  const a = { profile: 'A', rows: [{ host: 'x.claude.ai' }, { host: 'y.claude.ai' }] };
  const b = { profile: 'B', rows: [{ host: 'a.claude.ai' }, { host: 'b.deepseek.com' }] };
  assert.strictEqual(pickBest([a, b]).profile, 'B'); // 2 distinct sites beats 1
  assert.strictEqual(pickBest([]), null);
  console.log('index.js selftest OK');
}
