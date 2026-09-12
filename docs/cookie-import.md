# Importing logins from your browser

**Import: Edge / Chrome** copies your existing auth cookies from the system browser into Multi-AI's session, so panels are logged in without retyping passwords — the same idea as `yt-dlp --cookies-from-browser`. Nothing is uploaded anywhere; decryption happens locally.

It reads every profile (`Default`, `Profile N`), scores them by *distinct sites × 10000 + cookie count*, and imports the single best one (so it never merges conflicting sessions).

## Per platform

| OS | Key source | Cookie cipher |
|---|---|---|
| **macOS** | Keychain (`security find-generic-password`) + PBKDF2 | AES-128-CBC |
| **Windows** | `Local State` → `os_crypt.encrypted_key`, DPAPI-decrypted via PowerShell | AES-256-GCM (`v10`) |
| **Linux** | `secret-tool` (libsecret), else the `peanuts` fallback + PBKDF2 | AES-128-CBC |

- **macOS** shows a one-time Keychain "Allow" prompt — approve it.
- **Windows** needs `sqlite3` on your `PATH`.
- **Linux** works best with a keyring; without one it falls back to the default password.

## Caveats

- **Google/Gemini cookies are device-bound** and won't authenticate — use the **Log in** window for Gemini.
- **Windows/Linux import is code-complete but tested only on macOS** here. The pure decrypt math has self-checks (`npm test`); real-profile import on those OSes may need adjustment — issues/PRs welcome.

## Code

Everything lives in [`cookies/`](../cookies): `index.js` dispatches by `process.platform`; `common.js` holds shared DB discovery/reading; `macos.js` / `windows.js` / `linux.js` own each platform's key + value decryption. Run the self-checks with `npm test`.
