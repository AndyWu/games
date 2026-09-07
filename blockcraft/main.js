// Blockcraft — a tiny Minecraft-inspired voxel sandbox built on three.js.
// Single finite world, chunked meshes for fast edits, no build step required.
(() => {
'use strict';

// ---------- Config ----------
const WORLD_SIZE = 64;      // x/z extent
const WORLD_HEIGHT = 48;    // y extent
const CHUNK_SIZE = 16;
const CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK_SIZE;
const SEA_LEVEL = 15;
const BASE_HEIGHT = 20;
const AMPLITUDE = 9;
const SEED = 1337;
const FAR = 400;

const AIR=0, GRASS=1, DIRT=2, STONE=3, SAND=4, WOOD=5, LEAVES=6, PLANKS=7, WATER=8, BEDROCK=9;
const CRAFTING_TABLE=10, BRICKS=11, STICK=12;

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
};
const BLOCK_NAME = {
  [GRASS]:'Grass', [DIRT]:'Dirt', [STONE]:'Stone', [SAND]:'Sand', [WOOD]:'Wood',
  [LEAVES]:'Leaves', [PLANKS]:'Planks', [WATER]:'Water',
  [CRAFTING_TABLE]:'Crafting Table', [BRICKS]:'Bricks', [STICK]:'Stick',
};
const HOTBAR = [GRASS, DIRT, STONE, SAND, WOOD, LEAVES, PLANKS, WATER, CRAFTING_TABLE, BRICKS];
const COLLECTIBLE = new Set([GRASS, DIRT, STONE, SAND, WOOD, LEAVES, PLANKS, CRAFTING_TABLE, BRICKS]);

// ---------- Health / combat ----------
const HP_PER_HEART = 2;
const PLAYER_MAX_HP = 10 * HP_PER_HEART; // 10 hearts
const PLAYER_ATTACK_DMG = 2;
const ATTACK_RANGE = 4;
const ATTACK_ANGLE_COS = Math.cos(30 * Math.PI/180);
const AGGRO_RADIUS = 6;
const DEAGGRO_RADIUS = 11;
const RETALIATE_MS = 8000;

// HP is scaled against the 20-HP (10-heart) human baseline to roughly track real-world size/toughness:
// sheep and dogs are small and fragile; cows are human-sized; giraffes are big but not armored;
// lions match a human in raw toughness (they're dangerous because of their attack, not their HP);
// elephants are the toughest land animal, at double human HP.
const ANIMAL_TYPES = ['cow','sheep','dog','giraffe','lion','elephant'];
const ANIMAL_STATS = {
  sheep:    { maxHp: 3*HP_PER_HEART,  dmg:0, retaliate:false, aggressive:false, speed:1.0, chaseSpeed:1.8 },
  dog:      { maxHp: 4*HP_PER_HEART,  dmg:1, retaliate:true,  aggressive:false, speed:1.4, chaseSpeed:3.4 },
  cow:      { maxHp: 5*HP_PER_HEART,  dmg:0, retaliate:false, aggressive:false, speed:0.9, chaseSpeed:1.6 },
  giraffe:  { maxHp: 8*HP_PER_HEART,  dmg:3, retaliate:true,  aggressive:false, speed:1.1, chaseSpeed:2.6 },
  lion:     { maxHp: 10*HP_PER_HEART, dmg:4, retaliate:true,  aggressive:true,  speed:1.2, chaseSpeed:3.8 },
  elephant: { maxHp: 20*HP_PER_HEART, dmg:6, retaliate:true,  aggressive:true,  speed:0.8, chaseSpeed:2.4 },
};

// ---------- Crafting ----------
const RECIPES = [
  { name:'Planks',         out:{id:PLANKS, qty:4},         in:[{id:WOOD, qty:1}] },
  { name:'Sticks',         out:{id:STICK, qty:4},          in:[{id:PLANKS, qty:2}] },
  { name:'Crafting Table', out:{id:CRAFTING_TABLE, qty:1}, in:[{id:PLANKS, qty:4}] },
  { name:'Bricks',         out:{id:BRICKS, qty:4},         in:[{id:STONE, qty:4}] },
];
const inventory = {};
function invCount(id){ return inventory[id]||0; }
function invAdd(id,n){ inventory[id] = (inventory[id]||0)+n; }
function invSub(id,n){ inventory[id] = Math.max(0,(inventory[id]||0)-n); }
function canCraft(recipe){ return recipe.in.every(ing => invCount(ing.id) >= ing.qty); }
function craft(recipe){
  if(!canCraft(recipe)) return false;
  recipe.in.forEach(ing => invSub(ing.id, ing.qty));
  invAdd(recipe.out.id, recipe.out.qty);
  saveInventory();
  updateHotbarUI();
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
const TILE = 16, ATLAS_COLS = 4, ATLAS_ROWS = 4;
const T_GRASS_TOP=0, T_GRASS_SIDE=1, T_DIRT=2, T_STONE=3, T_SAND=4, T_LOG_SIDE=5, T_LOG_TOP=6,
      T_LEAVES=7, T_PLANKS=8, T_BEDROCK=9, T_CRAFT_TOP=10, T_CRAFT_SIDE=11, T_BRICKS=12, T_WATER=13;

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
function drawGrassTop(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x5b8a3a);
  speckle(ctx,x0,y0,0x5b8a3a,70,18);
}
function drawGrassSide(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x7a5230);
  speckle(ctx,x0,y0,0x7a5230,40,14);
  for(let x=0;x<TILE;x++){
    const h = 3 + (x%3===0 ? 1 : 0);
    for(let y=0;y<h;y++){
      ctx.fillStyle = shadeStr(0x5b8a3a, 0.85+Math.random()*0.3, 12);
      ctx.fillRect(x0+x, y0+TILE-1-y, 1, 1);
    }
  }
}
function drawDirt(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x7a5230);
  speckle(ctx,x0,y0,0x7a5230,60,16);
}
function drawStone(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x8a8a8a);
  speckle(ctx,x0,y0,0x8a8a8a,70,20);
  for(let i=0;i<4;i++){
    const x=x0+Math.floor(Math.random()*TILE), y=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0x8a8a8a,0.6,6);
    ctx.fillRect(x,y,1+Math.floor(Math.random()*2),1);
  }
}
function drawSand(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xe0d18f);
  speckle(ctx,x0,y0,0xe0d18f,50,14);
}
function drawLogSide(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x6b4a2b);
  speckle(ctx,x0,y0,0x6b4a2b,25,8);
  for(let x=0;x<TILE;x+=3){
    for(let y=0;y<TILE;y++){
      if(Math.random()<0.75){
        ctx.fillStyle = shadeStr(0x6b4a2b,0.7,6);
        ctx.fillRect(x0+x,y0+y,1,1);
      }
    }
  }
}
function drawLogTop(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xc9a06b);
  const cx=x0+TILE/2, cy=y0+TILE/2;
  for(let y=0;y<TILE;y++){
    for(let x=0;x<TILE;x++){
      const d = Math.hypot(x0+x+0.5-cx, y0+y+0.5-cy);
      const ring = Math.floor(d/1.6)%2;
      ctx.fillStyle = shadeStr(0xc9a06b, ring===0 ? 1.0 : 0.82, 6);
      ctx.fillRect(x0+x,y0+y,1,1);
    }
  }
}
function drawLeaves(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x3f7d34);
  speckle(ctx,x0,y0,0x3f7d34,110,26);
}
function drawPlanks(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xb8894f);
  speckle(ctx,x0,y0,0xb8894f,40,10);
  for(let y=0;y<TILE;y+=4){
    ctx.fillStyle = shadeStr(0xb8894f,0.65,4);
    ctx.fillRect(x0,y0+y,TILE,1);
    const seam = Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0xb8894f,0.75,4);
    ctx.fillRect(x0+seam,y0+y,1,3);
  }
}
function drawBedrock(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x2b2b2b);
  for(let i=0;i<40;i++){
    const x=x0+Math.floor(Math.random()*TILE), y=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0x2b2b2b,0.5+Math.random()*0.9,10);
    const s = 1+Math.floor(Math.random()*2);
    ctx.fillRect(x,y,s,s);
  }
}
function drawCraftTop(ctx,x0,y0){
  drawPlanks(ctx,x0,y0);
  ctx.fillStyle = shadeStr(0x3a2a1a,1,4);
  ctx.fillRect(x0+1,y0+1,TILE-2,1);
  ctx.fillRect(x0+1,y0+TILE-2,TILE-2,1);
  ctx.fillRect(x0+1,y0+1,1,TILE-2);
  ctx.fillRect(x0+TILE-2,y0+1,1,TILE-2);
  ctx.fillRect(x0+TILE/2-1,y0+3,2,TILE-6);
  ctx.fillRect(x0+3,y0+TILE/2-1,TILE-6,2);
}
function drawCraftSide(ctx,x0,y0){
  drawPlanks(ctx,x0,y0);
  ctx.fillStyle = shadeStr(0x3a2a1a,1,4);
  ctx.fillRect(x0+2,y0+6,TILE-4,4);
  ctx.fillStyle = shadeStr(0xc9a06b,1,4);
  ctx.fillRect(x0+4,y0+7,2,2);
  ctx.fillRect(x0+TILE-6,y0+7,2,2);
}
function drawBricks(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x9a4a3a);
  speckle(ctx,x0,y0,0x9a4a3a,30,10);
  const mortar = shadeStr(0x5a3a30,1,0);
  let row=0;
  for(let y=0;y<TILE;y+=4){
    ctx.fillStyle = mortar;
    ctx.fillRect(x0,y0+y,TILE,1);
    const offset = (row%2===0)?0:4;
    for(let x=offset;x<TILE;x+=8){
      ctx.fillStyle = mortar;
      ctx.fillRect(x0+x,y0+y,1,4);
    }
    row++;
  }
}
function drawWater(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x3a6fd8);
  speckle(ctx,x0,y0,0x3a6fd8,40,16);
  for(let i=0;i<3;i++){
    const y = y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0x3a6fd8,1.25,6);
    ctx.fillRect(x0,y,TILE,1);
  }
}
function buildAtlas(){
  const canvas = document.createElement('canvas');
  canvas.width = TILE*ATLAS_COLS;
  canvas.height = TILE*ATLAS_ROWS;
  const ctx = canvas.getContext('2d');
  const draw = [drawGrassTop, drawGrassSide, drawDirt, drawStone, drawSand, drawLogSide, drawLogTop,
                drawLeaves, drawPlanks, drawBedrock, drawCraftTop, drawCraftSide, drawBricks, drawWater];
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
        plantTree(x,h+1,z);
      }
    }
  }
}
function plantTree(x,y,z){
  const height = 4 + Math.floor(hash2(x+1,z+1)*3);
  for(let i=0;i<height;i++) setBlock(x,y+i,z,WOOD);
  const top = y+height;
  for(let dy=-2;dy<=1;dy++){
    const r = dy>=0 ? 1 : 2;
    for(let dx=-r;dx<=r;dx++){
      for(let dz=-r;dz<=r;dz++){
        if(Math.abs(dx)===r && Math.abs(dz)===r && r===2) continue;
        if(dx===0 && dz===0 && dy<=0) continue;
        const bx=x+dx, by=top+dy, bz=z+dz;
        if(getBlock(bx,by,bz)===AIR) setBlock(bx,by,bz,LEAVES);
      }
    }
  }
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
let scene, camera, renderer;
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

function buildChunkGeometries(cx,cz){
  const solid = {positions:[],normals:[],colors:[],uvs:[],indices:[]};
  const water = {positions:[],normals:[],colors:[],uvs:[],indices:[]};
  const x0=cx*CHUNK_SIZE, z0=cz*CHUNK_SIZE;
  for(let x=x0;x<x0+CHUNK_SIZE;x++){
    for(let z=z0;z<z0+CHUNK_SIZE;z++){
      for(let y=0;y<WORLD_HEIGHT;y++){
        const b = getBlock(x,y,z);
        if(b===AIR) continue;
        const isWater = b===WATER;
        const bucket = isWater ? water : solid;
        const tiles = BLOCK_TILES[b];
        for(let fi=0; fi<FACES.length; fi++){
          const f = FACES[fi];
          const nb = getBlock(x+f.n[0], y+f.n[1], z+f.n[2]);
          let draw;
          if(nb===AIR) draw = true;
          else if(nb===WATER && !isWater) draw = true;
          else draw = false;
          if(!draw) continue;
          const shadeF = f.n[1]===1 ? 1.0 : (f.n[1]===-1 ? 0.5 : 0.75);
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
  return { solid: toGeo(solid), water: toGeo(water) };
}

function rebuildChunk(cx,cz){
  const key = chunkKey(cx,cz);
  const existing = chunkMeshes.get(key);
  if(existing){
    if(existing.solid){ scene.remove(existing.solid); existing.solid.geometry.dispose(); }
    if(existing.water){ scene.remove(existing.water); existing.water.geometry.dispose(); }
  }
  const { solid, water } = buildChunkGeometries(cx,cz);
  const entry = {};
  if(solid){ const m = new THREE.Mesh(solid, solidMaterial); scene.add(m); entry.solid = m; }
  if(water){ const m = new THREE.Mesh(water, waterMaterial); scene.add(m); entry.water = m; }
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
}

// ---------- Player ----------
const GRAVITY = -28, JUMP_SPEED = 9, WALK_SPEED = 5.2, SPRINT_SPEED = 8.4;
const player = {
  pos: new THREE.Vector3(0,0,0),
  vel: new THREE.Vector3(0,0,0),
  yaw: 0, pitch: 0, onGround: false,
  width: 0.6, height: 1.8, eye: 1.6,
};
function spawnPlayer(){
  const x = Math.floor(WORLD_SIZE/2), z = Math.floor(WORLD_SIZE/2);
  const h = heightAt(x,z);
  player.pos.set(x+0.5, h+2, z+0.5);
  player.vel.set(0,0,0);
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

// ---------- Animal models (blocky quadrupeds) ----------
function animalBox(w,h,d,color){
  return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshLambertMaterial({ color }));
}
function makeQuadruped(opts){
  const g = new THREE.Group();
  const legH = opts.bodyY - opts.bodyH/2;
  const body = animalBox(opts.bodyW, opts.bodyH, opts.bodyD, opts.bodyColor);
  body.position.set(0, opts.bodyY, 0);
  g.add(body);

  const lx = opts.bodyW/2 - opts.legW*0.8;
  const lz = opts.bodyD/2 - opts.legW*0.8;
  const legColor = opts.legColor || opts.bodyColor;
  const legPositions = [[-lx,-lz],[lx,-lz],[-lx,lz],[lx,lz]]; // FL, FR, BL, BR (forward = -Z)
  const legs = legPositions.map(([px,pz])=>{
    const leg = animalBox(opts.legW, legH, opts.legW, legColor);
    leg.geometry.translate(0,-legH/2,0);
    leg.position.set(px, legH, pz);
    g.add(leg);
    return leg;
  });

  const head = animalBox(opts.headW, opts.headH, opts.headD, opts.headColor || opts.bodyColor);
  head.position.set(0, opts.headY, opts.headZ);
  g.add(head);

  if(opts.extras) opts.extras(g, { body, head, legs });

  g.userData.legs = legs;
  return g;
}
const ANIMAL_BUILDERS = {
  cow(){
    return makeQuadruped({
      bodyW:1.0, bodyH:0.65, bodyD:0.5, bodyY:0.75, bodyColor:0xe8e4d8,
      legW:0.14, legColor:0xe8e4d8,
      headW:0.32, headH:0.32, headD:0.3, headColor:0xe8e4d8, headY:0.85, headZ:-0.5,
      extras(g){
        const p1=animalBox(0.32,0.16,0.52,0x2a2a2a); p1.position.set(-0.2,0.98,0); g.add(p1);
        const p2=animalBox(0.28,0.16,0.3,0x2a2a2a); p2.position.set(0.22,0.65,-0.05); g.add(p2);
        const snout=animalBox(0.2,0.14,0.12,0xd9a0a0); snout.position.set(0,0.78,-0.67); g.add(snout);
        const earL=animalBox(0.12,0.05,0.05,0xe8e4d8); earL.position.set(-0.2,0.95,-0.46); g.add(earL);
        const earR=animalBox(0.12,0.05,0.05,0xe8e4d8); earR.position.set(0.2,0.95,-0.46); g.add(earR);
      },
    });
  },
  sheep(){
    return makeQuadruped({
      bodyW:0.7, bodyH:0.55, bodyD:0.45, bodyY:0.5, bodyColor:0xebe6d6,
      legW:0.1, legColor:0x3a3a3a,
      headW:0.24, headH:0.22, headD:0.22, headColor:0x3a3a3a, headY:0.55, headZ:-0.38,
      extras(g){
        const earL=animalBox(0.1,0.05,0.05,0x3a3a3a); earL.position.set(-0.14,0.58,-0.32); g.add(earL);
        const earR=animalBox(0.1,0.05,0.05,0x3a3a3a); earR.position.set(0.14,0.58,-0.32); g.add(earR);
      },
    });
  },
  dog(){
    return makeQuadruped({
      bodyW:0.5, bodyH:0.3, bodyD:0.26, bodyY:0.4, bodyColor:0x8a5a34,
      legW:0.08, legColor:0x8a5a34,
      headW:0.22, headH:0.2, headD:0.22, headColor:0x8a5a34, headY:0.48, headZ:-0.3,
      extras(g){
        const earL=animalBox(0.06,0.14,0.1,0x5a3a20); earL.position.set(-0.12,0.56,-0.32); g.add(earL);
        const earR=animalBox(0.06,0.14,0.1,0x5a3a20); earR.position.set(0.12,0.56,-0.32); g.add(earR);
        const tail=animalBox(0.06,0.06,0.26,0x8a5a34); tail.position.set(0,0.48,0.26); tail.rotation.x=0.5; g.add(tail);
      },
    });
  },
  giraffe(){
    return makeQuadruped({
      bodyW:0.6, bodyH:0.55, bodyD:0.4, bodyY:1.5, bodyColor:0xd8b26a,
      legW:0.13, legColor:0xd8b26a,
      headW:0.22, headH:0.28, headD:0.26, headColor:0xd8b26a, headY:2.55, headZ:-0.4,
      extras(g){
        const neck=animalBox(0.22,1.15,0.22,0xd8b26a);
        neck.position.set(0,1.98,-0.32); neck.rotation.x=-0.18; g.add(neck);
        const spot=(x,y,z)=>{ const s=animalBox(0.12,0.12,0.1,0xa5763a); s.position.set(x,y,z); g.add(s); };
        spot(-0.2,1.6,0.08); spot(0.18,1.35,-0.08); spot(-0.1,1.25,0.15); spot(0.1,1.7,0.1);
        const hornL=animalBox(0.05,0.14,0.05,0x8a6a3a); hornL.position.set(-0.08,2.78,-0.42); g.add(hornL);
        const hornR=animalBox(0.05,0.14,0.05,0x8a6a3a); hornR.position.set(0.08,2.78,-0.42); g.add(hornR);
      },
    });
  },
  lion(){
    return makeQuadruped({
      bodyW:0.85, bodyH:0.55, bodyD:0.5, bodyY:0.65, bodyColor:0xc99a4e,
      legW:0.14, legColor:0xc99a4e,
      headW:0.32, headH:0.3, headD:0.28, headColor:0xc99a4e, headY:0.8, headZ:-0.5,
      extras(g){
        const mane=animalBox(0.46,0.46,0.4,0x8a5a28); mane.position.set(0,0.8,-0.44); g.add(mane);
        const head2=animalBox(0.32,0.3,0.28,0xc99a4e); head2.position.set(0,0.8,-0.58); g.add(head2);
        const tail=animalBox(0.06,0.06,0.4,0xc99a4e); tail.position.set(0,0.65,0.5); tail.rotation.x=0.3; g.add(tail);
        const tuft=animalBox(0.1,0.1,0.1,0x5a3a1a); tuft.position.set(0,0.5,0.68); g.add(tuft);
      },
    });
  },
  elephant(){
    return makeQuadruped({
      bodyW:1.3, bodyH:0.9, bodyD:0.7, bodyY:1.0, bodyColor:0x9a9a9a,
      legW:0.24, legColor:0x9a9a9a,
      headW:0.5, headH:0.5, headD:0.4, headColor:0x9a9a9a, headY:1.15, headZ:-0.65,
      extras(g){
        const earL=animalBox(0.06,0.4,0.4,0x8a8a8a); earL.position.set(-0.28,1.2,-0.55); g.add(earL);
        const earR=animalBox(0.06,0.4,0.4,0x8a8a8a); earR.position.set(0.28,1.2,-0.55); g.add(earR);
        const trunk=animalBox(0.14,0.55,0.14,0x9a9a9a);
        trunk.geometry.translate(0,-0.275,0); trunk.position.set(0,1.3,-0.85); trunk.rotation.x=0.2; g.add(trunk);
        const tuskL=animalBox(0.05,0.05,0.22,0xf0ead6); tuskL.position.set(-0.12,0.95,-0.9); g.add(tuskL);
        const tuskR=animalBox(0.05,0.05,0.22,0xf0ead6); tuskR.position.set(0.12,0.95,-0.9); g.add(tuskR);
      },
    });
  },
};
function createAnimalMesh(type){ return ANIMAL_BUILDERS[type](); }
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
function groundHeightAt(x,z){
  const bx=Math.floor(x), bz=Math.floor(z);
  for(let y=WORLD_HEIGHT-1;y>=0;y--){
    if(blockSolid(bx,y,bz)) return y+1;
  }
  return 1;
}
function spawnAnimals(){
  const counts = { cow:4, sheep:5, dog:3, giraffe:3, lion:2, elephant:2 };
  let idx=0;
  for(const type of ANIMAL_TYPES){
    for(let i=0;i<counts[type];i++){
      let x,z,h,tries=0;
      do{
        const hx = hash2(idx*7.13+1.7, idx*3.91+5.2+tries*0.37);
        const hz = hash2(idx*11.3+2.9+tries*0.53, idx*4.77+8.1);
        x = 4 + Math.floor(hx*(WORLD_SIZE-8));
        z = 4 + Math.floor(hz*(WORLD_SIZE-8));
        h = heightAt(x,z);
        tries++;
      } while((h<=SEA_LEVEL || getBlock(x,h,z)!==GRASS) && tries<30);
      const stats = ANIMAL_STATS[type];
      const mesh = createAnimalMesh(type);
      const gy = groundHeightAt(x+0.5, z+0.5);
      mesh.position.set(x+0.5, gy, z+0.5);
      scene.add(mesh);
      animals.push({
        id: type+'_'+idx, type, mesh,
        hp: stats.maxHp, maxHp: stats.maxHp,
        x:x+0.5, y:gy, z:z+0.5, yaw: hash2(idx*2.1,idx*5.7)*Math.PI*2,
        wanderTimer: hash2(idx*3.3,idx*1.1)*2, target:null,
        aggroUntil:0, attackCooldown:0, walk:{phase:0,amp:0},
      });
      idx++;
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

  let moving = false;
  if(isAggro){
    if(distToPlayer > 0.05){
      const nx = dxp/distToPlayer, nz = dzp/distToPlayer;
      a.yaw = Math.atan2(-nx, -nz);
      if(distToPlayer > ATTACK_RANGE*0.4){
        a.x += nx*stats.chaseSpeed*dt;
        a.z += nz*stats.chaseSpeed*dt;
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
        a.x += nx*stats.speed*dt*0.5;
        a.z += nz*stats.speed*dt*0.5;
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
  if(a.hp<=0) killAnimal(a);
}
function applyRemoteMobHp(id, hp){
  const a = animals.find(x=>x.id===id);
  if(!a || hp==null || hp===a.hp) return;
  a.hp = hp;
  if(a.hp<=0) killAnimal(a);
}

// ---------- Combat ----------
let myHP = PLAYER_MAX_HP;
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
function damagePlayer(dmg, sourceType){
  myHP = Math.max(0, myHP - dmg);
  updateHeartsUI();
  if(fbReady) db.ref('players/'+myId+'/hp').set(myHP);
  if(myHP<=0) die();
}
function die(){
  const msg = document.getElementById('deathMessage');
  if(msg){ msg.hidden = false; setTimeout(()=>{ msg.hidden = true; }, 1500); }
  spawnPlayer();
  myHP = PLAYER_MAX_HP;
  updateHeartsUI();
  if(fbReady) db.ref('players/'+myId+'/hp').set(myHP);
}
function findAttackTarget(){
  const dir = getLookDir(player.yaw, player.pitch);
  const origin = camera.position;
  let best = null, bestDist = Infinity;
  animals.forEach(a=>{
    const dx=a.x-origin.x, dy=(a.y+0.4)-origin.y, dz=a.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
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
    if(target.type==='animal') damageAnimal(target.ref, PLAYER_ATTACK_DMG);
    else damageRemotePlayer(target.id, target.ref, PLAYER_ATTACK_DMG);
  }
  return true;
}

let thirdPerson = false;
let characterMesh;
const myWalkState = { phase:0, amp:0 };
function updateCharacterAnim(dt, moving, sprinting){
  animateWalk(characterMesh, myWalkState, dt, moving, sprinting);
  characterMesh.position.set(player.pos.x, player.pos.y, player.pos.z);
  characterMesh.rotation.y = player.yaw;
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
  scene.add(mesh);
  remotePlayers.set(id, {
    mesh, target:{x:data.x||0,y:data.y||0,z:data.z||0,yaw:data.yaw||0}, walk:{phase:0,amp:0},
    hp: data.hp!=null ? data.hp : PLAYER_MAX_HP,
  });
  document.getElementById('playerCount').textContent = remotePlayers.size+1;
}
function updateRemotePlayer(id, data){
  const e = remotePlayers.get(id);
  if(!e) return addRemotePlayer(id, data);
  e.target.x = data.x||0; e.target.y = data.y||0; e.target.z = data.z||0; e.target.yaw = data.yaw||0;
  if(data.hp!=null) e.hp = data.hp;
}
function removeRemotePlayer(id){
  const e = remotePlayers.get(id);
  if(!e) return;
  scene.remove(e.mesh);
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
  });
}
function applyWorldEdit(x,y,z,val,fromRemote){
  if(getBlock(x,y,z)===val) return;
  setBlock(x,y,z,val);
  const k = x+','+y+','+z;
  edits.set(k, val);
  if(val===CRAFTING_TABLE) craftingTables.add(k); else craftingTables.delete(k);
  onBlockChanged(x,y,z);
  saveEdits();
  if(!fromRemote && fbReady) db.ref('world/edits/'+k).set(val);
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
      yaw: Math.round(player.yaw*100)/100, hp: myHP, t: firebase.database.ServerValue.TIMESTAMP,
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
  return b!==AIR && b!==WATER;
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

  player.vel.y += GRAVITY*dt;
  if(player.vel.y < -50) player.vel.y = -50;
  if(keys['Space'] && player.onGround){
    player.vel.y = JUMP_SPEED;
    player.onGround = false;
  }

  const dx = mx*speed*dt, dz = mz*speed*dt, dy = player.vel.y*dt;

  if(!collidesBox(player.pos.x+dx, player.pos.y, player.pos.z)) player.pos.x += dx;
  if(!collidesBox(player.pos.x, player.pos.y, player.pos.z+dz)) player.pos.z += dz;
  if(!collidesBox(player.pos.x, player.pos.y+dy, player.pos.z)){
    player.pos.y += dy;
    player.onGround = false;
  } else {
    if(dy<0) player.onGround = true;
    player.vel.y = 0;
  }

  player.pos.x = Math.max(1, Math.min(WORLD_SIZE-1, player.pos.x));
  player.pos.z = Math.max(1, Math.min(WORLD_SIZE-1, player.pos.z));
  if(player.pos.y < -20) spawnPlayer();
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
  applyWorldEdit(hit.x, hit.y, hit.z, AIR, false);
  if(COLLECTIBLE.has(b)){ invAdd(b,1); saveInventory(); }
  updateHotbarUI();
  triggerSwing();
}
function placeBlock(){
  const hit = raycastBlock();
  if(!hit || !hit.prev) return;
  const {x,y,z} = hit.prev;
  if(getBlock(x,y,z)!==AIR) return;
  const block = HOTBAR[selectedSlot];
  if(invCount(block)<=0) return;
  const w = player.width/2;
  const px=player.pos.x, py=player.pos.y, pz=player.pos.z;
  const overlapsPlayer = (x+1>px-w && x<px+w && z+1>pz-w && z<pz+w && y<py+player.height && y+1>py);
  if(overlapsPlayer) return;
  applyWorldEdit(x, y, z, block, false);
  invSub(block,1);
  saveInventory();
  updateHotbarUI();
  triggerSwing();
}

// ---------- Input ----------
const keys = {};
let selectedSlot = 0;
window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(e.code==='Escape' && craftingOpen){ closeCrafting(false); return; }
  if(e.code==='KeyE'){
    if(craftingOpen){ closeCrafting(false); return; }
    if(locked && nearestCraftingTable(4)) openCrafting();
    return;
  }
  if(e.code==='KeyV' && locked){ thirdPerson = !thirdPerson; return; }
  if(e.code.startsWith('Digit')){
    let n = parseInt(e.code.slice(5),10);
    if(n===0) n = 10;
    if(n>=1 && n<=HOTBAR.length){ selectedSlot = n-1; updateHotbarUI(); updateHeldItemColor(); }
  }
});
window.addEventListener('keyup', e=>{ keys[e.code]=false; });
window.addEventListener('wheel', e=>{
  if(!locked) return;
  selectedSlot = (selectedSlot + (e.deltaY>0?1:-1) + HOTBAR.length) % HOTBAR.length;
  updateHotbarUI();
  updateHeldItemColor();
});

const overlay = document.getElementById('overlay');
let locked = false;
overlay.addEventListener('click', ()=>{ if(!craftingOpen) document.body.requestPointerLock(); });
document.addEventListener('pointerlockchange', ()=>{
  locked = document.pointerLockElement === document.body;
  overlay.hidden = locked || craftingOpen;
});
document.addEventListener('mousemove', e=>{
  if(!locked) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
});
document.addEventListener('contextmenu', e=> e.preventDefault());
document.addEventListener('mousedown', e=>{
  if(!locked) return;
  if(e.button===0){ if(!tryAttack()) breakBlock(); }
  if(e.button===2){
    const hit = raycastBlock();
    if(hit && getBlock(hit.x,hit.y,hit.z)===CRAFTING_TABLE) openCrafting();
    else placeBlock();
  }
});

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
    const key = document.createElement('div');
    key.className='key'; key.textContent = (i+1)%10;
    slot.appendChild(key);
    const count_el = document.createElement('div');
    count_el.className='count'; count_el.textContent = count;
    slot.appendChild(count_el);
    slot.title = BLOCK_NAME[b];
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
  overlay.hidden = true;
  renderCrafting();
}
function closeCrafting(relock){
  craftingOpen = false;
  craftingModal.hidden = true;
  if(relock) document.body.requestPointerLock();
  else overlay.hidden = false;
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

// ---------- Init & loop ----------
function init(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd0ee);
  scene.fog = new THREE.Fog(0x8fd0ee, FAR*0.35, FAR);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, FAR);
  camera.rotation.order = 'YXZ';

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(80,120,40);
  scene.add(sun);

  characterMesh = createCharacterMesh();
  characterMesh.visible = false;
  scene.add(characterMesh);
  buildHandModel();
  renderer.autoClear = false;

  generateWorld();
  loadEdits();
  loadInventory();
  rebuildAllChunks();
  spawnPlayer();
  spawnAnimals();
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

  if(locked) updatePlayer(dt);

  const moving = locked && (keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD']);
  const sprinting = !!(keys['ShiftLeft']||keys['ShiftRight']);
  updateCharacterAnim(dt, moving, sprinting);
  updateHandView(dt, moving, sprinting);
  updateRemotePlayers(dt);
  updateAnimals(dt);
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

  fpsTimer += dt; fpsCount++;
  if(fpsTimer>=0.5){
    document.getElementById('fps').textContent = Math.round(fpsCount/fpsTimer);
    fpsTimer=0; fpsCount=0;
  }
}

init();
})();
