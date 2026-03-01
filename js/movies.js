import * as THREE from 'three';

// VHS box dimensions (must match store.js constants)
const VHS_W = 0.12;
const VHS_H = 0.22;
const VHS_D = 0.08;

// TV show spine colours — cool blue/steel palette
const TV_SPINE_COLORS = [
  0x0a2a42, 0x1a3a5a, 0x0e3050, 0x163858, 0x0c2038,
  0x243060, 0x1a4060, 0x0e2848, 0x204070, 0x182848,
];

// Earth-tone spine colours — no more random pink
const SPINE_COLORS = [
  0x4a2810, 0x5c3520, 0x3a1e0c, 0x6b4530, 0x2e1808,
  0x7a5040, 0x4e3018, 0x381f0e, 0x5a3622, 0x6e4028,
];

export class MovieManager {
  constructor(scene, shelfSlots, jellyfinClient, onProgress) {
    this.scene         = scene;
    this.shelfSlots    = shelfSlots;
    this.jellyfin      = jellyfinClient;
    this.onProgress    = onProgress || (() => {});
    this.movieMeshes   = [];
    this.textureLoader = new THREE.TextureLoader();
    this.textureLoader.crossOrigin = 'anonymous';
  }

  // Place movies grouped by zone. zoneAssignments = [{genre, movies}] aligned to shelfZones[].
  async placeByZone(shelfZones, zoneAssignments) {
    const total = zoneAssignments.reduce((s, z) => s + z.movies.length, 0);
    let placed = 0;
    const BATCH = 30;

    for (let zi = 0; zi < zoneAssignments.length; zi++) {
      const { movies } = zoneAssignments[zi];
      const slots = shelfZones[zi]?.slots || [];
      const count = Math.min(movies.length, slots.length);

      for (let i = 0; i < count; i += BATCH) {
        const end = Math.min(i + BATCH, count);
        for (let j = i; j < end; j++) {
          this._placeOne(movies[j], slots[j]);
        }
        placed += end - i;
        this.onProgress(Math.round((placed / total) * 50) + 50);
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  // Fallback: place a flat list across all slots in order
  async placeMovies(movies) {
    const slots = this.shelfSlots;
    const count = Math.min(movies.length, slots.length);
    const BATCH = 30;
    for (let i = 0; i < count; i += BATCH) {
      const end = Math.min(i + BATCH, count);
      for (let j = i; j < end; j++) this._placeOne(movies[j], slots[j]);
      this.onProgress(Math.round((end / count) * 50) + 50);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  _placeOne(movie, slot) {
    const idx      = this.movieMeshes.length;
    const spineHex = SPINE_COLORS[idx % SPINE_COLORS.length];
    const spineMat = new THREE.MeshLambertMaterial({ color: spineHex });
    const topMat   = new THREE.MeshLambertMaterial({ color: 0x1a0c04 });

    // Front face gets a title-card canvas until (or if) the real poster loads
    const posterMat = new THREE.MeshLambertMaterial({
      map: this._makeTitleTex(movie.Name, movie.ProductionYear, spineHex),
    });

    // BoxGeometry face order: +X, -X, +Y, -Y, +Z(front/poster), -Z(back)
    const materials = [spineMat, spineMat, topMat, topMat, posterMat, topMat];

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(VHS_W, VHS_H, VHS_D),
      materials
    );
    mesh.position.copy(slot.position);
    mesh.rotation.y = slot.rotY;
    mesh.userData.movie = movie;
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.movieMeshes.push(mesh);

    // Try to load real poster from Jellyfin — replaces the title card if it loads
    if (this.jellyfin && !movie.Id.startsWith('d')) {
      const url = this.jellyfin.getImageUrl(movie.Id, 150);
      this.textureLoader.load(
        url,
        (tex) => {
          tex.minFilter = THREE.LinearFilter;
          posterMat.map = tex;
          posterMat.needsUpdate = true;
        },
        undefined,
        () => { /* keep the title-card fallback */ }
      );
    }

    return mesh;
  }

  // ── Canvas title card ─────────────────────────────────────────
  _makeTitleTex(title, year, spineHex) {
    const W = 150, H = 220;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background — derive a slightly lighter shade from the spine colour
    const r = (spineHex >> 16 & 0xff);
    const g = (spineHex >>  8 & 0xff);
    const b = (spineHex       & 0xff);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `rgb(${r+20},${g+12},${b+8})`);
    bg.addColorStop(1, `rgb(${Math.max(0,r-10)},${Math.max(0,g-6)},${Math.max(0,b-4)})`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Gold border
    ctx.strokeStyle = '#c8941e';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, W - 10, H - 10);

    // "VHS" banner at top
    ctx.fillStyle = '#c8941e';
    ctx.fillRect(10, 10, W - 20, 24);
    ctx.fillStyle = '#1a0c04';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VHS', W / 2, 27);

    // Title text — word-wrap
    ctx.fillStyle = '#f5d87a';
    ctx.textAlign = 'center';
    const lines = this._wrapText(ctx, title, W - 20, 15);
    const lineH = 18;
    const textTop = 55;
    for (let i = 0; i < lines.length; i++) {
      ctx.font = `bold 15px sans-serif`;
      ctx.fillText(lines[i], W / 2, textTop + i * lineH);
    }

    // Year at the bottom
    if (year) {
      ctx.fillStyle = '#c8941e';
      ctx.font = '12px sans-serif';
      ctx.fillText(String(year), W / 2, H - 14);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  _wrapText(ctx, text, maxWidth, fontSize) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // ── Hover highlight ───────────────────────────────────────────
  setHovered(mesh) {
    if (this._hoveredMesh === mesh) return;
    if (this._hoveredMesh) {
      for (const m of this._hoveredMesh.material) m.emissive?.set(0x000000);
    }
    this._hoveredMesh = mesh;
    if (mesh) {
      for (const m of mesh.material) m.emissive?.set(0x004444);
    }
  }

  // ── TV Shows ─────────────────────────────────────────────────
  async placeTVShows(shows, slots) {
    const count = Math.min(shows.length, slots.length);
    const BATCH = 30;
    for (let i = 0; i < count; i += BATCH) {
      const end = Math.min(i + BATCH, count);
      for (let j = i; j < end; j++) this._placeTVOne(shows[j], slots[j]);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  _placeTVOne(show, slot) {
    const idx      = this.movieMeshes.length;
    const spineHex = TV_SPINE_COLORS[idx % TV_SPINE_COLORS.length];
    const spineMat = new THREE.MeshLambertMaterial({ color: spineHex });
    const topMat   = new THREE.MeshLambertMaterial({ color: 0x04101a });

    const posterMat = new THREE.MeshLambertMaterial({
      map: this._makeTVLabelTex(show, spineHex),
    });

    const materials = [spineMat, spineMat, topMat, topMat, posterMat, topMat];

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(VHS_W, VHS_H, VHS_D),
      materials
    );
    mesh.position.copy(slot.position);
    mesh.rotation.y = slot.rotY;
    mesh.userData.movie   = show;   // reuse movie field so panel + raycast work
    mesh.userData.isTVShow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.movieMeshes.push(mesh);

    if (this.jellyfin && !show.Id.startsWith('tv')) {
      const url = this.jellyfin.getImageUrl(show.Id, 150);
      this.textureLoader.load(
        url,
        (tex) => { tex.minFilter = THREE.LinearFilter; posterMat.map = tex; posterMat.needsUpdate = true; },
        undefined, () => {}
      );
    }
    return mesh;
  }

  _makeTVLabelTex(show, spineHex) {
    const W = 150, H = 220;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const r = (spineHex >> 16 & 0xff);
    const g = (spineHex >>  8 & 0xff);
    const b = (spineHex       & 0xff);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `rgb(${r+30},${g+30},${b+40})`);
    bg.addColorStop(1, `rgb(${Math.max(0,r-5)},${Math.max(0,g-5)},${Math.max(0,b+10)})`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Blue border
    ctx.strokeStyle = '#4488cc';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, W - 10, H - 10);

    // "TV" badge at top
    ctx.fillStyle = '#4488cc';
    ctx.fillRect(10, 10, W - 20, 24);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TV SERIES', W / 2, 27);

    // Show name
    ctx.fillStyle = '#cce8ff';
    ctx.textAlign = 'center';
    const lines = this._wrapText(ctx, show.Name, W - 20, 14);
    const lineH = 17;
    const textTop = 52;
    for (let i = 0; i < lines.length; i++) {
      ctx.font = `bold 14px sans-serif`;
      ctx.fillText(lines[i], W / 2, textTop + i * lineH);
    }

    // Seasons info
    const seasons = show.ChildCount || show.NumberOfSeasons;
    if (seasons) {
      ctx.fillStyle = '#4488cc';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${seasons} Season${seasons > 1 ? 's' : ''}`, W / 2, H - 22);
    }
    if (show.ProductionYear) {
      ctx.fillStyle = '#88aabb';
      ctx.font = '11px sans-serif';
      ctx.fillText(String(show.ProductionYear), W / 2, H - 8);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  get allMeshes() { return this.movieMeshes; }
}
