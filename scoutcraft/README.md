# ScoutCraft

Set up camp in the wilderness and earn your merit badges. A single-player voxel world that runs
entirely in the browser — procedurally generated terrain, block breaking/placing, crafting — built
with [three.js](https://threejs.org/) — with a scouting layer on top: rope you twist from leaves, a
walk-in tent you pitch, campfires you cook on, a compass that finds its way back to camp, and
fourteen merit badges that promote you from Tenderfoot to Eagle Scout.

No build step, no server-side code, no dependencies to install, no account to make. Everything —
your world, your inventory, your progress — lives in this browser's `localStorage`.

ScoutCraft began as a fork of [Blockcraft](../blockcraft) and keeps its whole engine: the same
terrain generation, chunked meshing, day/night cycle, seasons and weather, animals, birds, fish and
wildlife. What's new is everything in [Merit badges](#merit-badges) and [Camp gear](#camp-gear).

## Play locally

Open `index.html` directly, or serve the folder (recommended, since some browsers restrict features on `file://`):

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to GitHub Pages

1. Create a new GitHub repository (public).
2. Push this folder's contents (`index.html`, `main.js`, `assets/`) to the repo's default branch:
   ```bash
   git init
   git add index.html main.js assets README.md
   git commit -m "Add ScoutCraft"
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
- Right click — place block. Or, depending on what you're holding and what you're aiming at: cook Raw Meat on a Campfire, take a bearing with the Compass, eat a meal, open the Camp Workbench or a placed Backpack, toggle a window/door open or closed, or light a fire with Flint aimed at wood or leaves
- `Q` `R` `F` `T` `G` `C` `X` `Z` `B` — select a hotbar slot directly (no number keys, no scroll-wheel cycling)
- `I` (or click the currently-selected hotbar slot again, or the **🎒 Inventory** button) — open your inventory and choose what that slot holds
- `E` — open/close crafting when standing near a Camp Workbench
- `M` (or the **🎖️ Badges** button) — open your merit badge sash
- `K` — sleep through the night, if you're near your tent and it's after dark
- `V` — toggle third-person camera (see your own blocky character)

On a phone or tablet (iPad included), the game automatically switches to touch controls — no setup needed, just open the page in Safari and tap to play:

- Left thumb: on-screen joystick to move (push all the way to the edge to sprint)
- Right side of the screen: drag to look around
- ⛏ — break / attack, ▦ — place / interact (open a table, toggle a window or door, light a fire), **JUMP**, **3rd** — third-person camera
- Tap a hotbar slot to select it, tap it again (or the **🎒 Inventory** button) to change what it holds

## Inventory & hotbar

Your inventory — everything you're currently holding, with live counts — is saved to this browser. Open it with `I`, the **🎒 Inventory** button, or by clicking a hotbar slot that's already selected. It's split into what you actually have ("Your items", with a count on each) and everything else you could still obtain or craft ("Not yet obtained", grayed out) — tap any tile, held or not, to put it in the currently-selected hotbar slot.

The hotbar itself only shows 9 slots (keys `Q` `R` `F` `T` `G` `C` `X` `Z` `B`, one per slot, left to right) at a time, but any slot can hold any item in the game — materials, structures, tools, all reachable from the same inventory screen. Your hotbar layout is saved per-browser, so it's exactly how you left it next time.

## Crafting

Blocks you break go into your inventory (shown as counts on the hotbar), and placing a block spends one from it. Place a Camp Workbench on the ground, then right-click it (or stand nearby and press `E`) to open the crafting menu:

**Basics**

- 1 Wood → 4 Planks
- 2 Planks → 4 Sticks
- 4 Planks → 1 Camp Workbench
- 4 Stone → 4 Bricks
- 2 Sand → 1 Window
- 3 Planks → 1 Door
- 2 Stone → 1 Flint
- 1 Stick + 1 Flint → 2 Torches
- 1 Wood → 4 Ladders

**Camp gear**

- 4 Leaves → 2 Rope
- 4 Planks + 2 Rope → 1 Tent
- 3 Wood + 1 Flint → 1 Campfire
- 1 Stick + 1 Flint + 1 Window → 1 Lantern
- 1 Flint + 2 Stone → 1 Compass
- 2 Planks + 2 Sticks + 1 Rope → 1 Troop Flag

Rope is the gateway: the Tent and the Troop Flag both need it, and it comes from leaves — so a
scout's first job is always finding a tree.

The Craft button lights up once you have enough materials. Your inventory (like your world edits) is saved to `localStorage`, so it persists across reloads.

## Merit badges

The scouting layer on top of the sandbox. Instead of only building for its own sake, you earn
badges for doing real scout things, and badges promote you through the ranks. Press `M` (or the
**🎖️ Badges** button) to open your sash: earned badges are lit in gold, the rest show what they
want and how far along you are ("14 / 25 wood").

| Badge | Name | How to earn it |
| --- | --- | --- |
| 🪵 | Woodcraft | Gather 25 wood from trees |
| 🪢 | Pioneering | Twist 6 lengths of rope |
| 🔥 | Firecraft | Light your first campfire |
| ⛺ | Camping | Pitch a tent |
| 🍳 | Cooking | Cook a meal on a campfire |
| 🧭 | Navigation | Craft a compass and take a bearing |
| 🥾 | Hiking | Hike 1,000 blocks on foot |
| 🏊 | Swimming | Swim 60 blocks |
| 🧗 | Climbing | Get 18 blocks above sea level |
| 🦌 | Nature Study | Study all 6 animals up close — the bear and moose included |
| 🦉 | Night Watch | Spend 5 minutes outdoors after dark |
| ⛑️ | First Aid | Heal back to full health after nearly dying |
| 🚩 | Troop Flag | Raise your troop flag at camp |
| ⭐ | Astronomy | Find the Big Dipper and stare at it for 10 seconds |

Ranks follow from the count alone — **Tenderfoot** (0), **Second Class** (2), **First Class** (5),
**Star Scout** (8), **Life Scout** (11), **Eagle Scout** (all 14) — and your current rank and badge
count sit in the HUD at the top of the screen. Earning one plays a short bugle call and drops a
banner telling you what you got, and what rank it just made you.

Progress is per-browser, saved to `localStorage` alongside your world edits and inventory, and only
counts while you're actually playing — nothing accrues while you sit on the start screen or have a
panel open. Distance ignores teleport-sized jumps, so a respawn doesn't quietly hand you Hiking.

Nature Study deliberately tracks only the six ground animals and only within 9 blocks: birds are
spawned to circle wherever the player is and fish fill every pond, so counting them made the badge
free. Walking up to the black bear or a wolf, on the other hand, is a genuine dare — both attack on
sight.

## Camp gear

Seven craftable things the badges are built around. Break any of them to pick it back up — for the
tent, breaking any single wall takes the whole shelter down and hands back just one Tent item, not
one per block.

- **Rope** — twisted from leaves. Pure crafting material; the Tent and Troop Flag both need it.
- **Tent** — not just a block: placing one builds a real walk-in shelter — three canvas walls and a
  flat roof around one tile of floor space, with a one-block gap left open at the front so you can
  actually step inside. It's oriented by which way you're facing when you place it, the same way a
  Door picks its width — the doorway always ends up facing back toward you.
- **Campfire** — the middle of camp. A permanent, harmless block (unlike wildfire `FIRE`, which
  burns out, spreads and hurts) that throws warm light over the whole clearing. Your **first**
  campfire is what the compass treats as camp from then on.
- **Lantern** — a cooler, tighter light you can walk through and place anywhere. Brighter and
  steadier than a torch.
- **Compass** — right-click it anywhere in the world and it tells you how far camp is and which
  way, as a real bearing: *"🧭 Camp: 34 blocks NNE."* Before you've lit a campfire it points to the
  middle of the map instead.
- **Backpack** — a camp fixture that doubles as a shortcut: right-click a placed one to open your
  pack, the same panel the `I` key opens, so you can check what you're carrying without reaching
  for the keyboard while your hands are full setting up camp.
- **Troop Flag** — a red pennant on a pole. Purely yours to plant, and the last badge on the sash.

**Sleep:** stand near your tent after dark and press `K`. It can't actually fast-forward the real
clock the world runs on, so — like the `N` key's day/night override — it jumps your own view to
morning rather than skipping the night outright, but it does fully restore your health and hunger.
Try it before dark, or too far from any tent, and it just tells you why not instead of doing
anything.

**Cooking:** hold Raw Meat, aim at a Campfire and right-click. A Cooked Meal restores twice the
hunger raw meat does (8 points against 4), which is the practical payoff for earning Firecraft.

Campfires, lanterns and torches render *unlit* — at full texture brightness, day or night. This is
deliberate: a block that gives off light shouldn't be shaded by light, and with the normal material
a campfire sat as a black cube in the middle of its own pool of light, because its point light is
inside the block and contributes nothing to the outward-facing normals.

## Fire & torches

Select Flint from your hotbar (open the item picker if it isn't already assigned to a slot) and right-click a wood or leaf block to set it alight — the block you're actually aiming at is what catches, immediately (not some empty space near it), same as anything fire spreads to on its own. Lighting a fire uses up one Flint. Fire burns for 30 real-world minutes — exactly half a ScoutCraft day — then burns itself out and disappears for good; you can also put it out early by breaking the fire block directly. A burning fire gives off a warm flickering light and a soft crackling sound when you're nearby, and is saved like any other world change, so it's still burning (or already out) right where you left it if you reload.

Fire isn't a solid block — it's a flickering, non-solid flame you can walk straight through, not something you can stand on or bump into. Standing in it hurts (both you and any nearby animal), so it's a real hazard, not just decoration. And fire spreads: every few seconds, a burning cell has a chance to catch any adjacent wood or leaves alight too, so a single spark on a tree can genuinely chain through the whole thing — trunk and canopy both burn down to nothing, block by block, given enough time — so keep flammable buildings away from anything you set on fire, or you may lose more than you meant to.

For lighting camp, prefer a **Campfire** or a **Lantern** (see [Camp gear](#camp-gear)) — they're brighter, they never burn out and they can't hurt you. Torches still work the same way: craft them with a Stick and a Flint, then place them like any other block — on the ground, on a wall, wherever. Unlike fire, a placed torch doesn't burn out; it's a permanent light source (break it to pick it back up), and it's the same warm glow whether it's day or the middle of the night, so it's the right tool for lighting a base or a path once the sun goes down.

You don't have to place one to benefit from it, either — simply having a Torch selected as your current hotbar item lights up the area around you as you walk, so you can explore a cave or find your way home at night without needing to plant torches along the whole route.

## Fireworks

Firework is unlimited — it has no recipe and is never used up, so once you put it in a hotbar slot it's always there. Select it and right-click to launch: a rocket climbs straight up from wherever you're standing and blooms into an evenly-spaced, colorful shower of sparks a moment later, like a flower opening outward, complete with its own soft flash of light.

The launch has a synthesized rising whistle, but the burst uses a real public-domain fireworks recording (see `assets/README.md`) layered with a few bright synthesized crackle-pops for sparkle. Both sounds are delayed to match how far away the firework actually is — light reaches you instantly but sound doesn't, so one going off right above you is basically instant while a distant one visibly outraces its own sound before you hear it, exactly like real fireworks.

Fireworks are purely a visual/audio flourish — never saved, never limited — so launch as many as you like.

## Ladders

Craft Ladders from Wood (1 Wood → 4 Ladders). Right-click a wall to place one — a single Ladder item fills in a run of up to 5 rungs going straight up from wherever you clicked (stopping early if something's in the way), so one item is usually enough to scale a small cliff or the inside of a tower. Ladders aren't solid — walk into one and holding `W` (or `Space`) climbs you straight up along it, `S` climbs back down, and letting go just holds you in place instead of falling. Climbing down never counts as a fall, so you can descend as far as you like without taking fall damage.

## Crawling

Hold `Ctrl` (or the CRAWL button on touch) to crawl. It drops you to a much shorter hitbox — short enough to fit through a genuine 1-block-tall gap (open space with a solid floor and a solid ceiling right above it) that you'd otherwise just walk into — at the cost of moving noticeably slower than a normal walk, and your view (and, in third person, your character) drops low to match. Standing back up happens the instant you let go of Ctrl, so don't let go while you're still under something low — there's no "keep crouching until there's headroom" grace period, so you'll just be stuck in place (still able to move again the moment you hold Ctrl back down) until you crawl clear of it. Press `L` to toggle crawl on permanently instead of holding Ctrl — handy for exploring a long stretch of low tunnel (like a gopher's) without holding a key the whole way; press `L` again to stand back up.

## Windows & doors

Windows and doors are placeable blocks with an open and a closed state. They're placed closed; right-click a placed one to toggle it — closed blocks movement and (for windows) is a translucent glass texture, open is passable and renders more faded so it's visually obvious you can walk through it. Each has its own creak/slide sound effect for opening vs. closing. Breaking either state always gives you back the closed (placeable) item, never the open one. Toggling is a normal world edit, so it's saved like any other block change.

Doors are person-sized: placing one fills a 2-wide × 3-tall opening (windows stay a single block). Right-click, break, or toggle any one of those six cells and the whole door responds together — breaking it anywhere refunds exactly one Door item, and toggling anywhere opens or closes the full frame. A door's orientation always matches the way you're facing when you place it, regardless of the exact spot your crosshair lands on, so it's predictable rather than depending on which face you happened to hit.

## Health & combat

Every human player has 10 hearts (20 HP), shown at the top of the screen. The world has five kinds of animals, each with HP scaled against that 10-heart baseline to roughly track their real-world size and toughness:

| Animal   | HP (hearts) | Attacks back? | Attacks on sight? |
|----------|-------------|----------------|--------------------|
| Rabbit   | 1           | No             | No                 |
| Squirrel | 1           | No             | No                 |
| Deer     | 4           | No             | No                 |
| Wolf     | 6           | Yes            | Yes (within ~6 blocks) |
| Bear     | 16          | Yes            | Yes (within ~6 blocks) |
| Moose    | 18          | Yes            | No                 |

Rabbits, squirrels, and deer are always harmless — you can hit them but they never fight back. The moose only turns hostile once you attack it. Wolves and the black bear will charge and attack on their own if you wander too close, whether or not you've touched them. Left-click anything in range to attack it (a fixed 1-heart hit, on a short cooldown); a kill is permanent, and dead animals respawn gradually over time (see below), not instantly. Dying freezes you in place for 3 seconds (with a respawn countdown on screen) before resetting you to full health at a random spawn point, picked from 10 fixed spots around the map — never the same one twice in a row. Leaving the game while still alive is different: close the tab and come back later, and you'll pick up right where you left off instead of at a random spot — your last position is saved in this browser every few seconds while you play. Dying clears that saved spot, so a death always still sends you to a random spawn point next time, not back to wherever you fell.

Climbing onto a short ledge or wading a little into deep water doesn't make a hostile animal give up — if it can't physically walk the rest of the way to you (a real height drop it can't climb, or water it won't cross), it can still lunge and land a hit as long as you're within a generous reach measured in real 3D space, not just flat ground distance. Get far enough away — a real cliff, open water well off the shore — and you're genuinely out of reach; a short obstacle just outside its normal attack range isn't.

Animals are solid, not something you can walk or fall straight through — jump onto one from above and you land on its back like any other obstacle, instead of clipping through its body onto the ground underneath.

Animals reproduce: whenever two of the same species wander within about 2 blocks of each other, a baby of that type is born right at the midpoint between them, and each of the two parents needs 30 in-game days (30 real hours) to cool down before it can trigger another birth. Left unattended over a long enough session, herds slowly grow on their own.

The world starts out with 10 rabbits, 10 squirrels, 5 deer, 2 wolves, 1 black bear, and 1 moose, and any that die respawn gradually to keep the population back up to those same counts.

### Hunger

You also have a hunger bar (10 drumsticks, right under your hearts) that empties slowly over time — about 19 real minutes from full to empty — regardless of what you're doing. While it's above empty, standing still for a couple of seconds regenerates health the same as always; once it hits zero, regen stops and you'll start taking slow damage until you eat something.

Killing an animal always drops Meat — bigger animals drop more:

| Animal   | Meat dropped |
|----------|--------------|
| Rabbit   | 1            |
| Squirrel | 1            |
| Deer     | 2            |
| Wolf     | 2            |
| Bear     | 3            |
| Moose    | 5            |

Select Meat in your hotbar and right-click (or the place/interact button on touch) to eat a piece — each one refills 2 drumsticks, up to the max. Meat is eat-only; it can't be placed as a block. You don't need to free up a hotbar slot for it, either — open your inventory (`I`, or the Inventory button on touch) and click Meat directly to eat a piece on the spot.

Every animal is modeled at real-world scale — world units are ~1 unit = 1 meter throughout, the same scale the 1.8-unit-tall player uses. That means a moose, at a good 2.1 blocks at the shoulder before you even count its antlers, towers well over you. Bigger animals also get a proportionally longer attack reach so their size isn't just cosmetic — a moose's kick reaches out a full block.

Killing off a species doesn't leave the world permanently empty — every animal type slowly respawns over time (checked periodically, replacing at most one missing animal every few seconds, so it never feels like a sudden burst) until each species is back to its starting population.

Animal placement is deterministic (same seed every time), so the herd starts in the same spots on a fresh world. Animals only ever spawn standing on actual ground — never floating in a tree's trunk or canopy — and each species has its own procedurally-drawn hide texture (a deer's reddish coat, a wolf's grey streaks, a moose's leathery wrinkles, etc.), same technique as the block textures.

Falling more than 3 blocks also hurts — you take damage roughly proportional to how far you fell beyond that. Taking any damage (from an animal or a fall) flashes a red vignette around the edge of the screen, and every action has a small sound effect synthesized on the fly with the Web Audio API. The black bear lets out a roar the moment it turns hostile — whether that's from you attacking it or just wandering too close — reusing the same public-domain roar recording (trimmed to ~2 seconds) that Blockcraft uses for its lions, since a real bear growl wasn't available; see [`assets/README.md`](assets/README.md) for the source and license. Everything else audio-wise, along with all the textures, is generated procedurally with no external files.

Stand still for a couple of seconds and your health slowly regenerates, half a heart at a time, until you're back to full — moving or taking damage resets that timer.

You, animals, and buildings all physically block each other — you can't walk through an animal or a wall/door/window, and animals can't wander through your buildings either (though they can still step up onto a single-block-tall obstacle, the same as a small ledge).

## Saving your progress

ScoutCraft is single-player and keeps everything on your own machine — there's no account, no
server, and no network connection at all. Your world edits, inventory, hotbar layout, badges, and
even your camp's worms/butterflies/saplings/fires are all written to this browser's `localStorage`
as you play, so closing the tab and coming back later picks up right where you left off.

That also means progress is tied to this specific browser on this specific device: clearing your
browser's site data for this page (or opening it in a different browser, or incognito) starts a
brand-new world. There's nothing to back up or export short of copying the relevant
`scoutcraft_*` keys out of `localStorage` yourself.

## Debug panel

Press `Alt+Shift+D` (`Option+Shift+D` on macOS) to toggle a read-only overlay in the top-right corner — it doesn't pause the game or grab the mouse, so you can keep playing with it open. It shows a full census of every block currently in the world (trees, wood, leaves, and water called out up top — "wood if all cut" is exactly how many Wood items chopping down every tree would give you — then every other block type below, most common first), plus a handful of other live numbers: FPS, block edits, chunk meshes actually built, animal/worm/butterfly/fire counts, your position and chunk, and the world's dimensions. "Trees" counts live trunk bases specifically (so a 5x giant tree still counts as one tree, and a felled trunk doesn't), refreshing every 2 seconds while the panel stays open.

## Update notifications

While you're playing, the game quietly checks every 5 minutes whether `main.js` on the server has changed since you loaded it (comparing its ETag/Last-Modified HTTP header, not a version number that has to be bumped by hand — so it can't go stale). If a new build has gone out since you opened the tab, a small banner appears near the top of the screen with a Reload button. It's purely informational — nothing about your session forces a reload, and if the check can't get a usable header (some local dev setups) it just stays quiet instead of false-alarming.

## Notes

- The world is a fixed 128×128 block area (4x the original map) with procedurally generated hills, a beach/water line, and scattered trees — regenerated from a fixed seed, so it's the same every time you load it. The world is flooded three blocks higher than its original sea level, so some ground that used to be shoreline is underwater now.
- Your current coordinates are shown live in the top-left HUD.
- A minimap in the top-left corner shows the whole (fixed-size) world from above — terrain colored the same as its blocks, so lakes read as blue and beaches as sand — with you shown as a triangle pointing whichever way you're actually facing, outlined in black-and-white so it stays visible over any terrain color, and labeled with your name. It updates live and reflects any block you build or dig, not just the original generated terrain.
- There are 4 seasons (Spring, Summer, Fall, Winter), each 3 real hours long (a full year is 12 hours), also derived from the system clock so everyone's on the same one. Each season has an average temperature — Spring 50°F, Summer 90°F, Fall 50°F, Winter 20°F — shown in the HUD, which then swings warmer at noon and colder at midnight and wobbles a little on its own, so it's never exactly the same twice. Wetter weather also runs colder on top of that — Cloudy knocks a couple degrees off, working up to a full 14°F colder in a Heavy Thunderstorm — so a rainy or stormy stretch can tip a merely-chilly day into a genuinely dangerous one. Standing outside (no roof, cave ceiling, or tree canopy overhead) above 105°F or below 20°F drains HP slowly, and rapidly (both a bigger hit and more often) once it's above 110°F or below 0°F — a pulsing red HUD warning tells you which ("Overheating!"/"Freezing!" for the slow tier, "Heatstroke!"/"Severe Frostbite!" once it's severe). A winter night or a summer noon are the stretches to watch for, especially with bad weather layered on top. Find shade, a cave, or a building and you're completely safe regardless of how extreme it gets outside.
- New little saplings sprout randomly on open grass over time and slowly grow — visibly taller every so often — into a full tree (or, about 40% of the time, a low trunk-less bush instead, so the world isn't wall-to-wall tall trees) after about 50 real-world minutes. Break a sapling early and it's gone for good; cut a tree's trunk and whatever's left disconnected from the ground (the rest of the trunk, still holding its canopy) actually falls — real accelerating gravity, not a teleport — landing wherever it hits solid ground below. The original generated forest has the same tree/bush mix baked in from the start. About 5% of trees are giants, growing to 5x their normal trunk height — towering landmarks visible from well outside the canopy line — and unlike a normal tree's single top canopy, a giant also grows branches at regular intervals up its trunk, each a short limb jutting outward with its own small leaf clump, so the height actually reads as a tree rather than a bare pole with a hat.
- As long as any part of a tree's trunk is still standing, its canopy slowly grows back over time — chop off some leaves and, minutes later, they'll have quietly regrown, one leaf at a time, back into the tree's original shape (including a giant's branches). Chop the trunk down to the ground, though, and that's permanent — a stump with no trunk left doesn't regrow anything.
- Leaves are sparse and see-through rather than a solid green cube — a genuinely holey, dappled canopy (like Minecraft's own leaf blocks) that still counts as real shelter from sun/rain/temperature even though light visibly passes through the gaps.
- Trees come in 7 species — oak, pine, birch, willow, maple, redwood, and apple — each with its own leaf and trunk coloring (birch's pale trunk, maple's red-orange leaves, redwood's dark canopy over a deep red-brown trunk, apple trees dotted with little red fruit-colored leaves, and so on) and its own canopy density — pine and redwood read as full, dense evergreens, birch and willow as wispy and open, the rest in between — picked deterministically per tree so it's consistent and doesn't need saving. This is purely a visual variation — chopping any of them still gives you the same plain Wood/Leaves items, nothing new to collect. A tree's whole trunk (even a 5x giant's) is always one consistent species end to end, and only wood that's actually got a canopy overhead gets tinted, so ordinary wood structures you build stay their normal color.
- A minority of trees generate dead — same trunk, but most are entirely bare (no canopy at all, just a stripped-looking snag), and a few keep a canopy of dry, sparse brown leaves instead of their species' usual color. Which is purely deterministic per tree, same as species. Chopping a dead tree is completely fine — it's chopping a **living** one (any tree that still has a canopy) that gets you a message reminding you a real Scout leaves living trees standing and cuts only dead wood; it's a nudge, not a rule, so it doesn't stop you.
- A worm spawns on one of the world's trees the first time you ever load the game. It eats a nearby leaf block once every 0.4 in-game hours (1 real minute, since a full in-game day is 1 real hour — a genuine, permanent world edit, same as if you'd broken it yourself) and has 2 children near itself once every 1 in-game hour (2.5 real minutes), so the population grows quickly over a play session and keeps on eating (capped at 100 so it can't run away entirely). Standing in an active fire kills it instantly, same as it would you or an animal, and stepping directly on one squashes it — dropping a piece of Meat, same as any other kill. Birds also snack on worms, eating one every so often if there's one close by, but only once the worm population is 10 or higher, so birds alone can never wipe worms out (a bird-eaten worm just vanishes, no meat drops — only a squash you deliver yourself does that). A worm always needs something real underneath it — a leaf it's nested in, or solid ground — never open air; eat through the leaf it's standing on (or chop down its whole tree) and it drops straight down like anything else here, lands on the ground, and slowly wanders around hunting for the nearest tree to climb back into. Worms and their eat/breed timers are saved to `localStorage`, so the population keeps growing even across reloads instead of resetting. The current worm count is shown live in the HUD.
- Once a worm has personally eaten 100 leaves it metamorphoses into a butterfly right where it's standing — a small, genuinely colorful (each one's own random hue and accent-spot pattern), genuinely 3D creature that flutters off and roams broadly across the map, though it always stays within 15 blocks of sea level vertically. Its two wings are real hinged geometry, not a flat cutout — they open and close in an actual up-down flap and read as a different silhouette depending which way you're looking at one, edge-on included. A butterfly lives for 30 in-game days (30 real hours) before dying of old age. Like worms, its existence is saved and shared with everyone in the world; unlike worms, its actual flight path is never sent over the network at all — every connected client computes the exact same wandering route independently from the butterfly's own id and birth time, so it moves identically everywhere with zero ongoing traffic. The current butterfly count is shown live in the HUD next to the worm count.
- 30 different species of birds (robins, cardinals, eagles, hummingbirds, penguin-less but everything else you'd expect, right down to a toucan) circle through the sky around you, each with its own size, coloring, and a real 3D body with a pair of flapping wings — genuinely a different-looking silhouette depending which way you're looking at one, not a flat cutout — and occasionally give a little chirp if one happens to be close enough to actually hear. Fish are real 3D bodies too (fins, a wiggling tail), and swim within whatever body of water is nearest you, staying inside its actual depth rather than beaching themselves. Six kinds — goldfish through catfish — swim at ordinary size; two much bigger species, Sharks (a solid 2 blocks nose to tail) and the rarer Whale Shark (a full 3 blocks), are scaled-up versions of that same fish model and need genuinely deep water to spawn in, so you'll only run into one out over a real lake or the ocean, never in a shallow pond. Every fish is attackable and drops Meat when killed, scaled to size — the small schooling species drop 1 (tuna 2), a Shark drops 3, a Whale Shark 5 — and all of them keep swimming continuously, a home spot too far away smoothly drifting to a new one over a second and a half instead of teleporting. Birds also occasionally eat a nearby worm once the worm population is healthy. Like the fireflies, birds and fish are purely ambient decoration, not saved between reloads.
- 2 Giant Eagles soar much higher and range much further than the regular birds — the same bird model, just scaled up to a real wingspan, and colored like the real thing: a near-black body and wings, a white head, and the same golden beak every bird already has. Rather than drifting like a regular bird, each one actually circles a fixed point in a real loop (one clockwise, one counterclockwise), the way a real bird of prey wheels while scanning the ground below. Roughly once an in-game day, each one hunts down the 2 birds or fish currently nearest it and eats them outright — that kill is the eagle's alone, so unlike hunting one yourself it drops no Meat. They're attackable like every other creature here and worth 3 Meat if you take one down (4 HP, tougher than a regular bird). Land on one from above (jump onto its back, same as landing on any animal) and you'll ride it: it stops circling and instead flies a long, slow tour of random points across the whole map, carrying you along for free sightseeing with no fall damage no matter how high it climbs. Press `Space` to hop off wherever you are — the eagle then finds a fresh spot nearby and goes back to its usual circling.
- Turtles paddle slowly through the water — three real kinds (Green Sea, Hawksbill, Loggerhead), each its own shell and skin coloring, with four flippers that stroke independently and a head that pokes out front. They're noticeably more leisurely than fish, drifting a shorter distance at a slower pace. Attackable like everything else here, dropping 1 Meat (2 for a Loggerhead).
- You can swim: get into water deep enough to actually submerge you (not just ankle-deep at the shoreline, where you just walk normally along the bottom) and `Space` takes you up, `S` takes you down. `W`/`A`/`D` only ever move you horizontally in water, same as on land — they don't hold you up — and letting go of everything sinks you gently rather than floating you in place, so simply swimming forward across a lake doesn't let you cruise along the surface for free; staying up takes actually holding Space, the way real swimming does. Landing in water from a fall never deals fall damage, however far you dropped.
- A few gophers dig slowly through the ground a handful of blocks underground, carving out real 2×2 tunnels as they wander — big enough to crawl through (see Crawling above). They're attackable (2 Meat when killed) and, like birds and fish, purely local to your own view.
- Water flows. Break a block (or dig a tunnel) next to existing water and it spreads into the new gap on its own — down first, then sideways — filling it in a block at a time rather than all at once, the same way a hole dug at the shoreline would flood in real life. It never flows upward, so a hole in the ceiling above a lake stays dry. A dropped bucket of Water spreads the same way from wherever you place it. A single dig or placement can only push a flow so far (about 14 blocks from where it started) so one tunnel can't flood the entire map in one go — dig further and it'll just pick up the flow again from wherever it left off.
- You can double jump: press `Space` again while already in the air (a genuine second tap, not just holding the first press down) for an extra boost, reaching noticeably higher than a single jump alone — best timed near the top of the first jump's arc. It recharges the moment you touch ground again, so it's always available for your next jump, but only once per trip through the air.
- A full day/night cycle takes 1 real hour, with gradual multi-minute sunrise and sunset transitions (sky color, lighting, and sun position all shift smoothly). It's driven straight off the system clock, so it's automatically consistent across a reload with nothing to save. The current in-world clock time (00:00 = midnight, 12:00 = noon) is shown live in the HUD as World Time. Press `N` (or the 🕐 button on touch) to cycle that clock through three modes: Regular (the normal wall-clock cycle, default), Day (frozen at noon), and Night (frozen at midnight) — everything driven by the clock follows along, including the sky, sun/moon, the temperature swing, and firefly visibility, so forcing night is a quick way to go firefly-watching without waiting.
- A visible sun rises due east, climbs straight overhead, and sets due west (real compass directions — +X is east, -X is west) — not just a light getting brighter/dimmer — and terrain, trees, and animals all cast real shadows that swing around to match — the shadow "camera" quietly follows you rather than trying to cover the whole world, so it stays sharp wherever you are. At night a moon takes its place on the opposite side of the sky, also crossing east to west on that same track, waxing and waning through real lunar phases (new → first quarter → full → last quarter → new) on the actual ~29.5-day lunar cycle — anchored so 2026-09-06, 8:00 AM Pacific is exactly a full moon — rather than the game's own sped-up clock, so it changes at the same pace the real moon does.
- A field of stars fades in overhead as it gets dark, including one real, findable constellation: the Big Dipper, sitting due north and well up in the sky, its seven stars connected by faint lines so the ladle shape actually reads as a shape rather than random dots. It's fixed in the sky (no real star-chart rotation, just consistently there every night, same compass direction) — look north and up after dark and it's there to find, which is exactly what the Astronomy badge asks you to do.
- There's also a full 12-month calendar shown live in the HUD next to World Time (e.g. "Feb 22, Y2"), independent from the season/temperature system above. It's anchored so that 2026-09-06, 8:00 AM Pacific is exactly Year 0, January 1 — every real hour after that is one calendar month (a nominal 30-day month, so the day-of-month ticks forward every 2 real minutes), and every 12 months rolls the year over. Since it's purely derived from the system clock like everything else here, it's automatically consistent across a reload with nothing to save.
- Weather rolls a new pattern roughly every 20 minutes and blends into it gradually over about a minute and a half (shown in the top-left HUD), also derived from the system clock. The 20-minute roll picks from: Sunny (50% of the time), Cloudy (15%), Rainy (20%), Rainstorm (10%), or a Heavy Thunderstorm (5%) with lightning flashes and thunder. Worse weather dims the lighting and shortens how far you can see.
- Wind is layered on top, also shown in the HUD (Calm, Light breeze, Breezy, Strong wind, Very strong wind). It drifts randomly and continuously rather than switching with the weather pattern, though storms tend to be windier than a clear sky on average. You'll notice it most in the rain — it visibly blows sideways, harder as the wind picks up — and hear it as a gusting sound that gets stronger and higher-pitched the harder it blows.
- Anywhere without a clear vertical path up to open sky — inside a building with a roof, a tunnel you've dug, under a dense tree canopy — is noticeably darker than the surface, independent of however bright it is outside. Light a torch if you're building somewhere enclosed.
- Fireflies drift and blink softly near you after dark (fading in around dusk, out around dawn, same clock as everything else) — a scattering of small glowing lights over open ground, gone again once the sun's up.
- Block edits and inventory are saved to the browser's `localStorage`, so your progress persists across reloads on the same device/browser.
- Best played on desktop with a mouse — pointer lock and WASD aren't a good fit for touch screens.
- Everything is a single `<script>` tag pulling three.js from a CDN (`jsdelivr`), so there's nothing to install or build.
