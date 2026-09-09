// Blockcraft — a tiny Minecraft-inspired voxel sandbox built on three.js.
// Single finite world, chunked meshes for fast edits, no build step required.
(() => {
'use strict';

// ---------- Config ----------
const WORLD_SIZE = 128;     // x/z extent (4x the original 64x64 area, same generation algorithm)
const WORLD_HEIGHT = 48;    // y extent
const CHUNK_SIZE = 16;
const CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK_SIZE;
const SEA_LEVEL = 18; // flooded 1 block higher again (originally 15)
const BASE_HEIGHT = 20;
const AMPLITUDE = 9;
const SEED = 1337;
const FAR = 400;

const AIR=0, GRASS=1, DIRT=2, STONE=3, SAND=4, WOOD=5, LEAVES=6, PLANKS=7, WATER=8, BEDROCK=9;
const CRAFTING_TABLE=10, BRICKS=11, STICK=12;
const WINDOW=13, WINDOW_OPEN=14, DOOR=15, DOOR_OPEN=16;
const SAPLING=17;
const FLINT=18, FIRE=19, TORCH=20, FIREWORK=21, LADDER=22, MEAT=23;

const BLOCK_COLOR = {
  [GRASS]:  0x5b8a3a,
  [DIRT]:   0x7a5230,
  [STONE]:  0x8a8a8a,
  [SAND]:   0xe0d18f,
  [WOOD]:   0x6b4a2b,
  [LEAVES]: 0x3f7d34,
  [PLANKS]: 0xb8894f,
  [WATER]:  0x3a6fd8,
  [BEDROCK]:0x2b2b2b,
  [CRAFTING_TABLE]: 0xa5652f,
  [BRICKS]: 0x9a4a3a,
  [STICK]:  0xc9a06b,
  [WINDOW]: 0xbfe4f0,
  [WINDOW_OPEN]: 0xdff3fa,
  [DOOR]: 0x8a5a34,
  [DOOR_OPEN]: 0xa8815a,
  [SAPLING]: 0x5b8a3a,
  [FLINT]: 0x5c5f66,
  [FIRE]: 0xff8a2b,
  [TORCH]: 0xd98a3d,
  [FIREWORK]: 0xd94dcf,
  [LADDER]: 0x8a6a3a,
  [MEAT]: 0xc9695a,
};
const BLOCK_NAME = {
  [GRASS]:'Grass', [DIRT]:'Dirt', [STONE]:'Stone', [SAND]:'Sand', [WOOD]:'Wood',
  [LEAVES]:'Leaves', [PLANKS]:'Planks', [WATER]:'Water',
  [CRAFTING_TABLE]:'Crafting Table', [BRICKS]:'Bricks', [STICK]:'Stick',
  [WINDOW]:'Window', [WINDOW_OPEN]:'Window (open)', [DOOR]:'Door', [DOOR_OPEN]:'Door (open)',
  [SAPLING]:'Sapling', [FLINT]:'Flint', [FIRE]:'Fire', [TORCH]:'Torch', [FIREWORK]:'Firework',
  [LADDER]:'Ladder', [MEAT]:'Meat',
};
// Every item the player can ever select. The hotbar only shows HOTBAR_SIZE of these at a time —
// the rest are reachable through the Items panel (the palette button, or the "I" key), which lets
// the player swap any hotbar slot for anything in this list.
const ALL_ITEMS = [GRASS, DIRT, STONE, SAND, WOOD, LEAVES, PLANKS, WATER, CRAFTING_TABLE, BRICKS, STICK, WINDOW, DOOR, FLINT, TORCH, FIREWORK, LADDER, MEAT];
const HOTBAR_SIZE = 9;
const DEFAULT_HOTBAR = [GRASS, DIRT, STONE, SAND, WOOD, PLANKS, CRAFTING_TABLE, DOOR, FLINT];
const HOTBAR = DEFAULT_HOTBAR.slice();
const HOTBAR_KEY = 'blockcraft_hotbar_v1';
function saveHotbar(){ try{ localStorage.setItem(HOTBAR_KEY, JSON.stringify(HOTBAR)); }catch(e){} }
function loadHotbar(){
  try{
    const raw = localStorage.getItem(HOTBAR_KEY);
    if(!raw) return;
    const arr = JSON.parse(raw);
    if(Array.isArray(arr) && arr.length===HOTBAR_SIZE && arr.every(id=>ALL_ITEMS.includes(id)))
      for(let i=0;i<HOTBAR_SIZE;i++) HOTBAR[i]=arr[i];
  }catch(e){}
}
// A few items are structures/tools, not plain materials — give them a distinct glyph on top of
// their swatch so they read at a glance instead of just being "another colored square."
const HOTBAR_ICON = { [CRAFTING_TABLE]: '🛠️', [WINDOW]: '🪟', [DOOR]: '🚪', [FLINT]: '🔥', [TORCH]: '🕯️', [FIREWORK]: '🎆', [LADDER]: '🪜', [MEAT]: '🍗' };
// Blocks with an open/closed state: right-clicking one toggles it to the other id in this map.
const TOGGLE_MAP = { [WINDOW]:WINDOW_OPEN, [WINDOW_OPEN]:WINDOW, [DOOR]:DOOR_OPEN, [DOOR_OPEN]:DOOR };
// Breaking the open form of a toggleable block gives you back its closed (placeable) form.
const COLLECT_AS = { [WINDOW_OPEN]:WINDOW, [DOOR_OPEN]:DOOR };
const COLLECTIBLE = new Set([GRASS, DIRT, STONE, SAND, WOOD, LEAVES, PLANKS, CRAFTING_TABLE, BRICKS, WINDOW, WINDOW_OPEN, DOOR, DOOR_OPEN, TORCH, LADDER]);

// ---------- Health / combat ----------
const HP_PER_HEART = 2;
const PLAYER_MAX_HP = 10 * HP_PER_HEART; // 10 hearts
const PLAYER_ATTACK_DMG = 2;
const ATTACK_RANGE = 4;
const ATTACK_ANGLE_COS = Math.cos(30 * Math.PI/180);
const AGGRO_RADIUS = 6;
const DEAGGRO_RADIUS = 11;
const RETALIATE_MS = 8000;
const FALL_DAMAGE_FREE_BLOCKS = 3; // first 3 blocks of any fall are damage-free, like stepping down normally

// ---------- Hunger ----------
// Mirrors the hearts exactly (10 icons, 2 points each) so it reads as a second, parallel stat rather
// than a differently-scaled bar. Ticks down purely on a real-time clock (no exhaustion-from-activity
// like real Minecraft — simplest version that still makes food a real, recurring need): a full bar
// lasts HUNGER_DECAY_INTERVAL_S * (PLAYER_MAX_HUNGER-1) real seconds, about 19 minutes at the numbers
// below. Passive HP regen (see updatePlayer) stops once hunger hits 0, and staying at 0 starts a slow
// starvation damage tick — same tick/tick-timer shape as the temperature-danger system.
const PLAYER_MAX_HUNGER = 20;
const HUNGER_PER_ICON = 2;
const HUNGER_DECAY_INTERVAL_S = 60; // lose 1 hunger point every real minute
const STARVE_DAMAGE_TICK_S = 4;
const STARVE_DAMAGE = 1;
const MEAT_HUNGER_RESTORE = 4; // 2 icons per piece eaten

// HP is scaled against the 20-HP (10-heart) human baseline to roughly track real-world size/toughness:
// sheep and dogs are small and fragile; cows are human-sized; giraffes are big but not armored;
// lions match a human in raw toughness (they're dangerous because of their attack, not their HP);
// elephants are the toughest land animal, at double human HP.
const ANIMAL_TYPES = ['cow','sheep','dog','giraffe','lion','elephant'];
const ANIMAL_STATS = {
  sheep:    { maxHp: 3*HP_PER_HEART,  dmg:0, retaliate:false, aggressive:false, speed:1.0, chaseSpeed:1.8, reach:0 },
  dog:      { maxHp: 4*HP_PER_HEART,  dmg:1, retaliate:true,  aggressive:false, speed:1.4, chaseSpeed:3.4, reach:0.15 },
  cow:      { maxHp: 5*HP_PER_HEART,  dmg:0, retaliate:false, aggressive:false, speed:0.9, chaseSpeed:1.6, reach:0 },
  giraffe:  { maxHp: 8*HP_PER_HEART,  dmg:3, retaliate:true,  aggressive:false, speed:1.1, chaseSpeed:2.6, reach:0.8 },
  lion:     { maxHp: 10*HP_PER_HEART, dmg:4, retaliate:true,  aggressive:true,  speed:1.2, chaseSpeed:3.8, reach:0.4 },
  elephant: { maxHp: 20*HP_PER_HEART, dmg:6, retaliate:true,  aggressive:true,  speed:0.8, chaseSpeed:2.4, reach:2.0 },
};

// ---------- Real-world scale ----------
// Each animal's model was originally built at an arbitrary "looks right together" size. These are
// the real shoulder/hip heights in meters — world units are ~1 unit = 1 meter throughout (the
// player is 1.8 units tall). ANIMAL_SCALE is derived once below by comparing this target height
// to each model's original bodyY.
const ANIMAL_REAL_HEIGHT = {
  sheep: 0.8, dog: 0.58, cow: 1.4, giraffe: 3.0, lion: 1.2, elephant: 3.3,
};
// How much Meat killing each animal drops, non-decreasing with its real size above (dog/sheep are the
// smallest, elephant the biggest) — not a strict formula, just hand-picked round numbers in the same
// order. Birds/fish scale by size too: large flying/aquatic species (eagle, swan, tuna) drop 2.
const MEAT_YIELD = { dog:1, sheep:1, lion:2, cow:2, giraffe:3, elephant:4,
  robin:1, sparrow:1, blue_jay:1, cardinal:1, crow:2, bluebird:1, finch:1, swallow:1, dove:1, woodpecker:1, owl:2, hawk:2, eagle:2, parrot:1, toucan:1, flamingo:2, hummingbird:1, kingfisher:1, heron:2, pelican:2, seagull:1, magpie:1, raven:2, wren:1, chickadee:1, oriole:1, warbler:1, swan:2, duck:1, goose:2,
  goldfish:1, bass:1, salmon:1, tuna:2, clownfish:1, catfish:1, shark:3, whaleshark:5,
  worm:1, gopher:2, bigeagle:3,
};
// Rough horizontal collision radius per species, used for entity-vs-entity collision below.
const ANIMAL_RADIUS = {
  sheep: 0.35, dog: 0.22, cow: 0.5, giraffe: 0.5, lion: 0.4, elephant: 0.95,
};
// Reproduction mechanics: animals reproduce when two of the same species meet.
// Cooldown is set in real-time ms further below (ANIMAL_REPRODUCE_INTERVAL_MS), once
// DAY_LENGTH_S is defined, since it's expressed as 30 in-game days.
const ANIMAL_REPRODUCE_RANGE = 2.0; // how close animals need to be to reproduce

// ---------- Crafting ----------
const RECIPES = [
  { name:'Planks',         out:{id:PLANKS, qty:4},         in:[{id:WOOD, qty:1}] },
  { name:'Sticks',         out:{id:STICK, qty:4},          in:[{id:PLANKS, qty:2}] },
  { name:'Crafting Table', out:{id:CRAFTING_TABLE, qty:1}, in:[{id:PLANKS, qty:4}] },
  { name:'Bricks',         out:{id:BRICKS, qty:4},         in:[{id:STONE, qty:4}] },
  { name:'Window',         out:{id:WINDOW, qty:1},         in:[{id:SAND, qty:2}] },
  { name:'Door',           out:{id:DOOR, qty:1},            in:[{id:PLANKS, qty:3}] },
  { name:'Flint',          out:{id:FLINT, qty:1},           in:[{id:STONE, qty:2}] },
  { name:'Torch',          out:{id:TORCH, qty:2},           in:[{id:STICK, qty:1}, {id:FLINT, qty:1}] },
  { name:'Ladder',         out:{id:LADDER, qty:4},          in:[{id:WOOD, qty:1}] },
];
const inventory = {};
// Fireworks are unlimited — no recipe, never consumed, always available regardless of what's saved.
function invCount(id){ return id===FIREWORK ? Infinity : (inventory[id]||0); }
function invAdd(id,n){ inventory[id] = (inventory[id]||0)+n; }
function invSub(id,n){ inventory[id] = Math.max(0,(inventory[id]||0)-n); }
function canCraft(recipe){ return recipe.in.every(ing => invCount(ing.id) >= ing.qty); }
function craft(recipe){
  if(!canCraft(recipe)) return false;
  recipe.in.forEach(ing => invSub(ing.id, ing.qty));
  invAdd(recipe.out.id, recipe.out.qty);
  saveInventory();
  updateHotbarUI();
  SFX.craft();
  return true;
}

const craftingTables = new Set();
function tableKey(x,y,z){ return x+','+y+','+z; }
function nearestCraftingTable(maxDist){
  for(const k of craftingTables){
    const [x,y,z] = k.split(',').map(Number);
    const dx = (x+0.5)-player.pos.x, dy = (y+0.5)-(player.pos.y+player.eye), dz = (z+0.5)-player.pos.z;
    if(Math.hypot(dx,dy,dz) <= maxDist) return true;
  }
  return false;
}

// ---------- Texture atlas (procedurally drawn pixel-art, no external image assets) ----------
// TILE=32 (was 16) gives 4x the pixel budget per block face — enough room for real structure
// (cracks, grain, brick-by-brick variation, ripples) rather than flat color + noise.
const TILE = 32, ATLAS_COLS = 4, ATLAS_ROWS = 7;
const T_GRASS_TOP=0, T_GRASS_SIDE=1, T_DIRT=2, T_STONE=3, T_SAND=4, T_LOG_SIDE=5, T_LOG_TOP=6,
      T_LEAVES=7, T_PLANKS=8, T_BEDROCK=9, T_CRAFT_TOP=10, T_CRAFT_SIDE=11, T_BRICKS=12, T_WATER=13,
      T_WINDOW=14, T_WINDOW_OPEN=15, T_DOOR=16, T_DOOR_OPEN=17, T_SAPLING=18, T_FLINT=19, T_FIRE=20,
      T_TORCH=21, T_LADDER=22, T_LEAVES_SPARSE=23, T_LEAVES_DENSE=24;

function hexRGB(hex){ return [(hex>>16)&255, (hex>>8)&255, hex&255]; }
function rgbStr(r,g,b){ return `rgb(${r|0},${g|0},${b|0})`; }
function shadeStr(hex, f, jitter){
  let [r,g,b] = hexRGB(hex);
  const j = jitter ? (Math.random()*2-1)*jitter : 0;
  r = Math.max(0,Math.min(255, r*f+j));
  g = Math.max(0,Math.min(255, g*f+j));
  b = Math.max(0,Math.min(255, b*f+j));
  return rgbStr(r,g,b);
}
function fillTile(ctx,x0,y0,baseHex){
  ctx.fillStyle = rgbStr(...hexRGB(baseHex));
  ctx.fillRect(x0,y0,TILE,TILE);
}
function speckle(ctx,x0,y0,baseHex,count,jitter){
  for(let i=0;i<count;i++){
    const px = x0 + Math.floor(Math.random()*TILE);
    const py = y0 + Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(baseHex, 0.8+Math.random()*0.4, jitter||0);
    ctx.fillRect(px,py,1,1);
  }
}
// A soft, irregular clump of pixels around a point — used wherever flat speckle alone looked too
// uniform (grass tufts, dirt clumps, leaf clusters, rock chunks, flame licks).
function blob(ctx,cx,cy,r,baseHex,jitter){
  const n = Math.max(4, Math.round(r*r*0.9));
  for(let i=0;i<n;i++){
    const ang = Math.random()*Math.PI*2, rad = Math.random()*r;
    const px = Math.round(cx+Math.cos(ang)*rad), py = Math.round(cy+Math.sin(ang)*rad);
    ctx.fillStyle = shadeStr(baseHex, 0.75+Math.random()*0.5, jitter||0);
    ctx.fillRect(px,py,1,1);
  }
}
function drawGrassTop(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x5b8a3a);
  for(let i=0;i<7;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.22, 0x5b8a3a, 20);
  speckle(ctx,x0,y0,0x5b8a3a,Math.round(TILE*TILE*0.3),18);
  for(let i=0;i<TILE*1.6;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0x74b84a, 1, 10);
    ctx.fillRect(px,py,1,1+Math.floor(Math.random()*2));
  }
}
function drawGrassSide(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x7a5230);
  speckle(ctx,x0,y0,0x7a5230,Math.round(TILE*TILE*0.2),14);
  for(let i=0;i<TILE*0.5;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(TILE*0.35)+Math.floor(Math.random()*Math.floor(TILE*0.6));
    ctx.fillStyle = shadeStr(0x4a2f18,1,6);
    ctx.fillRect(px,py,1,1);
  }
  const bandH = TILE*0.3;
  for(let x=0;x<TILE;x++){
    const h = bandH + Math.sin(x*0.9)*2 + Math.random()*3;
    for(let y=0;y<h;y++){
      ctx.fillStyle = shadeStr(0x5b8a3a, 0.8+Math.random()*0.35, 12);
      ctx.fillRect(x0+x, y0+TILE-1-y, 1, 1);
    }
  }
  ctx.fillStyle = shadeStr(0x3f2c18,1,4);
  ctx.fillRect(x0,y0+TILE-1-Math.floor(bandH),TILE,1);
}
function drawDirt(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x7a5230);
  for(let i=0;i<5;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.16, 0x7a5230, 14);
  speckle(ctx,x0,y0,0x7a5230,Math.round(TILE*TILE*0.22),16);
  for(let i=0;i<TILE*0.5;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0xc9b98f,1,6);
    ctx.fillRect(px,py,1,1);
  }
}
function drawStone(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x8a8a8a);
  for(let i=0;i<5;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.2, 0x8a8a8a, 14);
  speckle(ctx,x0,y0,0x8a8a8a,Math.round(TILE*TILE*0.26),20);
  for(let c=0;c<3;c++){
    let px = x0+Math.random()*TILE, py = y0+Math.random()*TILE;
    const steps = 4+Math.floor(Math.random()*4);
    ctx.fillStyle = shadeStr(0x8a8a8a,0.55,6);
    for(let s=0;s<steps;s++){
      ctx.fillRect(Math.round(px),Math.round(py),1,1);
      px += (Math.random()*2-1)*2; py += (Math.random()*2-1)*2;
    }
  }
  for(let i=0;i<TILE*0.4;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0xc4c4c4,1,8);
    ctx.fillRect(px,py,1,1);
  }
}
function drawSand(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xe0d18f);
  speckle(ctx,x0,y0,0xe0d18f,Math.round(TILE*TILE*0.2),14);
  for(let i=0;i<4;i++){
    const y = y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0xe0d18f, 1.08+Math.random()*0.1, 4);
    const len = TILE*0.4+Math.random()*TILE*0.5;
    ctx.fillRect(x0+Math.random()*(TILE-len),y,len,1);
  }
}
function drawLogSide(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x6b4a2b);
  speckle(ctx,x0,y0,0x6b4a2b,Math.round(TILE*TILE*0.12),8);
  let x=0;
  while(x<TILE){
    const w = 2+Math.floor(Math.random()*3);
    const f = 0.65+Math.random()*0.3;
    for(let dx=0;dx<w && x+dx<TILE;dx++){
      for(let y=0;y<TILE;y++){
        if(Math.random()<0.85){
          ctx.fillStyle = shadeStr(0x6b4a2b,f+(Math.random()*0.1-0.05),6);
          ctx.fillRect(x0+x+dx,y0+y,1,1);
        }
      }
    }
    x += w;
  }
  if(Math.random()<0.7) blob(ctx, x0+TILE*0.3+Math.random()*TILE*0.4, y0+TILE*0.3+Math.random()*TILE*0.4, TILE*0.09, 0x3f2c18, 4);
}
function drawLogTop(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xc9a06b);
  const cx=x0+TILE/2, cy=y0+TILE/2;
  const wobble = 0.4+Math.random()*0.3, wobbleSeed = Math.random()*10;
  for(let y=0;y<TILE;y++){
    for(let x=0;x<TILE;x++){
      const dx=x0+x+0.5-cx, dy=y0+y+0.5-cy;
      const d = Math.hypot(dx,dy) + Math.sin(Math.atan2(dy,dx)*5+wobbleSeed)*wobble;
      const ring = Math.floor(d/2.2)%2;
      ctx.fillStyle = shadeStr(0xc9a06b, ring===0 ? 1.0 : 0.8, 6);
      ctx.fillRect(x0+x,y0+y,1,1);
    }
  }
  ctx.fillStyle = shadeStr(0x6b4a2b,1,4);
  ctx.fillRect(x0,y0,TILE,2); ctx.fillRect(x0,y0+TILE-2,TILE,2);
  ctx.fillRect(x0,y0,2,TILE); ctx.fillRect(x0+TILE-2,y0,2,TILE);
}
// No base fill — the tile starts fully transparent, so the gaps between leaf clumps are genuine
// see-through holes (LEAVES is in TRANSPARENT_BLOCKS/the glass bucket) rather than a solid green
// cube with leaf-colored speckle painted on top of it. Shared by the three density tiers below
// (T_LEAVES/T_LEAVES_SPARSE/T_LEAVES_DENSE) — same clump technique, just more or fewer of them.
function drawLeavesDensity(ctx,x0,y0,clumps){
  for(let i=0;i<clumps;i++){
    const cx = x0+Math.random()*TILE, cy = y0+Math.random()*TILE;
    const r = TILE*(0.12+Math.random()*0.12);
    const n = Math.max(6, Math.round(r*r*1.1));
    for(let j=0;j<n;j++){
      const ang = Math.random()*Math.PI*2, rad = Math.random()*r;
      const px = Math.round(cx+Math.cos(ang)*rad), py = Math.round(cy+Math.sin(ang)*rad);
      if(px<x0||px>=x0+TILE||py<y0||py>=y0+TILE) continue;
      const dark = Math.random()<0.25;
      ctx.fillStyle = shadeStr(dark?0x24401f:0x3f7d34, 0.85+Math.random()*0.4, 20);
      ctx.fillRect(px,py,1,1);
    }
  }
}
function drawLeavesSparse(ctx,x0,y0){ drawLeavesDensity(ctx,x0,y0,34); } // ~58% coverage — willow, birch
function drawLeaves(ctx,x0,y0){ drawLeavesDensity(ctx,x0,y0,72); }       // ~80% (half the old gap) — oak, maple, apple
function drawLeavesDense(ctx,x0,y0){ drawLeavesDensity(ctx,x0,y0,90); }  // ~91% — pine, redwood
function drawPlanks(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xb8894f);
  const boardH = TILE/4;
  for(let y=0;y<TILE;y+=boardH){
    const boardTone = 0.9+Math.random()*0.2;
    for(let dy=0;dy<boardH;dy++){
      for(let x=0;x<TILE;x++){
        ctx.fillStyle = shadeStr(0xb8894f, boardTone+(Math.random()*0.08-0.04), 6);
        ctx.fillRect(x0+x,y0+y+dy,1,1);
      }
    }
    for(let i=0;i<4;i++){
      const gy = y0+y+1+Math.floor(Math.random()*(boardH-2));
      ctx.fillStyle = shadeStr(0xb8894f,0.75,4);
      ctx.fillRect(x0+Math.floor(Math.random()*(TILE-6)),gy,4+Math.floor(Math.random()*4),1);
    }
    ctx.fillStyle = shadeStr(0xb8894f,0.6,4);
    ctx.fillRect(x0,y0+y,TILE,1);
    ctx.fillStyle = shadeStr(0xb8894f,0.7,4);
    ctx.fillRect(x0+Math.floor(Math.random()*TILE),y0+y,1,boardH);
  }
}
function drawBedrock(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x2b2b2b);
  for(let i=0;i<6;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.22, 0x2b2b2b, 10);
  for(let i=0;i<TILE*TILE*0.16;i++){
    const x=x0+Math.floor(Math.random()*TILE), y=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0x2b2b2b,0.5+Math.random()*0.9,10);
    const s = 1+Math.floor(Math.random()*2);
    ctx.fillRect(x,y,s,s);
  }
}
function drawCraftTop(ctx,x0,y0){
  drawPlanks(ctx,x0,y0);
  ctx.fillStyle = shadeStr(0x3a2a1a,1,4);
  ctx.fillRect(x0+2,y0+2,TILE-4,2);
  ctx.fillRect(x0+2,y0+TILE-4,TILE-4,2);
  ctx.fillRect(x0+2,y0+2,2,TILE-4);
  ctx.fillRect(x0+TILE-4,y0+2,2,TILE-4);
  ctx.fillRect(x0+TILE/2-1,y0+5,2,TILE-10);
  ctx.fillRect(x0+5,y0+TILE/2-1,TILE-10,2);
  ctx.fillStyle = shadeStr(0x1c1410,1,2);
  [[3,3],[TILE-5,3],[3,TILE-5],[TILE-5,TILE-5]].forEach(([dx,dy])=> ctx.fillRect(x0+dx,y0+dy,2,2));
}
function drawCraftSide(ctx,x0,y0){
  drawPlanks(ctx,x0,y0);
  ctx.fillStyle = shadeStr(0x3a2a1a,1,4);
  ctx.fillRect(x0+4,y0+TILE*0.35,TILE-8,TILE*0.28);
  ctx.fillStyle = shadeStr(0xc9a06b,1,4);
  ctx.fillRect(x0+7,y0+TILE*0.42,4,4);
  ctx.fillRect(x0+TILE-11,y0+TILE*0.42,4,4);
  ctx.fillStyle = shadeStr(0x1c1410,1,2);
  ctx.fillRect(x0+3,y0+3,2,2);
  ctx.fillRect(x0+TILE-5,y0+3,2,2);
}
function drawBricks(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x9a4a3a);
  const mortar = shadeStr(0x5a3a30,1,0);
  const brickH = TILE/4, brickW = TILE/2;
  let row=0;
  for(let y=0;y<TILE;y+=brickH){
    const offset = (row%2===0)?0:brickW/2;
    for(let bx=-brickW; bx<TILE+brickW; bx+=brickW){
      const tone = 0.85+Math.random()*0.3;
      for(let dy=1;dy<brickH-1;dy++){
        for(let dx=1;dx<brickW-1;dx++){
          const px = x0+bx+offset+dx, py = y0+y+dy;
          if(px<x0||px>=x0+TILE) continue;
          ctx.fillStyle = shadeStr(0x9a4a3a, tone+(Math.random()*0.06-0.03), 6);
          ctx.fillRect(px,py,1,1);
        }
      }
    }
    ctx.fillStyle = mortar;
    ctx.fillRect(x0,y0+y,TILE,1);
    for(let bx=offset; bx<TILE; bx+=brickW) ctx.fillRect(x0+bx,y0+y,1,brickH);
    row++;
  }
}
function drawWater(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x3a6fd8);
  speckle(ctx,x0,y0,0x3a6fd8,Math.round(TILE*TILE*0.15),16);
  for(let i=0;i<5;i++){
    const y0r = Math.random()*TILE, amp = 1.5;
    ctx.fillStyle = shadeStr(0x3a6fd8,1.25,6);
    for(let x=0;x<TILE;x++){
      const yy = Math.round(y0r+Math.sin(x*0.5+i)*amp+TILE)%TILE;
      ctx.fillRect(x0+x,y0+yy,1,1);
    }
  }
}
function drawWindowFrame(ctx,x0,y0,glassHex){
  fillTile(ctx,x0,y0,glassHex);
  speckle(ctx,x0,y0,glassHex,Math.round(TILE*TILE*0.06),8);
  ctx.fillStyle = shadeStr(glassHex,1.3,4);
  for(let i=0;i<TILE*1.3;i++){
    const x = i, y = Math.round(i-TILE*0.3);
    if(y>=0 && y<TILE && x<TILE) ctx.fillRect(x0+x,y0+y,1,1);
  }
  const frame = shadeStr(0x6b4a2b,1,4);
  const fw = Math.max(2,Math.round(TILE/8));
  ctx.fillStyle = frame;
  ctx.fillRect(x0,y0,TILE,fw); ctx.fillRect(x0,y0+TILE-fw,TILE,fw);
  ctx.fillRect(x0,y0,fw,TILE); ctx.fillRect(x0+TILE-fw,y0,fw,TILE);
  ctx.fillRect(x0+TILE/2-fw/2,y0,fw,TILE); ctx.fillRect(x0,y0+TILE/2-fw/2,TILE,fw);
}
function drawWindow(ctx,x0,y0){ drawWindowFrame(ctx,x0,y0,0xbfe4f0); }
function drawWindowOpen(ctx,x0,y0){ drawWindowFrame(ctx,x0,y0,0xe8f6fb); }
function drawDoor(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x8a5a34);
  speckle(ctx,x0,y0,0x8a5a34,Math.round(TILE*TILE*0.12),8);
  for(let i=0;i<6;i++){
    const gy = y0+2+Math.random()*(TILE-4);
    ctx.fillStyle = shadeStr(0x8a5a34,0.8,4);
    ctx.fillRect(x0+2+Math.random()*(TILE-8),gy,4+Math.random()*4,1);
  }
  const dark = shadeStr(0x5a3a20,1,4);
  ctx.fillStyle = dark;
  ctx.fillRect(x0+TILE/2-1,y0+2,2,TILE-4);
  ctx.fillRect(x0+2,y0+2,TILE-4,2);
  ctx.fillRect(x0+2,y0+TILE-4,TILE-4,2);
  ctx.fillRect(x0+5,y0+6,TILE/2-8,TILE*0.3);
  ctx.fillRect(x0+TILE/2+3,y0+6,TILE/2-8,TILE*0.3);
  ctx.fillRect(x0+5,y0+TILE*0.5,TILE/2-8,TILE*0.3);
  ctx.fillRect(x0+TILE/2+3,y0+TILE*0.5,TILE/2-8,TILE*0.3);
  ctx.fillStyle = shadeStr(0xd9c060,1,4);
  ctx.fillRect(x0+TILE/2+5,y0+TILE/2,3,3);
}
function drawDoorOpen(ctx,x0,y0){
  // faded/ghosted look signals "passable", matching how it renders semi-transparent in-world
  fillTile(ctx,x0,y0,0x8a5a34);
  speckle(ctx,x0,y0,0x8a5a34,Math.round(TILE*TILE*0.06),6);
  const dark = shadeStr(0x5a3a20,1,4);
  ctx.fillStyle = dark;
  ctx.fillRect(x0+2,y0+2,TILE-4,2);
  ctx.fillRect(x0+2,y0+TILE-4,TILE-4,2);
}
function drawSapling(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x5b8a3a);
  ctx.fillStyle = shadeStr(0x3a5c22,1,4);
  ctx.fillRect(x0+TILE/2-1,y0+TILE*0.28,3,TILE*0.5);
  for(let i=0;i<4;i++) blob(ctx, x0+TILE*0.35+Math.random()*TILE*0.3, y0+TILE*0.2+Math.random()*TILE*0.3, TILE*0.14, 0x74b84a, 10);
  ctx.fillStyle = shadeStr(0x74b84a,1,10);
  for(let i=0;i<TILE*2.5;i++){
    const px = x0+TILE*0.15+Math.floor(Math.random()*TILE*0.7);
    const py = y0+TILE*0.15+Math.floor(Math.random()*TILE*0.6);
    ctx.fillRect(px,py,1,1);
  }
}
function drawFlint(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x3a3d42);
  speckle(ctx,x0,y0,0x3a3d42,Math.round(TILE*TILE*0.18),14);
  const facet = shadeStr(0x8a90a0,1,10);
  ctx.fillStyle = facet;
  ctx.fillRect(x0+TILE*0.2,y0+TILE*0.18,TILE*0.3,3);
  ctx.fillRect(x0+TILE*0.5,y0+TILE*0.42,TILE*0.25,3);
  ctx.fillRect(x0+TILE*0.25,y0+TILE*0.68,TILE*0.35,3);
  ctx.fillStyle = shadeStr(0x1c1e22,1,6);
  ctx.fillRect(x0+TILE*0.55,y0+TILE*0.18,TILE*0.2,3);
  ctx.fillRect(x0+TILE*0.12,y0+TILE*0.48,TILE*0.2,3);
}
function drawFire(ctx,x0,y0){
  // drawn on a near-black base — combined with the glass bucket's transparency this reads as
  // flickering flame rather than a solid tile
  fillTile(ctx,x0,y0,0x120600);
  for(let i=0;i<3;i++) blob(ctx, x0+TILE*0.3+Math.random()*TILE*0.4, y0+TILE*0.55+Math.random()*TILE*0.3, TILE*0.24, 0xc62b0e, 20);
  for(let i=0;i<3;i++) blob(ctx, x0+TILE*0.32+Math.random()*TILE*0.36, y0+TILE*0.35+Math.random()*TILE*0.25, TILE*0.18, 0xff7a1a, 24);
  for(let i=0;i<2;i++) blob(ctx, x0+TILE*0.4+Math.random()*TILE*0.2, y0+TILE*0.18+Math.random()*TILE*0.18, TILE*0.12, 0xffce4d, 20);
  for(let i=0;i<TILE*0.6;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE*0.5);
    ctx.fillStyle = shadeStr(0xffb066,1,10);
    ctx.fillRect(px,py,1,1);
  }
}
function drawTorch(ctx,x0,y0){
  // near-black base + the glass bucket's transparency reads as a thin stick rather than a solid cube
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x6b4a2b,1,6);
  ctx.fillRect(x0+TILE/2-1,y0+TILE*0.48,3,TILE*0.45);
  for(let i=0;i<3;i++){
    ctx.fillStyle = shadeStr(0x4a3018,1,4);
    ctx.fillRect(x0+TILE/2-1,y0+TILE*0.5+i*TILE*0.12,3,1);
  }
  for(let i=0;i<2;i++) blob(ctx, x0+TILE*0.4+Math.random()*TILE*0.2, y0+TILE*0.28+Math.random()*TILE*0.15, TILE*0.13, 0xc62b0e, 14);
  for(let i=0;i<2;i++) blob(ctx, x0+TILE*0.42+Math.random()*TILE*0.16, y0+TILE*0.16+Math.random()*TILE*0.12, TILE*0.09, 0xff9a2e, 16);
  ctx.fillStyle = '#ffd75e';
  ctx.fillRect(x0+TILE/2-1,y0+TILE*0.04,2,TILE*0.1);
}
function drawLadder(ctx,x0,y0){
  // near-black base + the glass bucket's transparency (same trick as fire/torch) reads as an open
  // wooden ladder you can see through the gaps of, rather than a solid cube.
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x8a6a3a,1,10);
  ctx.fillRect(x0+TILE*0.12, y0, TILE*0.14, TILE);
  ctx.fillRect(x0+TILE*0.74, y0, TILE*0.14, TILE);
  const rungs = 4;
  for(let i=0;i<rungs;i++){
    const ry = y0 + TILE*0.1 + i*(TILE*0.8/(rungs-1)) - TILE*0.045;
    ctx.fillStyle = shadeStr(0x9a7a48,1,10);
    ctx.fillRect(x0+TILE*0.12, ry, TILE*0.76, TILE*0.09);
  }
}
function buildAtlas(){
  const canvas = document.createElement('canvas');
  canvas.width = TILE*ATLAS_COLS;
  canvas.height = TILE*ATLAS_ROWS;
  const ctx = canvas.getContext('2d');
  const draw = [drawGrassTop, drawGrassSide, drawDirt, drawStone, drawSand, drawLogSide, drawLogTop,
                drawLeaves, drawPlanks, drawBedrock, drawCraftTop, drawCraftSide, drawBricks, drawWater,
                drawWindow, drawWindowOpen, drawDoor, drawDoorOpen, drawSapling, drawFlint, drawFire, drawTorch,
                drawLadder, drawLeavesSparse, drawLeavesDense];
  draw.forEach((fn, i)=> fn(ctx, (i%ATLAS_COLS)*TILE, Math.floor(i/ATLAS_COLS)*TILE));
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
function tileUV(i){
  const col = i % ATLAS_COLS, row = Math.floor(i/ATLAS_COLS);
  return {
    u0: col/ATLAS_COLS, u1: (col+1)/ATLAS_COLS,
    vBottom: 1-(row+1)/ATLAS_ROWS, vTop: 1-row/ATLAS_ROWS,
  };
}
const BLOCK_TILES = {
  [GRASS]:  {top:T_GRASS_TOP, side:T_GRASS_SIDE, bottom:T_DIRT},
  [DIRT]:   {top:T_DIRT, side:T_DIRT, bottom:T_DIRT},
  [STONE]:  {top:T_STONE, side:T_STONE, bottom:T_STONE},
  [SAND]:   {top:T_SAND, side:T_SAND, bottom:T_SAND},
  [WOOD]:   {top:T_LOG_TOP, side:T_LOG_SIDE, bottom:T_LOG_TOP},
  [LEAVES]: {top:T_LEAVES, side:T_LEAVES, bottom:T_LEAVES},
  [PLANKS]: {top:T_PLANKS, side:T_PLANKS, bottom:T_PLANKS},
  [WATER]:  {top:T_WATER, side:T_WATER, bottom:T_WATER},
  [BEDROCK]:{top:T_BEDROCK, side:T_BEDROCK, bottom:T_BEDROCK},
  [CRAFTING_TABLE]: {top:T_CRAFT_TOP, side:T_CRAFT_SIDE, bottom:T_PLANKS},
  [BRICKS]: {top:T_BRICKS, side:T_BRICKS, bottom:T_BRICKS},
  [WINDOW]: {top:T_WINDOW, side:T_WINDOW, bottom:T_WINDOW},
  [WINDOW_OPEN]: {top:T_WINDOW_OPEN, side:T_WINDOW_OPEN, bottom:T_WINDOW_OPEN},
  [DOOR]: {top:T_DOOR, side:T_DOOR, bottom:T_DOOR},
  [DOOR_OPEN]: {top:T_DOOR_OPEN, side:T_DOOR_OPEN, bottom:T_DOOR_OPEN},
  [SAPLING]: {top:T_SAPLING, side:T_SAPLING, bottom:T_SAPLING},
  [FLINT]: {top:T_FLINT, side:T_FLINT, bottom:T_FLINT},
  [FIRE]: {top:T_FIRE, side:T_FIRE, bottom:T_FIRE},
  [TORCH]: {top:T_TORCH, side:T_TORCH, bottom:T_TORCH},
  [LADDER]: {top:T_LADDER, side:T_LADDER, bottom:T_LADDER},
};
// per-face-direction UV winding (0/1 flags select u0/u1 and vBottom/vTop), aligned to FACES order below
const UV_PATTERNS = [
  [[0,0],[0,1],[1,1],[1,0]], // +x
  [[1,0],[1,1],[0,1],[0,0]], // -x
  [[0,0],[0,1],[1,1],[1,0]], // +y
  [[0,1],[0,0],[1,0],[1,1]], // -y
  [[1,0],[1,1],[0,1],[0,0]], // +z
  [[0,0],[0,1],[1,1],[1,0]], // -z
];

// ---------- Seeded noise (classic Perlin, seeded permutation) ----------
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const perm = new Uint8Array(512);
(function initPerm(){
  const rand = mulberry32(SEED);
  const p = new Uint8Array(256);
  for(let i=0;i<256;i++) p[i]=i;
  for(let i=255;i>0;i--){
    const j = Math.floor(rand()*(i+1));
    const t=p[i]; p[i]=p[j]; p[j]=t;
  }
  for(let i=0;i<512;i++) perm[i]=p[i&255];
})();
function fade(t){ return t*t*t*(t*(t*6-15)+10); }
function lerp(a,b,t){ return a+t*(b-a); }
function grad(hash,x,y){
  const h = hash & 7;
  const u = h<4 ? x : y;
  const v = h<4 ? y : x;
  return ((h&1)?-u:u) + ((h&2)?-2*v:2*v);
}
function perlin2(x,y){
  const X = Math.floor(x)&255, Y = Math.floor(y)&255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x), v = fade(y);
  const aa=perm[perm[X]+Y], ab=perm[perm[X]+Y+1], ba=perm[perm[X+1]+Y], bb=perm[perm[X+1]+Y+1];
  return lerp(
    lerp(grad(aa,x,y),   grad(ba,x-1,y),   u),
    lerp(grad(ab,x,y-1), grad(bb,x-1,y-1), u),
    v
  );
}
function fbm(x,y,octaves){
  let e=0, amp=1, freq=1, max=0;
  for(let o=0;o<octaves;o++){
    e += perlin2(x*freq, y*freq)*amp;
    max += amp;
    amp*=0.5; freq*=2;
  }
  return e/max;
}
function hash2(x,z){
  const s = Math.sin(x*127.1 + z*311.7 + SEED*0.0001) * 43758.5453123;
  return s - Math.floor(s);
}
function heightAt(x,z){
  const e = fbm(x*0.02, z*0.02, 4);
  return Math.max(2, Math.min(WORLD_HEIGHT-6, Math.floor(BASE_HEIGHT + e*AMPLITUDE)));
}

