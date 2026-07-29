# 500 — bid table & score sheet

A single-page web app. No build step, no dependencies, no server code. Scores live in
`localStorage` on the device, and a service worker caches everything so it runs with no signal.

```
index.html               markup and styles
app.js                   state, scoring, rendering
manifest.webmanifest     name, icon, colours, standalone display
sw.js                    offline cache
icons/                   app icons
test/                    node test suites (not deployed)
.nojekyll                stops GitHub Pages from processing the folder
```

Supports 2 sides (partnership), 3 players (cutthroat), and 5 players (called partners).

## Put it on GitHub Pages

1. Create a new repository — call it `500` — and make it **public**. (Pages needs public
   on a free account.)
2. Upload every file and folder in here to the root of the repo. Web UI is fine:
   **Add file → Upload files**, drag it all in, commit. Keep `icons/` as a folder.
3. **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
4. Wait a minute or two. Your URL will be `https://<your-username>.github.io/500/`.

Everything uses relative paths, so it works whether it sits at the repo root or a subfolder.

## Put it on your home screen

1. Open the URL in **Safari** — this will not work from Chrome on iOS.
2. Share button → **Add to Home Screen** → Add.
3. Launch it from the icon. No address bar, no tabs, works on aeroplane mode.

## How scoring works

Every hand stores a `declaring` array — the seats on the bidder's side for that hand. In
partnership and cutthroat play that is always just the bidder. In 5-player it is the bidder plus
whoever held the called card, or the bidder alone. Scoring reads `declaring` and never branches on
seat count.

Points are frozen when a hand is recorded, alongside a snapshot of the rules in force. Flipping a
scoring rule later prompts before touching hands already played, and shows what the totals would
become. Declining leaves those hands alone and marks them in the log as scored under earlier
rules. Win and loss conditions (`winOnBid`, `backDoor`) never prompt — they change when the game
ends, not what a hand is worth.

Rules declare which seat counts they apply to, so the settings list only shows what is relevant.
Hidden rules keep their stored values.

Seat count is locked once a hand exists. Changing it means starting a new game.

## Tests

```
node test/scoring.test.js     # scoring engine + migration, no dependencies
npm install jsdom
node test/ui.test.js          # drives the real page: recording, seat lock, rescore prompt
```

## Changing it later

Edit `index.html` or `app.js`, then **bump the `CACHE` string in `sw.js`** (`five-hundred-v2` →
`v3`, and so on). Without that bump, phones that already installed it keep serving the old
cached copy. Force a refresh on a stubborn device by removing the icon and re-adding it.

Persisted state lives under `fivehundred:game:v2`. A `fivehundred:game:v1` payload is migrated on
first load and rewritten under the new key; the old key is left in place as a fallback. If you
change the shape again, add a step to `migrate()` rather than editing `v1_to_v2`.

## If you go to the App Store later

These files are already the hard part. The route from here:

- Wrap this folder with [Capacitor](https://capacitorjs.com) (`npx cap add ios`) — it drops
  `index.html` into a native iOS shell. No code changes needed; `localStorage` persists inside
  the wrapper the same way.
- You'll need a Mac with Xcode and an Apple Developer account ($99/year).
- Apple rejects apps that are only a website in a box, so plan on at least one native
  capability to justify it — iCloud sync between the players at the table, a share sheet
  export of the score sheet, or Live Activities showing the running score on the lock screen.
  Any of those is a real reason for the app to be an app.
