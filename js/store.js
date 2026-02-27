import * as THREE from 'three';

/*
  Store layout (top-down, Z = depth, X = width):

        z=-22 (back wall)
  ┌─────────────────────────────┐
  │  [BW]  [BW]  [BW]  [BW]   │  ← back-wall shelves
  │                             │
  │  [L]           [R]         │  ← left/right wall shelves
  │     [CL]   [CR]            │  ← center aisle shelves
  │  [L]           [R]         │
  │     [CL]   [CR]            │
  │  [L]           [R]         │
  │                             │
  │         [COUNTER]          │
  └────────[ENTRANCE]──────────┘
        z=+22 (entrance)

  Room: X(-16..+16), Z(-22..+22), Y(0..3.8)
  Player starts at (0, 1.6, 20) facing -Z
*/

const SHELF_W   = 3.6;  // shelf length (along its run axis)
const SHELF_H   = 2.1;  // shelf height
const SHELF_D   = 0.45; // shelf depth
const SHELF_ROWS = 3;   // shelf rows per unit
const ROW_H     = (SHELF_H - 0.1) / SHELF_ROWS;

// VHS box dimensions
const VHS_W = 0.12; // spine width
const VHS_H = 0.22; // height
const VHS_D = 0.08; // front-to-back depth
const VHS_GAP = 0.025;
const VHS_PITCH = VHS_W + VHS_GAP;

const SHELF_MARGIN  = 0.07; // gap between side panel and first/last VHS
const BOOKS_PER_ROW = Math.floor((SHELF_W - 2 * SHELF_MARGIN) / VHS_PITCH);