// ---------- World storage ----------
const world = new Uint8Array(WORLD_SIZE*WORLD_SIZE*WORLD_HEIGHT);
function inBounds(x,y,z){ return x>=0 && x<WORLD_SIZE && z>=0 && z<WORLD_SIZE && y>=0 && y<WORLD_HEIGHT; }
function idx(x,y,z){ return (x*WORLD_SIZE+z)*WORLD_HEIGHT + y; }
function getBlock(x,y,z){ return inBounds(x,y,z) ? world[idx(x,y,z)] : AIR; }
function setBlock(x,y,z,v){ if(inBounds(x,y,z)) world[idx(x,y,z)] = v; }

function generateWorld(){
  for(let x=0;x<WORLD_SIZE;x++){
    for(let z=0;z<WORLD_SIZE;z++){
      const h = heightAt(x,z);
      const beach = h<=SEA_LEVEL+1;
      for(let y=0;y<=h;y++){
        let b;
        if(y===0) b=BEDROCK;
        else if(y===h) b = beach ? SAND : GRASS;
        else if(y>h-4) b = beach ? SAND : DIRT;
        else b = STONE;
        setBlock(x,y,z,b);
      }
      if(h < SEA_LEVEL){
        for(let y=h+1;y<=SEA_LEVEL;y++) setBlock(x,y,z,WATER);
      }
    }
  }
  for(let x=2;x<WORLD_SIZE-2;x++){
    for(let z=2;z<WORLD_SIZE-2;z++){
      const h = heightAt(x,z);
      if(h>SEA_LEVEL && getBlock(x,h,z)===GRASS && hash2(x,z) < 0.012){
        if(hash2(x+3,z+5) < BUSH_CHANCE) plantBush(x,h+1,z); else plantTree(x,h+1,z);
      }
    }
  }
}
// writeFn(bx,by,bz,block,unconditional) decides how each cell actually gets written — plantTree/
// plantBush use a raw setBlock (fast, unsynced — fine for deterministic world-gen), the *Synced
// variants route through applyWorldEdit so a sapling maturing at runtime is persisted/synced/
// rendered like any other edit.
const TALL_TREE_CHANCE = 0.05; // fraction of trees that grow to 5x their normal height
const TREE_BRANCH_SPACING = 4; // vertical blocks between each branch on a tall tree's trunk
function plantTreeCells(x,y,z,writeFn){
  const baseHeight = 4 + Math.floor(hash2(x+1,z+1)*3);
  const isTall = hash2(x+13,z+29) < TALL_TREE_CHANCE;
  const height = isTall ? baseHeight*5 : baseHeight;
  for(let i=0;i<height;i++) writeFn(x,y+i,z,WOOD,true);

  // Tall trees (5x normal height) grow branches along the trunk: short wood limbs jutting outward
  // at regular intervals, each with its own small leaf clump — otherwise a trunk that tall reads as
  // an unnaturally bare pole with a single canopy way up top. Deterministic per (x,branch-height), same
  // hash-based approach as the rest of world-gen, so this reconstructs identically every time
  // plantTreeCells is called for this tree (regrowth and the chop/collapse check both rely on that).
  if(isTall){
    for(let by=4; by<height-3; by+=TREE_BRANCH_SPACING){
      const dirSeed = hash2(x+by*7.7+0.5, z+by*3.3+0.5);
      const angle = dirSeed*Math.PI*2;
      const dirX = Math.round(Math.cos(angle)), dirZ = Math.round(Math.sin(angle));
      if(dirX===0 && dirZ===0) continue; // straight up/down isn't a valid branch direction, skip this slot
      const len = 2 + Math.floor(hash2(x+by*1.1, z+by*9.9)*2); // 2-3 blocks long
      let bx=x, bz=z, bY=y+by;
      for(let i=1;i<=len;i++){ bx+=dirX; bz+=dirZ; bY += (i>=len-1?1:0); writeFn(bx,bY,bz,WOOD,true); }
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){
        if(Math.abs(dx)+Math.abs(dz)+Math.abs(dy)>2) continue; // rounder clump than a full cube
        writeFn(bx+dx, bY+dy, bz+dz, LEAVES, false);
      }
    }
  }

  const top = y+height;
  for(let dy=-2;dy<=1;dy++){
    const r = dy>=0 ? 1 : 2;
    for(let dx=-r;dx<=r;dx++){
      for(let dz=-r;dz<=r;dz++){
        if(Math.abs(dx)===r && Math.abs(dz)===r && r===2) continue;
        if(dx===0 && dz===0 && dy<=0) continue;
        writeFn(x+dx, top+dy, z+dz, LEAVES, false);
      }
    }
  }
}
function plantTree(x,y,z){
  plantTreeCells(x,y,z,(bx,by,bz,b,unconditional)=>{
    if(unconditional || getBlock(bx,by,bz)===AIR) setBlock(bx,by,bz,b);
  });
}
function plantTreeSynced(x,y,z){
  plantTreeCells(x,y,z,(bx,by,bz,b,unconditional)=>{
    if(unconditional || getBlock(bx,by,bz)===AIR) applyWorldEdit(bx,by,bz,b,false);
  });
}
// A squat, trunk-less leaf clump (1-2 blocks tall, vs. a tree's 4-6) so the world isn't wall-to-wall
// tall trees — the same low shrub you'd expect scattered between them.
const BUSH_CHANCE = 0.4; // fraction of natural-growth spots that become a bush instead of a tree
function plantBushCells(x,y,z,writeFn){
  writeFn(x,y,z,LEAVES,true);
  for(let dx=-1;dx<=1;dx++){
    for(let dz=-1;dz<=1;dz++){
      if(dx===0 && dz===0) continue;
      if(Math.abs(dx)===1 && Math.abs(dz)===1 && hash2(x+dx*3+13,z+dz*5+17) < 0.4) continue;
      writeFn(x+dx, y, z+dz, LEAVES, false);
    }
  }
  if(hash2(x+7,z+11) < 0.5) writeFn(x, y+1, z, LEAVES, false);
}
function plantBush(x,y,z){
  plantBushCells(x,y,z,(bx,by,bz,b,unconditional)=>{
    if(unconditional || getBlock(bx,by,bz)===AIR) setBlock(bx,by,bz,b);
  });
}
function plantBushSynced(x,y,z){
  plantBushCells(x,y,z,(bx,by,bz,b,unconditional)=>{
    if(unconditional || getBlock(bx,by,bz)===AIR) applyWorldEdit(bx,by,bz,b,false);
  });
}

// ---------- Save / load edits ----------
const SAVE_KEY = 'blockcraft_edits_v1';
const INV_KEY = 'blockcraft_inventory_v1';
const edits = new Map();
let saveTimer = null;
function saveEdits(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    const obj = {};
    edits.forEach((v,k)=> obj[k]=v);
    try{ localStorage.setItem(SAVE_KEY, JSON.stringify(obj)); }catch(e){}
  }, 300);
  document.getElementById('blockCount').textContent = edits.size;
}
function loadEdits(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return;
    const obj = JSON.parse(raw);
    for(const k in obj){
      const [x,y,z] = k.split(',').map(Number);
      setBlock(x,y,z,obj[k]);
      edits.set(k, obj[k]);
      if(obj[k]===CRAFTING_TABLE) craftingTables.add(k);
      else craftingTables.delete(k);
    }
    document.getElementById('blockCount').textContent = edits.size;
  }catch(e){}
}
let invSaveTimer = null;
function saveInventory(){
  clearTimeout(invSaveTimer);
  invSaveTimer = setTimeout(()=>{
    try{ localStorage.setItem(INV_KEY, JSON.stringify(inventory)); }catch(e){}
  }, 300);
}
function loadInventory(){
  try{
    const raw = localStorage.getItem(INV_KEY);
    if(!raw){ inventory[CRAFTING_TABLE] = 1; return; }
    const obj = JSON.parse(raw);
    for(const k in obj) inventory[k] = obj[k];
  }catch(e){ inventory[CRAFTING_TABLE] = 1; }
}

// ---------- Chunked mesh building ----------
let scene, camera, renderer, hemiLight, sunLight, heldTorchLight;
const chunkMeshes = new Map();
function chunkKey(cx,cz){ return cx+','+cz; }

const FACES = [
  { n:[1,0,0],  c:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { n:[-1,0,0], c:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  { n:[0,1,0],  c:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
  { n:[0,-1,0], c:[[0,0,1],[0,0,0],[1,0,0],[1,0,1]] },
  { n:[0,0,1],  c:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
  { n:[0,0,-1], c:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
];

const atlasTexture = buildAtlas();
const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: atlasTexture });
const waterMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: atlasTexture, transparent:true, opacity:0.75 });
// Shared by every other see-through block (windows, an open door) -- a neutral, un-tinted glass
// material so their own texture supplies the color, unlike water's blue-tinted one.
const glassMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: atlasTexture, transparent:true, opacity:0.65 });
// Any block that isn't fully opaque. A face between two blocks of the SAME transparent type is
// skipped (no point rendering the seam between two adjacent water, window, or leaf blocks); a face
// against a *different* transparent type, or against AIR, still draws.
const TRANSPARENT_BLOCKS = new Set([WATER, WINDOW, WINDOW_OPEN, DOOR_OPEN, SAPLING, FIRE, TORCH, LADDER, LEAVES]);
// The subset of the above that a "is this column covered by a roof" check treats as passing sky/
// light straight through. Leaves are deliberately left out — a tree's canopy still counts as real
// shelter/shade (indoor darkening, temperature danger) even though it now renders sparse and
// translucent rather than as a solid cube.
const SKY_PASS_BLOCKS = new Set([WATER, WINDOW, WINDOW_OPEN, DOOR_OPEN, SAPLING, FIRE, TORCH, LADDER]);
function bucketFor(b){ return b===WATER ? 'water' : (TRANSPARENT_BLOCKS.has(b) ? 'glass' : 'solid'); }

// Blocks with a clear vertical path up to the sky get full outdoor light; anything with a solid
// roof over it (a cave ceiling, a building's roof, a closed door/window blocking a doorway) is
// darkened instead — otherwise every interior was exactly as bright as the surface, since the
// hemisphere/sun lights have no concept of occlusion. Computed once per column per chunk rebuild
// (top-down, O(WORLD_HEIGHT)) rather than per face, so it stays cheap.
const INDOOR_DARK_FACTOR = 0.28;
function computeSkyExposure(x,z){
  const exposed = new Uint8Array(WORLD_HEIGHT);
  let blocked = false;
  for(let y=WORLD_HEIGHT-1; y>=0; y--){
    exposed[y] = blocked ? 0 : 1;
    const b = getBlock(x,y,z);
    if(b!==AIR && !SKY_PASS_BLOCKS.has(b)) blocked = true;
  }
  return exposed;
}
// ---------- Tree species colors ----------
// Trees still all use the same generic WOOD/LEAVES block IDs — chopping any of them always gives
// plain Wood/Leaves items, no new resource types — but each tree's trunk+canopy is tinted per a
// species picked deterministically from its trunk's own (x,z), the same "no extra state to save"
// trick day/night/weather/seasons already use. mul values are RGB multipliers applied on top of the
// existing per-face lighting shade, not new textures. index 0 (untinted, [1,1,1]) is oak. leafTile
// picks which of the three leaf-density atlas tiles (T_LEAVES/_SPARSE/_DENSE) that species uses —
// evergreens read fuller, a willow's canopy reads wispier, same trick as the color tint.
const TREE_SPECIES = [
  { id:'oak',     leafMul:[1,1,1],           woodMul:[1,1,1],                                  leafTile:T_LEAVES },
  { id:'pine',    leafMul:[0.55,0.85,0.60],  woodMul:[0.85,0.72,0.68],                          leafTile:T_LEAVES_DENSE },
  { id:'birch',   leafMul:[1.10,1.25,0.55],  woodMul:[1.65,1.60,1.40],                          leafTile:T_LEAVES_SPARSE },
  { id:'willow',  leafMul:[0.85,1.15,0.75],  woodMul:[1.05,0.95,0.80],                          leafTile:T_LEAVES_SPARSE },
  { id:'maple',   leafMul:[1.55,0.55,0.35],  woodMul:[0.95,0.88,0.82],                          leafTile:T_LEAVES },
  { id:'redwood', leafMul:[0.55,0.82,0.58],  woodMul:[1.15,0.50,0.42],                          leafTile:T_LEAVES_DENSE },
  { id:'apple',   leafMul:[0.95,1.12,0.62],  woodMul:[1,1,1], fruitMul:[1.6,0.25,0.22],          leafTile:T_LEAVES },
];
function speciesIndexForRoot(x,z){ return Math.floor(hash2(x+41,z+67)*TREE_SPECIES.length) % TREE_SPECIES.length; }
// Bounded look for canopy near a wood run's top — gates tinting to things that actually look like a
// tree (a trunk with leaves overhead) so ordinary player-built wood walls/floors stay untinted.
function hasCanopyNear(x,y,z){
  for(let dy=-1;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){
    if(getBlock(x+dx,y+dy,z+dz)===LEAVES) return true;
  }
  return false;
}
// One pass per column (same cost class as computeSkyExposure, called right alongside it): walks
// every contiguous WOOD run top-to-bottom and, if that run has canopy near its top, tags the whole
// run with a species index (1-based; 0 = not tree wood) — so a tall/giant trunk is tinted
// consistently end to end, not just near the top.
function computeColumnTreeSpecies(x,z){
  const species = new Uint8Array(WORLD_HEIGHT);
  let runStart = -1;
  for(let y=0;y<=WORLD_HEIGHT;y++){
    const b = y<WORLD_HEIGHT ? getBlock(x,y,z) : AIR;
    if(b===WOOD){
      if(runStart<0) runStart = y;
    } else if(runStart>=0){
      if(hasCanopyNear(x,y-1,z)){
        const sIdx = speciesIndexForRoot(x,z)+1;
        for(let ry=runStart; ry<y; ry++) species[ry] = sIdx;
      }
      runStart = -1;
    }
  }
  return species;
}
// For a LEAVES cell, find the (x,z) of whichever nearby WOOD column its canopy most likely belongs
// to — checked ring-by-ring (closest first) within the same small spread plantTreeCells ever uses.
function findTrunkColumnNear(x,y,z){
  for(let r=0;r<=2;r++){
    for(let dx=-r;dx<=r;dx++){
      for(let dz=-r;dz<=r;dz++){
        if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
        for(let dy=-3;dy<=2;dy++){
          if(getBlock(x+dx,y+dy,z+dz)===WOOD) return {x:x+dx, z:z+dz};
        }
      }
    }
  }
  return null;
}
function treeTintAt(b,x,y,z,columnSpecies){
  if(b===WOOD){
    const sIdx = columnSpecies[y];
    return sIdx>0 ? { mul: TREE_SPECIES[sIdx-1].woodMul, leafTile:null } : null;
  }
  const trunk = findTrunkColumnNear(x,y,z);
  if(!trunk) return null;
  const species = TREE_SPECIES[speciesIndexForRoot(trunk.x,trunk.z)];
  const mul = (species.fruitMul && hash2(x*7+y*13+3, z*11+y*17+5) < 0.12) ? species.fruitMul : species.leafMul;
  return { mul, leafTile: species.leafTile };
}
function buildChunkGeometries(cx,cz){
  const buckets = {
    solid: {positions:[],normals:[],colors:[],uvs:[],indices:[]},
    water: {positions:[],normals:[],colors:[],uvs:[],indices:[]},
    glass: {positions:[],normals:[],colors:[],uvs:[],indices:[]},
  };
  const x0=cx*CHUNK_SIZE, z0=cz*CHUNK_SIZE;
  for(let x=x0;x<x0+CHUNK_SIZE;x++){
    for(let z=z0;z<z0+CHUNK_SIZE;z++){
      const skyExposed = computeSkyExposure(x,z);
      const columnSpecies = computeColumnTreeSpecies(x,z);
      for(let y=0;y<WORLD_HEIGHT;y++){
        const b = getBlock(x,y,z);
        // Fire is rendered as its own non-solid crossed-billboard sprite (see ensureFireFx), not as
        // a cube face — it stays in TRANSPARENT_BLOCKS so it still doesn't occlude neighbors or block
        // sky exposure, but it no longer gets meshed into the chunk itself.
        if(b===AIR || b===FIRE) continue;
        const bucket = buckets[bucketFor(b)];
        const tiles = BLOCK_TILES[b];
        const indoorF = skyExposed[y] ? 1.0 : INDOOR_DARK_FACTOR;
        const tint = (b===WOOD || b===LEAVES) ? treeTintAt(b,x,y,z,columnSpecies) : null;
        for(let fi=0; fi<FACES.length; fi++){
          const f = FACES[fi];
          const nb = getBlock(x+f.n[0], y+f.n[1], z+f.n[2]);
          let draw;
          if(nb===AIR) draw = true;
          else if(TRANSPARENT_BLOCKS.has(nb) && nb!==b) draw = true;
          else draw = false;
          if(!draw) continue;
          const shadeF = (f.n[1]===1 ? 1.0 : (f.n[1]===-1 ? 0.5 : 0.75)) * indoorF;
          const tileIdx = (tint && tint.leafTile!=null) ? tint.leafTile
            : (f.n[1]===1 ? tiles.top : (f.n[1]===-1 ? tiles.bottom : tiles.side));
          const {u0,u1,vBottom,vTop} = tileUV(tileIdx);
          const pattern = UV_PATTERNS[fi];
          const base = bucket.positions.length/3;
          for(let ci=0; ci<4; ci++){
            const c = f.c[ci];
            bucket.positions.push(x+c[0], y+c[1], z+c[2]);
            bucket.normals.push(f.n[0],f.n[1],f.n[2]);
            if(tint) bucket.colors.push(shadeF*tint.mul[0], shadeF*tint.mul[1], shadeF*tint.mul[2]);
            else bucket.colors.push(shadeF,shadeF,shadeF);
            const [uf,vf] = pattern[ci];
            bucket.uvs.push(uf?u1:u0, vf?vTop:vBottom);
          }
          bucket.indices.push(base,base+1,base+2, base,base+2,base+3);
        }
      }
    }
  }
  function toGeo(bucket){
    if(bucket.positions.length===0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions,3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals,3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors,3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs,2));
    geo.setIndex(bucket.indices);
    return geo;
  }
  return { solid: toGeo(buckets.solid), water: toGeo(buckets.water), glass: toGeo(buckets.glass) };
}

