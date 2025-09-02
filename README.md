# NeuroStack — Weekly Brain Enhancement (PWA)

Single-file, iPhone-friendly web app for your weekly brain module. Installable + offline.

## Quick Deploy (GitHub Pages)
1. Create a repo (e.g., `NeuroStack`).
2. Upload these files to the repo root:
   - `index.html`
   - `sw.js`
   - `manifest.webmanifest`
   - `icons/icon-192.png`
   - `icons/icon-512.png`
3. GitHub → **Settings → Pages** → Source: `main` / Root (`/`) → **Save**.
4. Open the Pages URL (e.g., `https://<you>.github.io/<repo>/`). In Safari → **Share → Add to Home Screen**.

## Notes
- Data stays on-device via localStorage.
- First user interaction enables sounds on iOS (start any timer).
- To reset, use the Clear buttons or clear site data in Safari.

## Optional
- Change app name/theme in `manifest.webmanifest`.
- Replace icons in `/icons/` with your own.