export class VideoStore {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];  // Array of {min, max} AABB
    this.shelfSlots = []; // Array of {position:Vector3, rotY:Number}

    this._buildOutside();
    this._buildRoom();
    this._buildLighting();
    this._buildAllShelves();
    this._buildCounter();
    this._buildDecor();
    this._buildBanners();
  }

  // ─── ROOM ───────────────────────────────────────────────────
  _buildRoom() {
    const s = this.scene;

    // Floor
    const floorTex = this._makeCarpetTex();
    floorTex.repeat.set(6, 8);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 44),
      new THREE.MeshLambertMaterial({ map: floorTex })
    );
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 44),
      new THREE.MeshLambertMaterial({ color: 0xc8c0a8 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 3.8;
    s.add(ceil);

    // Walls — warm cream like a classic video rental store
    const wallMat     = new THREE.MeshLambertMaterial({ color: 0xddd0b0 });
    // Lower wainscot panel (darker warm tone)
    const wainscotMat = new THREE.MeshLambertMaterial({ color: 0xb89a68 });
    // Dark wood baseboard — polygonOffset stops it z-fighting with the floor plane
    const baseboardMat = new THREE.MeshLambertMaterial({
      color: 0x2a1608,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });

    const WALL_H  = 3.8;
    const WAINS_H = 1.0;   // height of lower wainscot panel
    const BASE_H  = 0.12;  // baseboard strip height
    // Upper section fills the rest above baseboard + wainscot
    const UPPER_H = WALL_H - BASE_H - WAINS_H; // 2.68

    // Helper to build a two-tone wall segment (width × full height) at a given position/rotY
    const addWallPanel = (width, px, py, pz, rotY) => {
      // Upper cream section — starts at top of wainscot
      const upper = new THREE.Mesh(new THREE.PlaneGeometry(width, UPPER_H), wallMat);
      upper.position.set(px, py + BASE_H + WAINS_H + UPPER_H / 2, pz);
      upper.rotation.y = rotY;
      s.add(upper);
      // Wainscot — starts at top of baseboard (BASE_H), never touches y=0
      const wains = new THREE.Mesh(new THREE.PlaneGeometry(width, WAINS_H), wainscotMat);
      wains.position.set(px, py + BASE_H + WAINS_H / 2, pz);
      wains.rotation.y = rotY;
      s.add(wains);
      // Baseboard strip — polygonOffset prevents z-fight with floor at y=0
      const base = new THREE.Mesh(new THREE.PlaneGeometry(width, BASE_H), baseboardMat);
      base.position.set(px, py + BASE_H / 2, pz);
      base.rotation.y = rotY;
      s.add(base);
    };

    // Back wall (z=-22)
    addWallPanel(32, 0, 0, -21.99, 0);

    // Front wall (z=+22) — windowed sections either side of door
    this._addWindowWall(s, wallMat, -11); // left section
    this._addWindowWall(s, wallMat,  11); // right section

    // Left wall (x=-16)
    addWallPanel(44, -15.99, 0, 0, Math.PI / 2);

    // Right wall (x=+16)
    addWallPanel(44, 15.99, 0, 0, -Math.PI / 2);

    // Neon strips on walls
    this._neonStrip(new THREE.Vector3(0, 3.7, -22),  32, 0, 0x00ffff);
    this._neonStrip(new THREE.Vector3(-16, 3.7, 0), 44, Math.PI/2, 0xff00ff);
    this._neonStrip(new THREE.Vector3(16, 3.7, 0),  44, Math.PI/2, 0xff00ff);
    this._neonStrip(new THREE.Vector3(0, 3.7, 22),  32, 0, 0x00ffff);
  }

  _makeCheckerTex(size, color1, color2, squares) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const sq = size / squares;
    for (let r = 0; r < squares; r++) {
      for (let c = 0; c < squares; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? color1 : color2;
        ctx.fillRect(c * sq, r * sq, sq, sq);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  _makeCarpetTex() {
    const SIZE = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    // Base — dark navy blue
    ctx.fillStyle = '#060c2e';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Carpet fiber noise — short vertical/horizontal strokes in blue family
    for (let i = 0; i < 120000; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const t = Math.random();
      const r = Math.floor(4  + t * 18);
      const g = Math.floor(10 + t * 38);
      const b = Math.floor(55 + t * 90);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      // Alternate horizontal and vertical single-pixel strokes for pile look
      if (Math.random() < 0.5) {
        ctx.fillRect(x, y, 2, 1);
      } else {
        ctx.fillRect(x, y, 1, 2);
      }
    }

    // Subtle repeating diamond grid — classic video-store carpet motif
    const TILE = 40;
    ctx.strokeStyle = 'rgba(80, 140, 255, 0.22)';
    ctx.lineWidth = 1;
    for (let col = 0; col < SIZE / TILE + 1; col++) {
      for (let row = 0; row < SIZE / TILE + 1; row++) {
        const cx = col * TILE;
        const cy = row * TILE;
        ctx.beginPath();
        ctx.moveTo(cx + TILE / 2, cy);
        ctx.lineTo(cx + TILE,     cy + TILE / 2);
        ctx.lineTo(cx + TILE / 2, cy + TILE);
        ctx.lineTo(cx,            cy + TILE / 2);
        ctx.closePath();
        ctx.stroke();
      }
    }

    // Thin accent lines every 4 tiles — gives the carpet a band feel
    ctx.strokeStyle = 'rgba(60, 100, 220, 0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < SIZE; i += TILE * 4) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(SIZE, i); ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  _neonStrip(pos, length, rotY, color) {
    const geo = new THREE.BoxGeometry(length, 0.04, 0.04);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    this.scene.add(mesh);
    const light = new THREE.PointLight(color, 0.25, 10);
    light.position.copy(pos);
    this.scene.add(light);
  }

  // ─── LIGHTING ───────────────────────────────────────────────
  _buildLighting() {
    const s = this.scene;

    // Ambient: cool blue-grey like a cloudy day leaking in from windows
    s.add(new THREE.AmbientLight(0x7a8caa, 1.4));

    // Fluorescent ceiling lights — warm white, like actual store tubes
    for (const x of [-8, 0, 8]) {
      for (const z of [-15, -5, 5, 15]) {
        const tube = new THREE.Mesh(
          new THREE.BoxGeometry(3, 0.04, 0.08),
          new THREE.MeshBasicMaterial({ color: 0xfffde8 })
        );
        tube.position.set(x, 3.78, z);
        s.add(tube);
        const l = new THREE.PointLight(0xfff5d0, 2.2, 35);
        l.position.set(x, 3.5, z);
        s.add(l);
      }
    }

    // Cool daylight bleeding in from the two front windows
    for (const wx of [-11, 11]) {
      const wl = new THREE.PointLight(0xb8d0e8, 1.8, 28);
      wl.position.set(wx, 1.8, 20);
      s.add(wl);
    }

    // Neon accent lights — keep but toned down
    const accents = [
      [0, 2, -21.5, 0x00ffff],
      [-15.5, 2, 0, 0xff00ff],
      [15.5, 2, 0, 0xff00ff],
      [0, 2, 21.5, 0x00ffff],
    ];
    for (const [x, y, z, c] of accents) {
      const l = new THREE.PointLight(c, 0.8, 14);
      l.position.set(x, y, z);
      s.add(l);
    }
  }

  // ─── SHELVES ────────────────────────────────────────────────
  _buildAllShelves() {
    /*
      Zone layout — each zone = a group of shelf units sharing a genre.
      Sign positions are just above the shelf group, facing the reader.
    */
    const ZONE_DEFS = [
      // ── Left wall (3 zones, front → back) ──────────────────
      { rotY:  Math.PI/2,  sign:[-13.0, 2.55,  11, Math.PI/2],  shelves:[[-13.5,0,14],[-13.5,0,8]]           },
      { rotY:  Math.PI/2,  sign:[-13.0, 2.55,  -1, Math.PI/2],  shelves:[[-13.5,0,2], [-13.5,0,-4]]          },
      { rotY:  Math.PI/2,  sign:[-13.0, 2.55, -13, Math.PI/2],  shelves:[[-13.5,0,-10],[-13.5,0,-16]]        },
      // ── Right wall (3 zones, front → back) ─────────────────
      { rotY: -Math.PI/2,  sign:[ 13.0, 2.55,  11,-Math.PI/2],  shelves:[[ 13.5,0,14],[ 13.5,0,8]]          },
      { rotY: -Math.PI/2,  sign:[ 13.0, 2.55,  -1,-Math.PI/2],  shelves:[[ 13.5,0,2], [ 13.5,0,-4]]         },
      { rotY: -Math.PI/2,  sign:[ 13.0, 2.55, -13,-Math.PI/2],  shelves:[[ 13.5,0,-10],[ 13.5,0,-16]]       },
      // ── Back wall (1 zone) ──────────────────────────────────
      { rotY: 0,           sign:[  0,   2.55, -20.5, Math.PI],   shelves:[[-10,0,-20.5],[-5,0,-20.5],[0,0,-20.5],[5,0,-20.5],[10,0,-20.5]] },
      // ── Center-Left aisle: outer face (→ left wall aisle) ──
      { rotY: -Math.PI/2,  sign:[-5.2,  2.55,  -4, -Math.PI/2], shelves:[[-5.2,0,-16],[-5.2,0,-8],[-5.2,0,0],[-5.2,0,8]]  },
      // ── Center-Left aisle: inner face (→ center) ───────────
      { rotY:  Math.PI/2,  sign:[-4.0,  2.55,  -4,  Math.PI/2], shelves:[[-4.0,0,-16],[-4.0,0,-8],[-4.0,0,0],[-4.0,0,8]]  },
      // ── Center-Right aisle: inner face (→ center) ──────────
      { rotY: -Math.PI/2,  sign:[ 4.0,  2.55,  -4, -Math.PI/2], shelves:[[ 4.0,0,-16],[ 4.0,0,-8],[ 4.0,0,0],[ 4.0,0,8]] },
      // ── Center-Right aisle: outer face (→ right wall aisle) ─
      { rotY:  Math.PI/2,  sign:[ 5.2,  2.55,  -4,  Math.PI/2], shelves:[[ 5.2,0,-16],[ 5.2,0,-8],[ 5.2,0,0],[ 5.2,0,8]] },
    ];

    this.shelfZones = ZONE_DEFS.map(def => {
      const slots = [];
      for (const [x, y, z] of def.shelves) {
        slots.push(...this._addShelf(x, y, z, def.rotY));
      }
      const [sx, sy, sz, sRotY] = def.sign;
      const signMesh = this._makeZoneSign(sx, sy, sz, sRotY);
      return { slots, signMesh };
    });

    // Flat list kept for backward-compat (raycaster etc.)
    this.shelfSlots = this.shelfZones.flatMap(z => z.slots);
  }

  // Create a sign board above a shelf zone — label set later via setZoneGenre()
  _makeZoneSign(x, y, z, rotY) {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 0.38, 0.06),
      new THREE.MeshLambertMaterial({ color: 0x2a1408 })
    );
    board.position.set(x, y, z);
    board.rotation.y = rotY;
    this.scene.add(board);

    // Two thin hanging rods
    for (const ox of [-1.1, 1.1]) {
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6),
        new THREE.MeshLambertMaterial({ color: 0x888888 })
      );
      // Rotate rod to local shelf frame before positioning
      const wx = ox * Math.cos(rotY);
      const wz = ox * -Math.sin(rotY);
      rod.position.set(x + wx, y + 0.46, z + wz);
      this.scene.add(rod);
    }
    return board;
  }

  // Call after genre assignment to paint the sign
  setZoneGenre(zoneIdx, genreName) {
    const sign = this.shelfZones[zoneIdx]?.signMesh;
    if (!sign) return;

    const W = 512, H = 64;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background
    const bg = ctx.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0,   '#3a1a06');
    bg.addColorStop(0.5, '#5a2e10');
    bg.addColorStop(1,   '#3a1a06');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Gold border
    ctx.strokeStyle = '#d4a020';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, W - 6, H - 6);

    // Genre text
    ctx.fillStyle = '#fae060';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(genreName.toUpperCase(), W / 2, H / 2);

    const tex = new THREE.CanvasTexture(canvas);
    sign.material = new THREE.MeshBasicMaterial({ map: tex });
    sign.material.needsUpdate = true;
  }

  /*
    Canonical shelf (before rotation) faces +Z:
      - Shelf runs along X (-SHELF_W/2 to +SHELF_W/2)
      - Back panel at local z = -SHELF_D/2
      - Front (books face) at local z = +SHELF_D/2
      - Shelf boards at y = 0, ROW_H, 2*ROW_H, 3*ROW_H

    After rotY rotation:
      - local +Z maps to world direction based on rotY
      - local X (shelf run) rotates accordingly
  */
  _addShelf(cx, cy, cz, rotY) {
    const s        = this.scene;
    const newSlots = [];
    const shelfMat  = new THREE.MeshLambertMaterial({ color: 0x3b2511 });
    const boardMat  = new THREE.MeshLambertMaterial({ color: 0x4e3218 });

    const group = new THREE.Group();
    group.position.set(cx, cy, cz);
    group.rotation.y = rotY;

    // Back panel
    group.add(this._box(SHELF_W, SHELF_H, 0.05, 0, SHELF_H/2, -SHELF_D/2, shelfMat));

    // Side panels
    for (const sx of [-SHELF_W/2, SHELF_W/2]) {
      group.add(this._box(0.05, SHELF_H, SHELF_D, sx, SHELF_H/2, 0, shelfMat));
    }

    // Shelf boards
    for (let row = 0; row <= SHELF_ROWS; row++) {
      group.add(this._box(SHELF_W, 0.04, SHELF_D, 0, row * ROW_H, 0, boardMat));
    }

    // Collect slot positions top-row first so movies fill from the top down
    const bookZ = SHELF_D / 2 - VHS_D / 2 - 0.005;
    for (let row = SHELF_ROWS - 1; row >= 0; row--) {
      const bookY = row * ROW_H + 0.04 + VHS_H / 2;
      for (let i = 0; i < BOOKS_PER_ROW; i++) {
        const bookX = -SHELF_W / 2 + SHELF_MARGIN + VHS_W / 2 + i * VHS_PITCH;
        const worldPos = new THREE.Vector3(bookX, bookY, bookZ)
          .applyEuler(new THREE.Euler(0, rotY, 0))
          .add(new THREE.Vector3(cx, cy, cz));
        newSlots.push({ position: worldPos, rotY });
      }
    }

    s.add(group);

    // Collider (in world space, axis-aligned bounding box)
    // After rotation, compute world-space AABB
    const hw = SHELF_W / 2;
    const hd = SHELF_D / 2;
    // For 90° rotations, swap w and d
    const absRotY = Math.abs(rotY);
    const isRotated = Math.abs(Math.cos(absRotY)) < 0.1; // ≈ PI/2 or -PI/2
    const wx = isRotated ? hd : hw;
    const wz = isRotated ? hw : hd;
    this.colliders.push({
      min: new THREE.Vector3(cx - wx - 0.2, 0, cz - wz - 0.2),
      max: new THREE.Vector3(cx + wx + 0.2, SHELF_H + 0.1, cz + wz + 0.2),
    });

    return newSlots;
  }

  _box(w, h, d, lx, ly, lz, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(lx, ly, lz);
    return mesh;
  }

  // ─── COUNTER ────────────────────────────────────────────────
  _buildCounter() {
    const s = this.scene;
    const body = new THREE.MeshLambertMaterial({ color: 0x2b1a0a });
    const top  = new THREE.MeshLambertMaterial({ color: 0x3e2410 });

    const counterBody = new THREE.Mesh(new THREE.BoxGeometry(9, 1.05, 1.4), body);
    counterBody.position.set(0, 0.525, 19.5);
    s.add(counterBody);

    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(9.1, 0.06, 1.5), top);
    counterTop.position.set(0, 1.08, 19.5);
    s.add(counterTop);

    // Neon sign above counter
    this._neonSign(new THREE.Vector3(0, 2.6, 19.1), 'SamFlix');

    this.colliders.push({
      min: new THREE.Vector3(-4.7, 0, 18.7),
      max: new THREE.Vector3(4.7, 1.1, 20.3),
    });
  }

  _neonSign(pos, text) {
    const s = this.scene;

    // Wooden board — dark brown box with thickness
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.7, 0.08),
      new THREE.MeshLambertMaterial({ map: this._makeSignBoardTex(text) })
    );
    board.position.copy(pos);
    s.add(board);

    // Subtle warm light from the sign
    const light = new THREE.PointLight(0xffcc66, 0.8, 5);
    light.position.copy(pos);
    s.add(light);
  }

  _makeSignBoardTex(text) {
    const W = 1024, H = 140;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Dark wood grain background
    ctx.fillStyle = '#2a1505';
    ctx.fillRect(0, 0, W, H);

    // Wood grain lines — horizontal streaks
    for (let i = 0; i < 60; i++) {
      const y   = Math.random() * H;
      const w   = 80 + Math.random() * 300;
      const x   = Math.random() * W;
      const bri = Math.random() * 18 - 6;
      const base = 42 + bri;
      ctx.fillStyle = `rgba(${base + 10},${Math.floor(base * 0.45)},${Math.floor(base * 0.08)},0.35)`;
      ctx.fillRect(x, y, w, 1 + Math.random() * 2);
    }

    // Darker knot-like blobs
    for (let k = 0; k < 3; k++) {
      const kx = 80 + Math.random() * (W - 160);
      const ky = H / 2 + (Math.random() - 0.5) * 30;
      const rg  = ctx.createRadialGradient(kx, ky, 2, kx, ky, 22 + Math.random() * 14);
      rg.addColorStop(0,   'rgba(10,5,0,0.5)');
      rg.addColorStop(1,   'rgba(10,5,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.ellipse(kx, ky, 28, 14, Math.random(), 0, Math.PI * 2); ctx.fill();
    }

    // Border — routed edge effect (two thin lines)
    ctx.strokeStyle = 'rgba(255,200,120,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    // Text — engraved look (dark shadow slightly offset, then bright fill)
    const fontSize = 72;
    ctx.font = `bold ${fontSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow / engraved depth
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(text, W / 2 + 3, H / 2 + 4);

    // Highlight
    ctx.fillStyle = 'rgba(255,220,140,0.15)';
    ctx.fillText(text, W / 2 - 1, H / 2 - 2);

    // Main gold text
    const textGrad = ctx.createLinearGradient(0, H / 2 - 36, 0, H / 2 + 36);
    textGrad.addColorStop(0,   '#ffe090');
    textGrad.addColorStop(0.5, '#c8880a');
    textGrad.addColorStop(1,   '#e8aa30');
    ctx.fillStyle = textGrad;
    ctx.fillText(text, W / 2, H / 2);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  // ─── DECOR ──────────────────────────────────────────────────
  _buildDecor() {
    const s = this.scene;

    // TV on back wall
    const tvFrame = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 2.2, 0.2),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    tvFrame.position.set(0, 2.5, -21.85);
    s.add(tvFrame);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.9, 1.9),
      new THREE.MeshBasicMaterial({ color: 0x001aff })
    );
    screen.position.set(0, 2.5, -21.73);
    s.add(screen);

    const tvLight = new THREE.PointLight(0x001aff, 1.5, 6);
    tvLight.position.set(0, 2.5, -21.5);
    s.add(tvLight);

    // Static-ish pattern on TV screen using canvas texture
    const tvCanvas = document.createElement('canvas');
    tvCanvas.width = tvCanvas.height = 256;
    const ctx = tvCanvas.getContext('2d');
    for (let i = 0; i < 2000; i++) {
      const bri = Math.random() * 80;
      ctx.fillStyle = `rgb(${bri},${bri*0.8},${bri*2})`;
      ctx.fillRect(Math.random()*256, Math.random()*256, 3, 2);
    }
    screen.material.map = new THREE.CanvasTexture(tvCanvas);
    screen.material.needsUpdate = true;

    // Scattered VHS tapes on counter — with realistic textures
    const tapeOffsets = [
      [-2.5, 19.2,  0.18], [-1.5, 19.5, -0.15], [-0.4, 19.1,  0.22],
      [ 0.6, 19.4, -0.10], [ 1.6, 19.2,  0.30], [ 2.6, 19.5, -0.20],
    ];
    for (let i = 0; i < tapeOffsets.length; i++) {
      const [tx, tz, rotY] = tapeOffsets[i];
      const tape = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 0.105, 0.115),
        this._makeVHSMaterials(i)
      );
      tape.position.set(tx, 1.125, tz);
      tape.rotation.y = rotY;
      s.add(tape);
    }

    // Entrance door frame
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
    // Left door post
    const lpost = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 0.2), doorMat);
    lpost.position.set(-6, 1.9, 22);
    s.add(lpost);
    // Right door post
    const rpost = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 0.2), doorMat);
    rpost.position.set(6, 1.9, 22);
    s.add(rpost);
    // Door top
    const top2 = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 0.2), doorMat);
    top2.position.set(0, 3.7, 22);
    s.add(top2);
  }

  // ─── WINDOWED FRONT WALL SECTION ────────────────────────────
  // xCenter: -11 (left) or +11 (right). Section spans ±5 from center.
  _addWindowWall(s, wallMat, xCenter) {
    const z     = 22;
    const winW  = 5;    // window opening width
    const winH  = 1.5;  // window opening height
    const winY  = 1.55; // window centre Y  (0.8 → 2.3)
    const colW  = 2.5;  // solid column width either side
    const rot   = { rotation: { y: Math.PI } };

    const addPlane = (w, h, x, y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, z);
      m.rotation.y = Math.PI;
      s.add(m);
    };

    // Top bar (above window, full section width=10)
    addPlane(10, 3.8 - (winY + winH / 2), xCenter, (3.8 + winY + winH / 2) / 2);
    // Bottom sill
    addPlane(10, winY - winH / 2, xCenter, (winY - winH / 2) / 2);
    // Left solid column (window height band)
    addPlane(colW, winH, xCenter - (winW / 2 + colW / 2), winY);
    // Right solid column
    addPlane(colW, winH, xCenter + (winW / 2 + colW / 2), winY);

    // Glass — slightly tinted, transparent
    const glassMat = new THREE.MeshBasicMaterial({
      color: 0x9bbdd4, transparent: true, opacity: 0.18,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
    glass.position.set(xCenter, winY, z - 0.01);
    glass.rotation.y = Math.PI;
    s.add(glass);

    // Window frame — dark painted wood
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x1e1810 });
    const fw = 0.09; // frame bar thickness
    const fd = 0.1;  // frame depth
    const addBar = (w, h, x, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, fd), frameMat);
      m.position.set(x, y, z - fd / 2 - 0.005);
      s.add(m);
    };
    addBar(winW + fw * 2, fw, xCenter, winY + winH / 2 + fw / 2); // top
    addBar(winW + fw * 2, fw, xCenter, winY - winH / 2 - fw / 2); // bottom
    addBar(fw, winH,        xCenter - winW / 2 - fw / 2, winY);   // left
    addBar(fw, winH,        xCenter + winW / 2 + fw / 2, winY);   // right
    addBar(winW, fw * 0.6,  xCenter, winY);                        // horizontal divider
  }

  // ─── OUTSIDE SCENE ──────────────────────────────────────────
  _buildOutside() {
    const s = this.scene;

    // Pavement — continues the floor outside
    const paveMat = new THREE.MeshLambertMaterial({ color: 0x7a8090 });
    const pave = new THREE.Mesh(new THREE.PlaneGeometry(60, 28), paveMat);
    pave.rotation.x = -Math.PI / 2;
    pave.position.set(0, -0.01, 35);
    s.add(pave);

    // Sky + city backdrop billboard
    const skyMat = new THREE.MeshBasicMaterial({
      map: this._makeOutsideTex(),
      side: THREE.FrontSide,
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(80, 16), skyMat);
    sky.position.set(0, 6, 32);
    sky.rotation.y = Math.PI; // face toward store (-z)
    s.add(sky);

    // Building boxes
    const buildMat = new THREE.MeshLambertMaterial({ color: 0x5a6070 });
    const buildings = [
      [-18, 3,   30, 4,  6,  3],
      [-10, 2,   32, 3,  4,  3],
      [ 12, 4,   31, 4,  8,  3],
      [ 20, 2.5, 29, 3,  5,  3],
      [  4, 1.8, 33, 5,  3.6,3],
    ];
    for (const [x, y, z, w, h, d] of buildings) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildMat);
      b.position.set(x, y, z);
      s.add(b);
    }

    // Trees along the front
    const treePositions = [
      [-20, 25], [-14, 27], [-7, 26],
      [  7, 26], [ 14, 27], [20, 25],
      [ -3, 31], [  3, 31],
    ];
    for (const [tx, tz] of treePositions) {
      this._addTree(s, tx, tz);
    }

    // Outdoor light
    const outdoorLight = new THREE.HemisphereLight(0x88b4e8, 0x607858, 0.7);
    outdoorLight.position.set(0, 10, 30);
    s.add(outdoorLight);
  }

  _addTree(s, x, z) {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a2f12 });
    const leafMat  = new THREE.MeshLambertMaterial({ color: 0x2d6020 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.4, 7), trunkMat);
    trunk.position.set(x, 0.7, z);
    s.add(trunk);

    // Three stacked cones for a classic pine look
    const tiers = [[1.4, 1.8, 2.0], [1.0, 1.5, 3.2], [0.6, 1.2, 4.3]];
    for (const [r, h, y] of tiers) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), leafMat);
      cone.position.set(x, y, z);
      s.add(cone);
    }
  }

  _makeOutsideTex() {
    const W = 1024, H = 512;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Clear-cloudy sky — noticeably blue
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.65);
    skyGrad.addColorStop(0,   '#3a6eb5');
    skyGrad.addColorStop(0.4, '#5a90cc');
    skyGrad.addColorStop(1,   '#90bce0');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H * 0.65);

    // Soft cloud layers
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    this._cloud(ctx, 130,  55, 200, 65);
    this._cloud(ctx, 420,  40, 240, 72);
    this._cloud(ctx, 720,  70, 170, 55);
    this._cloud(ctx, 250, 130, 160, 48);
    this._cloud(ctx, 620, 150, 210, 58);
    this._cloud(ctx, 900, 110, 140, 44);
    ctx.fillStyle = 'rgba(185,198,210,0.4)';
    this._cloud(ctx,  60, 100, 210, 75);
    this._cloud(ctx, 520,  80, 190, 62);
    this._cloud(ctx, 830,  55, 155, 52);

    // Horizon haze
    const haze = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.67);
    haze.addColorStop(0, 'rgba(160,200,235,0)');
    haze.addColorStop(1, 'rgba(180,215,240,0.75)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, H * 0.55, W, H * 0.12);

    // Building silhouettes
    const horizY = H * 0.63;
    ctx.fillStyle = '#6e7a88';
    const blds = [
      [30,  100, 55, 100], [95,   70, 40,  70], [160, 130, 45, 130],
      [220,  65, 55,  65], [300,  90, 50,  90], [370,  55, 35,  55],
      [430, 115, 60, 115], [510,  80, 45,  80], [580, 145, 50, 145],
      [650,  70, 40,  70], [710, 100, 55, 100], [780,  60, 35,  60],
      [830, 120, 50, 120], [900,  85, 45,  85], [965,  75, 50,  75],
    ];
    for (const [x, h, w] of blds) {
      ctx.fillRect(x, horizY - h, w, h);
      // small windows
      ctx.fillStyle = 'rgba(200,220,240,0.6)';
      for (let wy = horizY - h + 8; wy < horizY - 10; wy += 14) {
        for (let wx = x + 5; wx < x + w - 5; wx += 10) {
          if (Math.random() > 0.4) ctx.fillRect(wx, wy, 5, 7);
        }
      }
      ctx.fillStyle = '#6e7a88';
    }

    // Ground / road
    const gGrad = ctx.createLinearGradient(0, horizY, 0, H);
    gGrad.addColorStop(0,   '#7a8492');
    gGrad.addColorStop(0.4, '#888e9a');
    gGrad.addColorStop(1,   '#9aa0aa');
    ctx.fillStyle = gGrad;
    ctx.fillRect(0, horizY, W, H - horizY);

    // Road markings
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(W / 2 - 6 + i * 18, horizY + 30, 8, 50);
      ctx.fillRect(W / 2 - 6 + i * 18, horizY + 100, 8, 70);
    }

    return new THREE.CanvasTexture(canvas);
  }

  // ─── REALISTIC VHS TAPE MATERIALS ───────────────────────────
  // BoxGeometry face order: +X(right), -X(left), +Y(top), -Y(bottom), +Z(front), -Z(back)
  _makeVHSMaterials(index) {
    const labelColors = ['#c8200c','#1a4fa0','#186a20','#8a6a00','#6a1888','#0a6a6a'];
    const labelColor  = labelColors[index % labelColors.length];

    const blackMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const sideMat  = new THREE.MeshLambertMaterial({ map: this._makeVHSSideTex() });
    const topMat   = new THREE.MeshLambertMaterial({ map: this._makeVHSTopTex() });
    const frontMat = new THREE.MeshLambertMaterial({ map: this._makeVHSFrontTex(labelColor) });
    const backMat  = new THREE.MeshLambertMaterial({ map: this._makeVHSBackTex() });

    // +X(right), -X(left), +Y(top), -Y(bottom), +Z(front), -Z(back)
    return [sideMat, sideMat, topMat, blackMat, frontMat, backMat];
  }

  // Top face — black plastic with tape window cutout
  _makeVHSTopTex() {
    const W = 380, H = 230;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Body
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, H);

    // Tape window (rounded rect, dark inside)
    const wx = 80, wy = 40, ww = W - 160, wh = H - 80;
    ctx.fillStyle = '#0a0a0a';
    this._roundRect(ctx, wx, wy, ww, wh, 12);
    ctx.fill();

    // Window rim
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    this._roundRect(ctx, wx, wy, ww, wh, 12);
    ctx.stroke();

    // Two tape reels inside the window
    for (const rx of [wx + ww * 0.28, wx + ww * 0.72]) {
      const ry = wy + wh / 2;
      const r  = wh * 0.32;
      // Outer ring
      ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fillStyle = '#222'; ctx.fill();
      ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.stroke();
      // Spokes
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
      for (let a = 0; a < 6; a++) {
        const angle = (a / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(angle) * r * 0.85, ry + Math.sin(angle) * r * 0.85);
        ctx.stroke();
      }
      // Hub
      ctx.beginPath(); ctx.arc(rx, ry, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = '#333'; ctx.fill();
    }

    // Tape path between reels
    ctx.strokeStyle = '#1a1005';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(wx + ww * 0.28, wy + wh / 2 + wh * 0.32);
    ctx.bezierCurveTo(
      wx + ww * 0.28, wy + wh - 4,
      wx + ww * 0.72, wy + wh - 4,
      wx + ww * 0.72, wy + wh / 2 + wh * 0.32
    );
    ctx.stroke();

    // Screw corners
    ctx.fillStyle = '#2a2a2a';
    for (const [sx, sy] of [[18,18],[W-18,18],[18,H-18],[W-18,H-18]]) {
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx-4, sy); ctx.lineTo(sx+4, sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, sy-4); ctx.lineTo(sx, sy+4); ctx.stroke();
    }

    return new THREE.CanvasTexture(c);
  }

  // Front face — big label with title area
  _makeVHSFrontTex(labelColor) {
    const W = 380, H = 210;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Black body
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    // Label area
    const lx = 14, ly = 14, lw = W - 28, lh = H - 28;
    const grad = ctx.createLinearGradient(lx, ly, lx, ly + lh);
    grad.addColorStop(0, this._lighten(labelColor, 30));
    grad.addColorStop(1, labelColor);
    ctx.fillStyle = grad;
    this._roundRect(ctx, lx, ly, lw, lh, 6);
    ctx.fill();

    // White horizontal stripe near top
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(lx, ly, lw, lh * 0.28);

    // "VHS" badge
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(lx + 8, ly + 8, 58, 22);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('VHS', lx + 16, ly + 24);

    // Fake title lines
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('[ VIDEOVAULT ]', W / 2, ly + lh * 0.55);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '13px sans-serif';
    ctx.fillText('T-160  ·  HI-FI STEREO', W / 2, ly + lh * 0.75);

    return new THREE.CanvasTexture(c);
  }

  // Back face — plain black with some moulding detail
  _makeVHSBackTex() {
    const W = 380, H = 210;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#161616';
    ctx.fillRect(0, 0, W, H);
    // Moulding lines
    ctx.strokeStyle = '#252525';
    ctx.lineWidth = 2;
    for (const y of [30, H - 30]) {
      ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke();
    }
    // Tape slot
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(W / 2 - 60, H / 2 - 8, 120, 16);
    return new THREE.CanvasTexture(c);
  }

  // Side face — narrow spine with label strip
  _makeVHSSideTex() {
    const W = 230, H = 210;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, H);
    // Recessed panel
    ctx.fillStyle = '#141414';
    ctx.fillRect(10, 10, W - 20, H - 20);
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    return new THREE.CanvasTexture(c);
  }

  // Helper — rounded rectangle path
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Helper — lighten a hex colour string
  _lighten(hex, amount) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (n >> 16) + amount);
    const g = Math.min(255, ((n >> 8) & 0xff) + amount);
    const b = Math.min(255, (n & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }

  _cloud(ctx, cx, cy, rw, rh) {
    ctx.beginPath(); ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - rw * 0.3, cy + rh * 0.2, rw * 0.55, rh * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + rw * 0.35, cy + rh * 0.1, rw * 0.6, rh * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ─── MOVIE BANNERS ──────────────────────────────────────────
  _buildBanners() {
    const s = this.scene;
    const loader = new THREE.TextureLoader();

    // Banner positions — side walls (clear of shelves) + back wall corners
    // Side walls:  shelves at z = 14,8,2,-4,-10,-16 (each ±1.8 wide)
    //   clear gaps: z≈18 (entrance), z≈5 (between z=2 & z=8), z≈-7 (between z=-4 & z=-10), z≈-19 (back corner)
    // Back wall (rotY=0): shelves at x=-10,-5,0,5,10 (each ±1.8 wide)
    //   clear gaps: x≈±13 (outside outermost shelf)
    const BANNERS = [
      { file: '/public/banners/batman.jpg',              x: -15.88, z:  18,     rotY:  Math.PI / 2 },
      { file: '/public/banners/spider.jpg',              x: -15.88, z:   5,     rotY:  Math.PI / 2 },
      { file: '/public/banners/spider3.jpg',             x: -15.88, z:  -7,     rotY:  Math.PI / 2 },
      { file: '/public/banners/jurassic-park.jpg',       x: -15.88, z: -19,     rotY:  Math.PI / 2 },
      { file: '/public/banners/iron-man.jpg',            x:  15.88, z:  18,     rotY: -Math.PI / 2 },
      { file: '/public/banners/star.jpg',                x:  15.88, z:   5,     rotY: -Math.PI / 2 },
      { file: '/public/banners/little-miss-sunshine.jpg',x:  15.88, z:  -7,     rotY: -Math.PI / 2 },
      { file: '/public/banners/luta.jpg',                x:  15.88, z: -19,     rotY: -Math.PI / 2 },
      { file: '/public/banners/avengers.jpg',            x:  -13,   z: -21.88,  rotY:  0           },
    ];

    const BW = 1.5, BH = 2.6; // banner width / height in world units

    for (const b of BANNERS) {
      // Dark wooden backing frame
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(BW + 0.1, BH + 0.1, 0.05),
        new THREE.MeshLambertMaterial({ color: 0x150a02 })
      );
      frame.position.set(b.x, 1.9, b.z);
      frame.rotation.y = b.rotY;
      s.add(frame);

      // Banner image plane — sits a hair in front of the frame
      const mat = new THREE.MeshBasicMaterial({ color: 0x555555 });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), mat);

      // Offset the plane 3 cm toward the room interior along the wall normal
      const inset = 0.03;
      const dx = Math.sin(b.rotY) * inset;
      const dz = Math.cos(b.rotY) * inset;
      plane.position.set(b.x + dx, 1.9, b.z + dz);
      plane.rotation.y = b.rotY;
      s.add(plane);

      loader.load(
        b.file,
        (tex) => {
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.anisotropy  = 4;
          mat.map   = tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
        }
      );

      // Subtle warm spotlight on each banner
      const spot = new THREE.PointLight(0xffe8b0, 0.9, 4);
      spot.position.set(b.x + Math.sin(b.rotY) * 1.5, 2.8, b.z + Math.cos(b.rotY) * 1.5);
      s.add(spot);
    }
  }
}