function rebuildChunk(cx,cz){
  const key = chunkKey(cx,cz);
  const existing = chunkMeshes.get(key);
  if(existing){
    ['solid','water','glass'].forEach(k=>{
      if(existing[k]){ scene.remove(existing[k]); existing[k].geometry.dispose(); }
    });
  }
  const { solid, water, glass } = buildChunkGeometries(cx,cz);
  const entry = {};
  // Only the solid terrain casts/receives shadows — water/glass stay out of it, both because
  // translucent shadow casters look wrong and because it keeps the shadow pass cheaper.
  if(solid){ const m = new THREE.Mesh(solid, solidMaterial); m.castShadow = true; m.receiveShadow = true; scene.add(m); entry.solid = m; }
  if(water){ const m = new THREE.Mesh(water, waterMaterial); m.receiveShadow = true; scene.add(m); entry.water = m; }
  if(glass){ const m = new THREE.Mesh(glass, glassMaterial); m.receiveShadow = true; scene.add(m); entry.glass = m; }
  chunkMeshes.set(key, entry);
}
function rebuildAllChunks(){
  for(let cx=0;cx<CHUNKS_PER_SIDE;cx++)
    for(let cz=0;cz<CHUNKS_PER_SIDE;cz++)
      rebuildChunk(cx,cz);
}
function rebuildChunkAt(x,z){
  const cx = Math.floor(x/CHUNK_SIZE), cz = Math.floor(z/CHUNK_SIZE);
  if(cx<0||cz<0||cx>=CHUNKS_PER_SIDE||cz>=CHUNKS_PER_SIDE) return;
  rebuildChunk(cx,cz);
}
function onBlockChanged(x,y,z){
  rebuildChunkAt(x,z);
  const lx = ((x % CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE;
  const lz = ((z % CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE;
  if(lx===0) rebuildChunkAt(x-1,z);
  if(lx===CHUNK_SIZE-1) rebuildChunkAt(x+1,z);
  if(lz===0) rebuildChunkAt(x,z-1);
  if(lz===CHUNK_SIZE-1) rebuildChunkAt(x,z+1);
  updateMinimapColumn(x,z);
}

// ---------- Minimap: a static top-down view of the whole (fixed-size) world ----------
// The terrain layer is a 1px-per-block offscreen canvas, baked once at load from each column's
// topmost non-air block (so lakes read as water, clearings as grass, etc. using the exact same
// BLOCK_COLOR every hotbar swatch already uses) and patched a single pixel at a time as blocks
// change, rather than ever re-scanning the whole map. The visible canvas just rescales that image
// every frame (crisp/nearest, no smoothing) and draws the live player positions on top of it.
const MINIMAP_DISPLAY = 160;
let minimapTerrainCanvas, minimapTerrainCtx, minimapCanvas, minimapCtx;
function surfaceColorAt(x,z){
  for(let y=WORLD_HEIGHT-1;y>=0;y--){
    const b = getBlock(x,y,z);
    if(b!==AIR) return BLOCK_COLOR[b]!=null ? BLOCK_COLOR[b] : 0x223322;
  }
  return 0x223322;
}
function updateMinimapColumn(x,z){
  if(!minimapTerrainCtx) return;
  minimapTerrainCtx.fillStyle = '#'+surfaceColorAt(x,z).toString(16).padStart(6,'0');
  minimapTerrainCtx.fillRect(x,z,1,1);
}
function buildMinimapTerrain(){
  minimapTerrainCanvas = document.createElement('canvas');
  minimapTerrainCanvas.width = WORLD_SIZE;
  minimapTerrainCanvas.height = WORLD_SIZE;
  minimapTerrainCtx = minimapTerrainCanvas.getContext('2d');
  for(let x=0;x<WORLD_SIZE;x++) for(let z=0;z<WORLD_SIZE;z++) updateMinimapColumn(x,z);
  minimapCanvas = document.getElementById('minimapCanvas');
  if(minimapCanvas){
    minimapCtx = minimapCanvas.getContext('2d');
    minimapCtx.imageSmoothingEnabled = false;
  }
}
// Points in the direction the character is actually facing (same forward-vector convention used
// for door placement: (-sin(yaw), -cos(yaw))), so at a glance you can tell which way someone's
// looking, not just where they are. A thick black outline followed by a thin white one gives every
// triangle a high-contrast border that stays legible over any terrain color underneath it.
function drawMinimapTriangle(px,py,yaw,size,fillColor){
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  minimapCtx.beginPath();
  minimapCtx.moveTo(px+fx*size, py+fz*size);
  minimapCtx.lineTo(px-fx*size*0.6+rx*size*0.55, py-fz*size*0.6+rz*size*0.55);
  minimapCtx.lineTo(px-fx*size*0.6-rx*size*0.55, py-fz*size*0.6-rz*size*0.55);
  minimapCtx.closePath();
  minimapCtx.fillStyle = fillColor;
  minimapCtx.fill();
  minimapCtx.lineWidth = 2.5;
  minimapCtx.strokeStyle = '#000';
  minimapCtx.stroke();
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeStyle = '#fff';
  minimapCtx.stroke();
}
function drawMinimapLabel(px,py,text){
  minimapCtx.font = '9px sans-serif';
  minimapCtx.textAlign = 'center';
  minimapCtx.textBaseline = 'top';
  minimapCtx.lineWidth = 2;
  minimapCtx.strokeStyle = 'rgba(0,0,0,0.85)';
  minimapCtx.strokeText(text, px, py);
  minimapCtx.fillStyle = '#fff';
  minimapCtx.fillText(text, px, py);
}
function updateMinimap(){
  if(!minimapCanvas) return;
  const S = MINIMAP_DISPLAY;
  minimapCtx.clearRect(0,0,S,S);
  minimapCtx.drawImage(minimapTerrainCanvas, 0,0, WORLD_SIZE, WORLD_SIZE, 0,0, S,S);
  remotePlayers.forEach((e,id)=>{
    const px = (e.mesh.position.x/WORLD_SIZE)*S, py = (e.mesh.position.z/WORLD_SIZE)*S;
    drawMinimapTriangle(px,py,e.mesh.rotation.y,5,'#'+colorForId(id).toString(16).padStart(6,'0'));
    drawMinimapLabel(px, py+6, e.name || 'Player');
  });
  if(!isDead){
    const px = (player.pos.x/WORLD_SIZE)*S, py = (player.pos.z/WORLD_SIZE)*S;
    drawMinimapTriangle(px,py,player.yaw,6,'#fff2b0');
    drawMinimapLabel(px, py+8, myName || 'You');
  }
}

// ---------- Player ----------
const GRAVITY = -28, JUMP_SPEED = 9, WALK_SPEED = 5.2, SPRINT_SPEED = 8.4, LADDER_CLIMB_SPEED = 4, SWIM_SPEED = 3.5;
const WATER_SINK_SPEED = 1.2; // gentle default sink in water when not actively holding Space to stay up
// Hold Ctrl to crawl: drops to a much shorter hitbox (comfortably under 1 block, so a 1-tall gap with
// solid floor and ceiling actually clears it) and moves slower, same "hold a modifier key" feel as
// sprint. player.height/eye shrink to these while crawling and pop back to PLAYER_HEIGHT/PLAYER_EYE
// the instant Ctrl is released (no "must find headroom before standing" gating — simplest version).
const PLAYER_HEIGHT = 1.8, PLAYER_EYE = 1.6;
const CRAWL_HEIGHT = 0.75, CRAWL_EYE = 0.55, CRAWL_SPEED = 2.2;
const player = {
  pos: new THREE.Vector3(0,0,0),
  vel: new THREE.Vector3(0,0,0),
  yaw: 0, pitch: 0, onGround: false, crawling: false, inWater: false,
  canDoubleJump: false, spaceWasDown: false, crawlMode: false,
  width: 0.6, height: PLAYER_HEIGHT, eye: PLAYER_EYE,
};
// 10 fixed spawn points spread across the map, as fractions of WORLD_SIZE so they scale with it.
const SPAWN_POINTS = [
  [0.50,0.50], [0.20,0.20], [0.80,0.20], [0.20,0.80], [0.80,0.80],
  [0.60,0.22], [0.50,0.80], [0.20,0.50], [0.80,0.50], [0.35,0.65],
].map(([fx,fz]) => [Math.floor(fx*WORLD_SIZE), Math.floor(fz*WORLD_SIZE)]);
let lastSpawnIndex = -1;
function pickSpawnIndex(){
  let idx;
  do{ idx = Math.floor(Math.random()*SPAWN_POINTS.length); }while(idx===lastSpawnIndex);
  lastSpawnIndex = idx;
  return idx;
}
function spawnPlayer(){
  const [x,z] = SPAWN_POINTS[pickSpawnIndex()];
  const h = heightAt(x,z);
  player.pos.set(x+0.5, h+2, z+0.5);
  player.vel.set(0,0,0);
  player.fallFrom = player.pos.y;
}

// ---------- Blocky character model (the player's own body, and other connected players) ----------
function buildFaceTexture(){
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(217,160,102)';
  ctx.fillRect(0,0,size,size);
  ctx.fillStyle = 'rgb(45,32,26)';
  ctx.fillRect(3,6,3,3);
  ctx.fillRect(10,6,3,3);
  ctx.fillStyle = 'rgb(250,250,250)';
  ctx.fillRect(4,6,1,1);
  ctx.fillRect(11,6,1,1);
  ctx.fillStyle = 'rgb(140,85,70)';
  ctx.fillRect(6,11,4,2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
const faceMaterial = new THREE.MeshLambertMaterial({ map: buildFaceTexture() });
// BoxGeometry material order is +x,-x,+y,-y,+z,-z; index 5 (-z) is the character's forward side,
// matching yaw=0 facing -Z (same convention as getLookDir/the camera).
const headMaterials = [skinMaterial, skinMaterial, skinMaterial, skinMaterial, skinMaterial, faceMaterial];

function createCharacterMesh(shirtColor){
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor!==undefined ? shirtColor : 0x3b6ea5 });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });

  function box(w,h,d,mat,pivotTop){
    const geo = new THREE.BoxGeometry(w,h,d);
    if(pivotTop) geo.translate(0,-h/2,0);
    return new THREE.Mesh(geo, mat);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5), headMaterials);
  head.position.set(0, 1.55, 0);
  const body = box(0.5,0.75,0.28, shirtMat);
  body.position.set(0, 1.05, 0);
  const armL = box(0.2,0.7,0.2, shirtMat, true);
  armL.position.set(-0.35, 1.4, 0);
  const armR = box(0.2,0.7,0.2, shirtMat, true);
  armR.position.set(0.35, 1.4, 0);
  const legL = box(0.22,0.7,0.22, pantsMat, true);
  legL.position.set(-0.14, 0.7, 0);
  const legR = box(0.22,0.7,0.22, pantsMat, true);
  legR.position.set(0.14, 0.7, 0);

  group.add(head, body, armL, armR, legL, legR);
  group.userData.parts = { armL, armR, legL, legR };
  group.traverse(o => { if(o.isMesh){ o.castShadow = true; } });
  return group;
}
function animateWalk(group, state, dt, moving, sprinting){
  state.amp += ((moving?1:0) - state.amp) * Math.min(1, dt*8);
  state.phase += dt * (sprinting ? 11 : 7);
  const swing = Math.sin(state.phase) * 0.6 * state.amp;
  const { armL, armR, legL, legR } = group.userData.parts;
  armR.rotation.x = swing;
  legL.rotation.x = swing;
  armL.rotation.x = -swing;
  legR.rotation.x = -swing;
}
function colorForId(id){
  return new THREE.Color(`hsl(${hashIdToSeed(id)%360},60%,55%)`).getHex();
}

// ---------- Floating name/HP tag (drawn on a canvas, shown as a billboard sprite above the head) ----------
function buildNameTagCanvas(name, hp, maxHp){
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(2,2,252,60);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(name, 128, 28);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#ff6b6b';
  ctx.fillText('❤ ' + Math.max(0, Math.round(hp)) + '/' + maxHp, 128, 52);
  return canvas;
}
function createNameTagSprite(){
  const tex = new THREE.CanvasTexture(buildNameTagCanvas('', 0, PLAYER_MAX_HP));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.set(0, 2.05, 0);
  return { sprite, tex, lastKey: null };
}
function updateNameTag(tag, name, hp, maxHp){
  const key = name + ':' + Math.max(0, Math.round(hp));
  if(tag.lastKey === key) return;
  tag.lastKey = key;
  const canvas = buildNameTagCanvas(name, hp, maxHp);
  tag.tex.dispose();
  tag.tex = new THREE.CanvasTexture(canvas);
  tag.sprite.material.map = tag.tex;
  tag.sprite.material.needsUpdate = true;
}

// ---------- Animal models (blocky quadrupeds, with procedurally-drawn hide textures) ----------
function fillTileSized(ctx,size,baseHex){ ctx.fillStyle = rgbStr(...hexRGB(baseHex)); ctx.fillRect(0,0,size,size); }
function speckleSized(ctx,size,baseHex,count,jitter){
  for(let i=0;i<count;i++){
    const px=Math.floor(Math.random()*size), py=Math.floor(Math.random()*size);
    ctx.fillStyle = shadeStr(baseHex, 0.8+Math.random()*0.4, jitter||0);
    ctx.fillRect(px,py,1,1);
  }
}
function blobPatch(ctx,x,y,w,h){
  [[0.5,0.5,0.5,0.5],[0.2,0.3,0.32,0.32],[0.75,0.65,0.3,0.32]].forEach(([cx,cy,rw,rh])=>{
    ctx.beginPath();
    ctx.ellipse(x+w*cx, y+h*cy, w*rw, h*rh, 0, 0, Math.PI*2);
    ctx.fill();
  });
}
function buildHideTexture(drawFn){
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  drawFn(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
const ANIMAL_HIDE = {
  cow: buildHideTexture((ctx,size)=>{
    fillTileSized(ctx,size,0xe8e4d8);
    speckleSized(ctx,size,0xe8e4d8,50,8);
    ctx.fillStyle = 'rgb(35,35,35)';
    blobPatch(ctx, 2, 3, 14, 12);
    blobPatch(ctx, 16, 15, 14, 14);
  }),
  sheep: buildHideTexture((ctx,size)=>{
    fillTileSized(ctx,size,0xebe6d6);
    for(let i=0;i<28;i++){
      const x=Math.random()*size, y=Math.random()*size, r=1.4+Math.random()*1.6;
      ctx.fillStyle = shadeStr(0xebe6d6, 0.8+Math.random()*0.35, 6);
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
  }),
  dog: buildHideTexture((ctx,size)=>{
    fillTileSized(ctx,size,0x8a5a34);
    speckleSized(ctx,size,0x8a5a34,70,12);
    for(let x=0;x<size;x+=2){
      if(Math.random()<0.5){
        ctx.fillStyle = shadeStr(0x8a5a34, 0.65+Math.random()*0.3, 6);
        ctx.fillRect(x, Math.random()*size*0.5, 1, size*0.35+Math.random()*size*0.3);
      }
    }
  }),
  giraffe: buildHideTexture((ctx,size)=>{
    fillTileSized(ctx,size,0xd8b26a);
    speckleSized(ctx,size,0xd8b26a,20,6);
    ctx.fillStyle = 'rgb(139,90,43)';
    for(let i=0;i<9;i++){
      const x=Math.random()*size, y=Math.random()*size, r=size*0.1+Math.random()*size*0.07;
      const pts = 6+Math.floor(Math.random()*3);
      ctx.beginPath();
      for(let p=0;p<=pts;p++){
        const ang=(p/pts)*Math.PI*2, rr=r*(0.7+Math.random()*0.5);
        const px=x+Math.cos(ang)*rr, py=y+Math.sin(ang)*rr;
        p===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
      }
      ctx.closePath(); ctx.fill();
    }
  }),
  lion: buildHideTexture((ctx,size)=>{
    fillTileSized(ctx,size,0xc99a4e);
    speckleSized(ctx,size,0xc99a4e,60,10);
  }),
  elephant: buildHideTexture((ctx,size)=>{
    fillTileSized(ctx,size,0x9a9a9a);
    for(let i=0;i<55;i++){
      const x=Math.floor(Math.random()*size), y=Math.floor(Math.random()*size);
      ctx.fillStyle = shadeStr(0x9a9a9a, 0.75+Math.random()*0.35, 8);
      ctx.fillRect(x,y, 1+Math.floor(Math.random()*2), 1+Math.floor(Math.random()*2));
    }
    ctx.strokeStyle = 'rgba(60,60,60,0.2)';
    for(let i=0;i<5;i++){
      const y = Math.random()*size;
      ctx.beginPath();
      ctx.moveTo(0,y);
      ctx.bezierCurveTo(size*0.3,y+Math.random()*5-2.5, size*0.7,y+Math.random()*5-2.5, size,y);
      ctx.stroke();
    }
  }),
};
const ANIMAL_HIDE_MAT = {};
for(const type of ANIMAL_TYPES) ANIMAL_HIDE_MAT[type] = new THREE.MeshLambertMaterial({ map: ANIMAL_HIDE[type] });

function animalBox(w,h,d,colorOrMat){
  const mat = (colorOrMat instanceof THREE.Material) ? colorOrMat : new THREE.MeshLambertMaterial({ color: colorOrMat });
  return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
}
function makeQuadruped(opts){
  const g = new THREE.Group();
  const legH = opts.bodyY - opts.bodyH/2;
  const body = animalBox(opts.bodyW, opts.bodyH, opts.bodyD, opts.bodyMat);
  body.position.set(0, opts.bodyY, 0);
  g.add(body);

  const lx = opts.bodyW/2 - opts.legW*0.8;
  const lz = opts.bodyD/2 - opts.legW*0.8;
  const legMat = opts.legMat || opts.bodyMat;
  const legPositions = [[-lx,-lz],[lx,-lz],[-lx,lz],[lx,lz]]; // FL, FR, BL, BR (forward = -Z)
  const legs = legPositions.map(([px,pz])=>{
    const leg = animalBox(opts.legW, legH, opts.legW, legMat);
    leg.geometry.translate(0,-legH/2,0);
    leg.position.set(px, legH, pz);
    g.add(leg);
    return leg;
  });

  const head = animalBox(opts.headW, opts.headH, opts.headD, opts.headMat || opts.bodyMat);
  head.position.set(0, opts.headY, opts.headZ);
  g.add(head);

  if(opts.extras) opts.extras(g, { body, head, legs });

  g.userData.legs = legs;
  return g;
}
const ANIMAL_BUILDERS = {
  cow(){
    const hide = ANIMAL_HIDE_MAT.cow;
    return makeQuadruped({
      bodyW:1.0, bodyH:0.65, bodyD:0.5, bodyY:0.75, bodyMat:hide,
      legW:0.14,
      headW:0.32, headH:0.32, headD:0.3, headY:0.85, headZ:-0.5,
      extras(g){
        const snout=animalBox(0.2,0.14,0.12,0xd9a0a0); snout.position.set(0,0.78,-0.67); g.add(snout);
        const earL=animalBox(0.12,0.05,0.05,hide); earL.position.set(-0.2,0.95,-0.46); g.add(earL);
        const earR=animalBox(0.12,0.05,0.05,hide); earR.position.set(0.2,0.95,-0.46); g.add(earR);
      },
    });
  },
  sheep(){
    const hide = ANIMAL_HIDE_MAT.sheep;
    return makeQuadruped({
      bodyW:0.7, bodyH:0.55, bodyD:0.45, bodyY:0.5, bodyMat:hide,
      legW:0.1, legMat:0x3a3a3a,
      headW:0.24, headH:0.22, headD:0.22, headMat:0x3a3a3a, headY:0.55, headZ:-0.38,
      extras(g){
        const earL=animalBox(0.1,0.05,0.05,0x3a3a3a); earL.position.set(-0.14,0.58,-0.32); g.add(earL);
        const earR=animalBox(0.1,0.05,0.05,0x3a3a3a); earR.position.set(0.14,0.58,-0.32); g.add(earR);
      },
    });
  },
  dog(){
    const hide = ANIMAL_HIDE_MAT.dog;
    return makeQuadruped({
      bodyW:0.5, bodyH:0.3, bodyD:0.26, bodyY:0.4, bodyMat:hide,
      legW:0.08,
      headW:0.22, headH:0.2, headD:0.22, headY:0.48, headZ:-0.3,
      extras(g){
        const earL=animalBox(0.06,0.14,0.1,0x5a3a20); earL.position.set(-0.12,0.56,-0.32); g.add(earL);
        const earR=animalBox(0.06,0.14,0.1,0x5a3a20); earR.position.set(0.12,0.56,-0.32); g.add(earR);
        const tail=animalBox(0.06,0.06,0.26,hide); tail.position.set(0,0.48,0.26); tail.rotation.x=0.5; g.add(tail);
      },
    });
  },
  giraffe(){
    const hide = ANIMAL_HIDE_MAT.giraffe;
    return makeQuadruped({
      bodyW:0.6, bodyH:0.55, bodyD:0.4, bodyY:1.5, bodyMat:hide,
      legW:0.13,
      headW:0.22, headH:0.28, headD:0.26, headY:2.55, headZ:-0.4,
      extras(g){
        const neck=animalBox(0.22,1.15,0.22,hide);
        neck.position.set(0,1.98,-0.32); neck.rotation.x=-0.18; g.add(neck);
        const hornL=animalBox(0.05,0.14,0.05,0x8a6a3a); hornL.position.set(-0.08,2.78,-0.42); g.add(hornL);
        const hornR=animalBox(0.05,0.14,0.05,0x8a6a3a); hornR.position.set(0.08,2.78,-0.42); g.add(hornR);
      },
    });
  },
  lion(){
    const hide = ANIMAL_HIDE_MAT.lion;
    return makeQuadruped({
      bodyW:0.85, bodyH:0.55, bodyD:0.5, bodyY:0.65, bodyMat:hide,
      legW:0.14,
      headW:0.32, headH:0.3, headD:0.28, headY:0.8, headZ:-0.5,
      extras(g){
        const mane=animalBox(0.46,0.46,0.4,0x8a5a28); mane.position.set(0,0.8,-0.44); g.add(mane);
        const head2=animalBox(0.32,0.3,0.28,hide); head2.position.set(0,0.8,-0.58); g.add(head2);
        const tail=animalBox(0.06,0.06,0.4,hide); tail.position.set(0,0.65,0.5); tail.rotation.x=0.3; g.add(tail);
        const tuft=animalBox(0.1,0.1,0.1,0x5a3a1a); tuft.position.set(0,0.5,0.68); g.add(tuft);
      },
    });
  },
  elephant(){
    const hide = ANIMAL_HIDE_MAT.elephant;
    return makeQuadruped({
      bodyW:1.3, bodyH:0.9, bodyD:0.7, bodyY:1.0, bodyMat:hide,
      legW:0.24,
      headW:0.5, headH:0.5, headD:0.4, headY:1.15, headZ:-0.65,
      extras(g){
        const earL=animalBox(0.06,0.4,0.4,hide); earL.position.set(-0.28,1.2,-0.55); g.add(earL);
        const earR=animalBox(0.06,0.4,0.4,hide); earR.position.set(0.28,1.2,-0.55); g.add(earR);
        const trunk=animalBox(0.14,0.55,0.14,hide);
        trunk.geometry.translate(0,-0.275,0); trunk.position.set(0,1.3,-0.85); trunk.rotation.x=0.2; g.add(trunk);
        const tuskL=animalBox(0.05,0.05,0.22,0xf0ead6); tuskL.position.set(-0.12,0.95,-0.9); g.add(tuskL);
        const tuskR=animalBox(0.05,0.05,0.22,0xf0ead6); tuskR.position.set(0.12,0.95,-0.9); g.add(tuskR);
      },
    });
  },
};
// Original bodyY (quadrupeds) / hip height (bipeds) each model was designed at, before rescaling.
const ANIMAL_ORIGINAL_BODY_Y = {
  cow:0.75, sheep:0.5, dog:0.4, giraffe:1.5, lion:0.65, elephant:1.0,
};
const ANIMAL_SCALE = {};
for(const type of ANIMAL_TYPES) ANIMAL_SCALE[type] = ANIMAL_REAL_HEIGHT[type] / ANIMAL_ORIGINAL_BODY_Y[type];
function createAnimalMesh(type){
  const mesh = ANIMAL_BUILDERS[type]();
  mesh.scale.setScalar(ANIMAL_SCALE[type]);
  mesh.traverse(o => { if(o.isMesh){ o.castShadow = true; } });
  return mesh;
}
function animateQuadrupedWalk(group, state, dt, moving, speedMul){
  state.amp += ((moving?1:0) - state.amp) * Math.min(1, dt*8);
  state.phase += dt * 6 * (speedMul||1);
  const swing = Math.sin(state.phase) * 0.5 * state.amp;
  const [fl,fr,bl,br] = group.userData.legs;
  fl.rotation.x = swing;  br.rotation.x = swing;
  fr.rotation.x = -swing; bl.rotation.x = -swing;
}

// ---------- Animal AI ----------
const animals = [];
// Ground for animals excludes tree material (WOOD/LEAVES) so they never end up standing in a
// tree's trunk or canopy — only natural terrain and player-built blocks count as "ground".
function isAnimalGround(b){ return b!==AIR && b!==WATER && b!==WOOD && b!==LEAVES && b!==WINDOW_OPEN && b!==DOOR_OPEN && b!==SAPLING && b!==FIRE && b!==TORCH; }
function groundHeightAt(x,z){
  const bx=Math.floor(x), bz=Math.floor(z);
  for(let y=WORLD_HEIGHT-1;y>=0;y--){
    if(isAnimalGround(getBlock(bx,y,bz))) return y+1;
  }
  return 1;
}
const SPAWN_COUNTS = { cow:16, sheep:20, dog:12, giraffe:12, lion:8, elephant:8 }; // 4x the original counts
function findSpawnSpot(seedX, seedZ){
  let x,z,h,tries=0;
  do{
    const hx = seedX!=null ? hash2(seedX+tries*0.37, seedZ) : Math.random();
    const hz = seedX!=null ? hash2(seedX, seedZ+tries*0.53) : Math.random();
    x = 4 + Math.floor(hx*(WORLD_SIZE-8));
    z = 4 + Math.floor(hz*(WORLD_SIZE-8));
    h = heightAt(x,z);
    tries++;
  } while((h<=SEA_LEVEL || getBlock(x,h,z)!==GRASS || getBlock(x,h+1,z)!==AIR) && tries<30);
  return {x,z};
}
function addAnimal(type, id, spot, yawSeed){
  const stats = ANIMAL_STATS[type];
  const mesh = createAnimalMesh(type);
  const gy = groundHeightAt(spot.x+0.5, spot.z+0.5);
  mesh.position.set(spot.x+0.5, gy, spot.z+0.5);
  scene.add(mesh);
  const a = {
    id, type, mesh,
    hp: stats.maxHp, maxHp: stats.maxHp,
    x:spot.x+0.5, y:gy, z:spot.z+0.5, yaw: (yawSeed!=null ? yawSeed : Math.random())*Math.PI*2,
    wanderTimer: Math.random()*2, target:null,
    aggroUntil:0, attackCooldown:0, walk:{phase:0,amp:0}, wasAggro:false,
    lastReproducedAt: Date.now(),
  };
  animals.push(a);
  return a;
}
function spawnAnimals(){
  let idx=0;
  for(const type of ANIMAL_TYPES){
    for(let i=0;i<SPAWN_COUNTS[type];i++){
      const spot = findSpawnSpot(idx*7.13+1.7, idx*11.3+2.9);
      addAnimal(type, type+'_'+idx, spot, hash2(idx*2.1,idx*5.7));
      idx++;
    }
  }
}
let respawnCheckTimer = 8;
function newRespawnId(type){
  // Random, not an incrementing counter: a per-session counter would start at 0 on every client
  // and could collide with another player's respawned animal, corrupting each other's HP via the
  // shared world/mobs sync. This is astronomically unlikely to collide across clients.
  return type+'_r'+Math.random().toString(36).slice(2,10);
}
function updateRespawns(dt){
  respawnCheckTimer -= dt;
  if(respawnCheckTimer>0) return;
  respawnCheckTimer = 8; // check periodically, replace at most one missing animal per type each time
  for(const type of ANIMAL_TYPES){
    const alive = animals.reduce((n,a)=> a.type===type ? n+1 : n, 0);
    if(alive < SPAWN_COUNTS[type]){
      addAnimal(type, newRespawnId(type), findSpawnSpot());
      break; // one new animal per check keeps respawns feeling gradual, not a sudden burst
    }
  }
}
function updateAnimal(a, dt){
  const stats = ANIMAL_STATS[a.type];
  a.attackCooldown = Math.max(0, a.attackCooldown - dt);

  const dxp = player.pos.x - a.x, dzp = player.pos.z - a.z;
  const distToPlayer = Math.hypot(dxp,dzp);
  const now = performance.now();

  if(stats.aggressive && distToPlayer < AGGRO_RADIUS) a.aggroUntil = Math.max(a.aggroUntil, now + 1500);
  const isAggro = now < a.aggroUntil && distToPlayer < DEAGGRO_RADIUS;
  if(isAggro && !a.wasAggro && a.type==='lion') SFX.roar();
  a.wasAggro = isAggro;

  let moving = false;
  if(isAggro){
    if(distToPlayer > 0.05){
      const nx = dxp/distToPlayer, nz = dzp/distToPlayer;
      a.yaw = Math.atan2(-nx, -nz);
      if(distToPlayer > ATTACK_RANGE*0.4 + stats.reach){
        stepAnimal(a, nx*stats.chaseSpeed*dt, nz*stats.chaseSpeed*dt);
        moving = true;
      } else if(a.attackCooldown<=0){
        damagePlayer(stats.dmg, a.type);
        a.attackCooldown = 1.1;
      }
    }
  } else {
    a.wanderTimer -= dt;
    if(a.wanderTimer<=0){
      a.wanderTimer = 2+Math.random()*3;
      a.target = Math.random()<0.6
        ? { x:a.x+(Math.random()*2-1)*3, z:a.z+(Math.random()*2-1)*3 }
        : null;
    }
    if(a.target){
      const tdx=a.target.x-a.x, tdz=a.target.z-a.z, td=Math.hypot(tdx,tdz);
      if(td>0.15){
        const nx=tdx/td, nz=tdz/td;
        a.yaw = Math.atan2(-nx,-nz);
        stepAnimal(a, nx*stats.speed*dt*0.5, nz*stats.speed*dt*0.5);
        moving = true;
      } else a.target = null;
    }
  }

  a.x = Math.max(1, Math.min(WORLD_SIZE-1, a.x));
  a.z = Math.max(1, Math.min(WORLD_SIZE-1, a.z));
  a.y = groundHeightAt(a.x, a.z);

  a.mesh.position.set(a.x, a.y, a.z);
  a.mesh.rotation.y = a.yaw;
  animateQuadrupedWalk(a.mesh, a.walk, dt, moving, isAggro?1.6:1);

  // Reproduction: check for nearby animals of the same type
  const nowMs = Date.now();
  if(nowMs - a.lastReproducedAt >= ANIMAL_REPRODUCE_INTERVAL_MS){
    for(const other of animals){
      if(other.type!==a.type || other===a) continue;
      const dx = other.x-a.x, dz = other.z-a.z;
      if(Math.hypot(dx,dz) < ANIMAL_REPRODUCE_RANGE){
        a.lastReproducedAt = nowMs;
        other.lastReproducedAt = nowMs; // both animals just reproduced
        // Spawn a baby animal at the midpoint
        const babyX = (a.x+other.x)/2, babyZ = (a.z+other.z)/2;
        addAnimal(a.type, newRespawnId(a.type), {x:babyX,z:babyZ});
        break; // one reproduction per update pass per animal
      }
    }
  }
}
function updateAnimals(dt){ animals.forEach(a=>updateAnimal(a,dt)); }
function killAnimal(a){
  scene.remove(a.mesh);
  const i = animals.indexOf(a);
  if(i>=0) animals.splice(i,1);
}
function damageAnimal(a, dmg){
  a.hp = Math.max(0, a.hp - dmg);
  const stats = ANIMAL_STATS[a.type];
  if(stats.retaliate) a.aggroUntil = performance.now() + RETALIATE_MS;
  if(fbReady) db.ref('world/mobs/'+a.id+'/hp').set(a.hp);
  if(a.hp<=0){
    SFX.animalDeath();
    // Only the client that actually lands the killing hit ever reaches this branch — a remote kill
    // arrives through applyRemoteMobHp below instead, which never calls damageAnimal — so meat can't
    // be double-awarded to bystanders who just see the HP sync.
    invAdd(MEAT, MEAT_YIELD[a.type] || 1);
    saveInventory();
    updateHotbarUI();
    killAnimal(a);
  }
}
// awardMeat defaults true (the player landed the hit, via tryAttack below) — a big eagle eating a
// bird or fish passes false, same reasoning as killWorm's reason string: only a kill the player
// actually delivers should ever put Meat in their inventory.
function damageBirdOrFish(entity, dmg, type, awardMeat){
  if(awardMeat===undefined) awardMeat = true;
  entity.hp = Math.max(0, entity.hp - dmg);
  if(entity.hp<=0){
    SFX.animalDeath();
    if(awardMeat){
      const speciesId = entity.species.id;
      invAdd(MEAT, MEAT_YIELD[speciesId] || 1);
      saveInventory();
      updateHotbarUI();
    }
    scene.remove(entity.mesh);
    const arr = type==='bird' ? birds : fish;
    const idx = arr.indexOf(entity);
    if(idx>=0) arr.splice(idx, 1);
  }
}
function damageGopher(gopher, dmg){
  gopher.hp = Math.max(0, gopher.hp - dmg);
  if(gopher.hp<=0){
    SFX.animalDeath();
    invAdd(MEAT, MEAT_YIELD.gopher || 2);
    saveInventory();
    updateHotbarUI();
    scene.remove(gopher.mesh);
    const idx = gophers.indexOf(gopher);
    if(idx>=0) gophers.splice(idx, 1);
  }
}
function damageBigEagle(eagle, dmg){
  eagle.hp = Math.max(0, eagle.hp - dmg);
  if(eagle.hp<=0){
    SFX.animalDeath();
    invAdd(MEAT, MEAT_YIELD.bigeagle || 3);
    saveInventory();
    updateHotbarUI();
    scene.remove(eagle.mesh);
    const idx = bigEagles.indexOf(eagle);
    if(idx>=0) bigEagles.splice(idx, 1);
  }
}
function applyRemoteMobHp(id, hp){
  const a = animals.find(x=>x.id===id);
  if(!a || hp==null || hp===a.hp) return;
  a.hp = hp;
  if(a.hp<=0) killAnimal(a);
}

// ---------- Sound effects (synthesized with Web Audio, no audio files needed) ----------
let audioCtx = null;
function ensureAudio(){
  if(!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return null;
    audioCtx = new Ctx();
  }
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(freq, duration, type, volume, freqEnd, attack){
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const a = attack!=null ? attack : 0.008; // tiny attack ramp avoids a harsh click at note-on
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, now);
  if(freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd,1), now+duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume||0.2, now+a);
  gain.gain.exponentialRampToValueAtTime(0.001, now+duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now+duration);
}
function playNoise(duration, volume, filterFreq, attack){
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate*duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq || 1500;
  const gain = ctx.createGain();
  const a = attack!=null ? attack : 0.004;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume||0.3, now+a);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
}
// Real recording (public domain, see assets/README.md) for the lion roar — loaded once up front,
// falls back to a synthesized growl if the file can't be fetched/decoded.
// offset: where in the source file playback starts each time (seconds) — lets a clip player pull a
// short clean moment out of a much longer recording (see firework-burst below) without needing to
// re-encode a separate trimmed file.
function makeClipPlayer(url, defaultClipDuration, tailFade, offset){
  let buffer = null;
  const startOffset = offset || 0;
  function load(){
    fetch(url)
      .then(r => { if(!r.ok) throw new Error('http '+r.status); return r.arrayBuffer(); })
      .then(buf => {
        const ctx = ensureAudio();
        if(!ctx) throw new Error('no audio context');
        return new Promise((resolve,reject) => ctx.decodeAudioData(buf, resolve, reject));
      })
      .then(decoded => { buffer = decoded; })
      .catch(() => {});
  }
  function play(clipDuration, volume){
    const ctx = ensureAudio();
    if(!ctx || !buffer) return false;
    const now = ctx.currentTime;
    const dur = Math.min(clipDuration!=null ? clipDuration : defaultClipDuration, buffer.duration-startOffset);
    const fade = tailFade!=null ? tailFade : 0.3;
    const fadeIn = 0.04; // avoids a click when starting mid-file (offset>0)
    const vol = volume!=null ? volume : 0.8;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now+fadeIn);
    gain.gain.setValueAtTime(vol, now + Math.max(fadeIn, dur-fade));
    gain.gain.linearRampToValueAtTime(0.0001, now + dur);
    src.connect(gain).connect(ctx.destination);
    src.start(now, startOffset, dur);
    return true;
  }
  return { load, play };
}
const lionRoarClip = makeClipPlayer('assets/lion-roar.ogg', 2.2, 0.35);
// Public-domain "Fireworks in distance - 3" field recording (see assets/README.md) — pulls just the
// one clean burst moment (found by scanning the recording for its loudest window) out of the full
// 46s file rather than needing a separately re-encoded clip.
const fireworkBurstClip = makeClipPlayer('assets/firework-burst.ogg', 1.5, 0.4, 22.75);
function playRoar(){
  if(lionRoarClip.play()) return;
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const duration = 1.2;

  // low growling tone with a slow pitch wobble (vibrato) and a rise-then-fall contour
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(85, now);
  osc.frequency.linearRampToValueAtTime(150, now+0.18);
  osc.frequency.linearRampToValueAtTime(60, now+duration);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 7.5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 14;
  lfo.connect(lfoGain).connect(osc.frequency);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(350, now);
  lowpass.frequency.linearRampToValueAtTime(1000, now+0.18);
  lowpass.frequency.linearRampToValueAtTime(250, now+duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.exponentialRampToValueAtTime(0.32, now+0.14);
  oscGain.gain.exponentialRampToValueAtTime(0.18, now+0.55);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now+duration);

  osc.connect(lowpass).connect(oscGain).connect(ctx.destination);

  // filtered noise layer for a breathy, throaty growl texture
  const bufferSize = Math.floor(ctx.sampleRate*duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = Math.random()*2-1;
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 500;
  noiseFilter.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.16, now+0.18);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now+duration);
  noiseSrc.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);

  osc.start(now); osc.stop(now+duration);
  lfo.start(now); lfo.stop(now+duration);
  noiseSrc.start(now);
}
function playDoorCreak(opening){
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const duration = 0.35;
  const bufferSize = Math.floor(ctx.sampleRate*duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = Math.random()*2-1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 8;
  filter.frequency.setValueAtTime(opening?250:500, now);
  filter.frequency.linearRampToValueAtTime(opening?500:200, now+duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.22, now+0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now+duration);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
  if(!opening) setTimeout(()=>playTone(90, 0.1, 'sine', 0.15, 55), duration*1000*0.85); // soft thud on shut
}
function playWindowSlide(opening){
  playNoise(0.12, 0.12, opening?2200:1400);
  setTimeout(()=>playTone(opening?700:500, 0.08, 'sine', 0.1, opening?900:400), 60);
}
const SFX = {
  breakBlock(){ playNoise(0.15, 0.35, 1200); playTone(90, 0.12, 'sine', 0.15, 50); },
  placeBlock(){ playNoise(0.09, 0.22, 2400); playTone(180, 0.08, 'triangle', 0.1, 260); },
  swing(){ playTone(220, 0.08, 'triangle', 0.08, 180); },
  hitAnimal(){ playNoise(0.05, 0.16, 2600); playTone(320, 0.1, 'square', 0.15, 150); },
  animalDeath(){ playTone(220, 0.4, 'sawtooth', 0.18, 40); playNoise(0.3, 0.12, 500); },
  hurt(){ playTone(150, 0.25, 'sawtooth', 0.22, 80); playNoise(0.15, 0.1, 900); },
  jump(){ playTone(500, 0.1, 'sine', 0.1, 700); },
  land(){ playNoise(0.1, 0.2, 700); playTone(100, 0.1, 'sine', 0.12, 55); },
  craft(){
    playTone(660, 0.1, 'sine', 0.13, 880);
    setTimeout(()=>playTone(880, 0.12, 'sine', 0.13, 1100), 70);
    setTimeout(()=>playTone(1100, 0.18, 'sine', 0.11, 1320), 140);
  },
  death(){ playTone(300, 0.6, 'sawtooth', 0.2, 50); playNoise(0.5, 0.14, 400); },
  roar(){ playRoar(); },
  doorToggle(opening){ playDoorCreak(opening); },
  windowToggle(opening){ playWindowSlide(opening); },
  // A soft attack rounds the transient off into a light "patter" instead of a percussive tap, and
  // randomizing the tone/length each drop keeps rapid-fire hits from reading as one mechanical loop.
  rainPatter(vol){ playNoise(0.08+Math.random()*0.06, vol, 4200+Math.random()*3000, 0.025); },
  // A short bright crack up front (the "snap"), then the existing low rolling rumble follows it.
  thunder(){
    playNoise(0.18, 0.28, 6000, 0.002);
    playNoise(1.6, 0.32, 220, 0.02);
    playTone(55, 1.2, 'sawtooth', 0.15, 30);
  },
  igniteFire(){ playNoise(0.35, 0.3, 3000, 0.01); playTone(200, 0.3, 'sawtooth', 0.12, 500); },
  fireCrackle(){ playNoise(0.06, 0.06, 4000, 0.002); },
  windGust(vol, filterFreq){ playNoise(1.4, vol, filterFreq, 0.3); },
  // Rising whistle for the climb (freqEnd above freq sweeps the pitch upward), then a low thump
  // plus a handful of staggered bright crackle-pops for the colorful burst up top.
  fireworkLaunch(){ playTone(280, 0.9, 'sine', 0.1, 900, 0.05); playNoise(0.8, 0.05, 5500, 0.05); },
  fireworkBurst(){
    if(!fireworkBurstClip.play(null, 0.7)){
      playNoise(0.3, 0.32, 700, 0.004);
      playTone(75, 0.35, 'sawtooth', 0.2, 40);
    }
    for(let i=0;i<6;i++){
      setTimeout(()=>playNoise(0.05+Math.random()*0.05, 0.09, 2800+Math.random()*3400, 0.002), 50+i*65+Math.random()*40);
    }
  },
  // Two overlapping soft descending tones for a gentle, cartoonish "woo-ooh" — spooky but harmless.
  ghostBoo(){
    playTone(300, 0.5, 'sine', 0.12, 180, 0.05);
    setTimeout(()=>playTone(240, 0.4, 'sine', 0.08, 140, 0.05), 150);
  },
  // A short 2-3 note chirp; pitchMul shifts the whole thing up/down per species (small birds read
  // higher, large ones lower) and volume is computed by the caller from distance to the listener,
  // the closest thing this synth-only sound system has to positional audio.
  birdTweet(pitchMul, volume){
    const base = 2100*pitchMul;
    playTone(base+Math.random()*250, 0.045, 'sine', volume, base*1.25, 0.004);
    setTimeout(()=>playTone(base*0.82+Math.random()*250, 0.05, 'sine', volume*0.85, base*1.05, 0.004), 55+Math.random()*25);
    if(Math.random()<0.55) setTimeout(()=>playTone(base*1.05+Math.random()*200, 0.04, 'sine', volume*0.6, base*1.3, 0.004), 115+Math.random()*25);
  },
  splash(){ playNoise(0.22, 0.22, 2200, 0.004); playTone(180, 0.15, 'sine', 0.1, 70); },
  // Two quick low, dampened noise thuds — a "chomp, chomp" bite rather than anything sustained.
  eat(){
    playNoise(0.07, 0.18, 700, 0.004);
    setTimeout(()=>playNoise(0.08, 0.16, 650, 0.004), 90);
  },
};
lionRoarClip.load();
fireworkBurstClip.load();

// ---------- Combat ----------
let myHP = PLAYER_MAX_HP;
let myHunger = PLAYER_MAX_HUNGER; // same as myHP — in-memory only, resets to full on reload/respawn
let myName = 'Player';
try{ const savedName = localStorage.getItem('blockcraft_player_name'); if(savedName) myName = savedName; }catch(e){}
// Regen: standing still (no movement keys held) for a bit slowly heals a half-heart at a time.
const REGEN_IDLE_DELAY = 2;   // seconds of standing still before regen starts
const REGEN_INTERVAL = 1.5;   // seconds between each half-heart tick while idle
let idleTimer = 0, regenTimer = 0;
const RESPAWN_DELAY = 3;      // seconds a dead player is frozen before respawning
let isDead = false, respawnTimer = 0;
function heartSVG(kind, i){
  const red='#d9463c', gray='#4a4a4a', dark='#2a2a2a';
  const path = 'M12 21s-7.5-4.6-10-9.3C0.3 8.5 2 5 5.5 5c2 0 3.3 1.1 4 2.2C10.2 6.1 11.5 5 13.5 5 17 5 18.7 8.5 17 11.7 15.5 16.4 12 21 12 21z';
  if(kind==='half'){
    const cid = 'heartClip'+i;
    return `<svg viewBox="0 0 24 24" width="20" height="20"><defs><clipPath id="${cid}"><rect x="0" y="0" width="12" height="24"/></clipPath></defs><path d="${path}" fill="${gray}" stroke="${dark}" stroke-width="1"/><path d="${path}" fill="${red}" clip-path="url(#${cid})"/></svg>`;
  }
  const fill = kind==='full' ? red : 'none';
  const stroke = kind==='full' ? dark : gray;
  return `<svg viewBox="0 0 24 24" width="20" height="20"><path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${kind==='full'?1:1.5}"/></svg>`;
}
function updateHeartsUI(){
  const el = document.getElementById('hearts');
  if(!el) return;
  el.innerHTML = '';
  const totalHearts = PLAYER_MAX_HP / HP_PER_HEART;
  for(let i=0;i<totalHearts;i++){
    const remaining = Math.max(0, Math.min(HP_PER_HEART, myHP - i*HP_PER_HEART));
    const kind = remaining>=HP_PER_HEART ? 'full' : (remaining>0 ? 'half' : 'empty');
    el.insertAdjacentHTML('beforeend', heartSVG(kind,i));
  }
}
// Emoji rather than hand-drawn SVG (unlike the hearts) — a drumstick silhouette isn't a simple enough
// shape to hand-derive a path for reliably, and this game already leans on plain emoji elsewhere in
// the HUD (weather, worm/butterfly counts). Full = a drumstick, half = the same drumstick dimmed, empty
// = a bare bone — reads at a glance without needing a legend.
function updateHungerUI(){
  const el = document.getElementById('hunger');
  if(!el) return;
  el.innerHTML = '';
  const totalIcons = PLAYER_MAX_HUNGER / HUNGER_PER_ICON;
  for(let i=0;i<totalIcons;i++){
    const remaining = Math.max(0, Math.min(HUNGER_PER_ICON, myHunger - i*HUNGER_PER_ICON));
    const span = document.createElement('span');
    span.textContent = remaining>0 ? '🍗' : '🦴';
    span.style.opacity = remaining>=HUNGER_PER_ICON ? '1' : (remaining>0 ? '0.45' : '0.7');
    el.appendChild(span);
  }
}
let hurtFlashTimeout = null;
function flashHurt(){
  const el = document.getElementById('hurtOverlay');
  if(!el) return;
  el.style.transition = 'none';
  el.style.opacity = '1';
  clearTimeout(hurtFlashTimeout);
  requestAnimationFrame(()=>{
    el.style.transition = 'opacity 0.5s ease-out';
    el.style.opacity = '0';
  });
}
function damagePlayer(dmg, sourceType){
  if(dmg<=0) return;
  myHP = Math.max(0, myHP - dmg);
  updateHeartsUI();
  flashHurt();
  SFX.hurt();
  if(fbReady) db.ref('players/'+myId+'/hp').set(myHP);
  if(myHP<=0) die();
}
function die(){
  if(isDead) return;
  isDead = true;
  respawnTimer = RESPAWN_DELAY;
  const msg = document.getElementById('deathMessage');
  if(msg){ msg.hidden = false; msg.textContent = `You died — respawning in ${Math.ceil(respawnTimer)}…`; }
  SFX.death();
}
function respawnAfterDeath(){
  isDead = false;
  const msg = document.getElementById('deathMessage');
  if(msg) msg.hidden = true;
  spawnPlayer();
  myHP = PLAYER_MAX_HP;
  updateHeartsUI();
  myHunger = PLAYER_MAX_HUNGER;
  updateHungerUI();
  if(fbReady) db.ref('players/'+myId+'/hp').set(myHP);
}
function updateDeathState(dt){
  if(!isDead) return;
  respawnTimer -= dt;
  const msg = document.getElementById('deathMessage');
  if(msg) msg.textContent = `You died — respawning in ${Math.max(0,Math.ceil(respawnTimer))}…`;
  if(respawnTimer <= 0) respawnAfterDeath();
}
function findAttackTarget(){
  const dir = getLookDir(player.yaw, player.pitch);
  const origin = camera.position;
  let best = null, bestDist = Infinity;
  animals.forEach(a=>{
    // Bigger animals (elephant, T-Rex...) need a longer reach so the player can hit their
    // visible body, not just the exact ground point their position is tracked from.
    const aimY = ANIMAL_REAL_HEIGHT[a.type] || 0.4;
    const range = ATTACK_RANGE + (ANIMAL_STATS[a.type].reach||0);
    const dx=a.x-origin.x, dy=(a.y+aimY)-origin.y, dz=a.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>range || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'animal', ref:a}; bestDist = dist; }
  });
  birds.forEach(b=>{
    const dx=b.mesh.position.x-origin.x, dy=(b.mesh.position.y)-origin.y, dz=b.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'bird', ref:b}; bestDist = dist; }
  });
  fish.forEach(f=>{
    const dx=f.mesh.position.x-origin.x, dy=(f.mesh.position.y)-origin.y, dz=f.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'fish', ref:f}; bestDist = dist; }
  });
  gophers.forEach(gopher=>{
    const dx=gopher.mesh.position.x-origin.x, dy=(gopher.mesh.position.y)-origin.y, dz=gopher.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'gopher', ref:gopher}; bestDist = dist; }
  });
  bigEagles.forEach(eagle=>{
    const dx=eagle.mesh.position.x-origin.x, dy=(eagle.mesh.position.y)-origin.y, dz=eagle.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'bigeagle', ref:eagle}; bestDist = dist; }
  });
  remotePlayers.forEach((e,id)=>{
    const dx=e.mesh.position.x-origin.x, dy=(e.mesh.position.y+1.0)-origin.y, dz=e.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'player', id, ref:e}; bestDist = dist; }
  });
  return best;
}
function damageRemotePlayer(id, entry, dmg){
  const cur = entry.hp!=null ? entry.hp : PLAYER_MAX_HP;
  const newHp = Math.max(0, cur - dmg);
  entry.hp = newHp;
  if(fbReady) db.ref('players/'+id+'/hp').set(newHp);
}
let lastPlayerAttack = 0;
function tryAttack(){
  const target = findAttackTarget();
  if(!target) return false;
  const now = performance.now();
  if(now - lastPlayerAttack >= 350){
    lastPlayerAttack = now;
    triggerSwing();
    SFX.swing();
    SFX.hitAnimal();
    if(target.type==='animal') damageAnimal(target.ref, PLAYER_ATTACK_DMG);
    else if(target.type==='bird') damageBirdOrFish(target.ref, PLAYER_ATTACK_DMG, 'bird');
    else if(target.type==='fish') damageBirdOrFish(target.ref, PLAYER_ATTACK_DMG, 'fish');
    else if(target.type==='gopher') damageGopher(target.ref, PLAYER_ATTACK_DMG);
    else if(target.type==='bigeagle') damageBigEagle(target.ref, PLAYER_ATTACK_DMG);
    else damageRemotePlayer(target.id, target.ref, PLAYER_ATTACK_DMG);
  }
  return true;
}

