# ACE Scorekeeper

A tiny, no-build web app for keeping score during a game of Gin (or any
winner-takes-points card game). Built to run great on an iPhone, added to the
home screen like a native app.

## Features

- **Unlimited games** — create as many as you like; each keeps its own
  players, rounds, and target score. Deleting one game never touches another.
- **Unlimited, named players** per game.
- **One tap per round** — pick the winner, enter their points, and it's added
  to their running total automatically.
- **Full round-by-round history**, kept forever (or until you delete a round
  or the game itself). Every round can be individually deleted if you make a
  mistake, and totals recalculate automatically.
- **Optional target score** per game — a banner announces the winner once
  someone reaches it, and you can keep playing past it if you want.
- **Backup & restore** — since everything is stored only in your phone's
  browser, use the ⇅ button to share a full backup of *all* your games as
  text (via the iOS share sheet — Notes, Messages, Mail, Files, AirDrop,
  whatever you like), or copy it to the clipboard. Paste it back in later
  (on this phone or a new one) to restore, either merging with what's there
  or replacing everything.
- **Installable / offline-capable** — "Add to Home Screen" from Safari gives
  it a full-screen, app-like icon, and a small service worker caches the app
  shell so it still works with no signal at the table (your data was always
  local anyway).

## Running it locally

No build step — it's just static files.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo's **Settings → Pages**, set the source to the `main` branch,
   root folder.
3. Your app will be live at `https://<username>.github.io/<repo>/`.

## Data & privacy

All data (games, players, rounds) lives in `localStorage` in your phone's
browser. Nothing is ever sent to a server — there is no backend at all. That
also means clearing Safari's site data, or switching phones/browsers, will
lose your data unless you've shared/saved a backup first. Use the backup
feature regularly if these scores matter to you!
