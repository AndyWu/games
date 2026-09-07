# Blockcraft

A tiny Minecraft-inspired voxel sandbox that runs entirely in the browser — procedurally generated terrain, block breaking/placing, crafting, and shared multiplayer, built with [three.js](https://threejs.org/). No build step, no server-side code, no dependencies to install (multiplayer sync uses a free Firebase project — see below).

## Play locally

Open `index.html` directly, or serve the folder (recommended, since some browsers restrict features on `file://`):

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to GitHub Pages

1. Create a new GitHub repository (public).
2. Push this folder's contents (`index.html`, `main.js`, `firebase-config.js`) to the repo's default branch:
   ```bash
   git init
   git add index.html main.js firebase-config.js README.md
   git commit -m "Add Blockcraft voxel game"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Set **Branch** to `main` and folder to `/ (root)`, then **Save**.
6. After a minute or two, your game is live at:
   `https://<your-username>.github.io/<your-repo>/`

## Controls

- `WASD` — move
- `Space` — jump
- `Shift` — sprint
- Mouse — look (click the page first to lock the pointer)
- Left click — break block, or attack whatever animal/player you're looking at within range
- Right click — place block (or open the crafting menu if you're looking at a Crafting Table)
- `1`–`0` or mouse wheel — select block from hotbar
- `E` — open/close crafting when standing near a Crafting Table
- `V` — toggle third-person camera (see your own blocky character)

## Crafting

Blocks you break go into your inventory (shown as counts on the hotbar), and placing a block spends one from it. You start with a single Crafting Table — place it on the ground, then right-click it (or stand nearby and press `E`) to open the crafting menu:

- 1 Wood → 4 Planks
- 2 Planks → 4 Sticks
- 4 Planks → 1 Crafting Table
- 4 Stone → 4 Bricks

The Craft button lights up once you have enough materials. Your inventory (like your world edits) is saved to `localStorage`, so it persists across reloads.

## Health & combat

Every human player has 10 hearts (20 HP), shown at the top of the screen. The world has six kinds of animals, each with HP scaled against that 10-heart baseline to roughly track their real-world size and toughness:

| Animal   | HP (hearts) | Attacks back? | Attacks on sight? |
|----------|-------------|----------------|--------------------|
| Sheep    | 3           | No             | No                 |
| Dog      | 4           | Yes            | No                 |
| Cow      | 5           | No             | No                 |
| Giraffe  | 8           | Yes            | No                 |
| Lion     | 10          | Yes            | Yes (within ~6 blocks) |
| Elephant | 20          | Yes            | Yes (within ~6 blocks) |

Cows and sheep are always harmless — you can hit them but they never fight back. Dogs and giraffes only turn hostile once you attack them. Lions and elephants will charge and attack on their own if you wander too close, whether or not you've touched them. Left-click anything in range to attack it (a fixed 1-heart hit, on a short cooldown); killing an animal or a player's HP dropping to 0 is synced live through Firebase, so a kill is permanent for everyone in the shared world, not just you. Dying resets you to full health at the spawn point.

Animal *placement* is deterministic (same seed for everyone), but their movement/AI runs independently on each client — so you and another player may see the same herd in slightly different spots or mid-wander differently, even though a kill is always shared. Animals only ever spawn standing on actual ground — never floating in a tree's trunk or canopy — and each species has its own procedurally-drawn hide texture (cow patches, giraffe spots, sheep wool, etc.), same technique as the block textures.

Falling more than 3 blocks also hurts — you take damage roughly proportional to how far you fell beyond that. Taking any damage (from an animal, another player, or a fall) flashes a red vignette around the edge of the screen, and every action has a small synthesized sound effect (no audio files — everything's generated on the fly with the Web Audio API, same "no external assets" approach as the graphics).

## Multiplayer

Everyone who loads the page connects to the same shared world via [Firebase Realtime Database](https://firebase.google.com/docs/database) — block edits and player positions sync live between everyone currently online. GitHub Pages only serves static files, so it can't run a multiplayer server itself; Firebase's free tier fills that role instead, and the client just talks to it directly over a WebSocket.

To point the game at your own Firebase project:

1. Create a free project at [console.firebase.google.com](https://console.firebase.google.com).
2. Go to **Build → Realtime Database → Create Database**.
3. Add a **Web app** to the project (the `</>` icon in Project Settings) and copy the `firebaseConfig` snippet it gives you into `firebase-config.js` in this folder (there's a template there already).
4. In **Realtime Database → Rules**, paste:
   ```json
   {
     "rules": {
       "players": { ".read": true, ".write": true },
       "world": { ".read": true, ".write": true }
     }
   }
   ```
   This keeps the world open to read/write for anyone with the URL — fine for a hobby project among friends, but note there's no auth, so anyone could in principle edit the world or spoof a player. Test-mode's default rules expire after 30 days; these don't.

If you don't want multiplayer at all, delete `firebase-config.js` and its `<script>` tag in `index.html` — the game detects the missing config and falls back to solo mode automatically (with everything saved to local `localStorage` instead).

## Notes

- The world is a fixed 64×64 block area with procedurally generated hills, a beach/water line, and scattered trees — regenerated from a fixed seed, so it's the same every time you load it.
- Block edits and inventory are saved to the browser's `localStorage`, so your progress persists across reloads on the same device/browser.
- Best played on desktop with a mouse — pointer lock and WASD aren't a good fit for touch screens.
- Everything is a single `<script>` tag pulling three.js from a CDN (`jsdelivr`), so there's nothing to install or build.
