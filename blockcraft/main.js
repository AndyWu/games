// Blockcraft — a tiny Minecraft-inspired voxel sandbox built on three.js.
// Single finite world, chunked meshes for fast edits, no build step required.
(() => {
'use strict';

// ---------- Config ----------
const WORLD_SIZE = 128;     // x/z extent (4x the original 64x64 area, same generation algorithm)
const WORLD_HEIGHT = 48;    // y extent
const CHUNK_SIZE = 16;
const CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK_SIZE;
const SEA_LEVEL = 16; // flooded 1 block higher than the original 15
const BASE_HEIGHT = 20;
const AMPLITUDE = 9;
const SEED = 1337;
const FAR = 400;

const AIR=0, GRASS=1, DIRT=2, STONE=3, SAND=4, WOOD=5, LEAVES=6, PLANKS=7, WATER=8, BEDROCK=9;
const CRAFTING_TABLE=10, BRICKS=11, STICK=12;
const WINDOW=13, WINDOW_OPEN=14, DOOR=15, DOOR_OPEN=16;
const SAPLING=17;
const FLINT=18, FIRE=19, TORCH=20, FIREWORK=21;

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
};
const BLOCK_NAME = {
  [GRASS]:'Grass', [DIRT]:'Dirt', [STONE]:'Stone', [SAND]:'Sand', [WOOD]:'Wood',
  [LEAVES]:'Leaves', [PLANKS]:'Planks', [WATER]:'Water',
  [CRAFTING_TABLE]:'Crafting Table', [BRICKS]:'Bricks', [STICK]:'Stick',
  [WINDOW]:'Window', [WINDOW_OPEN]:'Window (open)', [DOOR]:'Door', [DOOR_OPEN]:'Door (open)',
  [SAPLING]:'Sapling', [FLINT]:'Flint', [FIRE]:'Fire', [TORCH]:'Torch', [FIREWORK]:'Firework',
};
// Every item the player can ever select. The hotbar only shows HOTBAR_SIZE of these at a time —
// the rest are reachable through the Items panel (the palette button, or the "I" key), which lets
// the player swap any hotbar slot for anything in this list.
const ALL_ITEMS = [GRASS, DIRT, STONE, SAND, WOOD, LEAVES, PLANKS, WATER, CRAFTING_TABLE, BRICKS, STICK, WINDOW, DOOR, FLINT, TORCH, FIREWORK];
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
const HOTBAR_ICON = { [CRAFTING_TABLE]: '🛠️', [WINDOW]: '🪟', [DOOR]: '🚪', [FLINT]: '🔥', [TORCH]: '🕯️', [FIREWORK]: '🎆' };
// Blocks with an open/closed state: right-clicking one toggles it to the other id in this map.
const TOGGLE_MAP = { [WINDOW]:WINDOW_OPEN, [WINDOW_OPEN]:WINDOW, [DOOR]:DOOR_OPEN, [DOOR_OPEN]:DOOR };
// Breaking the open form of a toggleable block gives you back its closed (placeable) form.
const COLLECT_AS = { [WINDOW_OPEN]:WINDOW, [DOOR_OPEN]:DOOR };
const COLLECTIBLE = new Set([GRASS, DIRT, STONE, SAND, WOOD, LEAVES, PLANKS, CRAFTING_TABLE, BRICKS, WINDOW, WINDOW_OPEN, DOOR, DOOR_OPEN, TORCH]);

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
// Rough horizontal collision radius per species, used for entity-vs-entity collision below.
const ANIMAL_RADIUS = {
  sheep: 0.35, dog: 0.22, cow: 0.5, giraffe: 0.5, lion: 0.4, elephant: 0.95,
};

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
const TILE = 32, ATLAS_COLS = 4, ATLAS_ROWS = 6;
const T_GRASS_TOP=0, T_GRASS_SIDE=1, T_DIRT=2, T_STONE=3, T_SAND=4, T_LOG_SIDE=5, T_LOG_TOP=6,
      T_LEAVES=7, T_PLANKS=8, T_BEDROCK=9, T_CRAFT_TOP=10, T_CRAFT_SIDE=11, T_BRICKS=12, T_WATER=13,
      T_WINDOW=14, T_WINDOW_OPEN=15, T_DOOR=16, T_DOOR_OPEN=17, T_SAPLING=18, T_FLINT=19, T_FIRE=20,
      T_TORCH=21;

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
function drawLeaves(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x3f7d34);
  for(let i=0;i<10;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.2, 0x3f7d34, 24);
  speckle(ctx,x0,y0,0x3f7d34,Math.round(TILE*TILE*0.3),26);
  for(let i=0;i<TILE*0.3;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0x24401f,1,6);
    ctx.fillRect(px,py,1,1);
  }
}
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
function buildAtlas(){
  const canvas = document.createElement('canvas');
  canvas.width = TILE*ATLAS_COLS;
  canvas.height = TILE*ATLAS_ROWS;
  const ctx = canvas.getContext('2d');
  const draw = [drawGrassTop, drawGrassSide, drawDirt, drawStone, drawSand, drawLogSide, drawLogTop,
                drawLeaves, drawPlanks, drawBedrock, drawCraftTop, drawCraftSide, drawBricks, drawWater,
                drawWindow, drawWindowOpen, drawDoor, drawDoorOpen, drawSapling, drawFlint, drawFire, drawTorch];
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
function plantTreeCells(x,y,z,writeFn){
  const baseHeight = 4 + Math.floor(hash2(x+1,z+1)*3);
  const isTall = hash2(x+13,z+29) < TALL_TREE_CHANCE;
  const height = isTall ? baseHeight*5 : baseHeight;
  for(let i=0;i<height;i++) writeFn(x,y+i,z,WOOD,true);
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
// skipped (no point rendering the seam between two adjacent water or window blocks); a face against
// a *different* transparent type, or against AIR, still draws.
const TRANSPARENT_BLOCKS = new Set([WATER, WINDOW, WINDOW_OPEN, DOOR_OPEN, SAPLING, FIRE, TORCH]);
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
    if(b!==AIR && !TRANSPARENT_BLOCKS.has(b)) blocked = true;
  }
  return exposed;
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
      for(let y=0;y<WORLD_HEIGHT;y++){
        const b = getBlock(x,y,z);
        // Fire is rendered as its own non-solid crossed-billboard sprite (see ensureFireFx), not as
        // a cube face — it stays in TRANSPARENT_BLOCKS so it still doesn't occlude neighbors or block
        // sky exposure, but it no longer gets meshed into the chunk itself.
        if(b===AIR || b===FIRE) continue;
        const bucket = buckets[bucketFor(b)];
        const tiles = BLOCK_TILES[b];
        const indoorF = skyExposed[y] ? 1.0 : INDOOR_DARK_FACTOR;
        for(let fi=0; fi<FACES.length; fi++){
          const f = FACES[fi];
          const nb = getBlock(x+f.n[0], y+f.n[1], z+f.n[2]);
          let draw;
          if(nb===AIR) draw = true;
          else if(TRANSPARENT_BLOCKS.has(nb) && nb!==b) draw = true;
          else draw = false;
          if(!draw) continue;
          const shadeF = (f.n[1]===1 ? 1.0 : (f.n[1]===-1 ? 0.5 : 0.75)) * indoorF;
          const tileIdx = f.n[1]===1 ? tiles.top : (f.n[1]===-1 ? tiles.bottom : tiles.side);
          const {u0,u1,vBottom,vTop} = tileUV(tileIdx);
          const pattern = UV_PATTERNS[fi];
          const base = bucket.positions.length/3;
          for(let ci=0; ci<4; ci++){
            const c = f.c[ci];
            bucket.positions.push(x+c[0], y+c[1], z+c[2]);
            bucket.normals.push(f.n[0],f.n[1],f.n[2]);
            bucket.colors.push(shadeF,shadeF,shadeF);
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
  if(solid){ const m = new THREE.Mesh(solid, solidMaterial); scene.add(m); entry.solid = m; }
  if(water){ const m = new THREE.Mesh(water, waterMaterial); scene.add(m); entry.water = m; }
  if(glass){ const m = new THREE.Mesh(glass, glassMaterial); scene.add(m); entry.glass = m; }
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
const GRAVITY = -28, JUMP_SPEED = 9, WALK_SPEED = 5.2, SPRINT_SPEED = 8.4;
const player = {
  pos: new THREE.Vector3(0,0,0),
  vel: new THREE.Vector3(0,0,0),
  yaw: 0, pitch: 0, onGround: false,
  width: 0.6, height: 1.8, eye: 1.6,
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
  let h=0;
  for(let i=0;i<id.length;i++) h = (h*31 + id.charCodeAt(i)) >>> 0;
  return new THREE.Color(`hsl(${h%360},60%,55%)`).getHex();
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
const SPAWN_COUNTS = { cow:4, sheep:5, dog:3, giraffe:3, lion:2, elephant:2 };
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
  if(a.hp<=0){ SFX.animalDeath(); killAnimal(a); }
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
};
lionRoarClip.load();
fireworkBurstClip.load();

// ---------- Combat ----------
let myHP = PLAYER_MAX_HP;
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
function currentDayTime(){ return (Date.now()/1000 % DAY_LENGTH_S) / DAY_LENGTH_S; }

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
  const theta = dayTime*Math.PI*2;
  const sunHeight = Math.sin(theta - Math.PI/2);
  const R = 150;
  sunLight.position.set(Math.cos(theta)*R, Math.max(5, sunHeight*R*0.6+40), Math.sin(theta)*R);
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
    if(b!==AIR && !TRANSPARENT_BLOCKS.has(b)) return false;
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

// ---------- Worms: slowly eat tree leaves, breed, and can be burned to death ----------
// A single worm spawns on the world's trees at load. Every 2 real hours it eats the nearest leaf
// block within reach (a genuine world edit — synced/persisted like any other block change, so
// everyone sees the same tree thin out); every 24 real hours it has 2 children nearby. Population is
// capped so an unattended world can't grow it forever. Standing in an active fire cell kills it
// instantly, same "you're in the fire" test the fire-damage tick already uses for animals/players.
// The worm creature itself (unlike the leaves it eats) is a local decorative simulation, not synced
// across clients — the same tradeoff already made for fireflies.
const WORM_EAT_INTERVAL_MS = 2*3600*1000;       // one leaf block every 2 real hours
const WORM_REPRODUCE_INTERVAL_MS = 24*3600*1000; // 2 children every 24 real hours
const WORM_CHILDREN_PER_REPRODUCE = 2;
const WORM_MAX_POPULATION = 24;
const WORM_SEARCH_RADIUS = 6;
const worms = [];
let wormGeo, wormMat;
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
function spawnWorm(x,y,z,bornAt){
  if(worms.length>=WORM_MAX_POPULATION) return null;
  if(!wormGeo){
    wormGeo = new THREE.SphereGeometry(0.16,6,6);
    wormMat = new THREE.MeshLambertMaterial({ color: 0xc98a6b });
  }
  const mesh = new THREE.Mesh(wormGeo, wormMat);
  mesh.scale.set(1, 0.55, 2.4);
  mesh.position.set(x+0.5, y+0.25, z+0.5);
  scene.add(mesh);
  const w = {
    mesh, x:x+0.5, y:y+0.25, z:z+0.5,
    lastAteAt: bornAt, lastReproducedAt: bornAt, phase: Math.random()*Math.PI*2,
  };
  worms.push(w);
  return w;
}
function killWorm(w){
  scene.remove(w.mesh);
  const i = worms.indexOf(w);
  if(i>=0) worms.splice(i,1);
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
    if(burned){ killWorm(w); continue; }

    if(now - w.lastAteAt >= WORM_EAT_INTERVAL_MS){
      w.lastAteAt = now;
      const leaf = findNearestLeaf(w.x, w.y, w.z, WORM_SEARCH_RADIUS);
      if(leaf){
        applyWorldEdit(leaf.x, leaf.y, leaf.z, AIR, false);
        w.x = leaf.x+0.5; w.y = leaf.y+0.25; w.z = leaf.z+0.5;
      }
    }
    if(now - w.lastReproducedAt >= WORM_REPRODUCE_INTERVAL_MS){
      w.lastReproducedAt = now;
      for(let i=0;i<WORM_CHILDREN_PER_REPRODUCE;i++){
        spawnWorm(Math.floor(w.x)+(Math.random()<0.5?-1:1), Math.floor(w.y), Math.floor(w.z)+(Math.random()<0.5?-1:1), now);
      }
    }
    w.mesh.position.set(w.x, w.y + Math.sin(t*1.5+w.phase)*0.04, w.z);
    w.mesh.rotation.y = Math.sin(t*0.3+w.phase)*0.6;
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
  if(!hit || !hit.prev) return;
  if(getBlock(hit.x,hit.y,hit.z)!==WOOD) return; // flint only catches wood
  if(invCount(FLINT)<=0) return;
  const {x,y,z} = hit.prev;
  if(getBlock(x,y,z)!==AIR) return;
  if(playerOverlapsCell(x,y,z)) return;
  igniteFire(x,y,z);
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
  return b!==AIR && b!==WATER && b!==WINDOW_OPEN && b!==DOOR_OPEN && b!==SAPLING && b!==FIRE && b!==TORCH;
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

  const speed = (keys['ShiftLeft']||keys['ShiftRight']) ? SPRINT_SPEED : WALK_SPEED;

  const wasOnGround = player.onGround;

  player.vel.y += GRAVITY*dt;
  if(player.vel.y < -50) player.vel.y = -50;
  if(keys['Space'] && player.onGround){
    player.vel.y = JUMP_SPEED;
    player.onGround = false;
    SFX.jump();
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
  if(player.onGround) player.fallFrom = player.pos.y;

  player.pos.x = Math.max(1, Math.min(WORLD_SIZE-1, player.pos.x));
  player.pos.z = Math.max(1, Math.min(WORLD_SIZE-1, player.pos.z));
  if(player.pos.y < -20) spawnPlayer();

  if(len>0 || !player.onGround || myHP<=0){
    idleTimer = 0;
    regenTimer = 0;
  } else if(myHP < PLAYER_MAX_HP){
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
function placeBlock(){
  const hit = raycastBlock();
  if(!hit || !hit.prev) return;
  const block = HOTBAR[selectedSlot];
  if(block===DOOR){ placeDoor(hit); return; }
  const {x,y,z} = hit.prev;
  if(getBlock(x,y,z)!==AIR) return;
  if(invCount(block)<=0) return;
  if(playerOverlapsCell(x,y,z)) return;
  applyWorldEdit(x, y, z, block, false);
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
  const slotIdx = HOTBAR_KEYS.indexOf(e.code);
  if(slotIdx>=0 && slotIdx<HOTBAR.length){
    selectedSlot = slotIdx; updateHotbarUI(); updateHeldItemColor();
    if(itemsOpen) renderItemsGrid();
  }
});
window.addEventListener('keyup', e=>{ keys[e.code]=false; });

const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
function doAttackOrBreak(){ if(!tryAttack()) breakBlock(); }
function doInteract(){
  const hit = raycastBlock();
  const hitBlock = hit ? getBlock(hit.x,hit.y,hit.z) : null;
  if(HOTBAR[selectedSlot]===FLINT){ tryIgniteFire(hit); return; }
  if(HOTBAR[selectedSlot]===FIREWORK){ launchFirework(); return; }
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
  if(controlsP) controlsP.innerHTML = 'A tiny Minecraft-inspired voxel sandbox that runs entirely in your browser.<br><br>Left stick: move &nbsp; Drag right side: look<br>⛏ break/attack &nbsp; ▦ place/interact &nbsp; JUMP jump &nbsp; 3rd camera';
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
  overlay.hidden = locked || craftingOpen;
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
  bindTouchButton('btn3p', ()=>{ if(locked) thirdPerson = !thirdPerson; });
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
  document.body.appendChild(renderer.domElement);

  hemiLight = new THREE.HemisphereLight(0xffffff, 0x445533, 0.9);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
  sunLight.position.set(80,120,40);
  scene.add(sunLight);

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
  { const spot = findInitialWormSpot(); if(spot) spawnWorm(spot.x, spot.y, spot.z, Date.now()); }
  updateHotbarUI();
  updateHeldItemColor();
  updateHeartsUI();
  initMultiplayer();

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
  updateFires(dt);
  updateFireworks(dt);
  updateFireflies(dt);
  updateWorms(dt);
  updateGhost(dt);
  heldTorchLight.visible = HOTBAR[selectedSlot]===TORCH;
  if(heldTorchLight.visible) heldTorchLight.intensity = 1.0 + Math.random()*0.3;
  updateDayNight();
  updateWeather(dt);
  updateTemperature(dt);
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
  }
}
init();
})();
