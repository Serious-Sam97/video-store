import * as THREE from 'three';
import { JellyfinClient, DEMO_MOVIES } from './jellyfin.js';
import { VideoStore } from './store.js';
import { FirstPersonControls } from './controls.js';
import { MovieManager } from './movies.js';
import { NPCManager } from './npcs.js';
import { UI } from './ui.js';

const ZONE_LOCATIONS = [
  'LEFT WALL — FRONT',
  'LEFT WALL — MIDDLE',
  'LEFT WALL — BACK',
  'RIGHT WALL — FRONT',
  'RIGHT WALL — MIDDLE',
  'RIGHT WALL — BACK',
  'BACK WALL',
  'CENTER AISLE — LEFT OUTER',
  'CENTER AISLE — LEFT INNER',
  'CENTER AISLE — RIGHT INNER',
  'CENTER AISLE — RIGHT OUTER',
];

// ─────────────────────────────────────────────────────────────────
class VideoVault {
  constructor() {
    this.state         = 'settings'; // settings | playing | movie | paused | computer
    this.jellyfinClient = null;
    this.currentMovie  = null;
    this.store         = null;
    this.movieManager  = null;
    this.npcManager    = null;
    this._genreToZone  = new Map();

    this.ui = new UI();
    this._initThree();
    this._bindUI();
    this.ui.showSettings();
    this._loop();
  }

  // ─── THREE.JS SETUP ────────────────────────────────────────
  _initThree() {
    const canvas = document.getElementById('game-canvas');

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0e18);
    this.scene.fog         = new THREE.FogExp2(0x0c0e18, 0.028);

    this.camera = new THREE.PerspectiveCamera(
      72, window.innerWidth / window.innerHeight, 0.05, 80
    );
    this.camera.position.set(0, 1.6, 16);
    this.camera.lookAt(0, 1.6, 0);

