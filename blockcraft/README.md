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
- Right click — place block (or open the crafting menu if you're looking at a Crafting Table, toggle a window/door open or closed, or light a fire if you're holding Flint and aim at a wood or leaf block)
- `Q` `R` `F` `T` `G` `C` `X` `Z` `B` — select a hotbar slot directly (no number keys, no scroll-wheel cycling)
- `I` (or click the currently-selected hotbar slot again, or the **🎒 Inventory** button) — open your inventory and choose what that slot holds
- `E` — open/close crafting when standing near a Crafting Table
- `V` — toggle third-person camera (see your own blocky character)

On a phone or tablet (iPad included), the game automatically switches to touch controls — no setup needed, just open the page in Safari and tap to play:

- Left thumb: on-screen joystick to move (push all the way to the edge to sprint)
- Right side of the screen: drag to look around
- ⛏ — break / attack, ▦ — place / interact (open a table, toggle a window or door, light a fire), **JUMP**, **3rd** — third-person camera
- Tap a hotbar slot to select it, tap it again (or the **🎒 Inventory** button) to change what it holds

## Inventory & hotbar

Every player has their own inventory — everything you're currently holding, with live counts, private to you and saved to this browser (it isn't shared or visible to other players in the multiplayer world). Open it with `I`, the **🎒 Inventory** button, or by clicking a hotbar slot that's already selected. It's split into what you actually have ("Your items", with a count on each) and everything else you could still obtain or craft ("Not yet obtained", grayed out) — tap any tile, held or not, to put it in the currently-selected hotbar slot.

The hotbar itself only shows 9 slots (keys `Q` `R` `F` `T` `G` `C` `X` `Z` `B`, one per slot, left to right) at a time, but any slot can hold any item in the game — materials, structures, tools, all reachable from the same inventory screen. Your hotbar layout is saved per-browser, so it's exactly how you left it next time.

## Crafting

Blocks you break go into your inventory (shown as counts on the hotbar), and placing a block spends one from it. You start with a single Crafting Table — place it on the ground, then right-click it (or stand nearby and press `E`) to open the crafting menu:

- 1 Wood → 4 Planks
- 2 Planks → 4 Sticks
- 4 Planks → 1 Crafting Table
- 4 Stone → 4 Bricks
- 2 Sand → 1 Window
- 3 Planks → 1 Door
- 2 Stone → 1 Flint
- 1 Stick + 1 Flint → 2 Torches

The Craft button lights up once you have enough materials. Your inventory (like your world edits) is saved to `localStorage`, so it persists across reloads.

## Fire & torches

