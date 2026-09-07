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
2. Push this folder's contents (`index.html`, `main.js`, `firebase-config.js`, `assets/`) to the repo's default branch:
   ```bash
   git init
   git add index.html main.js firebase-config.js assets README.md
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
- Right click — place block (or open the crafting menu if you're looking at a Crafting Table, or toggle a window/door open or closed if you're looking at one)
- `1`–`0` + mouse wheel — select block from hotbar (12 items now; wheel reaches the last two)
- `E` — open/close crafting when standing near a Crafting Table
- `V` — toggle third-person camera (see your own blocky character)

On a phone or tablet (iPad included), the game automatically switches to touch controls — no setup needed, just open the page in Safari and tap to play:

- Left thumb: on-screen joystick to move (push all the way to the edge to sprint)
- Right side of the screen: drag to look around
- ⛏ — break / attack, ▦ — place / interact (open a table, toggle a window or door), **JUMP**, **3rd** — third-person camera
- Tap a hotbar slot to select it (also works with a mouse on desktop)

## Crafting

Blocks you break go into your inventory (shown as counts on the hotbar), and placing a block spends one from it. You start with a single Crafting Table — place it on the ground, then right-click it (or stand nearby and press `E`) to open the crafting menu:

- 1 Wood → 4 Planks
- 2 Planks → 4 Sticks
- 4 Planks → 1 Crafting Table
- 4 Stone → 4 Bricks
- 2 Sand → 1 Window
- 3 Planks → 1 Door

The Craft button lights up once you have enough materials. Your inventory (like your world edits) is saved to `localStorage`, so it persists across reloads.

## Windows & doors

Windows and doors are placeable blocks with an open and a closed state. They're placed closed; right-click a placed one to toggle it — closed blocks movement and (for windows) is a translucent glass texture, open is passable and renders more faded so it's visually obvious you can walk through it. Each has its own creak/slide sound effect for opening vs. closing. Breaking either state always gives you back the closed (placeable) item, never the open one. Toggling is a normal world edit, so it's saved and synced through Firebase like any other block change.

Doors are person-sized: placing one fills a 2-wide × 3-tall opening (windows stay a single block). Right-click, break, or toggle any one of those six cells and the whole door responds together — breaking it anywhere refunds exactly one Door item, and toggling anywhere opens or closes the full frame.

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

Cows and sheep are always harmless — you can hit them but they never fight back. Dogs and giraffes only turn hostile once you attack them. Lions and elephants will charge and attack on their own if you wander too close, whether or not you've touched them. Left-click anything in range to attack it (a fixed 1-heart hit, on a short cooldown); killing an animal or a player's HP dropping to 0 is synced live through Firebase, so a kill is permanent for everyone in the shared world, not just you. Dying freezes you in place for 3 seconds (with a respawn countdown on screen) before resetting you to full health at a random spawn point, picked from 10 fixed spots around the map — never the same one twice in a row.

Every animal is modeled at real-world scale — world units are ~1 unit = 1 meter throughout, the same scale the 1.8-unit-tall player uses. That means giraffes and elephants tower well over you. Bigger animals also get a proportionally longer attack reach so their size isn't just cosmetic.

Killing off a species doesn't leave the world permanently empty — every animal type slowly respawns over time (checked periodically, replacing at most one missing animal every few seconds, so it never feels like a sudden burst) until each species is back to its starting population.

Animal *placement* is deterministic (same seed for everyone), but their movement/AI runs independently on each client — so you and another player may see the same herd in slightly different spots or mid-wander differently, even though a kill is always shared. Animals only ever spawn standing on actual ground — never floating in a tree's trunk or canopy — and each species has its own procedurally-drawn hide texture (cow patches, giraffe spots, sheep wool, etc.), same technique as the block textures.

Falling more than 3 blocks also hurts — you take damage roughly proportional to how far you fell beyond that. Taking any damage (from an animal, another player, or a fall) flashes a red vignette around the edge of the screen, and every action has a small sound effect synthesized on the fly with the Web Audio API. Lions let out a roar the moment they turn hostile — whether that's from you attacking one or just wandering too close — and it's an actual public-domain lion recording (trimmed to ~2 seconds), not a synthesized sound; see [`assets/README.md`](assets/README.md) for the source and license. Everything else audio-wise, along with all the textures, is generated procedurally with no external files.

Stand still for a couple of seconds and your health slowly regenerates, half a heart at a time, until you're back to full — moving or taking damage resets that timer.

Players, animals, and buildings all physically block each other now — you can't walk through another player, an animal, or a wall/door/window, and animals can't wander through your buildings either (though they can still step up onto a single-block-tall obstacle, the same as a small ledge).

## Multiplayer

Everyone who loads the page connects to the same shared world via [Firebase Realtime Database](https://firebase.google.com/docs/database) — block edits and player positions sync live between everyone currently online. GitHub Pages only serves static files, so it can't run a multiplayer server itself; Firebase's free tier fills that role instead, and the client just talks to it directly over a WebSocket.

Before you play, the start screen asks for a name (saved in this browser, so you only type it once). Every player has a floating name-and-HP tag over their head, visible to everyone else in the world and kept live as their health changes.

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

- The world is a fixed 128×128 block area (4x the original map) with procedurally generated hills, a beach/water line, and scattered trees — regenerated from a fixed seed, so it's the same every time you load it.
- New little saplings sprout randomly on open grass over time and slowly grow — visibly taller every so often — into a full tree after a few real-world minutes. Break a sapling early and it's gone for good; cut a tree's trunk and whatever's left disconnected from the ground (the rest of the trunk, still holding its canopy) actually falls — real accelerating gravity, not a teleport — landing wherever it hits solid ground below.
- A full day/night cycle takes 1 real hour, with gradual multi-minute sunrise and sunset transitions (sky color, lighting, and sun position all shift smoothly). It's driven straight off the system clock, so everyone in the shared world — and your own game after a reload — is always on the same time of day with nothing to sync.
- Weather rolls a new pattern roughly every 20 minutes and blends into it gradually over about a minute and a half (shown in the top-left HUD), also derived from the system clock so it's the same for everyone. The 20-minute roll picks from: Sunny (50% of the time), Cloudy (15%), Rainy (20%), Rainstorm (10%), or a Heavy Thunderstorm (5%) with lightning flashes and thunder. Worse weather dims the lighting and shortens how far you can see.
- Block edits and inventory are saved to the browser's `localStorage`, so your progress persists across reloads on the same device/browser.
- Best played on desktop with a mouse — pointer lock and WASD aren't a good fit for touch screens.
- Everything is a single `<script>` tag pulling three.js from a CDN (`jsdelivr`), so there's nothing to install or build.