    this.controls  = new FirstPersonControls(this.camera, canvas);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 3.5; // max interaction distance (metres)
    this.clock     = new THREE.Clock();

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Click anywhere on canvas to (re)lock pointer
    canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.controls.isLocked) {
        this.controls.lock();
      }
    });

    // When pointer lock is released while playing, show a click-to-resume hint
    document.addEventListener('pointerlockchange', () => {
      if (this.state !== 'playing') return;
      const locked = !!document.pointerLockElement;
      document.getElementById('click-to-play').classList.toggle('hidden', locked);
      document.getElementById('crosshair').classList.toggle('hidden', !locked);
    });
  }

  // ─── UI EVENT BINDINGS ──────────────────────────────────────
  _bindUI() {
    const $ = (id) => document.getElementById(id);

    // Settings form
    $('settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const serverUrl = $('server-url').value.trim();
      const username  = $('username').value.trim();
      const password  = $('password').value;
      if (!serverUrl || !username) {
        alert('Please enter the server URL and username.');
        return;
      }
      this._connectJellyfin(serverUrl, username, password);
    });

    // Demo mode
    $('demo-link').addEventListener('click', (e) => {
      e.preventDefault();
      this._startDemo();
    });

    // Enter store (from instructions)
    $('enter-store-btn').addEventListener('click', () => {
      this._enterStore();
    });

    // Resume from pause
    $('resume-btn').addEventListener('click', () => {
      this._resume();
    });

    // Quit to settings
    $('quit-btn').addEventListener('click', () => {
      this._quit();
    });

    // Movie panel
    $('play-btn').addEventListener('click', () => { this._playMovie(); });
    $('back-btn').addEventListener('click', () => { this._closeMoviePanel(); });

    // Keyboard: E = interact, ESC = pause/close computer
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.state === 'playing' && this.controls.isLocked) {
        this._interact();
      } else if (e.code === 'Escape' && this.state === 'computer') {
        this._closeComputer();
      } else if ((e.code === 'Escape' || e.code === 'KeyE') && this.state === 'npc') {
        this._closeNPCDialog();
      }
    });

    // Computer terminal UI
    document.getElementById('computer-close-btn').addEventListener('click', () => {
      if (this.state === 'computer') this._closeComputer();
    });

    // NPC dialog
    document.getElementById('npc-dialog-close').addEventListener('click', () => {
      if (this.state === 'npc') this._closeNPCDialog();
    });
    document.getElementById('terminal-search').addEventListener('input', (e) => {
      this._searchComputer(e.target.value.trim());
    });
  }

  // ─── GAME STATE ─────────────────────────────────────────────
  async _connectJellyfin(serverUrl, username, password) {
    this.ui.showLoading();
    this.ui.setProgress(5, 'Connecting to Jellyfin...');
    try {
      this.jellyfinClient = await JellyfinClient.login(serverUrl, username, password);
      this.ui.setProgress(20, 'Fetching movie library...');
      const movies = await this.jellyfinClient.getMovies(500);
      this.ui.setProgress(40, `Found ${movies.length} movies — building store...`);
      await this._buildStore(movies);
      this.ui.setProgress(100, 'Done!');
      await this._sleep(400);
      this.ui.showInstructions();
      this.state = 'instructions';
    } catch (err) {
      console.error('[VideoVault] Login error:', err);
      this.ui.showSettings();
      // Show error inside the settings box instead of a plain alert
      this._showLoginError(err.message);
    }
  }

  async _startDemo() {
    this.ui.showLoading();
    this.ui.setProgress(10, 'Loading demo store...');
    this.jellyfinClient = null;
    await this._buildStore(DEMO_MOVIES);
    this.ui.setProgress(100, 'Ready!');
    await this._sleep(300);
    this.ui.showInstructions();
    this.state = 'instructions';
  }

  async _buildStore(movies) {
    this.store = new VideoStore(this.scene);
    this.ui.setProgress(50, 'Organising by genre...');

    // Group movies by primary genre, sort genres by count descending
    const genreMap = {};
    for (const movie of movies) {
      const genre = (movie.Genres && movie.Genres[0]) || 'Other';
      (genreMap[genre] = genreMap[genre] || []).push(movie);
    }

    const genres = Object.keys(genreMap)
      .sort((a, b) => genreMap[b].length - genreMap[a].length);

    const zones     = this.store.shelfZones;
    const zoneCount = zones.length;

    // Assign each genre to a zone (overflow goes into last zone's slots)
    const zoneAssignments = [];
    const overflowMovies  = [];

    genres.forEach((genre, i) => {
      if (i < zoneCount) {
        this.store.setZoneGenre(i, genre);
        zoneAssignments.push({ genre, movies: genreMap[genre] });
        this._genreToZone.set(genre, i);
      } else {
        overflowMovies.push(...genreMap[genre]);
      }
    });

    // Distribute overflow into remaining zone slots
    if (overflowMovies.length && zoneAssignments.length > 0) {
      zoneAssignments[zoneAssignments.length - 1].movies.push(...overflowMovies);
    }

    this.movieManager = new MovieManager(
      this.scene,
      this.store.shelfSlots,
      this.jellyfinClient,
      (pct) => this.ui.setProgress(pct, 'Loading movie covers...')
    );
    await this.movieManager.placeByZone(zones, zoneAssignments);

    this.npcManager = new NPCManager(this.scene, this.store.colliders);
  }

  _enterStore() {
    this.state = 'playing';
    this.ui.hideAllScreens();
    // Show "click to play" until pointer lock is acquired
    document.getElementById('click-to-play').classList.remove('hidden');
    document.getElementById('crosshair').classList.add('hidden');
    this.controls.lock();
  }

  _pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause();
  }

  _resume() {
    this.state = 'playing';
    this.ui.hideAllScreens();
    this.ui.showHUD();
    this.controls.lock();
  }

  _showLoginError(msg) {
    let box = document.getElementById('login-error');
    if (!box) {
      box = document.createElement('div');
      box.id = 'login-error';
      document.querySelector('#settings-screen .overlay-box').appendChild(box);
    }
    box.textContent = msg;
    box.style.cssText = `
      margin-top: 16px; padding: 12px 14px;
      border: 1px solid #ff4444; color: #ff8888;
      background: rgba(255,0,0,0.08); font-size: 1rem;
      text-align: left; white-space: pre-wrap; line-height: 1.5;
    `;
  }

  _quit() {
    this.state = 'settings';
    this.controls.unlock();
    this.ui.showSettings();
  }

  // ─── INTERACTION ────────────────────────────────────────────
  _interact() {
    // NPC takes priority over everything when player is facing one
    if (this._nearestNPC) {
      this._openNPCDialog(this._nearestNPC);
      return;
    }

    if (!this._hoveredMesh) return;

    if (this._hoveredMesh.userData.isComputer) {
      this._openComputer();
      return;
    }

    const movie = this._hoveredMesh.userData.movie;
    if (!movie) return;

    this.currentMovie = movie;
    this.state = 'movie';
    this.controls.unlock();
    this.ui.hideHover();
    this.ui.openMoviePanel(movie, this.jellyfinClient);
  }

  // ─── COMPUTER TERMINAL ───────────────────────────────────────
  _openComputer() {
    this.state = 'computer';
    this.controls.unlock();
    this._hoveredMesh = null;
    this.ui.hideHover();

    // Save camera state
    this._savedCamPos  = this.camera.position.clone();
    this._savedCamQuat = this.camera.quaternion.clone();
    this._zoomT = 0;
    this._computerUIShown = false;

    // Pre-compute the target look quaternion (looking from viewPos toward screen)
    const viewPos   = this.store.computerViewPos;
    const screenPos = this.store.computerFacePos;
    const m = new THREE.Matrix4().lookAt(viewPos, screenPos, new THREE.Vector3(0, 1, 0));
    this._targetCamQuat = new THREE.Quaternion().setFromRotationMatrix(m);
  }

  _closeComputer() {
    document.getElementById('computer-panel').classList.add('hidden');
    document.getElementById('terminal-search').value = '';
    document.getElementById('terminal-results').innerHTML =
      '<div class="terminal-hint">Type a movie name to search the catalog...</div>';

    // Reset 3D screen to idle
    this.store?.drawComputerIdle();

    // Restore camera
    this.camera.position.copy(this._savedCamPos);
    this.camera.quaternion.copy(this._savedCamQuat);
    const euler = new THREE.Euler().setFromQuaternion(this._savedCamQuat, 'YXZ');
    this.controls.yaw   = euler.y;
    this.controls.pitch = euler.x;

    this.state = 'playing';
    this.controls.lock();
  }

  _updateComputerZoom(delta) {
    this._zoomT = Math.min(1, this._zoomT + delta * 2.8);
    // Ease in-out
    const t = this._zoomT < 0.5
      ? 2 * this._zoomT * this._zoomT
      : -1 + (4 - 2 * this._zoomT) * this._zoomT;

    this.camera.position.lerpVectors(this._savedCamPos, this.store.computerViewPos, t);
    this.camera.quaternion.slerpQuaternions(this._savedCamQuat, this._targetCamQuat, t);

    if (this._zoomT >= 1 && !this._computerUIShown) {
      this._computerUIShown = true;
      document.getElementById('computer-panel').classList.remove('hidden');
      setTimeout(() => document.getElementById('terminal-search').focus(), 60);
    }
  }

  _searchComputer(query) {
    const resultsEl = document.getElementById('terminal-results');

    if (!query || query.length < 2) {
      resultsEl.innerHTML = '<div class="terminal-hint">Type at least 2 characters...</div>';
      this.store?.updateComputerScreen('', null);
      return;
    }

    const q = query.toLowerCase();
    const results = [];
    for (const mesh of (this.movieManager?.allMeshes || [])) {
      const movie = mesh.userData.movie;
      if (!movie) continue;
      if (movie.Name.toLowerCase().includes(q)) {
        const genre    = (movie.Genres && movie.Genres[0]) || 'Other';
        const zoneIdx  = this._genreToZone.get(genre);
        const location = zoneIdx !== undefined ? ZONE_LOCATIONS[zoneIdx] : 'STORE FLOOR';
        results.push({ movie, genre, location });
        if (results.length >= 8) break;
      }
    }

    // Update 3D screen
    this.store?.updateComputerScreen(query, results);

    // Update HTML panel
    if (results.length === 0) {
      resultsEl.innerHTML = `<div class="terminal-no-result">&gt; NO MATCH FOR "${query.toUpperCase()}"</div>`;
      return;
    }

    resultsEl.innerHTML = results.map((r, i) => `
      <div class="terminal-result">
        <div class="result-title">${i + 1}. ${r.movie.Name}${r.movie.ProductionYear ? ` (${r.movie.ProductionYear})` : ''}</div>
        <div class="result-detail">GENRE: <span>${r.genre}</span></div>
        <div class="result-detail">LOCATION: <span>${r.location}</span></div>
      </div>
    `).join('');
  }

  _closeMoviePanel() {
    this.ui.closeMoviePanel();
    this.state = 'playing';
    this.ui.showHUD();
    this.controls.lock();
    this.currentMovie = null;
  }

  _playMovie() {
    if (!this.currentMovie) return;
    if (this.jellyfinClient && !this.currentMovie.Id.startsWith('d')) {
      window.open(this.jellyfinClient.getWebPlayerUrl(this.currentMovie.Id), '_blank');
    } else {
      alert(`🎬 Demo mode\n\nWould play: "${this.currentMovie.Name}" (${this.currentMovie.ProductionYear})\n\nConnect to Jellyfin to watch real movies!`);
    }
  }

  // ─── NPC DIALOG ──────────────────────────────────────────────
  _nearestNPC = null;

  _openNPCDialog(npc) {
    this.state = 'npc';
    this.controls.unlock();
    this.ui.hideHover();

    // Pick a random phrase
    const phrase = npc.phrases[Math.floor(Math.random() * npc.phrases.length)];

    // Pick a random movie recommendation
    const allMeshes = this.movieManager?.allMeshes || [];
    let recMovie = null;
    if (allMeshes.length > 0) {
      recMovie = allMeshes[Math.floor(Math.random() * allMeshes.length)].userData.movie;
    }

    // Turn NPC to face the player
    const playerPos = this.camera.position;
    const npcPos    = npc.group.position;
    const dx = playerPos.x - npcPos.x;
    const dz = playerPos.z - npcPos.z;
    npc.group.rotation.y = Math.atan2(-dx, -dz);

    // Fill dialog
    document.getElementById('npc-dialog-name').textContent = npc.name;
    document.getElementById('npc-dialog-text').textContent = `"${phrase}"`;

    const recEl    = document.getElementById('npc-dialog-rec');
    const recTitle = document.getElementById('npc-rec-title');
    if (recMovie) {
      recTitle.textContent = recMovie.Name + (recMovie.ProductionYear ? ` (${recMovie.ProductionYear})` : '');
      recEl.classList.remove('hidden');
    } else {
      recEl.classList.add('hidden');
    }

    document.getElementById('npc-dialog').classList.remove('hidden');
    this._dialogNPC = npc;
  }

  _closeNPCDialog() {
    document.getElementById('npc-dialog').classList.add('hidden');
    this._dialogNPC = null;
    this.state = 'playing';
    this.controls.lock();
  }

  // Find the closest NPC the player is facing (within ~2.5 m, ≤55° arc)
  _findNearNPC() {
    if (!this.npcManager) return null;
    const playerPos = this.camera.position;
    const forward   = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) return null;
    forward.normalize();

    let best = null, bestDist = 2.5;
    for (const npc of this.npcManager.npcs) {
      const np = npc.group.position;
      const dx = np.x - playerPos.x;
      const dz = np.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > bestDist) continue;
      const dot = forward.dot(new THREE.Vector3(dx, 0, dz).normalize());
      if (dot < 0.42) continue; // ~65° half-angle
      best = npc;
      bestDist = dist;
    }
    return best;
  }

  // ─── RAYCASTING ─────────────────────────────────────────────
  _hoveredMesh = null;

  _updateRaycast() {
    if (this.state !== 'playing' || !this.controls.isLocked) {
      if (this._hoveredMesh) {
        this.movieManager?.setHovered(null);
        this._hoveredMesh = null;
      }
      this._nearestNPC = null;
      this.ui.hideHover();
      return;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    const targets = [...(this.movieManager?.allMeshes || [])];
    if (this.store?.computerScreenMesh) targets.push(this.store.computerScreenMesh);
    const hits = this.raycaster.intersectObjects(targets);

    const hit = hits.length > 0 ? hits[0].object : null;

    // Clear old movie highlight when hover changes
    if (hit !== this._hoveredMesh) {
      if (this._hoveredMesh && !this._hoveredMesh.userData.isComputer) {
        this.movieManager?.setHovered(null);
      }
      this._hoveredMesh = hit;
    }

    if (hit) {
      // Something in crosshair — NPC check skipped
      this._nearestNPC = null;
      if (hit.userData.isComputer) {
        this.ui.showHover('Catalog Computer', '[E] Search');
      } else {
        this.movieManager?.setHovered(hit);
        this.ui.showHover(hit.userData.movie?.Name || '', '[E] Pick up');
      }
    } else {
      // Nothing in crosshair — check for nearby NPC
      this._nearestNPC = this._findNearNPC();
      if (this._nearestNPC) {
        this.ui.showHover(this._nearestNPC.name, '[E] Talk');
      } else {
        this.ui.hideHover();
      }
    }
  }

  // ─── GAME LOOP ───────────────────────────────────────────────
  _loop() {
    requestAnimationFrame(() => this._loop());
    const delta = Math.min(this.clock.getDelta(), 0.1);

    if (this.state === 'playing') {
      this.controls.update(delta, this.store?.colliders);
      this._updateRaycast();
      this.npcManager?.update(delta);
    } else if (this.state === 'computer') {
      this._updateComputerZoom(delta);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

// ─── Boot ────────────────────────────────────────────────────────
new VideoVault();