let thirdPerson = false;
let characterMesh;
let myNameTag;
const myWalkState = { phase:0, amp:0 };
function updateCharacterAnim(dt, moving, sprinting){
  animateWalk(characterMesh, myWalkState, dt, moving, sprinting);
  characterMesh.position.set(player.pos.x, player.pos.y, player.pos.z);
  characterMesh.rotation.y = player.yaw;
  // Cheap third-person "crawling" tell: squash the whole body toward the ground rather than building a
  // separate prone pose. The group's origin is at the feet, so this alone keeps it planted correctly.
  characterMesh.scale.y = player.crawling ? 0.42 : 1;
  updateNameTag(myNameTag, myName, myHP, PLAYER_MAX_HP);
}

// ---------- Multiplayer (Firebase Realtime Database) ----------
let fbReady = false, db = null, myId = null;
const remotePlayers = new Map();
function shortestAngleLerp(from, to, t){
  let d = to - from;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return from + d*t;
}
function addRemotePlayer(id, data){
  const mesh = createCharacterMesh(colorForId(id));
  mesh.position.set(data.x||0, data.y||0, data.z||0);
  mesh.rotation.y = data.yaw||0;
  const nameTag = createNameTagSprite();
  mesh.add(nameTag.sprite);
  scene.add(mesh);
  remotePlayers.set(id, {
    mesh, target:{x:data.x||0,y:data.y||0,z:data.z||0,yaw:data.yaw||0}, walk:{phase:0,amp:0},
    hp: data.hp!=null ? data.hp : PLAYER_MAX_HP,
    name: (data.name || 'Player'), nameTag,
  });
  document.getElementById('playerCount').textContent = remotePlayers.size+1;
}
function updateRemotePlayer(id, data){
  const e = remotePlayers.get(id);
  if(!e) return addRemotePlayer(id, data);
  e.target.x = data.x||0; e.target.y = data.y||0; e.target.z = data.z||0; e.target.yaw = data.yaw||0;
  if(data.hp!=null) e.hp = data.hp;
  if(data.name) e.name = data.name;
}
function removeRemotePlayer(id){
  const e = remotePlayers.get(id);
  if(!e) return;
  scene.remove(e.mesh);
  e.nameTag.tex.dispose();
  remotePlayers.delete(id);
  document.getElementById('playerCount').textContent = remotePlayers.size+1;
}
function updateRemotePlayers(dt){
  remotePlayers.forEach(e=>{
    const dist = Math.hypot(e.target.x-e.mesh.position.x, e.target.y-e.mesh.position.y, e.target.z-e.mesh.position.z);
    const moving = dist > 0.03;
    const t = Math.min(1, dt*10);
    e.mesh.position.x += (e.target.x - e.mesh.position.x)*t;
    e.mesh.position.y += (e.target.y - e.mesh.position.y)*t;
    e.mesh.position.z += (e.target.z - e.mesh.position.z)*t;
    e.mesh.rotation.y = shortestAngleLerp(e.mesh.rotation.y, e.target.yaw, t);
    animateWalk(e.mesh, e.walk, dt, moving, false);
    updateNameTag(e.nameTag, e.name, e.hp, PLAYER_MAX_HP);
  });
}
function applyWorldEdit(x,y,z,val,fromRemote){
  if(getBlock(x,y,z)===val) return;
  setBlock(x,y,z,val);
  const k = x+','+y+','+z;
  edits.set(k, val);
  if(val===CRAFTING_TABLE) craftingTables.add(k); else craftingTables.delete(k);
  updateTorchLight(x,y,z,val);
  onBlockChanged(x,y,z);
  onWaterRelevantEdit(x,y,z,val);
  saveEdits();
  if(!fromRemote && fbReady) db.ref('world/edits/'+k).set(val);
}
// Torches are permanent (unlike fire) — no lifecycle to track, just a light that follows the block.
// Placement/breaking (local or synced from another player) always goes through applyWorldEdit above,
// so hooking the light there covers every case except the very first load, handled by
// restoreTorchLights() once after loadEdits() populates the world from localStorage.
const torchLights = new Map();
function updateTorchLight(x,y,z,val){
  const key = x+','+y+','+z;
  if(val===TORCH){
    if(!torchLights.has(key)){
      const light = new THREE.PointLight(0xffb060, 1.1, 8, 2);
      light.position.set(x+0.5, y+0.7, z+0.5);
      scene.add(light);
      torchLights.set(key, light);
    }
  } else if(torchLights.has(key)){
    scene.remove(torchLights.get(key));
    torchLights.delete(key);
  }
}
function restoreTorchLights(){
  edits.forEach((val,key)=>{
    if(val===TORCH){
      const [x,y,z] = key.split(',').map(Number);
      updateTorchLight(x,y,z,val);
    }
  });
}
// When a trunk block is cut, whatever wood+leaves are left connected to it but no longer resting on
// anything solid (the ground, or a block outside the cut cluster) breaks free and actually falls —
// real gravity, accelerating over time, until it hits something and settles as real blocks.
function fallLandingY(x, startY, z){
  for(let y=startY-1; y>=1; y--) if(blockSolid(x,y,z)) return y+1;
  return 1;
}
function checkTreeSupport(bx, by, bz){
  // Figures out which single tree the just-broken block belonged to and whether any of ITS
  // remaining wood/leaves are now floating — deliberately not a general flood-fill through touching
  // blocks. In a forest, neighboring trees' canopies constantly touch each other, so a flood-fill
  // from a cut tree routinely wanders into an untouched neighbor that's still fully rooted and
  // (correctly, but unhelpfully) reads the whole merged blob as supported — the chopped tree's own
  // leaves would then never fall except in open ground. Reconstructing this tree's exact cell list
  // from the same deterministic formula plantTree used to grow it sidesteps that entirely, and as a
  // bonus leaves ordinary player-built wood structures (which won't match that shape) untouched.
  const baseY = heightAt(bx,bz) + 1;
  const treeCells = [];
  plantTreeCells(bx, baseY, bz, (x,y,z,b) => treeCells.push([x,y,z,b]));
  const stillThere = treeCells.filter(([x,y,z,b]) => getBlock(x,y,z)===b);
  if(stillThere.length===0) return;
  let groundedTrunkTop = null;
  if(getBlock(bx,baseY,bz)===WOOD){
    let y = baseY;
    while(getBlock(bx,y,bz)===WOOD) y++;
    groundedTrunkTop = y-1;
  }
  const floating = stillThere.filter(([x,y,z]) =>
    !(x===bx && z===bz && groundedTrunkTop!=null && y<=groundedTrunkTop)
  );
  if(floating.length>0) dropCluster(floating);
}
function dropCluster(cells){
  // Clear the originals first (synced) so the landing/drop calc below sees a cluster-free world —
  // otherwise a piece could "land" on another piece of the very structure that's falling with it.
  for(const [x,y,z] of cells) applyWorldEdit(x,y,z,AIR,false);
  // The drop distance is decided by the structure's LOWEST layer only (its trunk stub if any wood
  // remains, otherwise its lowest leaves) — not the minimum across every cell. Using every cell was
  // too fragile: one leaf out at the edge of the canopy happening to sit close to unrelated terrain
  // could clamp the whole tree's fall to near zero even though the rest of it was clearly floating.
  const minY = cells.reduce((m,[,y])=>Math.min(m,y), Infinity);
  let drop = Infinity;
  for(const [x,y,z] of cells) if(y===minY) drop = Math.min(drop, y - fallLandingY(x,y,z));
  drop = Math.max(0, isFinite(drop) ? drop : 0);
  spawnFallingCluster(cells, drop);
}
// A short-lived local physics body: the whole disconnected chunk of trunk/canopy falls together
// under real gravity and only turns back into real (synced) blocks once it settles.
const fallingClusters = [];
let woodFxMat, leafFxMat, fallGeo;
function spawnFallingCluster(cells, drop){
  if(!fallGeo){
    fallGeo = new THREE.BoxGeometry(0.98,0.98,0.98);
    woodFxMat = new THREE.MeshLambertMaterial({ color: BLOCK_COLOR[WOOD] });
    leafFxMat = new THREE.MeshLambertMaterial({ color: BLOCK_COLOR[LEAVES] });
  }
  const group = new THREE.Group();
  const originX = cells[0][0], originY = cells[0][1], originZ = cells[0][2];
  for(const [x,y,z,b] of cells){
    const mesh = new THREE.Mesh(fallGeo, b===WOOD ? woodFxMat : leafFxMat);
    mesh.position.set(x-originX+0.5, y-originY+0.5, z-originZ+0.5);
    group.add(mesh);
  }
  group.position.set(originX, originY, originZ);
  scene.add(group);
  if(drop<=0){ settleCluster({group, cells, originX, originY, originZ, drop}); return; }
  fallingClusters.push({ group, cells, originX, originY, originZ, drop, fallen:0, vy:0 });
}
function settleCluster(f){
  scene.remove(f.group);
  for(const [x,y,z,b] of f.cells) applyWorldEdit(x, y-f.drop, z, b, false);
}
function updateFallingClusters(dt){
  for(let i=fallingClusters.length-1;i>=0;i--){
    const f = fallingClusters[i];
    f.vy += GRAVITY*dt;
    f.fallen = Math.min(f.drop, f.fallen - f.vy*dt);
    f.group.position.y = f.originY - f.fallen;
    if(f.fallen >= f.drop){
      fallingClusters.splice(i,1);
      settleCluster(f);
    }
  }
}

// ---------- Day/night cycle ----------
// dayTime (0..1) is derived straight from the wall clock rather than accumulated frame-by-frame, so
// every client (and a fresh page reload) is automatically on the same clock with no syncing needed.
// 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
const DAY_LENGTH_S = 3600; // 1 real hour per full day/night cycle
// Animal reproduction cooldown (see ANIMAL_REPRODUCE_RANGE above): 30 in-game days.
const ANIMAL_REPRODUCE_INTERVAL_MS = 30 * DAY_LENGTH_S * 1000;
const DAY_KEYFRAMES = [
  { t:0.00, sky:0x05070f, hemi:0.22, sunI:0.00, sunC:0x223355 },
  { t:0.20, sky:0x0d1330, hemi:0.25, sunI:0.00, sunC:0x223355 },
  { t:0.25, sky:0xff9a56, hemi:0.55, sunI:0.55, sunC:0xffb066 },
  { t:0.32, sky:0x8fd0ee, hemi:0.90, sunI:0.80, sunC:0xffffff },
  { t:0.68, sky:0x8fd0ee, hemi:0.90, sunI:0.80, sunC:0xffffff },
  { t:0.75, sky:0xff7f50, hemi:0.55, sunI:0.50, sunC:0xff8c50 },
  { t:0.80, sky:0x0d1330, hemi:0.25, sunI:0.00, sunC:0x223355 },
  { t:1.00, sky:0x05070f, hemi:0.22, sunI:0.00, sunC:0x223355 },
];
function lerpColorHex(a,b,t){
  const ar=(a>>16)&255, ag=(a>>8)&255, ab=a&255;
  const br=(b>>16)&255, bg=(b>>8)&255, bb=b&255;
  return (Math.round(ar+(br-ar)*t)<<16) | (Math.round(ag+(bg-ag)*t)<<8) | Math.round(ab+(bb-ab)*t);
}
// 'regular' (the normal wall-clock cycle), 'day' (frozen at noon), or 'night' (frozen at midnight) —
// toggled with N (see the keydown handler). Every consumer of currentDayTime() — sky/lighting, the
// sun/moon, the temperature swing, firefly/ghost night visibility, and the HH:MM World Time HUD label
// — reads it through this one function, so forcing it here is enough to make all of them agree.
let timeMode = 'regular';
function currentDayTime(){
  if(timeMode==='day') return 0.5;
  if(timeMode==='night') return 0;
  return (Date.now()/1000 % DAY_LENGTH_S) / DAY_LENGTH_S;
}
function cycleTimeMode(){
  timeMode = timeMode==='regular' ? 'day' : timeMode==='day' ? 'night' : 'regular';
  const el = document.getElementById('timeModeLabel');
  if(el) el.textContent = timeMode==='day' ? ' ☀️ forced day' : timeMode==='night' ? ' 🌙 forced night' : '';
}

// ---------- Calendar: Year/Month/Day, anchored to a specific real-world instant ----------
// A parallel, purely cosmetic calendar for the HUD date — it doesn't feed into season/temperature/
// weather at all (those keep their own independent wall-clock cycle). 2026-09-06 08:00 PDT is fixed
// as the start of Year 0, Jan 1; every real hour after that is one month (matching the existing
// season length of 3 hours = 3 months), and each month is a nominal 30 "days" so the date visibly
// ticks forward (one every 2 real minutes) instead of sitting on "Day 1" for the whole month.
const CALENDAR_EPOCH_MS = Date.UTC(2026, 8, 6, 15, 0, 0); // 2026-09-06 08:00 PDT (UTC-7) == 15:00 UTC
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_LENGTH_S = 3600;                // 1 real hour per month
const CALENDAR_DAY_S = MONTH_LENGTH_S / 30;  // a nominal 30-day month
function currentCalendarDate(){
  const elapsedS = (Date.now() - CALENDAR_EPOCH_MS) / 1000;
  const totalMonths = Math.floor(elapsedS / MONTH_LENGTH_S);
  const year = Math.floor(totalMonths / 12);
  let monthIdx = totalMonths % 12;
  if(monthIdx < 0) monthIdx += 12;
  const intoMonthS = elapsedS - totalMonths*MONTH_LENGTH_S;
  const day = 1 + Math.floor(intoMonthS / CALENDAR_DAY_S);
  return { year, month: MONTH_NAMES[monthIdx], day };
}

// ---------- Sun, moon & shadows ----------
// Both bodies are billboard sprites riding the same day-time angle the lighting already uses, at a
// large fixed radius so they read as distant sky objects. The DirectionalLight's actual position
// (used for both lighting direction and its shadow camera) is kept at that same angle/height but
// re-centered on the PLAYER every frame — shadows only need to be correct near you, and a shadow
// camera that follows you can use a small, sharp frustum instead of trying to cover the whole world.
const SUN_ORBIT_R = 150;
const SHADOW_RADIUS = 32;
const SYNODIC_MONTH_DAYS = 29.530588; // real lunar month length
let sunSprite, moonSprite, moonBaseCanvas, moonBaseImageData, moonPhaseCanvas;
let lastMoonPhaseKey = null;
function buildGlowSpriteTexture(stops){
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width=S; canvas.height=S;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(S/2,S/2,0, S/2,S/2,S/2);
  stops.forEach(([off,color])=> grad.addColorStop(off,color));
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,S,S);
  return new THREE.CanvasTexture(canvas);
}
function buildMoonBaseCanvas(){
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width=S; canvas.height=S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d4c8';
  ctx.beginPath(); ctx.arc(S/2,S/2,S/2-1,0,Math.PI*2); ctx.fill();
  for(let i=0;i<8;i++){
    const cx=S*0.2+Math.random()*S*0.6, cy=S*0.2+Math.random()*S*0.6;
    const r=S*(0.04+Math.random()*0.07);
    if(Math.hypot(cx-S/2,cy-S/2)>S/2-r) continue;
    ctx.fillStyle='rgba(140,138,125,0.5)';
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  }
  return canvas;
}
// Per-pixel sphere-lighting test (not canvas path arcs — much easier to get exactly right): a point
// on the visible hemisphere is lit if it faces the phase's implied light direction. theta=0 -> new
// moon (light from directly behind, as seen by us), theta=PI -> full (light from directly in front).
function buildMoonPhaseCanvas(phase01){
  const S = moonBaseCanvas.width;
  const canvas = document.createElement('canvas');
  canvas.width=S; canvas.height=S;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(S,S);
  const theta = phase01*Math.PI*2;
  const sinT = Math.sin(theta), cosT = Math.cos(theta);
  const cx=S/2, cy=S/2, r=S/2-1;
  const base = moonBaseImageData.data;
  for(let y=0;y<S;y++){
    for(let x=0;x<S;x++){
      const i=(y*S+x)*4;
      const nx=(x-cx)/r, ny=(y-cy)/r;
      const d2=nx*nx+ny*ny;
      if(d2>1){ out.data[i+3]=0; continue; }
      const nz = Math.sqrt(1-d2);
      const lit = (nx*sinT - nz*cosT) > 0;
      let br=base[i], bg=base[i+1], bb=base[i+2];
      if(!lit){ br*=0.12; bg*=0.12; bb*=0.18; }
      out.data[i]=br; out.data[i+1]=bg; out.data[i+2]=bb; out.data[i+3]=base[i+3];
    }
  }
  ctx.putImageData(out,0,0);
  return canvas;
}
function currentMoonPhase(){
  // 0 = new, 0.5 = full, cyclical. CALENDAR_EPOCH_MS is anchored to a full moon (see the calendar
  // section above), so phase = 0.5 exactly at that instant, moving in real elapsed days regardless
  // of the game's own compressed day/night or calendar speed.
  const elapsedDays = (Date.now() - CALENDAR_EPOCH_MS) / 86400000;
  let f = (0.5 + elapsedDays / SYNODIC_MONTH_DAYS) % 1;
  if(f < 0) f += 1;
  return f;
}
function buildCelestialBodies(){
  const sunTex = buildGlowSpriteTexture([[0,'rgba(255,255,230,1)'],[0.5,'rgba(255,235,150,0.95)'],[1,'rgba(255,200,80,0)']]);
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:sunTex, transparent:true, depthWrite:false, depthTest:false }));
  sunSprite.scale.set(28,28,1);
  sunSprite.renderOrder = -1;
  scene.add(sunSprite);

  moonBaseCanvas = buildMoonBaseCanvas();
  moonBaseImageData = moonBaseCanvas.getContext('2d').getImageData(0,0,moonBaseCanvas.width,moonBaseCanvas.height);
  const moonMat = new THREE.SpriteMaterial({ transparent:true, depthWrite:false, depthTest:false });
  moonSprite = new THREE.Sprite(moonMat);
  moonSprite.scale.set(20,20,1);
  moonSprite.renderOrder = -1;
  scene.add(moonSprite);
}
// +X is East, -X is West (matching the usual Minecraft-style convention) — both bodies ride a single
// vertical east-west plane through the player rather than a full horizontal circle, so "rise due east,
// climb overhead, set due west" is actually true instead of the sun also drifting through a third,
// unlabeled compass point at solar noon.
function updateCelestialBodies(dayTime){
  const theta = dayTime*Math.PI*2;
  const sunHeight = -Math.cos(theta); // unclamped: true rise/set through the horizon
  const sunX = Math.sin(theta);       // +1 (east) at sunrise, 0 (overhead) at noon, -1 (west) at sunset
  sunSprite.position.set(player.pos.x+sunX*SUN_ORBIT_R, player.pos.y+sunHeight*SUN_ORBIT_R*0.6+20, player.pos.z);
  sunSprite.visible = sunHeight > -0.06;

  // The moon sits opposite the sun (rises as the sun sets) and its own arc uses the same sunHeight
  // shape mirrored, so it's up for the night half of the cycle and below the horizon during the day.
  // Negating sunX doesn't reverse its direction of travel — it's the same east-west sine curve, just
  // running exactly half a cycle out of phase — so the moon crosses east-to-west too, same as the sun.
  const moonHeight = -sunHeight;
  const moonX = -sunX;
  moonSprite.position.set(player.pos.x+moonX*SUN_ORBIT_R, player.pos.y+moonHeight*SUN_ORBIT_R*0.6+20, player.pos.z);
  moonSprite.visible = moonHeight > -0.06;

  const phase = currentMoonPhase();
  const phaseKey = Math.round(phase*100); // real lunar month is ~29.5 days — no need to redraw often
  if(phaseKey !== lastMoonPhaseKey){
    lastMoonPhaseKey = phaseKey;
    if(moonSprite.material.map) moonSprite.material.map.dispose();
    moonPhaseCanvas = buildMoonPhaseCanvas(phase);
    const tex = new THREE.CanvasTexture(moonPhaseCanvas);
    moonSprite.material.map = tex;
    moonSprite.material.needsUpdate = true;
  }

  // Keep the sun (and its shadow) at the same angle/height, but centered on the player instead of
  // the world origin, so the shadow camera's small frustum always covers the ground right around you.
  sunLight.position.set(player.pos.x+sunX*SUN_ORBIT_R, Math.max(5, sunHeight*SUN_ORBIT_R*0.6+40), player.pos.z);
  sunLight.target.position.set(player.pos.x, player.pos.y, player.pos.z);
}

let lastWorldTimeLabel = null, lastDateLabel = null;
function updateDayNight(){
  const dayTime = currentDayTime();
  const totalMinutes = Math.floor(dayTime*24*60) % (24*60);
  const timeText = String(Math.floor(totalMinutes/60)).padStart(2,'0')+':'+String(totalMinutes%60).padStart(2,'0');
  if(timeText !== lastWorldTimeLabel){
    lastWorldTimeLabel = timeText;
    const el = document.getElementById('worldTimeLabel');
    if(el) el.textContent = timeText;
  }
  const { year, month, day } = currentCalendarDate();
  const dateText = `${month} ${day}, Y${year}`;
  if(dateText !== lastDateLabel){
    lastDateLabel = dateText;
    const el = document.getElementById('dateLabel');
    if(el) el.textContent = dateText;
  }
  let k0 = DAY_KEYFRAMES[0], k1 = DAY_KEYFRAMES[DAY_KEYFRAMES.length-1];
  for(let i=0;i<DAY_KEYFRAMES.length-1;i++){
    if(dayTime>=DAY_KEYFRAMES[i].t && dayTime<=DAY_KEYFRAMES[i+1].t){ k0=DAY_KEYFRAMES[i]; k1=DAY_KEYFRAMES[i+1]; break; }
  }
  const span = k1.t-k0.t;
  const lt = span>0 ? (dayTime-k0.t)/span : 0;
  const skyColor = lerpColorHex(k0.sky, k1.sky, lt);
  scene.background.setHex(skyColor);
  scene.fog.color.setHex(skyColor);
  hemiLight.intensity = k0.hemi + (k1.hemi-k0.hemi)*lt;
  sunLight.intensity = k0.sunI + (k1.sunI-k0.sunI)*lt;
  sunLight.color.setHex(lerpColorHex(k0.sunC, k1.sunC, lt));
  updateCelestialBodies(dayTime);
}

// ---------- Weather ----------
// Like the day/night cycle, weather is derived straight from the wall clock — no syncing needed,
// everyone in the shared world sees the same weather at the same time automatically.
const WEATHER_PERIOD_S = 1200;     // how long one weather episode lasts (20 min)
const WEATHER_TRANSITION_S = 90;   // how long it takes to blend into a freshly-rolled episode (1.5 min)
const WEATHER_TYPES = [
  // cumulative selection order matters only in that it's applied consistently; percentages per the spec
  // chillF: how many degrees this weather knocks off the temperature (see currentTemperatureF) —
  // wetter/stormier weather runs colder, on top of whatever season/time-of-day already has it at.
  { id:'sunny',        p:0.50, fogMul:1.00, darken:0.00, rain:0.0,  thunder:false, chillF:0,  label:'Sunny' },
  { id:'cloudy',       p:0.15, fogMul:0.80, darken:0.28, rain:0.0,  thunder:false, chillF:2,  label:'Cloudy' },
  { id:'rainy',        p:0.20, fogMul:0.55, darken:0.42, rain:0.5,  thunder:false, chillF:6,  label:'Rainy' },
  { id:'rainstorm',    p:0.10, fogMul:0.40, darken:0.55, rain:1.0,  thunder:false, chillF:10, label:'Rainstorm' },
  { id:'thunderstorm', p:0.05, fogMul:0.30, darken:0.68, rain:1.5,  thunder:true,  chillF:14, label:'Heavy Thunderstorm' },
];
function weatherHash(n){
  const s = Math.sin(n*12.9898 + SEED*0.0007)*43758.5453123;
  return s - Math.floor(s);
}
function weatherForEpoch(epoch){
  const r = weatherHash(epoch);
  let cum = 0;
  for(const w of WEATHER_TYPES){ cum += w.p; if(r<cum) return w; }
  return WEATHER_TYPES[0];
}
function currentWeatherBlend(){
  const t = Date.now()/1000;
  const epoch = Math.floor(t/WEATHER_PERIOD_S);
  const into = t - epoch*WEATHER_PERIOD_S;
  const to = weatherForEpoch(epoch);
  if(into < WEATHER_TRANSITION_S){
    const from = weatherForEpoch(epoch-1);
    return { from, to, lt: into/WEATHER_TRANSITION_S };
  }
  return { from: to, to, lt: 1 };
}
function lerp(a,b,t){ return a+(b-a)*t; }

// ---------- Seasons & temperature ----------
// Same wall-clock philosophy as day/night and weather — no state to save, everyone's always in
// sync. A year is 4 seasons of 3 real hours each (12h/year); temperature is that season's average,
// swung warmer at noon / colder at midnight by a cosine curve, plus a small organic wobble so it's
// never exactly the same twice. Being outdoors (no roof, cave ceiling, or tree canopy overhead —
// reusing the same sky-exposure idea the indoor-lighting fix uses) in genuinely dangerous heat or
// cold drains HP faster than standing still can regenerate it.
const SEASON_LENGTH_S = 3*3600;
const YEAR_LENGTH_S = 4*SEASON_LENGTH_S;
const SEASON_TRANSITION_S = 900; // 15 min blend into a freshly-arrived season
const SEASONS = [
  { id:'spring', label:'Spring', avgF:50 },
  { id:'summer', label:'Summer', avgF:90 },
  { id:'fall',   label:'Fall',   avgF:50 },
  { id:'winter', label:'Winter', avgF:20 },
];
const DAILY_TEMP_SWING_F = 18; // +/- this many degrees between noon and midnight
// Two danger tiers per direction: past DANGER_F you lose HP slowly, past the more extreme SUPER_F
// you lose it rapidly — both a higher per-tick amount and a shorter tick interval.
const COLD_DANGER_F = 20, COLD_SUPER_F = 0;
const HOT_DANGER_F = 105, HOT_SUPER_F = 110;
const TEMP_DAMAGE_TICK_S = 4, TEMP_DAMAGE_TICK_SUPER_S = 2;
const TEMP_DAMAGE_MILD = 1, TEMP_DAMAGE_SUPER = 4;
function currentSeasonBlend(){
  const t = Date.now()/1000;
  const yearT = ((t % YEAR_LENGTH_S) + YEAR_LENGTH_S) % YEAR_LENGTH_S;
  const idx = Math.floor(yearT / SEASON_LENGTH_S);
  const into = yearT - idx*SEASON_LENGTH_S;
  const to = SEASONS[idx];
  if(into < SEASON_TRANSITION_S){
    const from = SEASONS[(idx-1+4)%4];
    return { from, to, lt: into/SEASON_TRANSITION_S };
  }
  return { from: to, to, lt: 1 };
}
function currentTemperatureF(){
  const t = Date.now()/1000;
  const { from, to, lt } = currentSeasonBlend();
  const avgF = lerp(from.avgF, to.avgF, lt);
  const dayTime = currentDayTime();
  const dailyOffset = DAILY_TEMP_SWING_F * Math.cos((dayTime-0.5)*Math.PI*2);
  const noise = (smoothNoise01(t*0.05, 91)*2-1) * 4;
  const wb = currentWeatherBlend();
  const chillF = lerp(wb.from.chillF, wb.to.chillF, wb.lt);
  return avgF + dailyOffset + noise - chillF;
}
// Straight-up sky check from an arbitrary live position (the player), as opposed to
// computeSkyExposure() which is baked per-column into chunk mesh vertex colors at build time.
function isPositionSkyExposed(x,y,z){
  const bx=Math.floor(x), bz=Math.floor(z);
  for(let cy=Math.floor(y)+1; cy<WORLD_HEIGHT; cy++){
    const b = getBlock(bx,cy,bz);
    if(b!==AIR && !SKY_PASS_BLOCKS.has(b)) return false;
  }
  return true;
}
let tempDamageTimer = TEMP_DAMAGE_TICK_S;
let lastSeasonLabel = null;
function updateTemperature(dt){
  const { to } = currentSeasonBlend();
  const tempF = currentTemperatureF();
  const outdoors = isPositionSkyExposed(player.pos.x, player.pos.y+player.eye, player.pos.z);
  let danger = null, severe = false;
  if(tempF < COLD_DANGER_F){ danger = 'cold'; severe = tempF < COLD_SUPER_F; }
  else if(tempF > HOT_DANGER_F){ danger = 'hot'; severe = tempF > HOT_SUPER_F; }
  const inPeril = danger && outdoors && locked && !isDead;

  if(to.label !== lastSeasonLabel){
    lastSeasonLabel = to.label;
    const el = document.getElementById('seasonLabel');
    if(el) el.textContent = to.label;
  }
  const tempEl = document.getElementById('tempLabel');
  if(tempEl){
    let text = `${Math.round(tempF)}°F`;
    if(inPeril){
      if(danger==='cold') text += severe ? ' ❄ Severe Frostbite!' : ' ❄ Freezing!';
      else text += severe ? ' 🔥 Heatstroke!' : ' 🔥 Overheating!';
    }
    tempEl.textContent = text;
    tempEl.classList.toggle('danger', !!inPeril);
  }

  tempDamageTimer -= dt;
  if(tempDamageTimer<=0){
    if(inPeril){
      tempDamageTimer = severe ? TEMP_DAMAGE_TICK_SUPER_S : TEMP_DAMAGE_TICK_S;
      damagePlayer(severe ? TEMP_DAMAGE_SUPER : TEMP_DAMAGE_MILD, 'temperature');
    } else {
      tempDamageTimer = TEMP_DAMAGE_TICK_S;
    }
  }
}

let hungerDecayTimer = HUNGER_DECAY_INTERVAL_S, starveDamageTimer = STARVE_DAMAGE_TICK_S;
function updateHunger(dt){
  if(!locked || isDead) return;
  hungerDecayTimer -= dt;
  if(hungerDecayTimer<=0){
    hungerDecayTimer = HUNGER_DECAY_INTERVAL_S;
    if(myHunger>0){ myHunger--; updateHungerUI(); }
  }
  starveDamageTimer -= dt;
  if(starveDamageTimer<=0){
    starveDamageTimer = STARVE_DAMAGE_TICK_S;
    if(myHunger<=0) damagePlayer(STARVE_DAMAGE, 'hunger');
  }
}

// ---------- Wind ----------
// Same philosophy as day/night and weather: derived purely from the wall clock, so it's random
// (nobody chose it) but perfectly in sync for every player with no networking at all. Strength is a
// smooth, organic-looking signal built from a few sine waves at unrelated frequencies (a cheap stand-
// in for real noise) — a slow-moving base plus a faster gust layer — biased by the current weather
// (storms are windier than a clear sky on average) and clamped to [0,1] (calm to a full gale).
const WIND_DIR_PERIOD_S = 900; // wind direction slowly drifts all the way around every 15 min
const WEATHER_WIND_BIAS = { sunny:0.7, cloudy:0.95, rainy:1.15, rainstorm:1.5, thunderstorm:1.8 };
const WIND_LEVELS = [
  { max:0.12, label:'Calm' },
  { max:0.32, label:'Light breeze' },
  { max:0.55, label:'Breezy' },
  { max:0.78, label:'Strong wind' },
  { max:Infinity, label:'Very strong wind' },
];
function smoothNoise01(t, seed){
  return 0.5 + 0.28*Math.sin(t*0.0173 + seed*1.7)
             + 0.15*Math.sin(t*0.0071 + seed*3.1)
             + 0.07*Math.sin(t*0.0311 + seed*5.9);
}
function windLabel(strength){
  for(const lvl of WIND_LEVELS) if(strength<=lvl.max) return lvl.label;
  return WIND_LEVELS[WIND_LEVELS.length-1].label;
}
function currentWind(){
  const t = Date.now()/1000;
  const { from, to, lt } = currentWeatherBlend();
  const biasFrom = WEATHER_WIND_BIAS[from.id]!=null ? WEATHER_WIND_BIAS[from.id] : 1;
  const biasTo = WEATHER_WIND_BIAS[to.id]!=null ? WEATHER_WIND_BIAS[to.id] : 1;
  const bias = lerp(biasFrom, biasTo, lt);
  const base = smoothNoise01(t, 11);
  const gust = smoothNoise01(t*7, 29);
  const strength = Math.max(0, Math.min(1, (base*0.7 + gust*0.3) * bias));
  const angle = (t/WIND_DIR_PERIOD_S)*Math.PI*2 + (smoothNoise01(t*0.4, 53)-0.5)*1.2;
  return { strength, angle };
}

