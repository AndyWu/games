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

// ---------- Blocky character model (the player's own body; reusable for other players later) ----------
function createCharacterMesh(){
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0x3b6ea5 });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });

  function box(w,h,d,mat,pivotTop){
    const geo = new THREE.BoxGeometry(w,h,d);
    if(pivotTop) geo.translate(0,-h/2,0);
    return new THREE.Mesh(geo, mat);
  }

  const head = box(0.5,0.5,0.5, skinMat);
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
let thirdPerson = false;
let characterMesh;
let walkPhase = 0, walkAmp = 0;
function updateCharacterAnim(dt, moving, sprinting){
  walkAmp += ((moving?1:0) - walkAmp) * Math.min(1, dt*8);
  walkPhase += dt * (sprinting ? 11 : 7);
  const swing = Math.sin(walkPhase) * 0.6 * walkAmp;
  const { armL, armR, legL, legR } = characterMesh.userData.parts;
  armR.rotation.x = swing;
  legL.rotation.x = swing;
  armL.rotation.x = -swing;
  legR.rotation.x = -swing;
  characterMesh.position.set(player.pos.x, player.pos.y, player.pos.z);
  characterMesh.rotation.y = player.yaw;
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
  setBlock(hit.x,hit.y,hit.z,AIR);
  const k = hit.x+','+hit.y+','+hit.z;
  edits.set(k, AIR);
  craftingTables.delete(k);
  if(COLLECTIBLE.has(b)){ invAdd(b,1); saveInventory(); }
  onBlockChanged(hit.x,hit.y,hit.z);
  updateHotbarUI();
  saveEdits();
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
  setBlock(x,y,z, block);
  const k = x+','+y+','+z;
  edits.set(k, block);
  if(block===CRAFTING_TABLE) craftingTables.add(k);
  invSub(block,1);
  saveInventory();
  onBlockChanged(x,y,z);
  updateHotbarUI();
  saveEdits();
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
  if(e.button===0) breakBlock();
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
  updateHotbarUI();
  updateHeldItemColor();

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