Select Flint from your hotbar (open the item picker if it isn't already assigned to a slot) and right-click a wood or leaf block to set it alight — the block you're actually aiming at is what catches, immediately (not some empty space near it), same as anything fire spreads to on its own. Lighting a fire uses up one Flint. Fire burns for 30 real-world minutes — exactly half a Blockcraft day — then burns itself out and disappears for good; you can also put it out early by breaking the fire block directly. A burning fire gives off a warm flickering light and a soft crackling sound when you're nearby, and is synced through Firebase like any other world change, so everyone in the shared world sees the same fires burning (or going out) at the same time.

Fire isn't a solid block — it's a flickering, non-solid flame you can walk straight through, not something you can stand on or bump into. Standing in it hurts (both you and any nearby animal), so it's a real hazard, not just decoration. And fire spreads: every few seconds, a burning cell has a chance to catch any adjacent wood or leaves alight too, so a single spark on a tree can genuinely chain through the whole thing — trunk and canopy both burn down to nothing, block by block, given enough time — so keep flammable buildings away from anything you set on fire, or you may lose more than you meant to.

Torches are the practical way to actually light up where you live: craft them with a Stick and a Flint, then place them like any other block — on the ground, on a wall, wherever. Unlike fire, a placed torch doesn't burn out; it's a permanent light source (break it to pick it back up), and it's the same warm glow whether it's day or the middle of the night, so it's the right tool for lighting a base or a path once the sun goes down.

You don't have to place one to benefit from it, either — simply having a Torch selected as your current hotbar item lights up the area around you as you walk, so you can explore a cave or find your way home at night without needing to plant torches along the whole route.

## Fireworks

Firework is unlimited — it has no recipe and is never used up, so once you put it in a hotbar slot it's always there. Select it and right-click to launch: a rocket climbs straight up from wherever you're standing and blooms into an evenly-spaced, colorful shower of sparks a moment later, like a flower opening outward, complete with its own soft flash of light.

The launch has a synthesized rising whistle, but the burst uses a real public-domain fireworks recording (see `assets/README.md`) layered with a few bright synthesized crackle-pops for sparkle. Both sounds are delayed to match how far away the firework actually is — light reaches you instantly but sound doesn't, so one going off right above you is basically instant while a distant one visibly outraces its own sound before you hear it, exactly like real fireworks.

Fireworks are synced through Firebase like any other world event, so anyone launched by any connected player is seen (and heard, at the correct delay for wherever you happen to be standing) by everyone in the shared world — not just the person who set it off.

## Ladders

Craft Ladders from Wood (1 Wood → 4 Ladders). Right-click a wall to place one — a single Ladder item fills in a run of up to 5 rungs going straight up from wherever you clicked (stopping early if something's in the way), so one item is usually enough to scale a small cliff or the inside of a tower. Ladders aren't solid — walk into one and holding `W` (or `Space`) climbs you straight up along it, `S` climbs back down, and letting go just holds you in place instead of falling. Climbing down never counts as a fall, so you can descend as far as you like without taking fall damage.

## Crawling

Hold `Ctrl` (or the CRAWL button on touch) to crawl. It drops you to a much shorter hitbox — short enough to fit through a genuine 1-block-tall gap (open space with a solid floor and a solid ceiling right above it) that you'd otherwise just walk into — at the cost of moving noticeably slower than a normal walk, and your view (and, in third person, your character) drops low to match. Standing back up happens the instant you let go of Ctrl, so don't let go while you're still under something low — there's no "keep crouching until there's headroom" grace period, so you'll just be stuck in place (still able to move again the moment you hold Ctrl back down) until you crawl clear of it. Press `L` to toggle crawl on permanently instead of holding Ctrl — handy for exploring a long stretch of low tunnel (like a gopher's) without holding a key the whole way; press `L` again to stand back up.

## Windows & doors

Windows and doors are placeable blocks with an open and a closed state. They're placed closed; right-click a placed one to toggle it — closed blocks movement and (for windows) is a translucent glass texture, open is passable and renders more faded so it's visually obvious you can walk through it. Each has its own creak/slide sound effect for opening vs. closing. Breaking either state always gives you back the closed (placeable) item, never the open one. Toggling is a normal world edit, so it's saved and synced through Firebase like any other block change.

Doors are person-sized: placing one fills a 2-wide × 3-tall opening (windows stay a single block). Right-click, break, or toggle any one of those six cells and the whole door responds together — breaking it anywhere refunds exactly one Door item, and toggling anywhere opens or closes the full frame. A door's orientation always matches the way you're facing when you place it, regardless of the exact spot your crosshair lands on, so it's predictable rather than depending on which face you happened to hit.

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

Animals reproduce: whenever two of the same species wander within about 2 blocks of each other, a baby of that type is born right at the midpoint between them, and each of the two parents needs 30 in-game days (30 real hours) to cool down before it can trigger another birth. Left unattended over a long enough session, herds slowly grow on their own.

### Hunger

You also have a hunger bar (10 drumsticks, right under your hearts) that empties slowly over time — about 19 real minutes from full to empty — regardless of what you're doing. While it's above empty, standing still for a couple of seconds regenerates health the same as always; once it hits zero, regen stops and you'll start taking slow damage until you eat something.

Killing an animal always drops Meat — bigger animals drop more:

| Animal   | Meat dropped |
|----------|--------------|
| Sheep    | 1            |
| Dog      | 1            |
| Lion     | 2            |
| Cow      | 2            |
| Giraffe  | 3            |
| Elephant | 4            |

Select Meat in your hotbar and right-click (or the place/interact button on touch) to eat a piece — each one refills 2 drumsticks, up to the max. Meat is eat-only; it can't be placed as a block.

Every animal is modeled at real-world scale — world units are ~1 unit = 1 meter throughout, the same scale the 1.8-unit-tall player uses. That means giraffes and elephants tower well over you. Bigger animals also get a proportionally longer attack reach so their size isn't just cosmetic.

Killing off a species doesn't leave the world permanently empty — every animal type slowly respawns over time (checked periodically, replacing at most one missing animal every few seconds, so it never feels like a sudden burst) until each species is back to its starting population.

Animal *placement* is deterministic (same seed for everyone), but their movement/AI runs independently on each client — so you and another player may see the same herd in slightly different spots or mid-wander differently, even though a kill is always shared. Animals only ever spawn standing on actual ground — never floating in a tree's trunk or canopy — and each species has its own procedurally-drawn hide texture (cow patches, giraffe spots, sheep wool, etc.), same technique as the block textures.

Falling more than 3 blocks also hurts — you take damage roughly proportional to how far you fell beyond that. Taking any damage (from an animal, another player, or a fall) flashes a red vignette around the edge of the screen, and every action has a small sound effect synthesized on the fly with the Web Audio API. Lions let out a roar the moment they turn hostile — whether that's from you attacking one or just wandering too close — and it's an actual public-domain lion recording (trimmed to ~2 seconds), not a synthesized sound; see [`assets/README.md`](assets/README.md) for the source and license. Everything else audio-wise, along with all the textures, is generated procedurally with no external files.

Stand still for a couple of seconds and your health slowly regenerates, half a heart at a time, until you're back to full — moving or taking damage resets that timer.

Players, animals, and buildings all physically block each other now — you can't walk through another player, an animal, or a wall/door/window, and animals can't wander through your buildings either (though they can still step up onto a single-block-tall obstacle, the same as a small ledge).

## Multiplayer

Everyone who loads the page connects to the same shared world via [Firebase Realtime Database](https://firebase.google.com/docs/database) — block edits and player positions sync live between everyone currently online. GitHub Pages only serves static files, so it can't run a multiplayer server itself; Firebase's free tier fills that role instead, and the client just talks to it directly over a WebSocket.

Before you play, the start screen asks for a name (saved in this browser, so you only type it once). Every player has a floating name-and-HP tag over their head, visible to everyone else in the world and kept live as their health changes.

Press `Enter` (or the 💬 button on touch) to open a chat box — type a message and press `Enter` again to send it to everyone currently online, or `Esc` to cancel. It releases the mouse while you're typing, the same as opening the crafting or inventory menu, and grabs it back automatically the moment you send. The last several messages stay on screen under the hotbar. Chat only keeps the most recent 50 messages in the shared world, so a long-lived game's history never piles up.

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

## Debug panel

Press `Alt+Shift+D` (`Option+Shift+D` on macOS) to toggle a read-only overlay in the top-right corner — it doesn't pause the game or grab the mouse, so you can keep playing with it open. It shows a full census of every block currently in the world (trees, wood, leaves, and water called out up top — "wood if all cut" is exactly how many Wood items chopping down every tree would give you — then every other block type below, most common first), plus a handful of other live numbers: FPS, block edits, chunk meshes actually built, animal/worm/butterfly/fire counts, players online, your position and chunk, and the world's dimensions. "Trees" counts live trunk bases specifically (so a 5x giant tree still counts as one tree, and a felled trunk doesn't), refreshing every 2 seconds while the panel stays open.

## Update notifications

While you're playing, the game quietly checks every 5 minutes whether `main.js` on the server has changed since you loaded it (comparing its ETag/Last-Modified HTTP header, not a version number that has to be bumped by hand — so it can't go stale). If a new build has gone out since you opened the tab, a small banner appears near the top of the screen with a Reload button. It's purely informational — nothing about your session forces a reload, and if the check can't get a usable header (some local dev setups) it just stays quiet instead of false-alarming.

## Notes

- The world is a fixed 128×128 block area (4x the original map) with procedurally generated hills, a beach/water line, and scattered trees — regenerated from a fixed seed, so it's the same every time you load it. The world is flooded three blocks higher than its original sea level, so some ground that used to be shoreline is underwater now.
- Your current coordinates are shown live in the top-left HUD.
- A minimap in the top-left corner shows the whole (fixed-size) world from above — terrain colored the same as its blocks, so lakes read as blue and beaches as sand — with every player, yourself included, shown as a colored triangle (your own color, or the same tint as their in-world character for everyone else) pointing whichever way they're actually facing, outlined in black-and-white so it stays visible over any terrain color, and labeled with their name. It updates live and reflects any block you (or anyone else) build or dig, not just the original generated terrain.
- There are 4 seasons (Spring, Summer, Fall, Winter), each 3 real hours long (a full year is 12 hours), also derived from the system clock so everyone's on the same one. Each season has an average temperature — Spring 50°F, Summer 90°F, Fall 50°F, Winter 20°F — shown in the HUD, which then swings warmer at noon and colder at midnight and wobbles a little on its own, so it's never exactly the same twice. Wetter weather also runs colder on top of that — Cloudy knocks a couple degrees off, working up to a full 14°F colder in a Heavy Thunderstorm — so a rainy or stormy stretch can tip a merely-chilly day into a genuinely dangerous one. Standing outside (no roof, cave ceiling, or tree canopy overhead) above 105°F or below 20°F drains HP slowly, and rapidly (both a bigger hit and more often) once it's above 110°F or below 0°F — a pulsing red HUD warning tells you which ("Overheating!"/"Freezing!" for the slow tier, "Heatstroke!"/"Severe Frostbite!" once it's severe). A winter night or a summer noon are the stretches to watch for, especially with bad weather layered on top. Find shade, a cave, or a building and you're completely safe regardless of how extreme it gets outside.
- New little saplings sprout randomly on open grass over time and slowly grow — visibly taller every so often — into a full tree (or, about 40% of the time, a low trunk-less bush instead, so the world isn't wall-to-wall tall trees) after about 50 real-world minutes. Break a sapling early and it's gone for good; cut a tree's trunk and whatever's left disconnected from the ground (the rest of the trunk, still holding its canopy) actually falls — real accelerating gravity, not a teleport — landing wherever it hits solid ground below. The original generated forest has the same tree/bush mix baked in from the start. About 5% of trees are giants, growing to 5x their normal trunk height — towering landmarks visible from well outside the canopy line — and unlike a normal tree's single top canopy, a giant also grows branches at regular intervals up its trunk, each a short limb jutting outward with its own small leaf clump, so the height actually reads as a tree rather than a bare pole with a hat.
- As long as any part of a tree's trunk is still standing, its canopy slowly grows back over time — chop off some leaves and, minutes later, they'll have quietly regrown, one leaf at a time, back into the tree's original shape (including a giant's branches). Chop the trunk down to the ground, though, and that's permanent — a stump with no trunk left doesn't regrow anything.
- Leaves are sparse and see-through rather than a solid green cube — a genuinely holey, dappled canopy (like Minecraft's own leaf blocks) that still counts as real shelter from sun/rain/temperature even though light visibly passes through the gaps.
- Trees come in 7 species — oak, pine, birch, willow, maple, redwood, and apple — each with its own leaf and trunk coloring (birch's pale trunk, maple's red-orange leaves, redwood's dark canopy over a deep red-brown trunk, apple trees dotted with little red fruit-colored leaves, and so on) and its own canopy density — pine and redwood read as full, dense evergreens, birch and willow as wispy and open, the rest in between — picked deterministically per tree so it's consistent and doesn't need saving. This is purely a visual variation — chopping any of them still gives you the same plain Wood/Leaves items, nothing new to collect. A tree's whole trunk (even a 5x giant's) is always one consistent species end to end, and only wood that's actually got a canopy overhead gets tinted, so ordinary wood structures you build stay their normal color.
- A worm spawns on one of the world's trees the first time anyone loads the shared world. It eats a nearby leaf block once every 0.4 in-game hours (1 real minute, since a full in-game day is 1 real hour — a genuine, permanent world edit, same as if you'd broken it yourself) and has 2 children near itself once every 1 in-game hour (2.5 real minutes), so the population grows quickly over a play session and keeps on eating (capped at 100 so it can't run away entirely). Standing in an active fire kills it instantly, same as it would a player or animal, and stepping directly on one squashes it — dropping a piece of Meat, same as any other kill. Birds also snack on worms, eating one every so often if there's one close by, but only once the worm population is 10 or higher, so birds alone can never wipe worms out (a bird-eaten worm just vanishes, no meat drops — only a squash you deliver yourself does that). A worm always needs something real underneath it — a leaf it's nested in, or solid ground — never open air; eat through the leaf it's standing on (or chop down its whole tree) and it drops straight down like anything else here, lands on the ground, and slowly wanders around hunting for the nearest tree to climb back into. Worms and their eat/breed timers are saved and shared through the same multiplayer connection as everything else, so everyone sees the same worms and the population keeps growing even across reloads — in solo/offline play (no multiplayer connection) a single worm still spawns each session but doesn't persist. The current worm count is shown live in the HUD.
- Once a worm has personally eaten 100 leaves it metamorphoses into a butterfly right where it's standing — a small, genuinely colorful (each one's own random hue and accent-spot pattern) creature that flutters off and roams broadly across the map, though it always stays within 15 blocks of sea level vertically. A butterfly lives for 30 in-game days (30 real hours) before dying of old age. Like worms, its existence is saved and shared with everyone in the world; unlike worms, its actual flight path is never sent over the network at all — every connected client computes the exact same wandering route independently from the butterfly's own id and birth time, so it moves identically everywhere with zero ongoing traffic. The current butterfly count is shown live in the HUD next to the worm count.
- A single harmless ghost floats around at night, about a block above whatever ground is beneath it, and can drift straight through walls, hills, and trees — it simply has no collision at all. It's completely invisible in daylight, fading in at dusk and out at dawn like the fireflies. Every minute or two it likes to sneak in close behind you for a few seconds with a soft "boo," then drifts back off to wander — it never does anything more than that; it can't hurt you.
- 30 different species of birds (robins, cardinals, eagles, hummingbirds, penguin-less but everything else you'd expect, right down to a toucan) circle through the sky around you, each with its own size, coloring, and a real 3D body with a pair of flapping wings — genuinely a different-looking silhouette depending which way you're looking at one, not a flat cutout — and occasionally give a little chirp if one happens to be close enough to actually hear. Fish — six kinds, goldfish through catfish — are real 3D bodies too (fins, a wiggling tail), and swim within whatever body of water is nearest you, staying inside its actual depth rather than beaching themselves. Both are attackable and drop Meat when killed (small species 1, larger ones like the eagle, hawk, swan, and tuna 2), and both keep flying/swimming continuously — a home spot too far away smoothly drifts to a new one over a second and a half instead of teleporting. Birds also occasionally eat a nearby worm once the worm population is healthy. Like the fireflies and the ghost, birds and fish are purely local to your own view, not synced or saved.
- You can swim: get into water deep enough to actually submerge you (not just ankle-deep at the shoreline, where you just walk normally along the bottom) and `Space` takes you up, `S` takes you down. `W`/`A`/`D` only ever move you horizontally in water, same as on land — they don't hold you up — and letting go of everything sinks you gently rather than floating you in place, so simply swimming forward across a lake doesn't let you cruise along the surface for free; staying up takes actually holding Space, the way real swimming does. Landing in water from a fall never deals fall damage, however far you dropped.
- A few gophers dig slowly through the ground a handful of blocks underground, carving out real 2×2 tunnels as they wander — big enough to crawl through (see Crawling above). They're attackable (2 Meat when killed) and, like birds and fish, purely local to your own view.
- Water flows. Break a block (or dig a tunnel) next to existing water and it spreads into the new gap on its own — down first, then sideways — filling it in a block at a time rather than all at once, the same way a hole dug at the shoreline would flood in real life. It never flows upward, so a hole in the ceiling above a lake stays dry. A dropped bucket of Water spreads the same way from wherever you place it. A single dig or placement can only push a flow so far (about 14 blocks from where it started) so one tunnel can't flood the entire map in one go — dig further and it'll just pick up the flow again from wherever it left off.
- You can double jump: press `Space` again while already in the air (a genuine second tap, not just holding the first press down) for an extra boost, reaching noticeably higher than a single jump alone — best timed near the top of the first jump's arc. It recharges the moment you touch ground again, so it's always available for your next jump, but only once per trip through the air.
- A full day/night cycle takes 1 real hour, with gradual multi-minute sunrise and sunset transitions (sky color, lighting, and sun position all shift smoothly). It's driven straight off the system clock, so everyone in the shared world — and your own game after a reload — is always on the same time of day with nothing to sync. The current in-world clock time (00:00 = midnight, 12:00 = noon) is shown live in the HUD as World Time. Press `N` (or the 🕐 button on touch) to cycle that clock through three modes: Regular (the normal wall-clock cycle, default), Day (frozen at noon), and Night (frozen at midnight) — everything driven by the clock follows along, including the sky, sun/moon, the temperature swing, and firefly/ghost visibility, so forcing night is a quick way to go firefly- or ghost-watching without waiting. This is purely local to you — it doesn't change what time it is for anyone else in the shared world.
- A visible sun rises due east, climbs straight overhead, and sets due west (real compass directions — +X is east, -X is west) — not just a light getting brighter/dimmer — and terrain, trees, players, and animals all cast real shadows that swing around to match — the shadow "camera" quietly follows you rather than trying to cover the whole world, so it stays sharp wherever you are. At night a moon takes its place on the opposite side of the sky, also crossing east to west on that same track, waxing and waning through real lunar phases (new → first quarter → full → last quarter → new) on the actual ~29.5-day lunar cycle — anchored so 2026-09-06, 8:00 AM Pacific is exactly a full moon — rather than the game's own sped-up clock, so it changes at the same pace the real moon does.
- There's also a full 12-month calendar shown live in the HUD next to World Time (e.g. "Feb 22, Y2"), independent from the season/temperature system above. It's anchored so that 2026-09-06, 8:00 AM Pacific is exactly Year 0, January 1 — every real hour after that is one calendar month (a nominal 30-day month, so the day-of-month ticks forward every 2 real minutes), and every 12 months rolls the year over. Since it's purely derived from the system clock like everything else here, it's automatically the same date for everyone, with nothing to save or sync.
- Weather rolls a new pattern roughly every 20 minutes and blends into it gradually over about a minute and a half (shown in the top-left HUD), also derived from the system clock so it's the same for everyone. The 20-minute roll picks from: Sunny (50% of the time), Cloudy (15%), Rainy (20%), Rainstorm (10%), or a Heavy Thunderstorm (5%) with lightning flashes and thunder. Worse weather dims the lighting and shortens how far you can see.
- Wind is layered on top, also shown in the HUD (Calm, Light breeze, Breezy, Strong wind, Very strong wind) and also perfectly in sync for everyone. It drifts randomly and continuously rather than switching with the weather pattern, though storms tend to be windier than a clear sky on average. You'll notice it most in the rain — it visibly blows sideways, harder as the wind picks up — and hear it as a gusting sound that gets stronger and higher-pitched the harder it blows.
- Anywhere without a clear vertical path up to open sky — inside a building with a roof, a tunnel you've dug, under a dense tree canopy — is noticeably darker than the surface, independent of however bright it is outside. Light a torch if you're building somewhere enclosed.
- Fireflies drift and blink softly near you after dark (fading in around dusk, out around dawn, same clock as everything else) — a scattering of small glowing lights over open ground, gone again once the sun's up.
- Block edits and inventory are saved to the browser's `localStorage`, so your progress persists across reloads on the same device/browser.
- Best played on desktop with a mouse — pointer lock and WASD aren't a good fit for touch screens.
- Everything is a single `<script>` tag pulling three.js from a CDN (`jsdelivr`), so there's nothing to install or build.