let rainGeo, rainMat, rainPoints, rainVelocities;
const RAIN_COUNT = 700;
function ensureRain(){
  if(rainPoints) return;
  rainGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(RAIN_COUNT*3);
  rainVelocities = new Float32Array(RAIN_COUNT);
  for(let i=0;i<RAIN_COUNT;i++){
    positions[i*3+1] = -9999;
    rainVelocities[i] = 20 + Math.random()*10;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  rainMat = new THREE.PointsMaterial({ color:0xaad0f5, size:0.12, transparent:true, opacity:0.55, depthWrite:false });
  rainPoints = new THREE.Points(rainGeo, rainMat);
  rainPoints.frustumCulled = false;
  scene.add(rainPoints);
}
const MAX_RAIN_DRIFT = 7; // sideways speed (units/s) rain drifts at full wind strength
function updateRain(dt, intensity, wind){
  if(intensity<=0){ if(rainPoints) rainPoints.visible=false; return; }
  ensureRain();
  rainPoints.visible = true;
  const positions = rainGeo.attributes.position.array;
  const activeCount = Math.min(RAIN_COUNT, Math.round(RAIN_COUNT * Math.min(1, intensity)));
  const cx=player.pos.x, cy=player.pos.y, cz=player.pos.z;
  const windSpeed = (wind ? wind.strength : 0) * MAX_RAIN_DRIFT;
  const windDx = wind ? Math.cos(wind.angle)*windSpeed : 0;
  const windDz = wind ? Math.sin(wind.angle)*windSpeed : 0;
  for(let i=0;i<RAIN_COUNT;i++){
    if(i>=activeCount){ positions[i*3+1] = -9999; continue; }
    let y = positions[i*3+1];
    if(y < cy-2){
      positions[i*3] = cx + (Math.random()*2-1)*22;
      positions[i*3+1] = cy + 14 + Math.random()*8;
      positions[i*3+2] = cz + (Math.random()*2-1)*22;
    } else {
      positions[i*3+1] = y - rainVelocities[i]*dt;
      positions[i*3] += windDx*dt;
      positions[i*3+2] += windDz*dt;
    }
  }
  rainGeo.attributes.position.needsUpdate = true;
}
let rainSoundTimer = 0, lightningTimer = 8+Math.random()*8, windSoundTimer = 3+Math.random()*4;
let lastWeatherLabel = null, lastWindLabel = null;
function updateWeather(dt){
  const { from, to, lt } = currentWeatherBlend();
  const fogMul = lerp(from.fogMul, to.fogMul, lt);
  const darken = lerp(from.darken, to.darken, lt);
  const rain = lerp(from.rain, to.rain, lt);
  const thunderActive = lt>0.5 ? to.thunder : from.thunder;

  scene.fog.near = FAR*0.35*fogMul;
  scene.fog.far = FAR*fogMul;
  if(darken>0){
    const grayHex = lerpColorHex(scene.background.getHex(), 0x30363d, darken);
    scene.background.setHex(grayHex);
    scene.fog.color.setHex(grayHex);
  }
  hemiLight.intensity *= (1 - darken*0.6);
  sunLight.intensity *= (1 - darken*0.7);

  const wind = currentWind();
  updateRain(dt, rain, wind);

  if(rain>0 && locked){
    rainSoundTimer -= dt;
    if(rainSoundTimer<=0){
      rainSoundTimer = 0.07 + Math.random()*0.11;
      SFX.rainPatter(Math.min(0.08, 0.02 + rain*0.035));
    }
  }
  if(thunderActive && locked){
    lightningTimer -= dt;
    if(lightningTimer<=0){
      lightningTimer = 6 + Math.random()*14;
      triggerLightning();
    }
  }
  if(wind.strength>0.12 && locked){
    windSoundTimer -= dt;
    if(windSoundTimer<=0){
      windSoundTimer = 2.5 + Math.random()*2.5;
      SFX.windGust(Math.min(0.16, wind.strength*0.14), 900+wind.strength*1400);
    }
  }

  const label = to.label;
  if(label !== lastWeatherLabel){
    lastWeatherLabel = label;
    const el = document.getElementById('weatherLabel');
    if(el) el.textContent = label;
  }
  const windText = windLabel(wind.strength);
  if(windText !== lastWindLabel){
    lastWindLabel = windText;
    const el = document.getElementById('windLabel');
    if(el) el.textContent = windText;
  }
}
function triggerLightning(){
  const el = document.getElementById('lightningFlash');
  if(el){
    el.style.transition = 'none';
    el.style.opacity = '0.85';
    requestAnimationFrame(()=>{
      el.style.transition = 'opacity 0.6s ease-out';
      el.style.opacity = '0';
    });
  }
  setTimeout(()=> SFX.thunder(), 300+Math.random()*1200);
}

// ---------- Fireflies: small glowing ambiance, only out after dark ----------
// A fixed pool that's always recycled to wherever the player currently is (same trick as rain),
// so there's always a scattering of them nearby instead of only near world origin. Each blinks on
// an independent cycle (a sine wave raised to a power, so it snaps into short bright pulses with
// long dark gaps rather than smoothly breathing) and drifts lazily around its own "home" spot.
const FIREFLY_COUNT = 26;
const FIREFLY_RADIUS = 22; // recycle a firefly's home once it's this far (in x/z) from the player
let fireflyGlowTexture = null;
function buildFireflyGlowTexture(){
  const S = 32;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(S/2,S/2,0, S/2,S/2,S/2);
  grad.addColorStop(0, 'rgba(255,255,210,1)');
  grad.addColorStop(0.35, 'rgba(215,255,140,0.9)');
  grad.addColorStop(1, 'rgba(215,255,140,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,S,S);
  return new THREE.CanvasTexture(canvas);
}
const fireflies = [];
function spawnFireflyHome(f){
  let x,z,gy,tries=0;
  do{
    const ang = Math.random()*Math.PI*2, r = 6+Math.random()*16;
    x = player.pos.x + Math.cos(ang)*r;
    z = player.pos.z + Math.sin(ang)*r;
    gy = heightAt(Math.floor(x), Math.floor(z));
    tries++;
  } while(gy<=SEA_LEVEL && tries<8); // steer away from open water where reasonably possible
  f.homeX = x; f.homeZ = z;
  f.baseY = gy + 1.2 + Math.random()*1.6;
}
function ensureFireflies(){
  if(fireflies.length) return;
  if(!fireflyGlowTexture) fireflyGlowTexture = buildFireflyGlowTexture();
  for(let i=0;i<FIREFLY_COUNT;i++){
    const mat = new THREE.SpriteMaterial({ map:fireflyGlowTexture, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.45,0.45,1);
    scene.add(sprite);
    const light = new THREE.PointLight(0xccff66, 0, 3.5, 2);
    scene.add(light);
    const f = {
      sprite, light, homeX:0, homeZ:0, baseY:0,
      freqX: 0.2+Math.random()*0.3, freqY: 0.3+Math.random()*0.4, freqZ: 0.2+Math.random()*0.3,
      ampXZ: 1.2+Math.random()*1.8, ampY: 0.5+Math.random()*0.7, phase: Math.random()*Math.PI*2,
      blinkSpeed: 1.2+Math.random()*1.6, blinkPhase: Math.random()*Math.PI*2,
    };
    spawnFireflyHome(f);
    fireflies.push(f);
  }
}
// 1 through the heart of the night, fading out around dawn and back in around dusk, 0 all day —
// mirrors the sunrise/sunset windows in DAY_KEYFRAMES above (~0.20-0.32 and ~0.68-0.80).
function fireflyNightFactor(){
  const t = currentDayTime();
  if(t>=0.80 || t<0.20) return 1;
  if(t<0.32) return Math.max(0, 1-(t-0.20)/0.12);
  if(t>=0.68) return Math.max(0, (t-0.68)/0.12);
  return 0;
}
function updateFireflies(dt){
  ensureFireflies();
  const night = fireflyNightFactor();
  const t = performance.now()/1000;
  for(const f of fireflies){
    const dx = f.homeX-player.pos.x, dz = f.homeZ-player.pos.z;
    if(dx*dx+dz*dz > FIREFLY_RADIUS*FIREFLY_RADIUS) spawnFireflyHome(f);
    const x = f.homeX + Math.sin(t*f.freqX+f.phase)*f.ampXZ;
    const z = f.homeZ + Math.cos(t*f.freqZ+f.phase*1.3)*f.ampXZ;
    const y = f.baseY + Math.sin(t*f.freqY+f.phase*0.7)*f.ampY;
    f.sprite.position.set(x,y,z);
    f.light.position.set(x,y,z);
    const blink = Math.pow(Math.max(0, Math.sin(t*f.blinkSpeed+f.blinkPhase)), 4);
    const vis = blink*night;
    f.sprite.material.opacity = vis*0.9;
    f.light.intensity = vis*0.9;
  }
}

// ---------- Worms: slowly eat tree leaves, breed, turn into butterflies, and can be burned to death ----------
// A single worm spawns on the world's trees the first time anyone loads a world. Every 0.4 in-game
// hours (Blockcraft's clock, not the wall clock — DAY_LENGTH_S real seconds is a full 24-hour
// in-game day, so this works out to DAY_LENGTH_S/60 real seconds) each worm eats the nearest leaf
// block within reach (a genuine world edit — synced/persisted like any other block change, so
// everyone sees the same tree thin out); every 1 in-game hour (DAY_LENGTH_S/24 real seconds) it has
// 2 children nearby. Population is capped so an unattended world can't grow it forever. Standing in
// an active fire cell kills it instantly, same "you're in the fire" test the fire-damage tick
// already uses for animals/players. Once a worm has personally eaten WORM_BUTTERFLY_THRESHOLD leaves
// over its lifetime, it metamorphoses into a butterfly right where it's standing (see the Butterflies
// section below) instead of continuing to eat/reproduce as a worm.
// Unlike fireflies/the ghost, worms themselves ARE synced — under 'world/worms/<id>' — precisely so
// their eat/reproduce timers survive a reload: without persistence every page load reset every timer
// to "now", so a single continuously-open tab was the only way either interval could ever actually
// fire. Each worm's existence, position, both timestamps, and its running eaten-leaves count live in
// Firebase (with the timestamp fields written as firebase.database.ServerValue.TIMESTAMP so clocks
// don't need to agree); every connected client mirrors the same set of worms and independently runs
// the eat/reproduce checks against those shared timestamps, same client-authoritative, no-transactions
// approach already used for block edits/saplings/fires elsewhere in this file. In solo/offline play
// (no Firebase), worms fall back to the old purely-local, resets-on-reload behavior.
const WORM_EAT_INTERVAL_MS = DAY_LENGTH_S*1000 * (2/24) / 5; // one leaf block every 0.4 in-game hours (5x the original 2)
const WORM_REPRODUCE_INTERVAL_MS = DAY_LENGTH_S*1000 * (1/24); // 2 children every 1 in-game hour
const WORM_CHILDREN_PER_REPRODUCE = 2;
const WORM_MAX_POPULATION = 100;
const WORM_SEARCH_RADIUS = 6;
const WORM_BUTTERFLY_THRESHOLD = 100; // leaves eaten (lifetime) before a worm becomes a butterfly
// A worm needs real physical support underneath it — it lives either nested inside a leaf cell (the
// same spot the eat cycle above teleports it into, which is also exactly the leaf it just bit into,
// so eating routinely leaves it standing on thin air) or resting on solid ground. If neither is true —
// its leaf got eaten out from under it, a baby spawned at an offset with nothing there, or its tree
// got chopped down — it falls straight down like anything else in this world, lands on the ground,
// and then wanders in search of the nearest tree to climb back into (the existing eat cycle, once a
// leaf comes within its normal WORM_SEARCH_RADIUS, does the actual "climbing back in").
const WORM_FALL_SPEED = 3;               // blocks/sec while falling
const WORM_GROUND_SEARCH_RADIUS = 12;    // how far a grounded worm looks for a tree to head toward
const WORM_GROUND_SEARCH_INTERVAL_S = 3; // how often a grounded worm re-checks for one
const WORM_WALK_SPEED = 0.5;             // slow crawl while searching on open ground
const worms = [];
let wormGeo, wormMat;
// Returns the worm's settled y if (x,y,z) is currently supported — nested inside a leaf cell, or
// resting on solid ground directly beneath it — or null if there's nothing holding it up.
function wormRestY(x,y,z){
  const bx=Math.floor(x), by=Math.floor(y), bz=Math.floor(z);
  if(getBlock(bx,by,bz)===LEAVES) return by+0.25;
  if(blockSolid(bx,by-1,bz)) return by+0.1;
  return null;
}
function findNearestLeaf(cx,cy,cz,radius){
  let best=null, bestD2=Infinity;
  const r = Math.ceil(radius), r2 = radius*radius;
  const bx=Math.floor(cx), by=Math.floor(cy), bz=Math.floor(cz);
  for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++) for(let dz=-r;dz<=r;dz++){
    const d2 = dx*dx+dy*dy+dz*dz;
    if(d2>r2 || d2>=bestD2) continue;
    const x=bx+dx, y=by+dy, z=bz+dz;
    if(getBlock(x,y,z)===LEAVES){ best={x,y,z}; bestD2=d2; }
  }
  return best;
}
function findInitialWormSpot(){
  for(let tries=0; tries<200; tries++){
    const x = 4+Math.floor(Math.random()*(WORLD_SIZE-8));
    const z = 4+Math.floor(Math.random()*(WORLD_SIZE-8));
    const h = heightAt(x,z);
    for(let y=h; y<h+10 && y<WORLD_HEIGHT; y++){
      if(getBlock(x,y,z)===LEAVES) return {x,y,z};
    }
  }
  return null;
}
// Adds a worm to the local scene/array only — does not touch Firebase. Used both for genuinely new
// worms (via createWorm, below) and to materialize a worm mirrored in from a remote 'child_added'.
function spawnWorm(id,x,y,z,lastAteAt,lastReproducedAt,eatenCount){
  if(worms.length>=WORM_MAX_POPULATION || worms.some(w=>w.id===id)) return null;
  if(!wormGeo){
    wormGeo = new THREE.SphereGeometry(0.16,6,6);
    wormMat = new THREE.MeshLambertMaterial({ color: 0xc98a6b });
  }
  const mesh = new THREE.Mesh(wormGeo, wormMat);
  mesh.scale.set(1, 0.55, 2.4);
  mesh.position.set(x+0.5, y+0.25, z+0.5);
  scene.add(mesh);
  const w = {
    id, mesh, x:x+0.5, y:y+0.25, z:z+0.5,
    lastAteAt, lastReproducedAt, eatenCount: eatenCount||0, phase: Math.random()*Math.PI*2,
  };
  worms.push(w);
  return w;
}
// Spawns a brand-new worm (initial spawn or reproduction): adds it locally AND, when online, writes
// it to Firebase so every other client picks it up via the 'child_added' listener in initMultiplayer.
function createWorm(x,y,z){
  if(worms.length>=WORM_MAX_POPULATION) return null;
  const now = Date.now();
  const id = fbReady ? db.ref('world/worms').push().key : ('local_'+Math.random().toString(36).slice(2,10));
  const w = spawnWorm(id,x,y,z,now,now,0);
  if(w && fbReady){
    db.ref('world/worms/'+id).set({
      x, y, z, eatenCount: 0,
      lastAteAt: firebase.database.ServerValue.TIMESTAMP,
      lastReproducedAt: firebase.database.ServerValue.TIMESTAMP,
    });
  }
  return w;
}
function killWorm(w, reason){
  scene.remove(w.mesh);
  const i = worms.indexOf(w);
  if(i>=0) worms.splice(i,1);
  if(reason==='squashed'){
    // Only the player directly squashing a worm awards meat — burning, aging into a butterfly, a
    // bird eating it, or a remote deletion syncing in from another client never do.
    invAdd(MEAT, MEAT_YIELD.worm || 1);
    saveInventory();
    updateHotbarUI();
    SFX.animalDeath();
  }
  if(reason!=='remote' && fbReady) db.ref('world/worms/'+w.id).remove();
}
function updateWorms(dt){
  const now = Date.now();
  const t = performance.now()/1000;
  for(const w of Array.from(worms)){
    let burned = false;
    for(const key of fires.keys()){
      const [fx,fy,fz] = key.split(',').map(Number);
      if(Math.floor(w.x)===fx && Math.floor(w.y)===fy && Math.floor(w.z)===fz){ burned = true; break; }
    }
    if(burned){ killWorm(w, 'burned'); continue; }

    // Squash worm if player steps on it
    const dx = w.x - player.pos.x, dz = w.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if(dist<0.4 && player.pos.y<=w.y && player.pos.y+player.height>=w.y){
      killWorm(w, 'squashed');
      continue;
    }

    // Physical support: fall if there's nothing beneath (its leaf just got eaten, its tree got
    // chopped, or it spawned at an offset with nothing there), then hunt for a tree once grounded.
    let falling = false;
    const restY = wormRestY(w.x, w.y, w.z);
    if(restY===null){
      falling = true;
      w.y -= WORM_FALL_SPEED*dt;
      const landedY = wormRestY(w.x, w.y, w.z);
      if(landedY!==null){ w.y = landedY; falling = false; }
    } else {
      w.y = restY;
    }

    if(!falling && getBlock(Math.floor(w.x), Math.floor(w.y), Math.floor(w.z))!==LEAVES){
      // Grounded but not on a tree — periodically look for one and slowly crawl toward it.
      w.groundSearchTimer = (w.groundSearchTimer||0) - dt;
      if(w.groundSearchTimer<=0){
        w.groundSearchTimer = WORM_GROUND_SEARCH_INTERVAL_S + Math.random();
        const leaf = findNearestLeaf(w.x, w.y, w.z, WORM_GROUND_SEARCH_RADIUS);
        if(leaf){ w.wanderX = leaf.x+0.5; w.wanderZ = leaf.z+0.5; }
        else { const ang = Math.random()*Math.PI*2; w.wanderX = w.x+Math.cos(ang)*4; w.wanderZ = w.z+Math.sin(ang)*4; }
      }
      if(w.wanderX!=null){
        const wdx = w.wanderX-w.x, wdz = w.wanderZ-w.z, wd = Math.hypot(wdx,wdz);
        if(wd>0.2){
          const step = Math.min(WORM_WALK_SPEED*dt, wd);
          w.x += wdx/wd*step; w.z += wdz/wd*step;
        }
      }
    }

    if(falling){
      w.mesh.position.set(w.x, w.y, w.z);
      continue; // skip eating/reproducing while it's still falling
    }

    if(now - w.lastAteAt >= WORM_EAT_INTERVAL_MS){
      w.lastAteAt = now;
      const leaf = findNearestLeaf(w.x, w.y, w.z, WORM_SEARCH_RADIUS);
      if(leaf){
        applyWorldEdit(leaf.x, leaf.y, leaf.z, AIR, false);
        w.x = leaf.x+0.5; w.y = leaf.y+0.25; w.z = leaf.z+0.5;
        w.eatenCount++;
      }
      if(fbReady){
        const update = { lastAteAt: firebase.database.ServerValue.TIMESTAMP };
        if(leaf){ update.x = leaf.x; update.y = leaf.y; update.z = leaf.z; update.eatenCount = w.eatenCount; }
        db.ref('world/worms/'+w.id).update(update);
      }
      if(w.eatenCount>=WORM_BUTTERFLY_THRESHOLD){
        const bx=Math.floor(w.x), by=Math.floor(w.y), bz=Math.floor(w.z);
        killWorm(w, 'butterfly');
        createButterfly(bx,by,bz);
        continue;
      }
    }
    if(now - w.lastReproducedAt >= WORM_REPRODUCE_INTERVAL_MS){
      w.lastReproducedAt = now;
      if(fbReady) db.ref('world/worms/'+w.id+'/lastReproducedAt').set(firebase.database.ServerValue.TIMESTAMP);
      if(worms.length<WORM_MAX_POPULATION){
        for(let i=0;i<WORM_CHILDREN_PER_REPRODUCE;i++){
          createWorm(Math.floor(w.x)+(Math.random()<0.5?-1:1), Math.floor(w.y), Math.floor(w.z)+(Math.random()<0.5?-1:1));
        }
      }
    }
    w.mesh.position.set(w.x, w.y + Math.sin(t*1.5+w.phase)*0.04, w.z);
    w.mesh.rotation.y = Math.sin(t*0.3+w.phase)*0.6;
  }
}

// ---------- Gophers: dig tunnels underground ----------
// Gophers spawn underground and slowly dig tunnels through dirt, creating passages large enough
// for the player to crawl through (2 blocks wide, 2 blocks high).
const GOPHER_COUNT = 4;
const GOPHER_RADIUS = 40; // recycle a gopher's home once it's this far from player
const gophers = [];
function buildGopherMesh(){
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x7a6a5a });
  // Simple gopher body: rounded mound shape
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), mat);
  body.scale.set(1.2, 0.7, 1.4);
  body.castShadow = true;
  g.add(body);
  // Two small ears
  for(const side of [1,-1]){
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), mat);
    ear.position.set(side*0.2, 0.25, -0.15);
    ear.castShadow = true;
    g.add(ear);
  }
  return g;
}
function findUndergroundSpot(){
  // Find a spot 4-8 blocks underground with mostly dirt around it
  for(let tries=0; tries<40; tries++){
    const ang = Math.random()*Math.PI*2, r = 3+Math.random()*(GOPHER_RADIUS-3);
    const x = Math.floor(player.pos.x + Math.cos(ang)*r);
    const z = Math.floor(player.pos.z + Math.sin(ang)*r);
    const h = heightAt(x,z);
    const y = Math.max(3, h - 4 - Math.floor(Math.random()*4)); // 4-8 blocks below surface
    if(y<3) continue;
    // Check if there's enough dirt around
    let dirtCount = 0;
    for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) for(let dz=-1; dz<=1; dz++){
      const b = getBlock(x+dx, y+dy, z+dz);
      if(b===DIRT || b===GRASS) dirtCount++;
    }
    if(dirtCount>=15) return { x:x+0.5, y:y+0.5, z:z+0.5 };
  }
  return null;
}
function spawnGopherHome(g){
  const spot = findUndergroundSpot();
  if(!spot){ g.mesh.visible = false; return; }
  g.mesh.visible = true;
  g.homeX = spot.x; g.homeY = spot.y; g.homeZ = spot.z;
  g.digTimer = 1+Math.random()*2; // time before digging next block
}
function ensureGophers(){
  if(gophers.length) return;
  for(let i=0; i<GOPHER_COUNT; i++){
    const mesh = buildGopherMesh();
    scene.add(mesh);
    const g = {
      mesh, hp:3, maxHp:3,
      homeX:0, homeY:0, homeZ:0,
      digTimer:0, digSpeed:0.3, wanderTimer:0,
    };
    spawnGopherHome(g);
    gophers.push(g);
  }
}
function updateGophers(dt){
  ensureGophers();
  for(const g of gophers){
    if(!g.mesh.visible) spawnGopherHome(g);
    if(!g.mesh.visible) continue;

    const dx = g.homeX-player.pos.x, dz = g.homeZ-player.pos.z;
    if(dx*dx+dz*dz > GOPHER_RADIUS*GOPHER_RADIUS) spawnGopherHome(g);

    // Slow underground wandering + digging
    g.wanderTimer -= dt;
    if(g.wanderTimer<=0){
      g.wanderTimer = 2+Math.random()*3;
      // Pick a random direction to wander
      const ang = Math.random()*Math.PI*2;
      g.wanderX = Math.cos(ang)*0.5; g.wanderY = (Math.random()-0.5)*0.3; g.wanderZ = Math.sin(ang)*0.5;
    }
    g.homeX += g.wanderX*g.digSpeed*dt;
    g.homeY += g.wanderY*g.digSpeed*dt;
    g.homeZ += g.wanderZ*g.digSpeed*dt;

    g.digTimer -= dt;
    if(g.digTimer<=0){
      g.digTimer = 1+Math.random()*2;
      // Dig a small tunnel (2x2x2) around the gopher
      const cx = Math.floor(g.homeX), cy = Math.floor(g.homeY), cz = Math.floor(g.homeZ);
      for(let dy=-1; dy<=0; dy++) for(let dx=-1; dx<=0; dx++) for(let dz=-1; dz<=0; dz++){
        const x = cx+dx, y = cy+dy, z = cz+dz;
        const b = getBlock(x,y,z);
        if(b===DIRT || b===GRASS){
          applyWorldEdit(x, y, z, AIR, false);
        }
      }
    }

    g.mesh.position.set(g.homeX, g.homeY, g.homeZ);
  }
}

// ---------- Butterflies: a worm's final form ----------
// Once a worm has eaten WORM_BUTTERFLY_THRESHOLD leaves it stops being a worm and becomes a butterfly
// right where it stood — colorful, and free to roam. A butterfly's flight path is never synced frame
// by frame (that would be a firehose of writes for something purely decorative-looking); instead its
// position is a pure function of its id-derived seed and elapsed time since birth, so every connected
// client computes the exact same path independently with zero ongoing network traffic — the same
// wall-clock-derived trick already used throughout this file for the sun/moon, weather, and tree
// species. Only its existence, origin point, and birth time are ever written to Firebase, under
// 'world/butterflies/<id>'; a butterfly's own color and flight parameters are re-derived from its id
// on every client rather than stored. It roams broadly across the whole map (a slow, large-radius
// drift with a faster flutter layered on top) but stays within BUTTERFLY_WATER_RANGE blocks of
// SEA_LEVEL vertically, and dies of old age after BUTTERFLY_LIFESPAN_MS. In solo/offline play (no
// Firebase) it's still tracked locally, just not persisted, same as an offline worm.
const BUTTERFLY_LIFESPAN_MS = DAY_LENGTH_S*1000 * 30; // 30 in-game days
const BUTTERFLY_WATER_RANGE = 15; // stays within this many blocks of sea level, vertically
const butterflies = [];
function hashIdToSeed(id){
  let h=0;
  for(let i=0;i<id.length;i++) h = (h*31 + id.charCodeAt(i)) >>> 0;
  return h;
}
// Per-pixel, not canvas arcs (the ghost's tail taught that lesson) — a symmetric two-lobe-per-side
// silhouette (a bigger upper wing, a smaller lower wing) with a dark body line down the middle, plus
// scattered dark "vein" speckles and lighter accent-hue spots so each butterfly reads as genuinely
// colorful rather than a single flat tint.
function buildButterflyTexture(seed){
  const W=40, H=28;
  const canvas = document.createElement('canvas');
  canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext('2d');
  const hue = Math.floor(hash2(seed,21)*360);
  const accentHue = (hue + 30 + Math.floor(hash2(seed,22)*90)) % 360;
  const cx = W/2;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const side = Math.abs(x-cx);
      if(side<1.2 && y>1 && y<H-2){
        ctx.fillStyle = '#241a14';
        ctx.fillRect(x,y,1,1);
        continue;
      }
      const ux=(side-9)/9, uy=(y-9)/7.5;
      const inUpper = side>1.5 && side<19 && y>1 && y<17 && ux*ux+uy*uy<1;
      const lx=(side-6)/6.5, ly=(y-20)/6.5;
      const inLower = side>1.5 && side<13 && y>=15 && y<H-1 && lx*lx+ly*ly<1;
      if(!inUpper && !inLower) continue;
      const n = hash2(x*3.1+seed*0.7, y*4.3+seed*1.3);
      const dark = n<0.12;
      const spot = !dark && n>0.82;
      const h = spot?accentHue:hue;
      const light = dark?22:(spot?68:(inUpper?58:48));
      const sat = dark?35:82;
      ctx.fillStyle = `hsl(${h},${sat}%,${light}%)`;
      ctx.fillRect(x,y,1,1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
// A real 3D butterfly — not a camera-facing sprite — built the same way as the flame billboards
// (MeshBasicMaterial + alphaTest, so the transparent background cuts out cleanly instead of z-fighting,
// and DoubleSide so a paper-thin wing plane doesn't vanish from behind): two wing planes hinged on
// their own pivots either side of a thin 3D body, so they open/close in a real up-down flap and read
// as an actual silhouette from any angle, edge-on included, instead of a flat cutout that always faces
// you. Reuses buildButterflyTexture's existing per-butterfly pattern — since that canvas is already
// left/right symmetric (drawn from side=|x-center|), both wing planes just sample the same texture
// half rather than needing two separate textures.
function buildButterflyMesh(seed){
  const tex = buildButterflyTexture(seed);
  tex.repeat.set(0.5, 1);
  tex.offset.set(0.5, 0); // one full wing lobe's worth of the (symmetric) artwork
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });

  const g = new THREE.Group();
  const body = animalBox(0.035, 0.035, 0.5, new THREE.MeshBasicMaterial({ color: 0x241a14 }));
  g.add(body);

  const WING_W = 0.45, WING_H = 0.63;
  const wings = [];
  for(const side of [1,-1]){
    const pivot = new THREE.Group();
    const wingGeo = new THREE.PlaneGeometry(WING_W, WING_H);
    wingGeo.translate(side*WING_W/2, 0, 0); // inner edge at the pivot (the body's spine), not centered
    const wingMesh = new THREE.Mesh(wingGeo, mat);
    pivot.add(wingMesh);
    pivot.userData.side = side;
    g.add(pivot);
    wings.push(pivot);
  }
  g.userData.wings = wings;
  g.userData.material = mat; // single shared material/texture, disposed once in killButterfly
  return g;
}
// The x/z wander offset from wherever the butterfly was born, at a given elapsed time — split out so
// butterflyPositionAt can subtract its own t=0 value and guarantee the flight path actually starts at
// the origin point (see below) instead of teleporting to wherever a phase-shifted curve happens to be.
function butterflyWanderOffset(seed, elapsedS){
  const driftPeriodX = 30000 + hash2(seed,1)*30000, driftPeriodZ = 30000 + hash2(seed,2)*30000;
  const driftPhaseX = hash2(seed,3)*Math.PI*2, driftPhaseZ = hash2(seed,4)*Math.PI*2;
  const driftR = WORLD_SIZE*0.38;
  const flutterPeriod = 18 + hash2(seed,5)*22, flutterPhase = hash2(seed,6)*Math.PI*2;
  const flutterR = 5 + hash2(seed,7)*6;
  const dx = Math.sin(elapsedS/driftPeriodX*Math.PI*2 + driftPhaseX)*driftR
    + Math.sin(elapsedS/flutterPeriod*Math.PI*2 + flutterPhase)*flutterR;
  const dz = Math.sin(elapsedS/driftPeriodZ*Math.PI*2 + driftPhaseZ)*driftR
    + Math.cos(elapsedS/flutterPeriod*Math.PI*2*1.3 + flutterPhase)*flutterR;
  return {dx,dz};
}
// A pure function of (seed, birth point, elapsed seconds since birth) — every client computes the
// identical flight position with no network traffic. A slow Lissajous "drift" plus a faster, smaller
// "flutter" carries it away from its birth point and across most of the map over its lifetime, always
// starting exactly at (originX, originZ) at elapsedS=0 rather than jumping there from wherever the
// underlying curve happens to be; height is an independent sine wave clamped to stay within
// BUTTERFLY_WATER_RANGE of SEA_LEVEL (not anchored to the origin — it settles into that band right
// away even if the worm turned into it high up in a tall tree).
function butterflyPositionAt(seed, originX, originZ, elapsedS){
  const at0 = butterflyWanderOffset(seed, 0);
  const atT = butterflyWanderOffset(seed, elapsedS);
  const x = Math.max(1, Math.min(WORLD_SIZE-1, originX + (atT.dx-at0.dx)));
  const z = Math.max(1, Math.min(WORLD_SIZE-1, originZ + (atT.dz-at0.dz)));

  const yPeriod = 12 + hash2(seed,8)*18, yPhase = hash2(seed,9)*Math.PI*2;
  const y = Math.max(1, Math.min(WORLD_HEIGHT-1, SEA_LEVEL + Math.sin(elapsedS/yPeriod*Math.PI*2 + yPhase)*BUTTERFLY_WATER_RANGE));
  return {x,y,z};
}
// Adds a butterfly to the local scene/array only — does not touch Firebase. Used both for genuinely
// new butterflies (via createButterfly, below) and to materialize one mirrored in from a remote
// 'child_added'.
function spawnButterfly(id,x,y,z,bornAt){
  if(butterflies.some(b=>b.id===id)) return null;
  const seed = hashIdToSeed(id);
  const mesh = buildButterflyMesh(seed);
  const p = butterflyPositionAt(seed, x, z, Math.max(0,(Date.now()-bornAt)/1000));
  mesh.position.set(p.x,p.y,p.z);
  scene.add(mesh);
  const b = { id, mesh, seed, bornAt, originX:x, originZ:z };
  butterflies.push(b);
  return b;
}
// Spawns a brand-new butterfly (a worm's metamorphosis): adds it locally AND, when online, writes it
// to Firebase so every other client picks it up via the 'child_added' listener in initMultiplayer.
function createButterfly(x,y,z){
  const now = Date.now();
  const id = fbReady ? db.ref('world/butterflies').push().key : ('local_'+Math.random().toString(36).slice(2,10));
  const b = spawnButterfly(id,x,y,z,now);
  if(b && fbReady){
    db.ref('world/butterflies/'+id).set({ x, y, z, bornAt: firebase.database.ServerValue.TIMESTAMP });
  }
  return b;
}
function killButterfly(b, fromRemote){
  scene.remove(b.mesh);
  b.mesh.userData.material.map.dispose();
  b.mesh.userData.material.dispose();
  const i = butterflies.indexOf(b);
  if(i>=0) butterflies.splice(i,1);
  if(!fromRemote && fbReady) db.ref('world/butterflies/'+b.id).remove();
}
// A small time step used only to numerically estimate the flight direction (for facing yaw) from
// butterflyPositionAt's layered drift+flutter curve — safer than hand-deriving an analytic velocity
// for a function with this many mixed sin/cos terms, and cheap enough for the handful of butterflies
// that ever exist at once.
const BUTTERFLY_YAW_DT = 0.05;
function updateButterflies(dt){
  const now = Date.now();
  const t = performance.now()/1000;
  for(const b of Array.from(butterflies)){
    if(now-b.bornAt>=BUTTERFLY_LIFESPAN_MS){ killButterfly(b); continue; }
    const elapsedS = (now-b.bornAt)/1000;
    const p = butterflyPositionAt(b.seed, b.originX, b.originZ, elapsedS);
    b.mesh.position.set(p.x,p.y,p.z);

    const pNext = butterflyPositionAt(b.seed, b.originX, b.originZ, elapsedS+BUTTERFLY_YAW_DT);
    const vx = pNext.x-p.x, vz = pNext.z-p.z;
    if(vx*vx+vz*vz > 1e-8) b.mesh.rotation.y = Math.atan2(-vx,-vz);

    const flap = Math.sin(t*9+b.seed)*0.9;
    for(const wingPivot of b.mesh.userData.wings) wingPivot.rotation.z = wingPivot.userData.side*flap;
  }
}

