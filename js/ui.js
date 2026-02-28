export class UI {
  constructor() {
    this.$ = (id) => document.getElementById(id);

    this.screens = {
      settings:     this.$('settings-screen'),
      loading:      this.$('loading-screen'),
      instructions: this.$('instructions-screen'),
      pause:        this.$('pause-menu'),
    };

    this.hud = {
      crosshair:   this.$('crosshair'),
      hoverLabel:  this.$('hover-label'),
      hoverTitle:  this.$('hover-title'),
      moviePanel:  this.$('movie-panel'),
    };
  }

  // ─── Screen management ──────────────────────────────────────
  showOnly(name) {
    for (const [k, el] of Object.entries(this.screens)) {
      el.classList.toggle('hidden', k !== name);
    }
  }

  showSettings()     { this.showOnly('settings'); this._hideHUD(); }
  showLoading()      { this.showOnly('loading');  this._hideHUD(); }
  showInstructions() { this.showOnly('instructions'); this._hideHUD(); }
  showPause()        { this.showOnly('pause');    this._hideHUD(); }
  hideAllScreens()   { this.showOnly('__none__'); }

  // ─── Loading progress ───────────────────────────────────────
  setProgress(pct, text) {
    document.getElementById('progress-fill').style.width = `${pct}%`;
    if (text) document.getElementById('loading-text').textContent = text;
  }

  // ─── HUD ────────────────────────────────────────────────────
  showHUD() {
    this.hud.crosshair.classList.remove('hidden');
    this.hud.moviePanel.classList.add('hidden');
  }
  _hideHUD() {
    this.hud.crosshair.classList.add('hidden');
    this.hud.hoverLabel.classList.add('hidden');
  }

  showHover(title, hint = '[E] Pick up') {
    this.hud.hoverTitle.textContent = title;
    this.hud.hoverLabel.querySelector('.hint-key').textContent = hint;
    this.hud.hoverLabel.classList.remove('hidden');
  }
  hideHover() {
    this.hud.hoverLabel.classList.add('hidden');
  }

  // ─── Movie panel ─────────────────────────────────────────────
  openMoviePanel(movie, jellyfinClient) {
    this._hideHUD();

    document.getElementById('info-title').textContent    = movie.Name;
    document.getElementById('info-year').textContent     = movie.ProductionYear || '';
    document.getElementById('info-rating').textContent   = movie.CommunityRating
      ? `★ ${movie.CommunityRating.toFixed(1)}` : '';
    document.getElementById('info-runtime').textContent  = movie.RunTimeTicks
      ? `${Math.floor(movie.RunTimeTicks / 600000000)} min` : '';
    document.getElementById('info-overview').textContent = movie.Overview || 'No description available.';

    const img = document.getElementById('poster-img');
    const ph  = document.getElementById('poster-placeholder');

    img.classList.remove('loaded');
    ph.style.display = 'flex';

    if (jellyfinClient && !movie.Id.startsWith('d')) {
      img.onload = () => {
        img.classList.add('loaded');
        ph.style.display = 'none';
      };
      img.onerror = () => { img.classList.remove('loaded'); ph.style.display = 'flex'; };
      img.src = jellyfinClient.getImageUrl(movie.Id, 300);
    } else {
      img.src = '';
    }

    this.hud.moviePanel.classList.remove('hidden');
  }

  closeMoviePanel() {
    this.hud.moviePanel.classList.add('hidden');
  }
}
