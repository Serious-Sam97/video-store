import * as THREE from 'three';
import { JellyfinClient, DEMO_MOVIES } from './jellyfin.js';
import { VideoStore } from './store.js';
import { FirstPersonControls } from './controls.js';
import { MovieManager } from './movies.js';
import { NPCManager } from './npcs.js';
import { UI } from './ui.js';

// ─────────────────────────────────────────────────────────────────
class VideoVault {
  constructor() {
    this.state         = 'settings'; // settings | playing | movie | paused
    this.jellyfinClient = null;
    this.currentMovie  = null;
    this.store         = null;
    this.movieManager  = null;
    this.npcManager    = null;

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

    // Keyboard: E = interact, ESC = pause
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.state === 'playing' && this.controls.isLocked) {
        this._interact();
      }
      if (e.code === 'Escape' && this.state === 'playing') {
        // browser handles pointer-lock escape, which triggers the pointerlockchange listener
      }
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
    if (!this._hoveredMesh) return;
    const movie = this._hoveredMesh.userData.movie;
    if (!movie) return;

    this.currentMovie = movie;
    this.state = 'movie';
    this.controls.unlock();
    this.ui.hideHover();
    this.ui.openMoviePanel(movie, this.jellyfinClient);
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

  // ─── RAYCASTING ─────────────────────────────────────────────
  _hoveredMesh = null;

  _updateRaycast() {
    if (this.state !== 'playing' || !this.controls.isLocked) {
      if (this._hoveredMesh) {
        this.movieManager?.setHovered(null);
        this._hoveredMesh = null;
        this.ui.hideHover();
      }
      return;
    }

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.raycaster.intersectObjects(this.movieManager?.allMeshes || []);

    const hit = hits.length > 0 ? hits[0].object : null;

    if (hit !== this._hoveredMesh) {
      this._hoveredMesh = hit;
      this.movieManager?.setHovered(hit);
      if (hit) {
        this.ui.showHover(hit.userData.movie?.Name || '');
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
    }

    this.renderer.render(this.scene, this.camera);
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

// ─── Boot ────────────────────────────────────────────────────────
new VideoVault();