// ---------- Ghost: a single harmless Casper who floats around at night ----------
// Solid-block collision simply never applies to it — its position is set directly every frame with
// no blockSolid/collidesBox check anywhere, so it drifts straight through walls, trees, hills,
// anything. It hovers a fixed 1 block above whatever ground is directly below it (recomputed each
// frame via groundHeightAt, the same helper animals use to find footing), fades in with the same
// night-only visibility fireflies already use, and is otherwise a lazy wanderer recycled near the
// player — except every so often (GHOST_SURPRISE_*) it breaks off to drift in close behind the
// player for a few seconds with a soft "boo", then wanders off again. Purely decorative: it never
// deals damage or reacts to being hit, and — like fireflies/worms — it's a local-only flourish, not
// synced across clients.
const GHOST_WANDER_RADIUS = 22;
const GHOST_SURPRISE_MIN_S = 30, GHOST_SURPRISE_MAX_S = 90;
const GHOST_SURPRISE_DURATION_S = 3;
const GHOST_APPROACH_SPEED = 4; // units/s while closing in during a "surprise"
let ghostTexture = null, ghost = null;
// Built per-pixel (a boundary test per row/column) rather than with canvas path/arc calls, so the
// scalloped tail is an unambiguous sine-wave edge instead of relying on overlapping erased circles.
function buildGhostTexture(){
  const W=48, H=64;
  const canvas = document.createElement('canvas');
  canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext('2d');
  const cx0=W/2, domeCy=H*0.30, domeR=W*0.42;
  const leftX=W*0.08, rightX=W*0.92;
  const straightBottom=H*0.74, tailBottom=H*0.92, waves=4;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      let inside;
      if(y<domeCy){
        const dx=x-cx0, dy=y-domeCy;
        inside = (dx*dx+dy*dy) <= domeR*domeR;
      } else if(y<straightBottom){
        inside = x>=leftX && x<=rightX;
      } else {
        const xf = (x-leftX)/(rightX-leftX);
        const wave = Math.sin(xf*waves*Math.PI*2)*0.5+0.5;
        const localBottom = straightBottom + (tailBottom-straightBottom)*wave;
        inside = x>=leftX && x<=rightX && y<=localBottom;
      }
      if(inside) ctx.fillRect(x,y,1,1);
    }
  }
  ctx.fillStyle = 'rgba(25,25,40,0.85)';
  ctx.beginPath(); ctx.ellipse(W*0.37,domeCy,W*0.065,H*0.075,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(W*0.63,domeCy,W*0.065,H*0.075,0,0,Math.PI*2); ctx.fill();
  return new THREE.CanvasTexture(canvas);
}
function ensureGhost(){
  if(ghost) return;
  if(!ghostTexture) ghostTexture = buildGhostTexture();
  const mat = new THREE.SpriteMaterial({ map:ghostTexture, transparent:true, opacity:0, depthWrite:false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.1, 1.5, 1);
  scene.add(sprite);
  const light = new THREE.PointLight(0xcfe8ff, 0, 6, 2);
  scene.add(light);
  ghost = {
    sprite, light,
    x: player.pos.x, y: player.pos.y+1, z: player.pos.z, baseY: player.pos.y+1,
    homeX: player.pos.x, homeZ: player.pos.z,
    freqX: 0.15+Math.random()*0.1, freqZ: 0.13+Math.random()*0.1, freqY: 0.25+Math.random()*0.15,
    ampXZ: 3+Math.random()*2, ampY: 0.4, phase: Math.random()*Math.PI*2,
    state: 'wander',
    surpriseTimer: GHOST_SURPRISE_MIN_S + Math.random()*(GHOST_SURPRISE_MAX_S-GHOST_SURPRISE_MIN_S),
    surpriseElapsed: 0, targetX: 0, targetZ: 0,
  };
}
function updateGhost(dt){
  ensureGhost();
  const g = ghost;
  const night = fireflyNightFactor();
  const t = performance.now()/1000;

  if(g.state==='wander'){
    const dx = g.homeX-player.pos.x, dz = g.homeZ-player.pos.z;
    if(dx*dx+dz*dz > GHOST_WANDER_RADIUS*GHOST_WANDER_RADIUS){
      const ang = Math.random()*Math.PI*2, r = 8+Math.random()*10;
      g.homeX = player.pos.x + Math.cos(ang)*r;
      g.homeZ = player.pos.z + Math.sin(ang)*r;
    }
    g.x = g.homeX + Math.sin(t*g.freqX+g.phase)*g.ampXZ;
    g.z = g.homeZ + Math.cos(t*g.freqZ+g.phase*1.3)*g.ampXZ;
    g.surpriseTimer -= dt;
    if(g.surpriseTimer<=0 && night>0.5 && locked){
      g.state = 'surprise';
      g.surpriseElapsed = 0;
      const ang = player.yaw + Math.PI + (Math.random()<0.5?0.5:-0.5); // roughly behind, left or right
      const dist = 2.2+Math.random();
      g.targetX = player.pos.x + Math.sin(ang)*dist;
      g.targetZ = player.pos.z + Math.cos(ang)*dist;
      SFX.ghostBoo();
    }
  } else { // surprise
    g.surpriseElapsed += dt;
    const step = GHOST_APPROACH_SPEED*dt;
    const dx = g.targetX-g.x, dz = g.targetZ-g.z, d = Math.hypot(dx,dz);
    if(d>step) { g.x += dx/d*step; g.z += dz/d*step; }
    else { g.x = g.targetX; g.z = g.targetZ; }
    if(g.surpriseElapsed >= GHOST_SURPRISE_DURATION_S){
      g.state = 'wander';
      g.homeX = g.x; g.homeZ = g.z;
      g.surpriseTimer = GHOST_SURPRISE_MIN_S + Math.random()*(GHOST_SURPRISE_MAX_S-GHOST_SURPRISE_MIN_S);
    }
  }

  const groundY = groundHeightAt(g.x, g.z);
  const targetBaseY = groundY + 1;
  g.baseY += (targetBaseY-g.baseY) * Math.min(1, dt*2);
  g.y = g.baseY + Math.sin(t*g.freqY+g.phase*0.6)*g.ampY;
  g.sprite.position.set(g.x, g.y, g.z);
  g.light.position.copy(g.sprite.position);
  g.sprite.material.opacity = night*0.85;
  g.light.intensity = night*0.6;
}

// ---------- Birds: 30 flyable species, ambient wildlife that circles nearby and occasionally tweets ----------
// Modeled on the fireflies' "home point recycled near the player + closed-form sinusoidal drift"
// approach rather than the ground animals' wander/aggro state machine — birds fly through open 3D
// space, not along the ground, and like fireflies/the ghost they're a purely local, non-persistent
// decoration: nothing about them is saved or synced, so every client just sees its own equally-alive
// sky. Two of each of the 30 species are aloft at any time. There's no true positional audio in this
// game's synth-only sound system, so "hearing" a tweet is faked by only ever playing one for a bird
// currently within BIRD_EARSHOT_RADIUS, with volume scaled by how close it actually is.
const BIRD_SPECIES = [
  { id:'robin',       name:'Robin',       body:0x8a5a3a, accent:0xd9702f, size:1.00, pitch:1.00 },
  { id:'sparrow',     name:'Sparrow',     body:0x9a8a5f, accent:0xc9b98a, size:0.85, pitch:1.15 },
  { id:'blue_jay',    name:'Blue Jay',    body:0x3a5fbf, accent:0xe8eef5, size:1.05, pitch:0.95 },
  { id:'cardinal',    name:'Cardinal',    body:0xd41a2a, accent:0x2a2020, size:1.00, pitch:1.05 },
  { id:'crow',        name:'Crow',        body:0x1c1c1c, accent:0x3a3a3a, size:1.20, pitch:0.65 },
  { id:'bluebird',    name:'Bluebird',    body:0x3a7fd9, accent:0xd97a3a, size:0.90, pitch:1.10 },
  { id:'finch',       name:'Finch',       body:0xd9c93a, accent:0x8a9a3a, size:0.80, pitch:1.25 },
  { id:'swallow',     name:'Swallow',     body:0x1a2a4a, accent:0xe8e4d8, size:0.90, pitch:1.10 },
  { id:'dove',        name:'Dove',        body:0xc9c2b5, accent:0xa89a8a, size:1.05, pitch:0.85 },
  { id:'woodpecker',  name:'Woodpecker',  body:0x1a1a1a, accent:0xd41a2a, size:1.05, pitch:0.90 },
  { id:'owl',         name:'Owl',         body:0x7a5a3a, accent:0xc9a86a, size:1.25, pitch:0.55 },
  { id:'hawk',        name:'Hawk',        body:0x6a4a2a, accent:0xc9a06a, size:1.30, pitch:0.60 },
  { id:'eagle',       name:'Eagle',       body:0x3a2a1a, accent:0xe8e0c8, size:1.45, pitch:0.50 },
  { id:'parrot',      name:'Parrot',      body:0x2a9a4a, accent:0xd4341a, size:1.10, pitch:1.00 },
  { id:'toucan',      name:'Toucan',      body:0x1a1a1a, accent:0xf0a020, size:1.10, pitch:0.90 },
  { id:'flamingo',    name:'Flamingo',    body:0xf07aa0, accent:0xd4508a, size:1.35, pitch:0.75 },
  { id:'hummingbird', name:'Hummingbird', body:0x2a9a6a, accent:0xd4341a, size:0.55, pitch:1.60 },
  { id:'kingfisher',  name:'Kingfisher',  body:0x2a7ac9, accent:0xd9702f, size:0.85, pitch:1.15 },
  { id:'heron',       name:'Heron',       body:0x6a7a7a, accent:0xd9d4c5, size:1.35, pitch:0.65 },
  { id:'pelican',     name:'Pelican',     body:0xe8e4d8, accent:0xa89a8a, size:1.40, pitch:0.60 },
  { id:'seagull',     name:'Seagull',     body:0xe8e4d8, accent:0x9a9a9a, size:1.10, pitch:0.95 },
  { id:'magpie',      name:'Magpie',      body:0x1a1a1a, accent:0xe8e4d8, size:1.05, pitch:0.90 },
  { id:'raven',       name:'Raven',       body:0x0a0a0a, accent:0x2a2a2a, size:1.20, pitch:0.55 },
  { id:'wren',        name:'Wren',        body:0x8a6a3a, accent:0xc9a86a, size:0.60, pitch:1.40 },
  { id:'chickadee',   name:'Chickadee',   body:0x2a2a2a, accent:0xe8e4d8, size:0.65, pitch:1.35 },
  { id:'oriole',      name:'Oriole',      body:0xf0801a, accent:0x1a1a1a, size:0.95, pitch:1.05 },
  { id:'warbler',     name:'Warbler',     body:0xd4c93a, accent:0x8a9a4a, size:0.75, pitch:1.30 },
  { id:'swan',        name:'Swan',        body:0xf5f2e8, accent:0xf0a020, size:1.40, pitch:0.60 },
  { id:'duck',        name:'Duck',        body:0x2a5a3a, accent:0x8a6a3a, size:1.00, pitch:0.85 },
  { id:'goose',       name:'Goose',       body:0x8a8270, accent:0x3a3a3a, size:1.25, pitch:0.70 },
];
const BIRD_COUNT = BIRD_SPECIES.length * 2;
const BIRD_RADIUS = 32; // recycle a bird's home once it's this far (x/z) from the player
const BIRD_EARSHOT_RADIUS = 20; // only a bird within this many blocks of the player is ever heard
// Birds occasionally snack on nearby worms — but only once the worm population is healthy (>=
// WORM_MIN_POPULATION_FOR_PREDATION), so birds can't ever hunt worms to extinction. A worm eaten
// this way is just gone (no meat drop — the bird ate it, not the player).
const BIRD_EAT_WORM_INTERVAL_S = 6; // how often each bird checks for a nearby worm to eat
const BIRD_EAT_WORM_RADIUS = 3; // how close a worm needs to be to the bird's current position
const WORM_MIN_POPULATION_FOR_PREDATION = 10;
const birds = [];
const birdMatCache = new Map(); // species.id -> {body, accent} materials, shared across that species' instances
const birdBeakMat = new THREE.MeshLambertMaterial({ color: 0xe8a83d });
function birdMaterials(species){
  let m = birdMatCache.get(species.id);
  if(!m){
    m = { body: new THREE.MeshLambertMaterial({ color: species.body }), accent: new THREE.MeshLambertMaterial({ color: species.accent }) };
    birdMatCache.set(species.id, m);
  }
  return m;
}
// A genuinely 3D low-poly bird — body/head/beak/tail plus two wings on flapping hinges, all simple
// boxes composed into a THREE.Group, the exact same "compose primitives" approach the animal models
// already use (see makeQuadruped/animalBox above). Replaces an earlier billboard-sprite version that
// always faced the camera and read as a flat cutout from any angle other than straight-on; a real 3D
// shape actually looks like a bird — and looks like a DIFFERENT bird depending which way you're
// looking at it from — the way a sprite fundamentally can't.
function buildBirdMesh(species){
  const { body: bodyMat, accent: accentMat } = birdMaterials(species);
  const g = new THREE.Group();

  g.add(animalBox(0.22, 0.2, 0.42, bodyMat));
  const belly = animalBox(0.17, 0.1, 0.26, accentMat);
  belly.position.set(0, -0.09, 0.02);
  g.add(belly);

  const head = animalBox(0.15, 0.15, 0.15, bodyMat);
  head.position.set(0, 0.09, -0.25); // -Z is "forward", matching the rest of this file's convention
  g.add(head);
  const beak = animalBox(0.05, 0.05, 0.13, birdBeakMat);
  beak.position.set(0, 0.07, -0.38);
  g.add(beak);

  const tail = animalBox(0.05, 0.1, 0.24, accentMat);
  tail.position.set(0, 0.02, 0.33);
  tail.rotation.x = 0.2;
  g.add(tail);

  // Each wing is a box offset from its own pivot group, not centered on it, so rotating the pivot
  // around Z swings the wing up/down about the shoulder like a real hinge instead of the wing's own
  // center.
  const wings = [];
  for(const side of [1,-1]){
    const pivot = new THREE.Group();
    pivot.position.set(side*0.11, 0.03, 0);
    const wing = animalBox(0.34, 0.03, 0.2, bodyMat);
    wing.geometry.translate(side*0.17, 0, 0);
    pivot.add(wing);
    pivot.userData.side = side;
    g.add(pivot);
    wings.push(pivot);
  }
  g.userData.wings = wings;
  g.scale.setScalar(species.size);
  g.traverse(o => { if(o.isMesh) o.castShadow = true; });
  return g;
}
function spawnBirdHome(b){
  const ang = Math.random()*Math.PI*2, r = 8+Math.random()*(BIRD_RADIUS-8);
  const x = player.pos.x + Math.cos(ang)*r;
  const z = player.pos.z + Math.sin(ang)*r;
  const targetBaseY = heightAt(Math.floor(x), Math.floor(z)) + 6 + Math.random()*8; // above the canopy line
  // Smoothly transition to a new home over 1.5 seconds instead of teleporting instantly
  b.homeXTarget = x; b.homeZTarget = z; b.baseYTarget = targetBaseY;
  b.transitionTime = 1.5; b.transitionElapsed = 0;
  // Initialize on first spawn
  if(b.homeX===0 && b.homeZ===0){
    b.homeX = x; b.homeZ = z; b.baseY = targetBaseY;
    b.homeXTarget = x; b.homeZTarget = z; b.baseYTarget = targetBaseY;
    b.transitionTime = 0;
  }
}
function ensureBirds(){
  if(birds.length) return;
  for(let i=0;i<BIRD_COUNT;i++){
    const species = BIRD_SPECIES[i % BIRD_SPECIES.length];
    const mesh = buildBirdMesh(species);
    scene.add(mesh);
    const b = {
      mesh, species, homeX:0, homeZ:0, baseY:0,
      hp: 2, maxHp: 2,
      freqX: 0.15+Math.random()*0.2, freqY: 0.4+Math.random()*0.5, freqZ: 0.15+Math.random()*0.2,
      ampXZ: 5+Math.random()*7, ampY: 1+Math.random()*1.5, phase: Math.random()*Math.PI*2,
      tweetTimer: 2+Math.random()*8, flapPhase: Math.random()*Math.PI*2, flapSpeed: 9+Math.random()*4,
      eatWormTimer: Math.random()*BIRD_EAT_WORM_INTERVAL_S,
    };
    spawnBirdHome(b);
    birds.push(b);
  }
}
function updateBirds(dt){
  ensureBirds();
  const t = performance.now()/1000;
  for(const b of birds){
    // Smooth transition to new home point over 1.5 seconds
    if(b.transitionTime > 0){
      b.transitionElapsed += dt;
      const alpha = Math.min(1, b.transitionElapsed / b.transitionTime);
      b.homeX += (b.homeXTarget - b.homeX) * alpha;
      b.homeZ += (b.homeZTarget - b.homeZ) * alpha;
      b.baseY += (b.baseYTarget - b.baseY) * alpha;
    }

    const dx = b.homeXTarget-player.pos.x, dz = b.homeZTarget-player.pos.z;
    if(dx*dx+dz*dz > BIRD_RADIUS*BIRD_RADIUS) spawnBirdHome(b);
    const ax = t*b.freqX+b.phase, az = t*b.freqZ+b.phase*1.3, ay = t*b.freqY+b.phase*0.7;
    const x = b.homeX + Math.sin(ax)*b.ampXZ;
    const z = b.homeZ + Math.cos(az)*b.ampXZ;
    const y = Math.max(2, b.baseY + Math.sin(ay)*b.ampY);
    b.mesh.position.set(x,y,z);
    // Face the direction it's actually moving — the analytic derivative of the x/z formulas above —
    // using the same atan2(-vx,-vz) convention the player itself uses for yaw-from-forward-vector.
    const vx = Math.cos(ax)*b.freqX*b.ampXZ, vz = -Math.sin(az)*b.freqZ*b.ampXZ;
    if(vx*vx+vz*vz > 0.0001) b.mesh.rotation.y = Math.atan2(-vx,-vz);

    b.flapPhase += dt*b.flapSpeed;
    const flap = Math.sin(b.flapPhase)*0.9;
    for(const wingPivot of b.mesh.userData.wings) wingPivot.rotation.z = wingPivot.userData.side*flap;

    b.tweetTimer -= dt;
    if(b.tweetTimer<=0){
      b.tweetTimer = 4+Math.random()*8;
      const dist = Math.hypot(x-player.pos.x, y-(player.pos.y+player.eye), z-player.pos.z);
      if(dist < BIRD_EARSHOT_RADIUS) SFX.birdTweet(b.species.pitch, Math.max(0,1-dist/BIRD_EARSHOT_RADIUS)*0.13);
    }

    b.eatWormTimer -= dt;
    if(b.eatWormTimer<=0){
      b.eatWormTimer = BIRD_EAT_WORM_INTERVAL_S*0.5 + Math.random()*BIRD_EAT_WORM_INTERVAL_S;
      if(worms.length >= WORM_MIN_POPULATION_FOR_PREDATION){
        let nearest = null, bestD2 = BIRD_EAT_WORM_RADIUS*BIRD_EAT_WORM_RADIUS;
        for(const w of worms){
          const wdx = w.x-x, wdy = w.y-y, wdz = w.z-z;
          const d2 = wdx*wdx+wdy*wdy+wdz*wdz;
          if(d2<bestD2){ nearest = w; bestD2 = d2; }
        }
        if(nearest) killWorm(nearest, 'eaten');
      }
    }
  }
}

// ---------- Big Eagles: 2 apex predators that hunt other birds and fish ----------
// Reuses the exact same bird model (buildBirdMesh) and home-point-recycling wander pattern as the
// regular birds above, just scaled way up and with its own slower, more majestic wingbeat — same
// "one model, differentiate by size/color" approach used for the big Shark/Whale Shark fish. Only 2
// exist, ranging much further than a regular bird (BIG_EAGLE_RADIUS), and roughly once per in-game
// day each one hunts down whatever bird or fish is currently nearest it and eats it — a clean kill,
// no meat drop (see damageBirdOrFish's awardMeat flag: only a kill the player lands themselves ever
// puts Meat in their inventory, same reasoning as birds eating worms below WORM_MIN_POPULATION_FOR_
// PREDATION). They're themselves attackable and drop Meat like every other creature here.
const BIG_EAGLE_COUNT = 2;
const BIG_EAGLE_SPECIES = { id:'bigeagle', name:'Giant Eagle', body:0x4a3a2a, accent:0xe8dcc8, size:3.0, pitch:0.4 };
const BIG_EAGLE_RADIUS = 40;
const BIG_EAGLE_HUNT_INTERVAL_MS = DAY_LENGTH_S*1000; // once per in-game day
const BIG_EAGLE_HUNT_RADIUS = 15;
const bigEagles = [];
function spawnBigEagleHome(e){
  const ang = Math.random()*Math.PI*2, r = 10+Math.random()*(BIG_EAGLE_RADIUS-10);
  const x = player.pos.x + Math.cos(ang)*r;
  const z = player.pos.z + Math.sin(ang)*r;
  const targetBaseY = heightAt(Math.floor(x), Math.floor(z)) + 10 + Math.random()*10; // soars higher than regular birds
  e.homeXTarget = x; e.homeZTarget = z; e.baseYTarget = targetBaseY;
  e.transitionTime = 2; e.transitionElapsed = 0;
  if(e.homeX===0 && e.homeZ===0){
    e.homeX = x; e.homeZ = z; e.baseY = targetBaseY;
    e.homeXTarget = x; e.homeZTarget = z; e.baseYTarget = targetBaseY;
    e.transitionTime = 0;
  }
}
function ensureBigEagles(){
  if(bigEagles.length) return;
  for(let i=0;i<BIG_EAGLE_COUNT;i++){
    const mesh = buildBirdMesh(BIG_EAGLE_SPECIES);
    scene.add(mesh);
    const e = {
      mesh, species: BIG_EAGLE_SPECIES, homeX:0, homeZ:0, baseY:0,
      hp: 4, maxHp: 4,
      freqX: 0.08+Math.random()*0.1, freqY: 0.2+Math.random()*0.2, freqZ: 0.08+Math.random()*0.1,
      ampXZ: 10+Math.random()*8, ampY: 2+Math.random()*2, phase: Math.random()*Math.PI*2,
      flapPhase: Math.random()*Math.PI*2, flapSpeed: 4+Math.random()*2, // slower, more majestic than small birds
      // Staggered so the two eagles don't both hunt the instant the world loads.
      lastHuntAt: Date.now() - Math.random()*BIG_EAGLE_HUNT_INTERVAL_MS,
    };
    spawnBigEagleHome(e);
    bigEagles.push(e);
  }
}
function updateBigEagles(dt){
  ensureBigEagles();
  const t = performance.now()/1000;
  const now = Date.now();
  for(const e of bigEagles){
    if(e.transitionTime > 0){
      e.transitionElapsed += dt;
      const alpha = Math.min(1, e.transitionElapsed / e.transitionTime);
      e.homeX += (e.homeXTarget - e.homeX) * alpha;
      e.homeZ += (e.homeZTarget - e.homeZ) * alpha;
      e.baseY += (e.baseYTarget - e.baseY) * alpha;
    }

    const dx = e.homeXTarget-player.pos.x, dz = e.homeZTarget-player.pos.z;
    if(dx*dx+dz*dz > BIG_EAGLE_RADIUS*BIG_EAGLE_RADIUS) spawnBigEagleHome(e);
    const ax = t*e.freqX+e.phase, az = t*e.freqZ+e.phase*1.3, ay = t*e.freqY+e.phase*0.7;
    const x = e.homeX + Math.sin(ax)*e.ampXZ;
    const z = e.homeZ + Math.cos(az)*e.ampXZ;
    const y = Math.max(4, e.baseY + Math.sin(ay)*e.ampY);
    e.mesh.position.set(x,y,z);
    const vx = Math.cos(ax)*e.freqX*e.ampXZ, vz = -Math.sin(az)*e.freqZ*e.ampXZ;
    if(vx*vx+vz*vz > 0.0001) e.mesh.rotation.y = Math.atan2(-vx,-vz);

    e.flapPhase += dt*e.flapSpeed;
    const flap = Math.sin(e.flapPhase)*0.7;
    for(const wingPivot of e.mesh.userData.wings) wingPivot.rotation.z = wingPivot.userData.side*flap;

    if(now - e.lastHuntAt >= BIG_EAGLE_HUNT_INTERVAL_MS){
      let nearest = null, nearestType = null, bestD2 = BIG_EAGLE_HUNT_RADIUS*BIG_EAGLE_HUNT_RADIUS;
      for(const b of birds){
        const bdx=b.mesh.position.x-x, bdy=b.mesh.position.y-y, bdz=b.mesh.position.z-z;
        const d2 = bdx*bdx+bdy*bdy+bdz*bdz;
        if(d2<bestD2){ nearest=b; nearestType='bird'; bestD2=d2; }
      }
      for(const f of fish){
        const fdx=f.mesh.position.x-x, fdy=f.mesh.position.y-y, fdz=f.mesh.position.z-z;
        const d2 = fdx*fdx+fdy*fdy+fdz*fdz;
        if(d2<bestD2){ nearest=f; nearestType='fish'; bestD2=d2; }
      }
      if(nearest){
        e.lastHuntAt = now;
        damageBirdOrFish(nearest, nearest.hp, nearestType, false);
      }
    }
  }
}

// ---------- Fish: swim in the water, ambient wildlife ----------
// Same local-only, recycled-near-the-player home-point approach as birds/fireflies, but a fish's home
// is a specific nearby water column (found by scanning for heightAt(x,z) < SEA_LEVEL, the exact
// condition world generation itself uses to flood a column) and its drift is clamped to that column's
// real water depth (its bottom is the terrain, its top is SEA_LEVEL) rather than open space. If no
// water happens to be within FISH_RADIUS of the player (deep inland) a fish just stays invisible until
// one wanders into range, instead of popping up stranded on dry land.
// size is a multiplier on buildFishMesh's total nose-to-tail length (0.48 local units: the 0.32-long
// body plus the tail fin that extends further back off its own pivot) — so size 4.167 / 6.25 come out
// to exactly 2 / 3 blocks long nose-to-tail. Big fish are deliberately rarer (count) and need deeper
// water to swim in without clipping the sea floor or surface (minDepth) than the regular schooling
// fish, which default to count:4 and minDepth:1.
const FISH_SPECIES = [
  { id:'goldfish',   name:'Goldfish',   body:0xf0801a, accent:0xffe0a0, size:0.75 },
  { id:'bass',       name:'Bass',       body:0x5a7a5a, accent:0x2a3a2a, size:1.10 },
  { id:'salmon',     name:'Salmon',     body:0xe08a8a, accent:0xc95a6a, size:1.00 },
  { id:'tuna',       name:'Tuna',       body:0x3a5a7a, accent:0xd8e0e8, size:1.30 },
  { id:'clownfish',  name:'Clownfish',  body:0xf0601a, accent:0xffffff, size:0.65 },
  { id:'catfish',    name:'Catfish',    body:0x6a5a4a, accent:0x4a3a2a, size:1.15 },
  { id:'shark',      name:'Shark',      body:0x74828c, accent:0xe8ecec, size:4.167, count:2, hp:3, minDepth:2 },
  { id:'whaleshark', name:'Whale Shark',body:0x2f4a5c, accent:0xcfe0e8, size:6.25,  count:1, hp:5, minDepth:3 },
];
const FISH_COUNT = FISH_SPECIES.reduce((sum,s)=>sum+(s.count||4), 0);
const FISH_RADIUS = 26;
const fish = [];
const fishMatCache = new Map(); // species.id -> {body, accent} materials, shared across that species' instances
const fishEyeMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
function fishMaterials(species){
  let m = fishMatCache.get(species.id);
  if(!m){
    m = { body: new THREE.MeshLambertMaterial({ color: species.body }), accent: new THREE.MeshLambertMaterial({ color: species.accent }) };
    fishMatCache.set(species.id, m);
  }
  return m;
}
// A real 3D torpedo body (same "compose animalBox primitives into a THREE.Group" approach as the
// birds and the animal models) — a body, a belly stripe, two eye dots, a dorsal fin, two side
// (pectoral) fins, and a tail on its own pivot so it can wiggle side to side like a swimming fish
// actually does, instead of flapping like a bird's wings.
function buildFishMesh(species){
  const { body: bodyMat, accent: accentMat } = fishMaterials(species);
  const g = new THREE.Group();

  g.add(animalBox(0.14, 0.13, 0.32, bodyMat));
  const belly = animalBox(0.1, 0.06, 0.22, accentMat);
  belly.position.set(0, -0.06, 0.02);
  g.add(belly);

  for(const side of [1,-1]){
    const eye = animalBox(0.02, 0.02, 0.02, fishEyeMat);
    eye.position.set(side*0.06, 0.02, -0.13);
    g.add(eye);
  }

  const dorsal = animalBox(0.02, 0.08, 0.1, accentMat);
  dorsal.position.set(0, 0.09, 0);
  g.add(dorsal);

  for(const side of [1,-1]){
    const fin = animalBox(0.1, 0.02, 0.08, accentMat);
    fin.position.set(side*0.08, -0.01, -0.08);
    fin.rotation.z = side*0.4;
    g.add(fin);
  }

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, 0.16);
  const tail = animalBox(0.02, 0.12, 0.16, accentMat);
  tail.geometry.translate(0, 0, 0.08); // offset so it extends backward from the pivot, not centered on it
  tailPivot.add(tail);
  g.add(tailPivot);

  g.userData.tail = tailPivot;
  g.scale.setScalar(species.size);
  g.traverse(o => { if(o.isMesh) o.castShadow = true; });
  return g;
}
function findFishSpot(minDepth){
  for(let tries=0; tries<20; tries++){
    const ang = Math.random()*Math.PI*2, r = 4+Math.random()*(FISH_RADIUS-4);
    const x = Math.floor(player.pos.x + Math.cos(ang)*r);
    const z = Math.floor(player.pos.z + Math.sin(ang)*r);
    const h = heightAt(x,z);
    if(h < SEA_LEVEL && SEA_LEVEL-h >= (minDepth||1)) return { x:x+0.5, z:z+0.5, bottom:h+1, top:SEA_LEVEL };
  }
  return null;
}
function spawnFishHome(f){
  const spot = findFishSpot(f.species.minDepth);
  if(!spot){ f.hasHome = false; f.mesh.visible = false; return; }
  f.hasHome = true; f.mesh.visible = true;
  f.bottom = spot.bottom; f.top = spot.top;
  const depth = spot.top - spot.bottom + 1;
  const targetBaseY = spot.bottom + depth/2;
  // Smoothly transition to a new home over 1.5 seconds instead of teleporting instantly
  f.homeXTarget = spot.x; f.homeZTarget = spot.z; f.baseYTarget = targetBaseY;
  f.transitionTime = 1.5; f.transitionElapsed = 0;
  // Initialize on first spawn
  if(f.homeX===0 && f.homeZ===0){
    f.homeX = spot.x; f.homeZ = spot.z; f.baseY = targetBaseY;
    f.homeXTarget = spot.x; f.homeZTarget = spot.z; f.baseYTarget = targetBaseY;
    f.transitionTime = 0;
  }
}
function ensureFish(){
  if(fish.length) return;
  const speciesList = [];
  for(const species of FISH_SPECIES) for(let i=0;i<(species.count||4);i++) speciesList.push(species);
  for(const species of speciesList){
    const mesh = buildFishMesh(species);
    scene.add(mesh);
    const hp = species.hp||1;
    const f = {
      mesh, species, homeX:0, homeZ:0, bottom:1, top:1, baseY:1, hasHome:false,
      hp, maxHp: hp,
      freqX: 0.2+Math.random()*0.3, freqZ: 0.2+Math.random()*0.3,
      ampXZ: 1.5+Math.random()*2.5, phase: Math.random()*Math.PI*2,
      vertPeriod: 6+Math.random()*10, vertPhase: Math.random()*Math.PI*2,
      tailPhase: Math.random()*Math.PI*2, tailSpeed: 5+Math.random()*3,
    };
    spawnFishHome(f);
    fish.push(f);
  }
}
function updateFish(dt){
  ensureFish();
  const t = performance.now()/1000;
  for(const f of fish){
    if(!f.hasHome){ spawnFishHome(f); if(!f.hasHome) continue; }

    // Smooth transition to new home point over 1.5 seconds
    if(f.transitionTime > 0){
      f.transitionElapsed += dt;
      const alpha = Math.min(1, f.transitionElapsed / f.transitionTime);
      f.homeX += (f.homeXTarget - f.homeX) * alpha;
      f.homeZ += (f.homeZTarget - f.homeZ) * alpha;
      f.baseY += (f.baseYTarget - f.baseY) * alpha;
    }

    const dx = f.homeXTarget-player.pos.x, dz = f.homeZTarget-player.pos.z;
    if(dx*dx+dz*dz > FISH_RADIUS*FISH_RADIUS){ spawnFishHome(f); if(!f.hasHome) continue; }
    const ax = t*f.freqX+f.phase, az = t*f.freqZ+f.phase*1.3;
    let x = f.homeX + Math.sin(ax)*f.ampXZ;
    let z = f.homeZ + Math.cos(az)*f.ampXZ;
    const vertRange = Math.max(0.3, (f.top-f.bottom)/2 - 0.3);
    let y = f.baseY + Math.sin(t/f.vertPeriod*Math.PI*2+f.vertPhase)*vertRange;
    if(getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) !== WATER){ x=f.homeX; z=f.homeZ; y=f.baseY; }
    f.mesh.position.set(x,y,z);
    // Face the direction it's actually swimming — same analytic-derivative + atan2(-vx,-vz)
    // convention used for the player and the birds.
    const vx = Math.cos(ax)*f.freqX*f.ampXZ, vz = -Math.sin(az)*f.freqZ*f.ampXZ;
    if(vx*vx+vz*vz > 0.0001) f.mesh.rotation.y = Math.atan2(-vx,-vz);

    f.tailPhase += dt*f.tailSpeed;
    f.mesh.userData.tail.rotation.y = Math.sin(f.tailPhase)*0.6; // side-to-side wiggle, not a bird's up/down flap
  }
}

// ---------- Saplings: little trees that randomly appear on grass and slowly grow into full trees ----------
const SAPLING_MAX_STAGE = 3;          // height in blocks while still growing, before it becomes a real tree
const SAPLING_STAGE_MS = 400000;      // real time between each extra block of height (10x slower)
const SAPLING_MATURE_MS = 3000000;    // real time (50 min) from planting until it becomes a full tree (10x slower)
const SAPLING_CAP = 30;               // roughly how many can be growing across the map at once
const SAPLING_SPAWN_CHECK_S = 15;     // how often each client rolls the dice on spawning a new one
const saplings = new Map(); // key "x,z" -> {y: baseY, plantedAt: ms-since-epoch}
let saplingTickTimer = 0, saplingSpawnTimer = SAPLING_SPAWN_CHECK_S;
function saplingStageForElapsed(elapsedMs){
  return Math.min(SAPLING_MAX_STAGE, 1 + Math.floor(elapsedMs / SAPLING_STAGE_MS));
}
function findSaplingColumn(x,y,z){
  let baseY = y;
  while(getBlock(x,baseY-1,z)===SAPLING) baseY--;
  const cells = [];
  let cy = baseY;
  while(getBlock(x,cy,z)===SAPLING){ cells.push({x,y:cy,z}); cy++; }
  return cells;
}
function cancelSapling(x,z){
  const key = x+','+z;
  saplings.delete(key);
  if(fbReady) db.ref('world/saplings/'+key).remove();
}
function plantSapling(x,y,z){
  const key = x+','+z;
  saplings.set(key, { y, plantedAt: Date.now() });
  applyWorldEdit(x,y,z,SAPLING,false);
  if(fbReady) db.ref('world/saplings/'+key).set({ y, t: firebase.database.ServerValue.TIMESTAMP });
}
function trySpawnSapling(){
  if(saplings.size >= SAPLING_CAP) return;
  for(let tries=0; tries<10; tries++){
    const x = 2 + Math.floor(Math.random()*(WORLD_SIZE-4));
    const z = 2 + Math.floor(Math.random()*(WORLD_SIZE-4));
    const h = heightAt(x,z);
    if(h<=SEA_LEVEL) continue;
    if(getBlock(x,h,z)!==GRASS) continue;
    if(getBlock(x,h+1,z)!==AIR) continue;
    if(saplings.has(x+','+z)) continue;
    plantSapling(x,h+1,z);
    return;
  }
}
function updateSaplings(dt){
  saplingTickTimer -= dt;
  if(saplingTickTimer<=0){
    saplingTickTimer = 2;
    const now = Date.now();
    for(const [key, info] of Array.from(saplings.entries())){
      const [xs,zs] = key.split(',');
      const x = Number(xs), z = Number(zs), y = info.y;
      const elapsed = now - info.plantedAt;
      if(elapsed >= SAPLING_MATURE_MS){
        for(let dy=0; dy<SAPLING_MAX_STAGE; dy++){
          if(getBlock(x,y+dy,z)===SAPLING) applyWorldEdit(x,y+dy,z,AIR,false);
        }
        if(hash2(x+3,z+5) < BUSH_CHANCE) plantBushSynced(x,y,z); else plantTreeSynced(x,y,z);
        saplings.delete(key);
        if(fbReady) db.ref('world/saplings/'+key).remove();
        continue;
      }
      const stage = saplingStageForElapsed(elapsed);
      for(let dy=0; dy<stage; dy++){
        if(getBlock(x,y+dy,z)===AIR) applyWorldEdit(x,y+dy,z,SAPLING,false);
      }
    }
  }
  saplingSpawnTimer -= dt;
  if(saplingSpawnTimer<=0){ saplingSpawnTimer = SAPLING_SPAWN_CHECK_S; trySpawnSapling(); }
}

// ---------- Tree regrowth: leaves slowly grow back as long as the trunk still stands ----------
// A tree's exact original shape (trunk + canopy + any branches) is fully deterministic — the same
// plantTreeCells(x,baseY,z,...) call used to plant it in the first place always reconstructs the
// identical cell layout (see checkTreeSupport above, which relies on the same trick). So regrowth
// doesn't need its own registry of "which trees exist": each tick, sample a few random columns near
// the player, and any one whose base cell (heightAt(x,z)+1) is still WOOD is a living trunk — replay
// its shape and fill back in one missing LEAVES cell at a time, on a per-tree cooldown so it reads as
// gradual regrowth rather than an instant refill. A trunk that's been chopped down to the ground no
// longer matches (its base cell is AIR), so it simply stops being found and never regrows.
const TREE_REGROW_CHECK_S = 3;          // how often each client samples nearby columns for trunks
const TREE_REGROW_SCAN_RADIUS = 24;     // how far from the player to sample
const TREE_REGROW_SAMPLES_PER_CHECK = 20;
const TREE_REGROW_LEAF_INTERVAL_S = 8;  // real seconds between each leaf a given tree regrows
const treeRegrowCooldowns = new Map();  // key "x,z" (trunk base column) -> next allowed regrow time (s)
let treeRegrowTimer = 0;
function updateTreeRegrowth(dt){
  treeRegrowTimer -= dt;
  if(treeRegrowTimer>0) return;
  treeRegrowTimer = TREE_REGROW_CHECK_S;

  const nowS = performance.now()/1000;
  const px = Math.floor(player.pos.x), pz = Math.floor(player.pos.z);
  for(let tries=0; tries<TREE_REGROW_SAMPLES_PER_CHECK; tries++){
    const x = px + Math.floor((Math.random()*2-1)*TREE_REGROW_SCAN_RADIUS);
    const z = pz + Math.floor((Math.random()*2-1)*TREE_REGROW_SCAN_RADIUS);
    if(x<1 || z<1 || x>=WORLD_SIZE-1 || z>=WORLD_SIZE-1) continue;
    const h = heightAt(x,z);
    if(h<=SEA_LEVEL) continue;
    const baseY = h+1;
    if(getBlock(x,baseY,z)!==WOOD) continue; // no living trunk rooted at this column

    const key = x+','+z;
    if(nowS < (treeRegrowCooldowns.get(key)||0)) continue;

    let missing = null;
    plantTreeCells(x, baseY, z, (bx,by,bz,b)=>{
      if(missing || b!==LEAVES) return;
      if(getBlock(bx,by,bz)===AIR) missing = {x:bx,y:by,z:bz};
    });
    if(missing){
      applyWorldEdit(missing.x, missing.y, missing.z, LEAVES, false);
      treeRegrowCooldowns.set(key, nowS + TREE_REGROW_LEAF_INTERVAL_S);
    }
  }
}

// ---------- Fire: light a wood block with flint, burns for half a Blockcraft day (30 real min) ----------
// Fire is a non-solid hazard, not a block you can stand on or bump into (see blockSolid/TRANSPARENT_
// BLOCKS): it's drawn as two crossed billboard sprites rather than a cube (ensureFireFx), it hurts
// any player or animal standing in its cell, and it can catch adjacent wood/leaves alight — so a
// single flint spark can grow into a real, spreading blaze rather than a single static block.
const FIRE_DURATION_MS = 1800000; // 30 real minutes == half a 1-hour Blockcraft day
const FLAMMABLE_BLOCKS = new Set([WOOD, LEAVES]);
const FIRE_SPREAD_INTERVAL_S = 4;
const FIRE_SPREAD_CHANCE = 0.12;
const MAX_ACTIVE_FIRES = 60; // caps runaway spread so light/sprite count stays cheap to render
const FIRE_DAMAGE_TICK_S = 1;
const FIRE_DAMAGE = 2;
const FIRE_NEIGHBOR_OFFSETS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const fires = new Map(); // key "x,y,z" -> {ignitedAt: ms-since-epoch}
const fireFx = new Map(); // key -> { light, flame, phase }

// A small transparent-background sprite (not a full opaque tile like the other block textures) so
// the crossed billboards read as a flame silhouette instead of a translucent cube.
function buildFireSpriteTexture(){
  const W = 32, H = 48;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const cx = W/2;
  for(let row=0; row<H; row++){
    const frac = 1 - row/(H-1); // 1 at the base, 0 at the tip
    const taper = Math.pow(frac, 0.65);
    const jag = (Math.sin(row*1.7)*0.5 + (Math.random()-0.5)) * W*0.09;
    const half = Math.max(1, W*0.46*taper + jag);
    const x0 = Math.round(cx-half), x1 = Math.round(cx+half);
    const color = frac>0.7 ? 0xff3d12 : (frac>0.35 ? 0xff8a1a : 0xffd24d);
    for(let x=x0; x<x1; x++){
      if(x<0 || x>=W) continue;
      const hot = Math.random()<0.15;
      ctx.fillStyle = shadeStr(hot ? 0xfff2b0 : color, 1, hot?0:14);
      ctx.fillRect(x,row,1,1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
const fireFlameMaterial = new THREE.MeshBasicMaterial({ map: buildFireSpriteTexture(), alphaTest:0.5, side:THREE.DoubleSide });
const fireFlameGeo = new THREE.PlaneGeometry(0.95, 1.0);

function tryIgniteFire(hit){
  if(!hit) return;
  // Ignites the wood/leaf block you're actually aiming at (not some adjacent empty air cell) — same
  // instant "catches and starts burning" transition fire spread already uses on its neighbors, so
  // what you point the flint at is what visibly starts burning, and eventually disappears once its
  // fire burns out, same as it would for the rest of the tree.
  if(!FLAMMABLE_BLOCKS.has(getBlock(hit.x,hit.y,hit.z))) return; // flint only catches wood or leaves
  if(invCount(FLINT)<=0) return;
  const key = hit.x+','+hit.y+','+hit.z;
  if(fires.has(key)) return; // already burning
  igniteFire(hit.x,hit.y,hit.z);
  invSub(FLINT,1);
  saveInventory();
  updateHotbarUI();
  triggerSwing();
}
function igniteFire(x,y,z){
  const key = x+','+y+','+z;
  fires.set(key, { ignitedAt: Date.now() });
  applyWorldEdit(x,y,z,FIRE,false);
  if(fbReady) db.ref('world/fires/'+key).set({ t: firebase.database.ServerValue.TIMESTAMP });
  SFX.igniteFire();
}
function extinguishFire(key){
  const [x,y,z] = key.split(',').map(Number);
  if(getBlock(x,y,z)===FIRE) applyWorldEdit(x,y,z,AIR,false);
  fires.delete(key);
  removeFireFx(key);
  if(fbReady) db.ref('world/fires/'+key).remove();
}
let fireTickTimer = 0, fireSpreadTimer = 0, fireDamageTimer = 0;
function updateFires(dt){
  fireTickTimer -= dt;
  if(fireTickTimer<=0){
    fireTickTimer = 3;
    const now = Date.now();
    for(const [key,info] of Array.from(fires.entries())){
      if(now - info.ignitedAt >= FIRE_DURATION_MS) extinguishFire(key);
    }
  }

  fireSpreadTimer -= dt;
  if(fireSpreadTimer<=0){
    fireSpreadTimer = FIRE_SPREAD_INTERVAL_S;
    for(const key of Array.from(fires.keys())){
      if(fires.size>=MAX_ACTIVE_FIRES) break;
      const [x,y,z] = key.split(',').map(Number);
      for(const [dx,dy,dz] of FIRE_NEIGHBOR_OFFSETS){
        if(fires.size>=MAX_ACTIVE_FIRES) break;
        const nx=x+dx, ny=y+dy, nz=z+dz;
        if(!FLAMMABLE_BLOCKS.has(getBlock(nx,ny,nz))) continue;
        if(fires.has(nx+','+ny+','+nz)) continue;
        if(Math.random()<FIRE_SPREAD_CHANCE) igniteFire(nx,ny,nz);
      }
    }
  }

  fireDamageTimer -= dt;
  if(fireDamageTimer<=0){
    fireDamageTimer = FIRE_DAMAGE_TICK_S;
    if(locked && !isDead){
      for(const key of fires.keys()){
        const [x,y,z] = key.split(',').map(Number);
        if(playerOverlapsCell(x,y,z)){ damagePlayer(FIRE_DAMAGE,'fire'); break; }
      }
    }
    for(const a of animals){
      for(const key of fires.keys()){
        const [x,y,z] = key.split(',').map(Number);
        if(animalOverlapsCell(a,x,y,z)){ damageAnimal(a, FIRE_DAMAGE); break; }
      }
    }
  }

  const t = performance.now()/1000;
  for(const [key, info] of fires){
    const [x,y,z] = key.split(',').map(Number);
    const fx = ensureFireFx(key,x,y,z);
    fx.light.intensity = 2.6 + Math.random()*0.8;
    const wob = Math.sin(t*9 + fx.phase);
    fx.flame.scale.set(1 + wob*0.06, 1 + Math.sin(t*6+fx.phase*1.3)*0.08, 1 + wob*0.06);
    fx.flame.rotation.y = Math.sin(t*3 + fx.phase)*0.25;
  }
  for(const key of Array.from(fireFx.keys())) if(!fires.has(key)) removeFireFx(key);

  fireCrackleTimer -= dt;
  if(fireCrackleTimer<=0){
    let near = false;
    for(const key of fires.keys()){
      const [x,y,z] = key.split(',').map(Number);
      if(Math.hypot(x+0.5-player.pos.x, y+0.5-player.pos.y, z+0.5-player.pos.z) < 6){ near=true; break; }
    }
    if(near && locked){ fireCrackleTimer = 0.4+Math.random()*0.5; SFX.fireCrackle(); }
    else fireCrackleTimer = 1;
  }
}
let fireCrackleTimer = 1;
function ensureFireFx(key,x,y,z){
  let fx = fireFx.get(key);
  if(!fx){
    const light = new THREE.PointLight(0xff8a2b, 2.6, 16, 1.4);
    light.position.set(x+0.5, y+0.5, z+0.5);
    scene.add(light);

    const flame = new THREE.Group();
    const p1 = new THREE.Mesh(fireFlameGeo, fireFlameMaterial);
    const p2 = new THREE.Mesh(fireFlameGeo, fireFlameMaterial);
    p2.rotation.y = Math.PI/2;
    flame.add(p1, p2);
    flame.position.set(x+0.5, y+0.5, z+0.5);
    scene.add(flame);

    fx = { light, flame, phase: Math.random()*Math.PI*2 };
    fireFx.set(key, fx);
  }
  return fx;
}
function removeFireFx(key){
  const fx = fireFx.get(key);
  if(fx){ scene.remove(fx.light); scene.remove(fx.flame); fireFx.delete(key); }
}

// ---------- Water flow: water spreads into adjacent empty gaps/holes over time ----------
// Not a full per-tick fluid simulation across the whole world (way too expensive at this world size,
// and the initial ocean is already "settled" from world-gen — it doesn't need to re-simulate itself
// on load). Instead this is purely reactive and queue-driven: applyWorldEdit calls onWaterRelevantEdit
// below for every edit, and any block breaking (a fresh AIR gap) or water being placed queues the
// cells right around it as flow candidates. Each tick drains a few entries off that queue; a candidate
// that's still empty AND still has a water neighbor becomes water itself and queues its own downstream
// neighbors in turn — so a flow cascades outward exactly like water finding its way into a freshly-dug
// hole, a visible trickle at a time rather than an instant fill. A per-tick rate cap and a max BFS
// distance from the triggering edit keep a tunnel dug next to the ocean from flooding the whole map at
// once. Every client runs this independently off the same synced edits (same client-authoritative, no-
// transactions approach as blocks/fires/saplings elsewhere), so everyone ends up seeing the same flow.
const WATER_FLOW_TICK_S = 0.35;      // how often the flow queue drains
const WATER_FLOW_PER_TICK = 5;       // cells filled per tick — a visible trickle, not instant
const WATER_FLOW_MAX_DIST = 14;      // how far (BFS hops) one flow event can travel from its trigger
// Water only ever spreads down or sideways, never up — a hole dug directly under a lake shouldn't pull
// water out of thin air above it. These two offset lists are deliberately NOT the same set, even
// though they look like they should mirror each other: WATER_SPREAD_OFFSETS is "which of MY neighbors
// might I now be able to reach" (asked by a cell that just became water, so down + sideways); a
// candidate cell's eligibility question is the inverse along the vertical axis — "is there water
// positioned such that it could reach ME" is true if water sits directly ABOVE me (it can drip down)
// or beside me (it can spread sideways), but never if water is merely below me (that would mean water
// flowing upward into me, which real fluid never does).
const WATER_SPREAD_OFFSETS = [[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
const WATER_NEIGHBOR_OFFSETS = [[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
const waterFlowQueue = [];         // [{x,y,z,dist}]
const waterFlowQueued = new Set(); // dedupe key "x,y,z", mirrors what's currently queued
function hasWaterNeighbor(x,y,z){
  for(const [dx,dy,dz] of WATER_NEIGHBOR_OFFSETS) if(getBlock(x+dx,y+dy,z+dz)===WATER) return true;
  return false;
}
function enqueueWaterFlow(x,y,z,dist){
  if(getBlock(x,y,z)!==AIR) return;
  const key = x+','+y+','+z;
  if(waterFlowQueued.has(key)) return;
  waterFlowQueued.add(key);
  waterFlowQueue.push({x,y,z,dist});
}
// Only reacts to a cell turning to AIR (a fresh gap next to water). Deliberately does NOT also react
// to val===WATER here: applyWorldEdit calls this for every edit including the flow system's own
// fills, and reseeding dist=1 every time a fill happens would silently defeat WATER_FLOW_MAX_DIST —
// every new cell would re-announce itself as a fresh distance-1 source forever, so a flow could never
// actually run out of distance budget as long as it kept finding new empty neighbors. updateWaterFlow's
// own explicit dist+1 propagation below is the sole mechanism for cascading a flow forward; placeBlock
// separately calls seedWaterFlowFromPlacement for a genuinely new player-placed water source.
function onWaterRelevantEdit(x,y,z,val){
  if(val===AIR && hasWaterNeighbor(x,y,z)) enqueueWaterFlow(x,y,z,1);
}
// Called once, directly, when a player places a water block — gives its empty neighbors a fresh
// distance-1 source to spread from, same as if a gap had just opened up next to existing water.
function seedWaterFlowFromPlacement(x,y,z){
  for(const [dx,dy,dz] of WATER_SPREAD_OFFSETS) enqueueWaterFlow(x+dx,y+dy,z+dz,1);
}
let waterFlowTimer = 0;
function updateWaterFlow(dt){
  waterFlowTimer -= dt;
  if(waterFlowTimer>0) return;
  waterFlowTimer = WATER_FLOW_TICK_S;
  let filled = 0;
  while(filled<WATER_FLOW_PER_TICK && waterFlowQueue.length){
    const cell = waterFlowQueue.shift();
    waterFlowQueued.delete(cell.x+','+cell.y+','+cell.z);
    if(getBlock(cell.x,cell.y,cell.z)!==AIR) continue; // no longer empty — built on, or already filled
    if(!hasWaterNeighbor(cell.x,cell.y,cell.z)) continue; // stale — its water neighbor is gone now
    applyWorldEdit(cell.x,cell.y,cell.z,WATER,false);
    filled++;
    if(cell.dist<WATER_FLOW_MAX_DIST){
      for(const [dx,dy,dz] of WATER_SPREAD_OFFSETS) enqueueWaterFlow(cell.x+dx,cell.y+dy,cell.z+dz,cell.dist+1);
    }
  }
}

// ---------- Fireworks: unlimited, purely a fun effect — no crafting, never consumed ----------
// A small rocket climbs straight up from wherever you're standing, then blooms into an evenly-
// spaced spherical shower of colored sparks (a fibonacci-sphere point distribution, which reads as
// a symmetric "flower" opening outward rather than a random scatter) with a bright flash-light and
// a boom+crackle sound. Both the climb and the burst are driven from the same per-frame update list
// pattern as fallingClusters/fires, so a burst that's still fading doesn't block launching another.
const FIREWORK_COLORS = [0xff4d4d, 0xffb347, 0xfff066, 0x7cfc8a, 0x66d9ff, 0xb388ff, 0xff7edb, 0xffffff];
const FIREWORK_PARTICLES = 48;
const SPEED_OF_SOUND = 343; // world units (~meters) per second
const fireworks = [];
// Shared by both the local right-click and a remote player's launch synced through Firebase (see
// initMultiplayer's 'world/fireworks' listener), so everyone in the shared world sees and hears the
// same rocket, not just whoever launched it. The launch whistle gets the same speed-of-sound delay
// as the burst boom — for your own launch that's imperceptible (you're right next to it), but a
// firework someone else set off across the map now visibly outraces its own sound for you too.
function spawnFireworkEffect(x,z,startY,targetY){
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1,6,6), new THREE.MeshBasicMaterial({color:0xfff2b0}));
  mesh.position.set(x, startY, z);
  scene.add(mesh);
  const trailLight = new THREE.PointLight(0xfff2b0, 1.4, 6, 2);
  mesh.add(trailLight);
  fireworks.push({ mesh, x, z, startY, targetY, t:0, riseTime: 0.9, burst:null });
  const dist = Math.hypot(x-player.pos.x, startY-(player.pos.y+player.eye), z-player.pos.z);
  setTimeout(()=>SFX.fireworkLaunch(), (dist/SPEED_OF_SOUND)*1000);
}
function launchFirework(){
  const x = player.pos.x, z = player.pos.z;
  const startY = player.pos.y + player.eye;
  const targetY = startY + 9 + Math.random()*5;
  spawnFireworkEffect(x,z,startY,targetY);
  if(fbReady){
    const ref = db.ref('world/fireworks').push({
      x, y:startY, z, targetY, by:myId, t: firebase.database.ServerValue.TIMESTAMP,
    });
    setTimeout(()=> ref.remove(), 3000); // ephemeral event, not persistent world state
  }
}
function createFireworkBurst(x,y,z){
  const n = FIREWORK_PARTICLES;
  const positions = new Float32Array(n*3);
  const velocities = new Float32Array(n*3);
  const colors = new Float32Array(n*3);
  const goldenAngle = Math.PI*(3-Math.sqrt(5));
  const speed = 3.2 + Math.random()*1.6;
  const colorA = new THREE.Color(FIREWORK_COLORS[Math.floor(Math.random()*FIREWORK_COLORS.length)]);
  const colorB = new THREE.Color(FIREWORK_COLORS[Math.floor(Math.random()*FIREWORK_COLORS.length)]);
  for(let i=0;i<n;i++){
    const yv = 1 - (i/(n-1))*2;
    const r = Math.sqrt(Math.max(0, 1-yv*yv));
    const theta = goldenAngle*i;
    const dx = Math.cos(theta)*r, dz = Math.sin(theta)*r;
    positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
    velocities[i*3]=dx*speed; velocities[i*3+1]=yv*speed; velocities[i*3+2]=dz*speed;
    const c = i%2===0 ? colorA : colorB;
    colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const mat = new THREE.PointsMaterial({ size:0.32, vertexColors:true, transparent:true, opacity:1, depthWrite:false, sizeAttenuation:true });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  const light = new THREE.PointLight(colorA.getHex(), 3.2, 14, 2);
  light.position.set(x,y,z);
  scene.add(light);
  return { points, velocities, light, t:0, life:1.3 };
}
function updateFireworkBurst(b, dt){
  const pos = b.points.geometry.attributes.position.array;
  for(let i=0;i<b.velocities.length/3;i++){
    pos[i*3]   += b.velocities[i*3]*dt;
    pos[i*3+1] += b.velocities[i*3+1]*dt;
    pos[i*3+2] += b.velocities[i*3+2]*dt;
    b.velocities[i*3+1] -= 2.2*dt; // gentle droop instead of expanding forever
    b.velocities[i*3]   *= 0.98;
    b.velocities[i*3+2] *= 0.98;
  }
  b.points.geometry.attributes.position.needsUpdate = true;
  b.t += dt;
  const lt = Math.min(1, b.t/b.life);
  b.points.material.opacity = 1-lt;
  b.light.intensity = Math.max(0, 3.2*(1-lt*3)); // the flash itself only lasts the first third
}
function updateFireworks(dt){
  for(let i=fireworks.length-1; i>=0; i--){
    const f = fireworks[i];
    if(!f.burst){
      f.t += dt;
      const p = Math.min(1, f.t/f.riseTime);
      f.mesh.position.y = f.startY + (f.targetY-f.startY)*p;
      if(p>=1){
        const bx=f.mesh.position.x, by=f.mesh.position.y, bz=f.mesh.position.z;
        scene.remove(f.mesh);
        f.burst = createFireworkBurst(bx,by,bz);
        // Light reaches you instantly, sound doesn't — delay the boom by how long it actually takes
        // to travel from the burst to your ears (speed of sound, world units treated as meters), so a
        // burst you're right under is basically instant while a distant one visibly lags its sound.
        const dist = Math.hypot(bx-player.pos.x, by-(player.pos.y+player.eye), bz-player.pos.z);
        setTimeout(()=>SFX.fireworkBurst(), (dist/SPEED_OF_SOUND)*1000);
      }
    } else {
      updateFireworkBurst(f.burst, dt);
      if(f.burst.t>=f.burst.life){
        scene.remove(f.burst.points);
        scene.remove(f.burst.light);
        fireworks.splice(i,1);
      }
    }
  }
}

function findDoorCells(x,y,z){
  const isDoor = b => b===DOOR || b===DOOR_OPEN;
  let baseY = y;
  while(isDoor(getBlock(x,baseY-1,z))) baseY--;
  let axis=null, dir=1;
  if(isDoor(getBlock(x+1,baseY,z))){ axis='x'; dir=1; }
  else if(isDoor(getBlock(x-1,baseY,z))){ axis='x'; dir=-1; }
  else if(isDoor(getBlock(x,baseY,z+1))){ axis='z'; dir=1; }
  else if(isDoor(getBlock(x,baseY,z-1))){ axis='z'; dir=-1; }
  else return null;
  const baseX = axis==='x' ? (dir===1?x:x-1) : x;
  const baseZ = axis==='z' ? (dir===1?z:z-1) : z;
  const cells = [];
  for(let dy=0; dy<3; dy++)
    for(let w=0; w<2; w++)
      cells.push({ x: axis==='x'?baseX+w:baseX, y: baseY+dy, z: axis==='z'?baseZ+w:baseZ });
  return cells;
}
function toggleOpenable(x,y,z,current){
  const opening = current===WINDOW || current===DOOR; // toggling FROM the closed state
  if(current===DOOR || current===DOOR_OPEN){
    const cells = findDoorCells(x,y,z) || [{x,y,z}];
    for(const c of cells) applyWorldEdit(c.x, c.y, c.z, TOGGLE_MAP[current], false);
    SFX.doorToggle(opening);
    return;
  }
  applyWorldEdit(x, y, z, TOGGLE_MAP[current], false);
  SFX.windowToggle(opening);
}
let lastBroadcast = 0;
function broadcastPosition(now){
  if(!fbReady) return;
  if(now - lastBroadcast < 100) return;
  lastBroadcast = now;
  // update(), not set(): a set() would clobber the hp field, which other clients write to directly on attack
  db.ref('players/'+myId).update({
    x: Math.round(player.pos.x*100)/100,
    y: Math.round(player.pos.y*100)/100,
    z: Math.round(player.pos.z*100)/100,
    yaw: Math.round(player.yaw*100)/100,
    t: firebase.database.ServerValue.TIMESTAMP,
  });
}
function initMultiplayer(){
  if(typeof firebase==='undefined' || typeof FIREBASE_CONFIG==='undefined') return;
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();

    myId = localStorage.getItem('blockcraft_player_id');
    if(!myId){
      myId = (crypto.randomUUID ? crypto.randomUUID() : 'p'+Math.random().toString(36).slice(2));
      localStorage.setItem('blockcraft_player_id', myId);
    }

    const myRef = db.ref('players/'+myId);
    myRef.onDisconnect().remove();
    myRef.set({
      x: Math.round(player.pos.x*100)/100, y: Math.round(player.pos.y*100)/100, z: Math.round(player.pos.z*100)/100,
      yaw: Math.round(player.yaw*100)/100, hp: myHP, name: myName, t: firebase.database.ServerValue.TIMESTAMP,
    });
    db.ref('players/'+myId+'/hp').on('value', snap=>{
      const v = snap.val();
      if(v==null || v===myHP) return;
      myHP = v;
      updateHeartsUI();
      if(myHP<=0) die();
    });

    db.ref('world/edits').on('child_added', snap=>{
      const [x,y,z] = snap.key.split(',').map(Number);
      applyWorldEdit(x,y,z,snap.val(),true);
    });
    db.ref('world/edits').on('child_changed', snap=>{
      const [x,y,z] = snap.key.split(',').map(Number);
      applyWorldEdit(x,y,z,snap.val(),true);
    });

    db.ref('world/mobs').on('child_added', snap=>{
      applyRemoteMobHp(snap.key, snap.val() && snap.val().hp);
    });
    db.ref('world/mobs').on('child_changed', snap=>{
      applyRemoteMobHp(snap.key, snap.val() && snap.val().hp);
    });

    db.ref('world/saplings').on('child_added', snap=>{
      const val = snap.val();
      if(!val || saplings.has(snap.key)) return;
      saplings.set(snap.key, { y: val.y, plantedAt: val.t });
    });
    db.ref('world/saplings').on('child_removed', snap=>{
      saplings.delete(snap.key);
    });

    db.ref('world/fires').on('child_added', snap=>{
      const val = snap.val();
      if(!val || fires.has(snap.key)) return;
      fires.set(snap.key, { ignitedAt: val.t });
    });
    db.ref('world/fires').on('child_removed', snap=>{
      fires.delete(snap.key);
      removeFireFx(snap.key);
    });

    db.ref('world/fireworks').on('child_added', snap=>{
      const val = snap.val();
      if(!val || val.by===myId) return; // we already played our own launch locally
      spawnFireworkEffect(val.x, val.z, val.y, val.targetY);
    });

    db.ref('world/worms').on('child_added', snap=>{
      const val = snap.val();
      if(!val) return;
      spawnWorm(snap.key, val.x||0, val.y||0, val.z||0, val.lastAteAt||Date.now(), val.lastReproducedAt||Date.now(), val.eatenCount||0);
    });
    db.ref('world/worms').on('child_changed', snap=>{
      const val = snap.val();
      const w = worms.find(w=>w.id===snap.key);
      if(!w || !val) return;
      if(typeof val.x==='number'){ w.x = val.x+0.5; w.y = val.y+0.25; w.z = val.z+0.5; }
      if(val.lastAteAt) w.lastAteAt = val.lastAteAt;
      if(val.lastReproducedAt) w.lastReproducedAt = val.lastReproducedAt;
      if(typeof val.eatenCount==='number') w.eatenCount = val.eatenCount;
    });
    db.ref('world/worms').on('child_removed', snap=>{
      const w = worms.find(w=>w.id===snap.key);
      if(w) killWorm(w, 'remote');
    });
    // Nobody's created the first worm for this shared world yet — do it once, the same "first client
    // in wins" approach the rest of this file relies on rather than a transaction.
    db.ref('world/worms').once('value').then(snap=>{
      if(snap.exists()) return;
      const spot = findInitialWormSpot();
      if(spot) createWorm(spot.x, spot.y, spot.z);
    });

    db.ref('world/butterflies').on('child_added', snap=>{
      const val = snap.val();
      if(!val) return;
      spawnButterfly(snap.key, val.x||0, val.y||0, val.z||0, val.bornAt||Date.now());
    });
    db.ref('world/butterflies').on('child_removed', snap=>{
      const b = butterflies.find(b=>b.id===snap.key);
      if(b) killButterfly(b, true);
    });

    db.ref('chat').limitToLast(CHAT_HISTORY_LIMIT).on('child_added', snap=>{
      const val = snap.val();
      if(!val || val.by===myId) return; // we already added our own message locally when we sent it
      addChatMessage(val.name||'?', val.text||'');
    });

    db.ref('players').on('child_added', snap=>{
      if(snap.key===myId) return;
      addRemotePlayer(snap.key, snap.val());
    });
    db.ref('players').on('child_changed', snap=>{
      if(snap.key===myId) return;
      updateRemotePlayer(snap.key, snap.val());
    });
    db.ref('players').on('child_removed', snap=>{
      removeRemotePlayer(snap.key);
    });

    document.getElementById('mpStatus').textContent = 'Online';
    fbReady = true;
  }catch(e){
    console.warn('Multiplayer unavailable, playing solo:', e);
    document.getElementById('mpStatus').textContent = 'Offline (solo)';
    fbReady = false;
  }
}

// ---------- First-person view-model (arm + held block, rendered as a separate overlay pass) ----------
let handScene, handCamera, handGroup, armMesh, heldItemMesh;
let handBobPhase = 0, handBobAmp = 0, swingT = 0;
function buildHandModel(){
  handScene = new THREE.Scene();
  handScene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.0));
  handCamera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 10);

  handGroup = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const armGeo = new THREE.BoxGeometry(0.22,0.6,0.22);
  armGeo.translate(0,-0.3,0);
  armMesh = new THREE.Mesh(armGeo, skinMat);
  armMesh.position.set(0.32,-0.05,-0.55);
  armMesh.rotation.set(0.15, 0, -0.25);
  handGroup.add(armMesh);

  heldItemMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.22,0.22), new THREE.MeshLambertMaterial({color:0xffffff}));
  heldItemMesh.position.set(0.32,-0.34,-0.78);
  handGroup.add(heldItemMesh);

  handScene.add(handGroup);
  updateHeldItemColor();
}
function updateHeldItemColor(){
  if(!heldItemMesh) return;
  heldItemMesh.material.color.setHex(BLOCK_COLOR[HOTBAR[selectedSlot]]);
}
function triggerSwing(){ swingT = 1; }
function updateHandView(dt, moving, sprinting){
  handBobAmp += ((moving?1:0) - handBobAmp) * Math.min(1, dt*8);
  handBobPhase += dt * (sprinting?14:9);
  const bobX = Math.sin(handBobPhase) * 0.02 * handBobAmp;
  const bobY = Math.abs(Math.sin(handBobPhase*2)) * 0.015 * handBobAmp;
  swingT = Math.max(0, swingT - dt*4);
  const swing = Math.sin(swingT*Math.PI) * 0.9;
  handGroup.position.set(bobX, -bobY, 0);
  armMesh.rotation.x = 0.15 - swing;
}

function blockSolid(bx,by,bz){
  const b = getBlock(bx,by,bz);
  return b!==AIR && b!==WATER && b!==WINDOW_OPEN && b!==DOOR_OPEN && b!==SAPLING && b!==FIRE && b!==TORCH && b!==LADDER;
}
function collidesBox(px,py,pz){
  const w = player.width/2;
  const minX = Math.floor(px-w), maxX = Math.floor(px+w);
  const minY = Math.floor(py),   maxY = Math.floor(py+player.height);
  const minZ = Math.floor(pz-w), maxZ = Math.floor(pz+w);
  for(let x=minX;x<=maxX;x++)
    for(let y=minY;y<=maxY;y++)
      for(let z=minZ;z<=maxZ;z++)
        if(blockSolid(x,y,z)) return true;
  return false;
}

// ---------- Entity-vs-entity collision (players & animals can't walk through each other) ----------
// excludeAnimal: pass the animal doing the checking (so it also gets checked against the local
// player); leave undefined when the local player itself is the one moving.
// fromX/fromZ: the entity's position BEFORE this move. If given, a candidate that's still inside
// another entity's radius is only blocked when it's not moving away from that entity (i.e. its
// distance didn't increase). Without this, two entities that ever end up overlapping — simultaneous
// spawns, a lagged remote position, a shove from a third entity — would deadlock: every candidate
// position is still "inside" the other one, including every direction that would let them separate,
// so neither side could ever move again.
function entityBlockedByOthers(px,pz,radius,excludeAnimal,fromX,fromZ){
  const wasMoving = fromX!=null;
  for(const a of animals){
    if(a===excludeAnimal) continue;
    const r = radius + (ANIMAL_RADIUS[a.type]||0.4);
    const dx=px-a.x, dz=pz-a.z;
    if(dx*dx+dz*dz >= r*r) continue;
    if(wasMoving){
      const odx=fromX-a.x, odz=fromZ-a.z;
      if(dx*dx+dz*dz >= odx*odx+odz*odz) continue;
    }
    return true;
  }
  if(excludeAnimal){
    const r = radius + player.width/2;
    const dx=px-player.pos.x, dz=pz-player.pos.z;
    if(dx*dx+dz*dz < r*r){
      let blocked = true;
      if(wasMoving){
        const odx=fromX-player.pos.x, odz=fromZ-player.pos.z;
        if(dx*dx+dz*dz >= odx*odx+odz*odz) blocked = false;
      }
      if(blocked) return true;
    }
  }
  for(const [,rp] of remotePlayers){
    const r = radius + player.width/2;
    const dx=px-rp.mesh.position.x, dz=pz-rp.mesh.position.z;
    if(dx*dx+dz*dz >= r*r) continue;
    if(wasMoving){
      const odx=fromX-rp.mesh.position.x, odz=fromZ-rp.mesh.position.z;
      if(dx*dx+dz*dz >= odx*odx+odz*odz) continue;
    }
    return true;
  }
  return false;
}
// Animals don't jump, so a step up of more than one block (a wall, a building) simply blocks them —
// matches how groundHeightAt already snaps them onto gradual terrain.
function animalStepBlocked(nx,nz,baseY){
  return groundHeightAt(nx,nz) - baseY > 1;
}
function stepAnimal(a,dxMove,dzMove){
  const r = ANIMAL_RADIUS[a.type]||0.4;
  const fromX = a.x, fromZ = a.z;
  const tryX = a.x+dxMove;
  if(!animalStepBlocked(tryX,a.z,a.y) && !entityBlockedByOthers(tryX,a.z,r,a,fromX,fromZ)) a.x = tryX;
  const tryZ = a.z+dzMove;
  if(!animalStepBlocked(a.x,tryZ,a.y) && !entityBlockedByOthers(a.x,tryZ,r,a,fromX,fromZ)) a.z = tryZ;
}

function getLookDir(yaw,pitch){
  return new THREE.Vector3(
    -Math.sin(yaw)*Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw)*Math.cos(pitch)
  );
}

function isTouchingLadder(){
  const w = player.width/2;
  const minX = Math.floor(player.pos.x-w), maxX = Math.floor(player.pos.x+w);
  const minY = Math.floor(player.pos.y),   maxY = Math.floor(player.pos.y+player.height);
  const minZ = Math.floor(player.pos.z-w), maxZ = Math.floor(player.pos.z+w);
  for(let x=minX;x<=maxX;x++)
    for(let y=minY;y<=maxY;y++)
      for(let z=minZ;z<=maxZ;z++)
        if(getBlock(x,y,z)===LADDER) return true;
  return false;
}
// A single check at body-center height, not "any part of the hitbox touches water" — so wading
// through ankle-deep shoreline water (only the bottom sliver of the hitbox in a WATER cell) still
// walks normally, and only genuinely being submerged switches on swim controls.
function isInWater(){
  return getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y+player.height*0.5), Math.floor(player.pos.z))===WATER;
}
function updatePlayer(dt){
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx =  Math.cos(player.yaw), rz = -Math.sin(player.yaw);

  let mx=0, mz=0;
  if(keys['KeyW']){ mx+=fx; mz+=fz; }
  if(keys['KeyS']){ mx-=fx; mz-=fz; }
  if(keys['KeyD']){ mx+=rx; mz+=rz; }
  if(keys['KeyA']){ mx-=rx; mz-=rz; }
  const len = Math.hypot(mx,mz);
  if(len>0){ mx/=len; mz/=len; }

  player.crawling = player.crawlMode || !!(keys['ControlLeft']||keys['ControlRight']);
  player.height = player.crawling ? CRAWL_HEIGHT : PLAYER_HEIGHT;
  player.eye = player.crawling ? CRAWL_EYE : PLAYER_EYE;
  const speed = player.crawling ? CRAWL_SPEED : (keys['ShiftLeft']||keys['ShiftRight']) ? SPRINT_SPEED : WALK_SPEED;

  const wasOnGround = player.onGround;
  const onLadder = isTouchingLadder();
  const inWater = isInWater();
  if(inWater && !player.inWater) SFX.splash();
  player.inWater = inWater;

  // Double jump: landing recharges one extra mid-air jump; pressing Space again while already
  // airborne — a genuine fresh press, not just still holding it down from the first jump, which is
  // why this needs edge detection rather than the ground jump's simpler "held + onGround" check —
  // spends it for a second upward boost. It's applied on top of whatever vertical speed you already
  // have at that moment, so timing the second press near the top of the first jump's arc reaches
  // noticeably higher than a single jump ever could.
  if(player.onGround) player.canDoubleJump = true;
  const spaceDown = !!keys['Space'];
  const spaceJustPressed = spaceDown && !player.spaceWasDown;
  player.spaceWasDown = spaceDown;

  if(onLadder){
    // Climbing overrides gravity entirely — hold W/Space to go up, S to go down, let go to hang in
    // place, same feel as swimming.
    let climbY = 0;
    if(keys['KeyW'] || keys['Space']) climbY = LADDER_CLIMB_SPEED;
    else if(keys['KeyS']) climbY = -LADDER_CLIMB_SPEED;
    player.vel.y = climbY;
  } else if(inWater){
    // Only Space actively swims up (not W) — W/A/S/D stay purely horizontal in water, same as on
    // land. Letting go sinks gently by default rather than holding position, so simply holding W to
    // cross a lake no longer keeps you pinned at the surface for free the whole way across; staying
    // up takes actually holding Space, the same way real swimming does. S swims down faster still.
    let swimY = -WATER_SINK_SPEED;
    if(keys['Space']) swimY = SWIM_SPEED;
    else if(keys['KeyS']) swimY = -SWIM_SPEED;
    player.vel.y = swimY;
  } else {
    player.vel.y += GRAVITY*dt;
    if(player.vel.y < -50) player.vel.y = -50;
    if(keys['Space'] && player.onGround){
      player.vel.y = JUMP_SPEED;
      player.onGround = false;
      SFX.jump();
    } else if(spaceJustPressed && !player.onGround && player.canDoubleJump){
      player.vel.y = JUMP_SPEED;
      player.canDoubleJump = false;
      SFX.jump();
    }
  }

  const dx = mx*speed*dt, dz = mz*speed*dt, dy = player.vel.y*dt;

  const pr = player.width/2;
  const fromX = player.pos.x, fromZ = player.pos.z;
  if(!collidesBox(player.pos.x+dx, player.pos.y, player.pos.z) && !entityBlockedByOthers(player.pos.x+dx, player.pos.z, pr, undefined, fromX, fromZ)) player.pos.x += dx;
  if(!collidesBox(player.pos.x, player.pos.y, player.pos.z+dz) && !entityBlockedByOthers(player.pos.x, player.pos.z+dz, pr, undefined, fromX, fromZ)) player.pos.z += dz;
  if(!collidesBox(player.pos.x, player.pos.y+dy, player.pos.z)){
    player.pos.y += dy;
    player.onGround = false;
  } else {
    if(dy<0) player.onGround = true;
    player.vel.y = 0;
  }

  if(!wasOnGround && player.onGround){
    const fallDist = player.fallFrom - player.pos.y;
    if(fallDist > FALL_DAMAGE_FREE_BLOCKS){
      damagePlayer(Math.round(fallDist - FALL_DAMAGE_FREE_BLOCKS), 'fall');
    }
    SFX.land();
  }
  if(player.onGround || onLadder || inWater) player.fallFrom = player.pos.y;

  player.pos.x = Math.max(1, Math.min(WORLD_SIZE-1, player.pos.x));
  player.pos.z = Math.max(1, Math.min(WORLD_SIZE-1, player.pos.z));
  if(player.pos.y < -20) spawnPlayer();

  if(len>0 || !player.onGround || myHP<=0){
    idleTimer = 0;
    regenTimer = 0;
  } else if(myHP < PLAYER_MAX_HP && myHunger>0){
    idleTimer += dt;
    if(idleTimer >= REGEN_IDLE_DELAY){
      regenTimer += dt;
      if(regenTimer >= REGEN_INTERVAL){
        regenTimer -= REGEN_INTERVAL;
        myHP = Math.min(PLAYER_MAX_HP, myHP + HP_PER_HEART/2);
        updateHeartsUI();
        if(fbReady) db.ref('players/'+myId+'/hp').set(myHP);
      }
    }
  }
}

// ---------- Block interaction ----------
function raycastBlock(maxDist=6, step=0.02){
  const dir = getLookDir(player.yaw, player.pitch);
  const origin = camera.position;
  let prev = null;
  for(let t=0; t<maxDist; t+=step){
    const px = origin.x+dir.x*t, py = origin.y+dir.y*t, pz = origin.z+dir.z*t;
    const bx=Math.floor(px), by=Math.floor(py), bz=Math.floor(pz);
    const b = getBlock(bx,by,bz);
    if(b!==AIR && b!==WATER) return { x:bx,y:by,z:bz, prev };
    prev = {x:bx,y:by,z:bz};
  }
  return null;
}
function breakBlock(){
  const hit = raycastBlock();
  if(!hit) return;
  const b = getBlock(hit.x,hit.y,hit.z);
  if(b===BEDROCK) return;
  if(b===DOOR || b===DOOR_OPEN){
    const cells = findDoorCells(hit.x,hit.y,hit.z) || [{x:hit.x,y:hit.y,z:hit.z}];
    for(const c of cells) applyWorldEdit(c.x, c.y, c.z, AIR, false);
    invAdd(DOOR, 1);
    saveInventory();
    updateHotbarUI();
    triggerSwing();
    SFX.breakBlock();
    return;
  }
  if(b===SAPLING){
    const cells = findSaplingColumn(hit.x,hit.y,hit.z);
    for(const c of cells) applyWorldEdit(c.x, c.y, c.z, AIR, false);
    cancelSapling(hit.x, hit.z);
    updateHotbarUI();
    triggerSwing();
    SFX.breakBlock();
    return;
  }
  if(b===FIRE){
    extinguishFire(hit.x+','+hit.y+','+hit.z);
    triggerSwing();
    SFX.breakBlock();
    return;
  }
  applyWorldEdit(hit.x, hit.y, hit.z, AIR, false);
  if(COLLECTIBLE.has(b)){ invAdd(COLLECT_AS[b] || b, 1); saveInventory(); }
  if(b===WOOD) checkTreeSupport(hit.x, hit.y, hit.z);
  updateHotbarUI();
  triggerSwing();
  SFX.breakBlock();
}
function playerOverlapsCell(x,y,z){
  const w = player.width/2;
  const px=player.pos.x, py=player.pos.y, pz=player.pos.z;
  return (x+1>px-w && x<px+w && z+1>pz-w && z<pz+w && y<py+player.height && y+1>py);
}
function animalOverlapsCell(a,x,y,z){
  const r = ANIMAL_RADIUS[a.type]||0.4;
  const h = ANIMAL_REAL_HEIGHT[a.type]||0.8;
  return (x+1>a.x-r && x<a.x+r && z+1>a.z-r && z<a.z+r && y<a.y+h && y+1>a.y);
}
function placeDoor(hit){
  const {x,y,z} = hit.prev;
  if(invCount(DOOR)<=0) return;
  // Orientation is driven by which way the player is actually looking (yaw), not by which exact
  // face the raycast happened to hit — the old face-normal approach could pick a different axis
  // depending on subtle aim differences even when the player felt like they were facing the same
  // way, which read as "random." Facing more along X/Z decides the door's width axis (perpendicular
  // to your view, like something you'd walk through), and it always extends toward your right hand
  // from the cell you targeted, so the same aim always produces the same door.
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const axis = Math.abs(fx) > Math.abs(fz) ? 'z' : 'x';
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  const widthDir = (axis==='x' ? rx : rz) >= 0 ? 1 : -1;
  const cells = [];
  for(let dy=0; dy<3; dy++)
    for(let w=0; w<2; w++)
      cells.push({ x: axis==='x'?x+w*widthDir:x, y: y+dy, z: axis==='z'?z+w*widthDir:z });
  for(const c of cells){
    if(getBlock(c.x,c.y,c.z)!==AIR) return;
    if(playerOverlapsCell(c.x,c.y,c.z)) return;
  }
  for(const c of cells) applyWorldEdit(c.x, c.y, c.z, DOOR, false);
  invSub(DOOR,1);
  saveInventory();
  updateHotbarUI();
  triggerSwing();
  SFX.placeBlock();
}
const LADDER_PLACE_HEIGHT = 5;
// One Ladder item places a run of up to 5 rungs going straight up from the targeted cell (stopping
// early if it runs into something, rather than requiring the full run to be clear like a door does)
// — climbing any of them is handled in updatePlayer via isTouchingLadder.
function placeLadder(hit){
  const {x,y,z} = hit.prev;
  if(invCount(LADDER)<=0) return;
  const cells = [];
  for(let dy=0; dy<LADDER_PLACE_HEIGHT; dy++){
    const cy = y+dy;
    if(getBlock(x,cy,z)!==AIR || playerOverlapsCell(x,cy,z)) break;
    cells.push({x,y:cy,z});
  }
  if(cells.length===0) return;
  for(const c of cells) applyWorldEdit(c.x, c.y, c.z, LADDER, false);
  invSub(LADDER,1);
  saveInventory();
  updateHotbarUI();
  triggerSwing();
  SFX.placeBlock();
}
function placeBlock(){
  const hit = raycastBlock();
  if(!hit || !hit.prev) return;
  const block = HOTBAR[selectedSlot];
  if(block===DOOR){ placeDoor(hit); return; }
  if(block===LADDER){ placeLadder(hit); return; }
  const {x,y,z} = hit.prev;
  if(getBlock(x,y,z)!==AIR) return;
  if(invCount(block)<=0) return;
  if(playerOverlapsCell(x,y,z)) return;
  applyWorldEdit(x, y, z, block, false);
  if(block===WATER) seedWaterFlowFromPlacement(x, y, z);
  invSub(block,1);
  saveInventory();
  updateHotbarUI();
  triggerSwing();
  SFX.placeBlock();
}

// ---------- Input ----------
const keys = {};
let selectedSlot = 0;
// Direct letter shortcuts for the hotbar, one per slot — no numbers, no scroll-wheel cycling.
// Picked to avoid every letter already bound to something else (WASD move, E craft, I inventory,
// V third-person), and clustered near WASD so they're reachable without moving your hand.
const HOTBAR_KEYS = ['KeyQ','KeyR','KeyF','KeyT','KeyG','KeyC','KeyX','KeyZ','KeyB'];
window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(e.code==='KeyD' && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey){
    // Alt+Shift+D (Option+Shift+D on macOS) rather than Ctrl/Cmd+Shift+D — that one's "bookmark all
    // tabs" in Chrome on both Windows/Linux (Ctrl+Shift+D) and macOS (Cmd+Shift+D), and neither Chrome
    // nor macOS binds anything to Alt+Shift+D by default.
    e.preventDefault();
    toggleDebugPanel();
    return;
  }
  if(e.code==='Escape'){
    if(craftingOpen){ closeCrafting(false); return; }
    if(itemsOpen){ closeItems(false); return; }
  }
  if(e.code==='KeyE'){
    if(craftingOpen){ closeCrafting(false); return; }
    if(locked && !isDead && nearestCraftingTable(4)) openCrafting();
    return;
  }
  if(e.code==='KeyI'){
    if(itemsOpen){ closeItems(true); return; }
    if(craftingOpen) return;
    if(locked && !isDead) openItems();
    return;
  }
  if(e.code==='KeyV' && locked){ thirdPerson = !thirdPerson; return; }
  if(e.code==='KeyN' && locked){ cycleTimeMode(); return; }
  if(e.code==='KeyL' && locked){ player.crawlMode = !player.crawlMode; return; }
  if(e.code==='Enter'){
    // Chat itself is focused while typing, so its own keydown listener (stopPropagation) handles
    // Enter-to-send/Escape-to-cancel from here on — this only ever fires the "not open yet" case.
    if(!chatOpen && !craftingOpen && !itemsOpen && locked && !isDead) openChat();
    return;
  }
  const slotIdx = HOTBAR_KEYS.indexOf(e.code);
  if(slotIdx>=0 && slotIdx<HOTBAR.length){
    selectedSlot = slotIdx; updateHotbarUI(); updateHeldItemColor();
    if(itemsOpen) renderItemsGrid();
  }
});
window.addEventListener('keyup', e=>{ keys[e.code]=false; });

const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
function doAttackOrBreak(){ if(!tryAttack()) breakBlock(); }
function tryEatMeat(){
  if(invCount(MEAT)<=0 || myHunger>=PLAYER_MAX_HUNGER) return;
  invSub(MEAT,1);
  saveInventory();
  updateHotbarUI();
  myHunger = Math.min(PLAYER_MAX_HUNGER, myHunger + MEAT_HUNGER_RESTORE);
  updateHungerUI();
  SFX.eat();
}
function doInteract(){
  const hit = raycastBlock();
  const hitBlock = hit ? getBlock(hit.x,hit.y,hit.z) : null;
  if(HOTBAR[selectedSlot]===FLINT){ tryIgniteFire(hit); return; }
  if(HOTBAR[selectedSlot]===FIREWORK){ launchFirework(); return; }
  if(HOTBAR[selectedSlot]===MEAT){ tryEatMeat(); return; }
  if(hitBlock===CRAFTING_TABLE) openCrafting();
  else if(hitBlock in TOGGLE_MAP) toggleOpenable(hit.x, hit.y, hit.z, hitBlock);
  else placeBlock();
}

const overlay = document.getElementById('overlay');
const touchControls = document.getElementById('touchControls');
let locked = false;
const nameInput = document.getElementById('nameInput');
nameInput.value = myName==='Player' ? '' : myName;
nameInput.addEventListener('click', e=> e.stopPropagation());
nameInput.addEventListener('touchstart', e=> e.stopPropagation());
nameInput.addEventListener('keydown', e=> e.stopPropagation());
if(isTouchDevice){
  document.body.classList.add('touch-device');
  const controlsP = document.getElementById('controlsText');
  if(controlsP) controlsP.innerHTML = 'A tiny Minecraft-inspired voxel sandbox that runs entirely in your browser.<br><br>Left stick: move &nbsp; Drag right side: look<br>⛏ break/attack &nbsp; ▦ place/interact &nbsp; JUMP jump &nbsp; CRAWL hold to crawl &nbsp; 3rd camera &nbsp; 🕐 cycle day/night &nbsp; 💬 chat';
  const tapP = document.getElementById('tapToPlay');
  if(tapP) tapP.innerHTML = '<strong>Tap anywhere to play</strong>';
  const hintP = document.getElementById('playHint');
  if(hintP) hintP.textContent = 'Break blocks to gather materials, then place your Crafting Table and tap it to craft — including windows and doors, which you can tap to open or close. Cows and sheep are harmless — dogs, giraffes, lions and elephants will fight back if you attack them, and lions and elephants will attack on sight if you get too close. Progress is saved automatically in this browser.';
}
overlay.addEventListener('click', ()=>{
  ensureAudio();
  if(craftingOpen) return;
  const typedName = nameInput.value.trim().slice(0,16);
  if(typedName) myName = typedName;
  try{ localStorage.setItem('blockcraft_player_name', myName); }catch(e){}
  if(fbReady && myId) db.ref('players/'+myId+'/name').set(myName);
  if(isTouchDevice){
    locked = true;
    overlay.hidden = true;
    touchControls.hidden = false;
  } else {
    document.body.requestPointerLock();
  }
});
document.addEventListener('pointerlockchange', ()=>{
  if(isTouchDevice) return;
  locked = document.pointerLockElement === document.body;
  overlay.hidden = locked || craftingOpen || itemsOpen || chatOpen;
});
document.addEventListener('mousemove', e=>{
  if(!locked || isTouchDevice) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
});
document.addEventListener('contextmenu', e=> e.preventDefault());
document.addEventListener('mousedown', e=>{
  if(!locked || isDead) return;
  if(e.button===0) doAttackOrBreak();
  if(e.button===2) doInteract();
});

// ---------- Touch controls (phones/tablets: virtual joystick, drag-look, action buttons) ----------
if(isTouchDevice){
  const joyBase = document.getElementById('joystickBase');
  const joyKnob = document.getElementById('joystickKnob');
  const maxR = 38;
  let joyTouchId = null, joyCenter = {x:0,y:0};
  function setMoveKeys(forward, strafe, mag){
    keys['KeyW'] = forward > 0.25;
    keys['KeyS'] = forward < -0.25;
    keys['KeyD'] = strafe > 0.25;
    keys['KeyA'] = strafe < -0.25;
    keys['ShiftLeft'] = mag > 0.85;
  }
  function updateJoystick(cx,cy){
    const dx = cx-joyCenter.x, dy = cy-joyCenter.y;
    const dist = Math.hypot(dx,dy);
    const clamped = Math.min(dist, maxR);
    const ang = Math.atan2(dy,dx);
    const kx = Math.cos(ang)*clamped, ky = Math.sin(ang)*clamped;
    joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
    setMoveKeys(-(ky/maxR), kx/maxR, clamped/maxR);
  }
  function resetJoystick(){
    joyTouchId = null;
    joyKnob.style.transform = 'translate(0px,0px)';
    setMoveKeys(0,0,0);
  }
  joyBase.addEventListener('touchstart', e=>{
    const t = e.changedTouches[0];
    joyTouchId = t.identifier;
    const rect = joyBase.getBoundingClientRect();
    joyCenter = { x: rect.left+rect.width/2, y: rect.top+rect.height/2 };
    updateJoystick(t.clientX, t.clientY);
    e.preventDefault();
  }, {passive:false});
  joyBase.addEventListener('touchmove', e=>{
    for(const t of e.changedTouches) if(t.identifier===joyTouchId) updateJoystick(t.clientX, t.clientY);
    e.preventDefault();
  }, {passive:false});
  joyBase.addEventListener('touchend', e=>{
    for(const t of e.changedTouches) if(t.identifier===joyTouchId) resetJoystick();
  });
  joyBase.addEventListener('touchcancel', resetJoystick);

  const lookZone = document.getElementById('touchLookZone');
  let lookTouchId = null, lastLook = {x:0,y:0};
  lookZone.addEventListener('touchstart', e=>{
    if(craftingOpen) return;
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lastLook = {x:t.clientX, y:t.clientY};
    e.preventDefault();
  }, {passive:false});
  lookZone.addEventListener('touchmove', e=>{
    for(const t of e.changedTouches){
      if(t.identifier===lookTouchId){
        const dx = t.clientX-lastLook.x, dy = t.clientY-lastLook.y;
        lastLook = {x:t.clientX, y:t.clientY};
        player.yaw -= dx*0.0045;
        player.pitch -= dy*0.0045;
        player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
      }
    }
    e.preventDefault();
  }, {passive:false});
  lookZone.addEventListener('touchend', e=>{
    for(const t of e.changedTouches) if(t.identifier===lookTouchId) lookTouchId = null;
  });

  function bindTouchButton(id, onDown, onUp){
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e=>{ e.preventDefault(); e.stopPropagation(); onDown(); }, {passive:false});
    if(onUp) el.addEventListener('touchend', e=>{ e.preventDefault(); e.stopPropagation(); onUp(); }, {passive:false});
  }
  bindTouchButton('btnAttack', ()=>{ if(locked && !craftingOpen && !isDead) doAttackOrBreak(); });
  bindTouchButton('btnPlace', ()=>{ if(locked && !craftingOpen && !isDead) doInteract(); });
  bindTouchButton('btnJump', ()=>{ keys['Space']=true; }, ()=>{ keys['Space']=false; });
  const crawlBtn = document.getElementById('btnCrawl');
  bindTouchButton('btnCrawl', ()=>{ keys['ControlLeft']=true; crawlBtn.classList.add('active'); }, ()=>{ keys['ControlLeft']=false; crawlBtn.classList.remove('active'); });
  bindTouchButton('btn3p', ()=>{ if(locked) thirdPerson = !thirdPerson; });
  bindTouchButton('btnTime', ()=>{ if(locked) cycleTimeMode(); });
  bindTouchButton('btnChat', ()=>{ if(locked && !isDead) openChat(); });
}

// ---------- Debug panel (Alt+Shift+D) ----------
// A read-only developer overlay: a full census of every block currently in the world (trees, wood,
// leaves, water called out up top, everything else below) plus a grab-bag of other live counts that
// are handy to eyeball while testing. It doesn't pause the game or grab the pointer — it's just an
// overlay, like Minecraft's own F3 screen — and refreshes on a slow timer while open rather than every
// frame, since walking the whole world array is cheap but pointless to redo 60 times a second for
// numbers that only change when someone breaks a block or a worm eats a leaf.
// "Trees" specifically counts live trunk bases — a WOOD block sitting directly on the natural terrain
// surface (heightAt(x,z)+1) — rather than trying to flood-fill distinct trees out of the census, which
// runs into the exact same neighboring-trees-blur problem already noted on checkTreeSupport. This
// undercounts a giant tree as just one tree (correct) and only counts ones with an intact base (also
// what "how many trees are still standing" should mean), at the cost of occasionally miscounting a
// single player-placed wood block that happens to sit exactly at natural ground level as a "tree" —
// an acceptable rough edge for a debug readout, not a scored feature.
let debugPanelOpen = false;
let debugPanelTimer = 0;
function debugBlockName(id){
  if(id===AIR) return 'Air';
  if(id===BEDROCK) return 'Bedrock';
  return BLOCK_NAME[id] || ('Block #'+id);
}
function computeWorldCensus(){
  const counts = new Uint32Array(256);
  for(let i=0;i<world.length;i++) counts[world[i]]++;
  let treeCount = 0;
  for(let x=0;x<WORLD_SIZE;x++){
    for(let z=0;z<WORLD_SIZE;z++){
      const h = heightAt(x,z);
      if(h+1<WORLD_HEIGHT && getBlock(x,h+1,z)===WOOD) treeCount++;
    }
  }
  return { counts, treeCount };
}
function renderDebugPanel(){
  const panel = document.getElementById('debugPanel');
  if(!panel || !debugPanelOpen) return;
  const { counts, treeCount } = computeWorldCensus();
  const rows = [];
  for(let id=1; id<256; id++) if(counts[id]>0) rows.push({ id, name: debugBlockName(id), count: counts[id] });
  rows.sort((a,b)=>b.count-a.count);
  const chunkX = Math.floor(player.pos.x/CHUNK_SIZE), chunkZ = Math.floor(player.pos.z/CHUNK_SIZE);
  const fps = document.getElementById('fps');
  panel.innerHTML = `
    <h3>World census</h3>
    <table>
      <tr><td>🌳 Trees (standing)</td><td>${treeCount.toLocaleString()}</td></tr>
      <tr><td>🪵 Wood if all cut</td><td>${(counts[WOOD]||0).toLocaleString()}</td></tr>
      <tr><td>🍃 Leaves blocks</td><td>${(counts[LEAVES]||0).toLocaleString()}</td></tr>
      <tr><td>💧 Water blocks</td><td>${(counts[WATER]||0).toLocaleString()}</td></tr>
    </table>
    <h3>All block types</h3>
    <table>${rows.map(r=>`<tr><td>${r.name}</td><td>${r.count.toLocaleString()}</td></tr>`).join('')}</table>
    <h3>Live stats</h3>
    <table>
      <tr><td>FPS</td><td>${fps?fps.textContent:'?'}</td></tr>
      <tr><td>Block edits</td><td>${edits.size.toLocaleString()}</td></tr>
      <tr><td>Chunk meshes built</td><td>${chunkMeshes.size} / ${CHUNKS_PER_SIDE*CHUNKS_PER_SIDE}</td></tr>
      <tr><td>Animals</td><td>${animals.length}</td></tr>
      <tr><td>Worms</td><td>${worms.length}</td></tr>
      <tr><td>Butterflies</td><td>${butterflies.length}</td></tr>
      <tr><td>Birds</td><td>${birds.length}</td></tr>
      <tr><td>Fish</td><td>${fish.length}</td></tr>
      <tr><td>Active fires</td><td>${fires.size}</td></tr>
      <tr><td>Falling clusters</td><td>${fallingClusters.length}</td></tr>
      <tr><td>Players online</td><td>${remotePlayers.size+1}</td></tr>
      <tr><td>Multiplayer</td><td>${fbReady?'Online':'Offline (solo)'}</td></tr>
      <tr><td>Your position</td><td>${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}</td></tr>
      <tr><td>Your chunk</td><td>${chunkX}, ${chunkZ}</td></tr>
      <tr><td>World size</td><td>${WORLD_SIZE}×${WORLD_SIZE}×${WORLD_HEIGHT}</td></tr>
    </table>
  `;
}
function toggleDebugPanel(){
  debugPanelOpen = !debugPanelOpen;
  const panel = document.getElementById('debugPanel');
  if(panel) panel.hidden = !debugPanelOpen;
  if(debugPanelOpen){ debugPanelTimer = 0; renderDebugPanel(); }
}

function swatchColor(id){ return '#' + BLOCK_COLOR[id].toString(16).padStart(6,'0'); }

function updateHotbarUI(){
  const el = document.getElementById('hotbar');
  el.innerHTML = '';
  HOTBAR.forEach((b,i)=>{
    const count = invCount(b);
    const slot = document.createElement('div');
    slot.className = 'slot' + (i===selectedSlot ? ' active' : '') + (count<=0 ? ' empty' : '');
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = swatchColor(b);
    slot.appendChild(sw);
    if(HOTBAR_ICON[b]){
      const icon = document.createElement('div');
      icon.className = 'icon';
      icon.textContent = HOTBAR_ICON[b];
      slot.appendChild(icon);
    }
    const key = document.createElement('div');
    key.className='key'; key.textContent = HOTBAR_KEYS[i] ? HOTBAR_KEYS[i].slice(3) : '';
    slot.appendChild(key);
    const count_el = document.createElement('div');
    count_el.className='count'; count_el.textContent = count===Infinity ? '∞' : count;
    slot.appendChild(count_el);
    slot.title = BLOCK_NAME[b] + ' (click again to change)';
    slot.addEventListener('click', ()=>{
      if(selectedSlot===i) openItems();
      else { selectedSlot = i; updateHotbarUI(); updateHeldItemColor(); }
    });
    el.appendChild(slot);
  });
  if(craftingOpen) renderCrafting();
}

// ---------- Crafting UI ----------
let craftingOpen = false;
const craftingModal = document.getElementById('craftingModal');
const craftHint = document.getElementById('craftHint');
document.getElementById('craftingClose').addEventListener('click', ()=> closeCrafting(true));
craftingModal.addEventListener('click', e=>{ if(e.target===craftingModal) closeCrafting(true); });

function openCrafting(){
  craftingOpen = true;
  craftingModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderCrafting();
}
function closeCrafting(relock){
  craftingOpen = false;
  craftingModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}
function renderCrafting(){
  const invEl = document.getElementById('craftingInventory');
  invEl.innerHTML = '';
  const held = Object.keys(inventory).map(Number).filter(id => invCount(id)>0);
  if(held.length===0){
    invEl.innerHTML = '<span style="opacity:0.6">Nothing yet — break some blocks to gather materials.</span>';
  } else {
    held.forEach(id=>{
      const row = document.createElement('div');
      row.className = 'invItem';
      row.innerHTML = `<span class="sw" style="background:${swatchColor(id)}"></span>${BLOCK_NAME[id]} × ${invCount(id)}`;
      invEl.appendChild(row);
    });
  }

  const recEl = document.getElementById('craftingRecipes');
  recEl.innerHTML = '';
  RECIPES.forEach((r,i)=>{
    const ok = canCraft(r);
    const row = document.createElement('div');
    row.className = 'recipe';
    const needText = r.in.map(ing => `${ing.qty} ${BLOCK_NAME[ing.id]} (have ${invCount(ing.id)})`).join(', ');
    row.innerHTML = `
      <span class="sw" style="background:${swatchColor(r.out.id)}"></span>
      <div class="info"><b>${r.name} × ${r.out.qty}</b><span class="need${ok?'':' short'}">Needs: ${needText}</span></div>
    `;
    const btn = document.createElement('button');
    btn.textContent = 'Craft';
    btn.disabled = !ok;
    btn.addEventListener('click', ()=>{ craft(r); renderCrafting(); });
    row.appendChild(btn);
    recEl.appendChild(row);
  });
}

// ---------- Items panel (pick what goes in the currently-selected hotbar slot) ----------
let itemsOpen = false;
const itemsModal = document.getElementById('itemsModal');
document.getElementById('itemsClose').addEventListener('click', ()=> closeItems(true));
itemsModal.addEventListener('click', e=>{ if(e.target===itemsModal) closeItems(true); });
document.getElementById('btnItems').addEventListener('click', ()=>{ if(locked && !isDead) openItems(); });
function openItems(){
  itemsOpen = true;
  itemsModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderItemsGrid();
}
function closeItems(relock){
  itemsOpen = false;
  itemsModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}
function makeItemTile(id){
  const count = invCount(id);
  const tile = document.createElement('div');
  tile.className = 'itemTile' + (HOTBAR[selectedSlot]===id ? ' active' : '') + (count<=0 ? ' empty' : '');
  const sw = document.createElement('div');
  sw.className = 'swatch';
  sw.style.background = swatchColor(id);
  tile.appendChild(sw);
  if(HOTBAR_ICON[id]){
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.textContent = HOTBAR_ICON[id];
    tile.appendChild(icon);
  }
  const countEl = document.createElement('div');
  countEl.className = 'itemCount';
  countEl.textContent = count===Infinity ? '∞' : (count>0 ? count : '');
  tile.appendChild(countEl);
  const label = document.createElement('div');
  label.className = 'itemLabel';
  label.textContent = BLOCK_NAME[id];
  tile.appendChild(label);
  tile.title = BLOCK_NAME[id] + (count===Infinity ? ' — unlimited' : (count>0 ? ` — you have ${count}` : ' — you have none yet'));
  tile.addEventListener('click', ()=>{
    HOTBAR[selectedSlot] = id;
    saveHotbar();
    updateHotbarUI();
    updateHeldItemColor();
    renderItemsGrid();
  });
  return tile;
}
function renderItemsGrid(){
  document.getElementById('itemsSlotNum').textContent = HOTBAR_KEYS[selectedSlot] ? HOTBAR_KEYS[selectedSlot].slice(3) : selectedSlot+1;
  const grid = document.getElementById('itemsGrid');
  grid.innerHTML = '';
  const held = ALL_ITEMS.filter(id => invCount(id)>0);
  const rest = ALL_ITEMS.filter(id => invCount(id)<=0);
  if(held.length>0){
    const lbl = document.createElement('div');
    lbl.className = 'sectionLabel';
    lbl.textContent = 'Your items';
    grid.appendChild(lbl);
    held.forEach(id => grid.appendChild(makeItemTile(id)));
  }
  if(rest.length>0){
    const lbl = document.createElement('div');
    lbl.className = 'sectionLabel';
    lbl.textContent = 'Not yet obtained';
    grid.appendChild(lbl);
    rest.forEach(id => grid.appendChild(makeItemTile(id)));
  }
}

// ---------- Chat ----------
// Enter opens a text box; Enter again sends, Escape cancels — the exact same exitPointerLock()-while-
// open / requestPointerLock()-to-resume pattern crafting/items already use, so typing never fights
// with WASD/mouse-look. The input itself stops its own keydown from bubbling to the game's global
// handler (the same trick the pre-game name field already relies on), so none of the letters you type
// ever get misread as a hotbar/inventory/craft shortcut.
// Messages sync through Firebase under 'chat/<id>' like everything else in the shared world, read back
// via a query capped to CHAT_HISTORY_LIMIT so a long-lived world's full chat history is never fully
// downloaded or held in memory — only the most recent messages. A sent message is added to the local
// log immediately (optimistic, matching how block edits/fireworks already work) and the 'by' field
// lets the child_added listener recognize and skip its own message when Firebase echoes it back.
const CHAT_HISTORY_LIMIT = 50;
const CHAT_DISPLAY_LIMIT = 8; // how many recent lines actually stay on screen
const CHAT_MIN_SEND_INTERVAL_MS = 600; // a light guard against accidental double-sends, not moderation
let chatOpen = false;
let lastChatSendAt = 0;
const chatMessages = [];
const chatLogEl = document.getElementById('chatLog');
const chatInputBar = document.getElementById('chatInputBar');
const chatInput = document.getElementById('chatInput');
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function renderChatLog(){
  chatLogEl.innerHTML = chatMessages.slice(-CHAT_DISPLAY_LIMIT)
    .map(m => `<div class="chatLine"><b>${escapeHtml(m.name)}:</b> ${escapeHtml(m.text)}</div>`).join('');
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}
function addChatMessage(name, text){
  chatMessages.push({ name, text });
  if(chatMessages.length > CHAT_HISTORY_LIMIT) chatMessages.shift();
  renderChatLog();
}
function openChat(){
  if(chatOpen || craftingOpen || itemsOpen || isDead) return;
  chatOpen = true;
  chatInputBar.hidden = false;
  chatInput.value = '';
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  chatInput.focus();
}
function closeChat(relock){
  chatOpen = false;
  chatInputBar.hidden = true;
  chatInput.blur();
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}
function sendChatMessage(){
  const text = chatInput.value.trim().slice(0,200);
  const now = Date.now();
  if(text && now-lastChatSendAt >= CHAT_MIN_SEND_INTERVAL_MS){
    lastChatSendAt = now;
    addChatMessage(myName, text);
    if(fbReady) db.ref('chat').push({ name: myName, text, by: myId, t: firebase.database.ServerValue.TIMESTAMP });
  }
  closeChat(true);
}
chatInput.addEventListener('click', e=> e.stopPropagation());
chatInput.addEventListener('touchstart', e=> e.stopPropagation());
chatInput.addEventListener('keydown', e=>{
  e.stopPropagation();
  if(e.code==='Enter') sendChatMessage();
  else if(e.code==='Escape') closeChat(true);
});

// ---------- Init & loop ----------
function init(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd0ee);
  scene.fog = new THREE.Fog(0x8fd0ee, FAR*0.35, FAR);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, FAR);
  camera.rotation.order = 'YXZ';

  // Lights up around you while a Torch is your held item, same warm glow as a placed one — off
  // otherwise. A child of the camera so it always tracks wherever you're looking/standing for free.
  heldTorchLight = new THREE.PointLight(0xffb060, 1.1, 8, 2);
  heldTorchLight.visible = false;
  camera.add(heldTorchLight);
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  hemiLight = new THREE.HemisphereLight(0xffffff, 0x445533, 0.9);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
  sunLight.position.set(80,120,40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1536,1536);
  // The shadow camera is a small box that follows the player (see updateDayNight) rather than
  // trying to cover the whole 128x128 world at once — keeps shadow resolution usable regardless of
  // how big the world is. SHADOW_RADIUS/far need to stay in sync with the light's own orbit radius.
  const sc = sunLight.shadow.camera;
  sc.left = -SHADOW_RADIUS; sc.right = SHADOW_RADIUS;
  sc.top = SHADOW_RADIUS; sc.bottom = -SHADOW_RADIUS;
  sc.near = 1; sc.far = SUN_ORBIT_R*2.2;
  sunLight.shadow.bias = -0.0015;
  scene.add(sunLight);
  scene.add(sunLight.target);
  buildCelestialBodies();

  characterMesh = createCharacterMesh();
  characterMesh.visible = false;
  myNameTag = createNameTagSprite();
  characterMesh.add(myNameTag.sprite);
  scene.add(characterMesh);
  buildHandModel();
  renderer.autoClear = false;

  generateWorld();
  loadEdits();
  restoreTorchLights();
  buildMinimapTerrain();
  loadInventory();
  loadHotbar();
  rebuildAllChunks();
  spawnPlayer();
  spawnAnimals();
  updateHotbarUI();
  updateHeldItemColor();
  updateHeartsUI();
  updateHungerUI();
  initMultiplayer();
  // Firebase (when available) owns worm creation — see the 'world/worms' once('value') check in
  // initMultiplayer — so a fresh, unconnected worm doesn't pop into existence on every single client's
  // load. Solo/offline play has no such shared state to check, so it keeps the old local-only spawn.
  if(!fbReady){
    const spot = findInitialWormSpot();
    if(spot) spawnWorm('local_'+Math.random().toString(36).slice(2,10), spot.x, spot.y, spot.z, Date.now(), Date.now(), 0);
  }

  window.addEventListener('resize', ()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    handCamera.aspect = window.innerWidth/window.innerHeight;
    handCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  requestAnimationFrame(animate);
}

let lastTime = performance.now();
let fpsCount=0, fpsTimer=0;
function animate(now){
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now-lastTime)/1000);
  lastTime = now;

  if(locked && !isDead) updatePlayer(dt);
  updateDeathState(dt);

  const moving = locked && !isDead && (keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD']);
  const sprinting = !!(keys['ShiftLeft']||keys['ShiftRight']);
  updateCharacterAnim(dt, moving, sprinting);
  updateHandView(dt, moving, sprinting);
  updateRemotePlayers(dt);
  updateAnimals(dt);
  updateRespawns(dt);
  updateFallingClusters(dt);
  updateSaplings(dt);
  updateTreeRegrowth(dt);
  updateFires(dt);
  updateWaterFlow(dt);
  updateFireworks(dt);
  updateFireflies(dt);
  updateWorms(dt);
  updateButterflies(dt);
  updateGhost(dt);
  updateBirds(dt);
  updateFish(dt);
  updateBigEagles(dt);
  updateGophers(dt);
  heldTorchLight.visible = HOTBAR[selectedSlot]===TORCH;
  if(heldTorchLight.visible) heldTorchLight.intensity = 1.0 + Math.random()*0.3;
  updateDayNight();
  updateWeather(dt);
  updateTemperature(dt);
  updateHunger(dt);
  broadcastPosition(now);

  if(thirdPerson){
    characterMesh.visible = true;
    const dir = getLookDir(player.yaw, player.pitch);
    const dist = 4.5;
    camera.position.set(
      player.pos.x - dir.x*dist,
      player.pos.y + player.eye - dir.y*dist,
      player.pos.z - dir.z*dist
    );
    camera.lookAt(player.pos.x, player.pos.y+player.eye, player.pos.z);
  } else {
    characterMesh.visible = false;
    camera.rotation.set(player.pitch, player.yaw, 0);
    camera.position.set(player.pos.x, player.pos.y+player.eye, player.pos.z);
  }

  renderer.clear();
  renderer.render(scene, camera);
  if(!thirdPerson){
    renderer.clearDepth();
    renderer.render(handScene, handCamera);
  }

  craftHint.classList.toggle('show', locked && !craftingOpen && nearestCraftingTable(4));

  const coordsEl = document.getElementById('coordsLabel');
  if(coordsEl) coordsEl.textContent = `${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}`;
  updateMinimap();

  fpsTimer += dt; fpsCount++;
  if(fpsTimer>=0.5){
    document.getElementById('fps').textContent = Math.round(fpsCount/fpsTimer);
    fpsTimer=0; fpsCount=0;
    document.getElementById('wormCount').textContent = worms.length;
    document.getElementById('butterflyCount').textContent = butterflies.length;
  }

  if(debugPanelOpen){
    debugPanelTimer -= dt;
    if(debugPanelTimer<=0){ debugPanelTimer = 2; renderDebugPanel(); }
  }
}

// ---------- Update checker ----------
// Detects when a newer build has been deployed while this tab is still open, and shows a small
// persistent banner nudging the player to reload — the exact class of confusion a stale cached script
// has caused before in this project (fireworks that seemed not to sync, a hotkey that silently did
// nothing), just surfaced proactively instead of debugged after the fact. No version number to
// remember to bump by hand: it just compares main.js's own ETag/Last-Modified HTTP header against
// whatever it was the last time this tab checked. If neither header is available (some local dev
// servers, or a fetch that fails for any reason) it silently does nothing rather than false-alarm.
const UPDATE_CHECK_INTERVAL_MS = 5*60*1000; // every 5 real minutes
let currentBuildTag = null;
async function fetchBuildTag(){
  try{
    const res = await fetch('main.js', { method:'HEAD', cache:'no-store' });
    if(!res.ok) return null;
    return res.headers.get('etag') || res.headers.get('last-modified') || null;
  }catch(e){ return null; }
}
async function checkForUpdate(){
  const tag = await fetchBuildTag();
  if(!tag) return;
  if(currentBuildTag===null){ currentBuildTag = tag; return; } // first successful check just sets the baseline
  if(tag !== currentBuildTag){
    const banner = document.getElementById('updateBanner');
    if(banner) banner.hidden = false;
  }
}
const updateReloadBtn = document.getElementById('updateReloadBtn');
if(updateReloadBtn) updateReloadBtn.addEventListener('click', ()=> location.reload());
checkForUpdate();
setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

init();
})();
