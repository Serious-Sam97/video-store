import * as THREE from 'three';

// ── Proportions at scale 1.0 ≈ 1.72 m ──────────────────────────
const SHIN_L  = 0.36, THIGH_L = 0.40, HIP_H  = 0.14;
const TORSO_H = 0.48, NECK_H  = 0.10, HEAD_R = 0.130;
const UARM_L  = 0.30, FARM_L  = 0.27, ARM_R  = 0.044;
const LEG_R   = 0.058;

// Derived Y levels (feet at y = 0)
const HIP_Y   = SHIN_L + THIGH_L;               // 0.76
const WAIST_Y = HIP_Y  + HIP_H;                 // 0.90
const SHLDR_Y = WAIST_Y + TORSO_H;              // 1.38
const HEAD_CY = SHLDR_Y + NECK_H + HEAD_R;      // 1.61

const NPC_RADIUS = 0.28;

// ── NPC names (tied to style index) ─────────────────────────────
const NPC_NAMES = ['Marcus', 'Dex', 'Layla', 'Ozzy', 'Nadia', 'Ray'];

// ── Per-character dialogue pools ─────────────────────────────────
const NPC_PHRASES = [
  // Marcus — casual, indecisive
  [
    "Man, I've been here two hours and still can't pick one.",
    "I always end up rewatching the same three movies. No shame.",
    "My whole weekend is basically planned around this place.",
    "Do you think they'd notice if I just lived here?",
    "I judge a film by its cover. It usually works out.",
  ],
  // Dex — action obsessed
  [
    "If it doesn't have a car chase in the first ten minutes, I'm out.",
    "Nothing beats an 80s action flick on a Friday night.",
    "CGI explosions never hit the same as practical effects. Trust me.",
    "I rank every movie by its villain. That's the real metric.",
    "The louder the soundtrack, the better the movie. Proven fact.",
  ],
  // Layla — artsy, indie
  [
    "I'm looking for anything with interesting cinematography.",
    "People sleep on foreign films. They're missing out.",
    "The mood lighting in this store really sets the vibe, doesn't it?",
    "I always read the back cover twice before committing.",
    "If the color grading is flat, I'm already disappointed.",
  ],
  // Ozzy — critic, glasses
  [
    "The director's cut is always the definitive version. Always.",
    "Most sequels dilute the original. There, I said it.",
    "I rate movies in a private spreadsheet. Yes, really.",
    "Honestly, the trailer gave too much away on that one.",
    "Narrative subtext is what separates cinema from content.",
  ],
  // Nadia — horror fan
  [
    "The scarier, the better. That's just science.",
    "I sleep like a baby after a good horror marathon.",
    "Jump scares are cheap. Atmosphere is everything.",
    "People act weird when I say I watch horror to relax.",
    "If there's no tension in the first act, the third won't save it.",
  ],
  // Ray — classic movies, nostalgic
  [
    "They don't make them like they used to, my friend.",
    "Everything modern is just a remake of something from the '60s.",
    "A good film should make you feel something real.",
    "I've been coming here since this place opened. Good memories.",
    "You can't rush a great story. That's what people forget.",
  ],
];

// ── Appearance styles ───────────────────────────────────────────
const STYLES = [
  { skin: 0xf5c5a0, shirt: 0x2471a3, pants: 0x1a3050, hair: 0x2a1408, hairStyle: 'short'  },
  { skin: 0xc87850, shirt: 0xb03a2e, pants: 0x1a1a2e, hair: 0x080400, hairStyle: 'cap',   cap: 0x152840 },
  { skin: 0xe8c090, shirt: 0x1e8449, pants: 0x2e4050, hair: 0x8a6040, hairStyle: 'long'   },
  { skin: 0xa07050, shirt: 0x6c3483, pants: 0x1a3050, hair: 0x080400, hairStyle: 'short',  glasses: true },
  { skin: 0xf2d4b0, shirt: 0xba4a00, pants: 0x1a1a2e, hair: 0xb08040, hairStyle: 'bun'    },
  { skin: 0xd4906a, shirt: 0x117a65, pants: 0x1e2f3a, hair: 0x1a0800, hairStyle: 'medium' },
];

// ── Waypoints ───────────────────────────────────────────────────
const WPS = [
  { x: -12.0, z:  14,   t: 's', y:  Math.PI / 2 },
  { x: -12.0, z:   8,   t: 's', y:  Math.PI / 2 },
  { x: -12.0, z:   2,   t: 's', y:  Math.PI / 2 },
  { x: -12.0, z:  -4,   t: 's', y:  Math.PI / 2 },
  { x: -12.0, z: -10,   t: 's', y:  Math.PI / 2 },
  { x: -12.0, z: -16,   t: 's', y:  Math.PI / 2 },
  { x:  12.0, z:  14,   t: 's', y: -Math.PI / 2 },
  { x:  12.0, z:   8,   t: 's', y: -Math.PI / 2 },
  { x:  12.0, z:   2,   t: 's', y: -Math.PI / 2 },
  { x:  12.0, z:  -4,   t: 's', y: -Math.PI / 2 },
  { x:  12.0, z: -10,   t: 's', y: -Math.PI / 2 },
  { x:  12.0, z: -16,   t: 's', y: -Math.PI / 2 },
  { x: -10,   z: -19.5, t: 's', y:  0 },
  { x:  -5,   z: -19.5, t: 's', y:  0 },
  { x:   0,   z: -19.5, t: 's', y:  0 },
  { x:   5,   z: -19.5, t: 's', y:  0 },
  { x:  10,   z: -19.5, t: 's', y:  0 },
  { x:   0,   z:  14,   t: 'a' },
  { x:   0,   z:   6,   t: 'a' },
  { x:   0,   z:  -2,   t: 'a' },
  { x:   0,   z: -10,   t: 'a' },
  { x:  -8,   z:  14,   t: 'a' },
  { x:  -8,   z:   5,   t: 'a' },
  { x:  -8,   z:  -6,   t: 'a' },
  { x:  -8,   z: -14,   t: 'a' },
  { x:   8,   z:  14,   t: 'a' },
  { x:   8,   z:   5,   t: 'a' },
  { x:   8,   z:  -6,   t: 'a' },
  { x:   8,   z: -14,   t: 'a' },
  { x:  -3,   z:  16,   t: 'a' },
  { x:   3,   z:  16,   t: 'a' },
];

// ── NPC ─────────────────────────────────────────────────────────
class NPC {
  constructor(scene, styleIdx, startWPIdx) {
    const style  = STYLES[styleIdx % STYLES.length];
    this.name    = NPC_NAMES[styleIdx % NPC_NAMES.length];
    this.phrases = NPC_PHRASES[styleIdx % NPC_PHRASES.length];
    this.group   = new THREE.Group();
    this._build(style);

    // Realistic height variation: 0.93–1.08×
    this.group.scale.setScalar(0.93 + Math.random() * 0.15);

    const wp = WPS[startWPIdx % WPS.length];
    this.group.position.set(wp.x, 0, wp.z);

    this.yaw         = Math.random() * Math.PI * 2;
    this.state       = 'walking';
    this.browseState = 'scan';
    this.browseTimer  = 0;
    this.subTimer     = 0;
    this.targetWP     = this._nextWP();
    this.speed        = 1.2 + Math.random() * 0.7;
    this.phase        = Math.random() * Math.PI * 2;
    this._stuckTimer  = 0;
    this._stuckCheck  = null;

    scene.add(this.group);
  }

  _mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }

  _build(s) {
    // ── Two-segment legs ────────────────────────────────────────
    const thighGeo = new THREE.CylinderGeometry(LEG_R,       LEG_R * 0.88, THIGH_L, 7);
    const shinGeo  = new THREE.CylinderGeometry(LEG_R * 0.8, LEG_R * 0.70, SHIN_L,  7);
    const legMat   = this._mat(s.pants);

    this.lHip = new THREE.Group(); this.lHip.position.set(-0.088, HIP_Y, 0);
    this.rHip = new THREE.Group(); this.rHip.position.set( 0.088, HIP_Y, 0);

    for (const [hip, xSign] of [[this.lHip, -1], [this.rHip, 1]]) {
      const thigh = new THREE.Mesh(thighGeo, legMat);
      thigh.position.y = -THIGH_L / 2;

      const kneePiv = new THREE.Group();
      kneePiv.position.y = -THIGH_L;

      // Knee bump
      const kneeBump = new THREE.Mesh(new THREE.SphereGeometry(LEG_R * 0.95, 7, 5), legMat);

      const shin = new THREE.Mesh(shinGeo, legMat);
      shin.position.y = -SHIN_L / 2;

      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.10, 0.065, 0.19),
        this._mat(0x151008)
      );
      foot.position.set(xSign * 0.012, -SHIN_L + 0.038, 0.042);

      kneePiv.add(kneeBump, shin, foot);
      hip.add(thigh, kneePiv);

      if (xSign < 0) this.lKnee = kneePiv;
      else           this.rKnee = kneePiv;
    }

    // ── Pelvis block ────────────────────────────────────────────
    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.152, 0.162, HIP_H, 8),
      this._mat(s.pants)
    );
    pelvis.position.y = HIP_Y + HIP_H / 2;

    // ── Torso ───────────────────────────────────────────────────
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.128, 0.148, TORSO_H, 8),
      this._mat(s.shirt)
    );
    torso.position.y = WAIST_Y + TORSO_H / 2;

    // ── Two-segment arms ────────────────────────────────────────
    const uArmGeo = new THREE.CylinderGeometry(ARM_R,        ARM_R * 0.88, UARM_L, 6);
    const fArmGeo = new THREE.CylinderGeometry(ARM_R * 0.85, ARM_R * 0.72, FARM_L, 6);

    this.lShoulder = new THREE.Group(); this.lShoulder.position.set(-(0.128 + 0.038), SHLDR_Y - 0.04, 0);
    this.rShoulder = new THREE.Group(); this.rShoulder.position.set(  0.128 + 0.038,  SHLDR_Y - 0.04, 0);

    for (const [shoulder, side] of [[this.lShoulder, -1], [this.rShoulder, 1]]) {
      const uArm = new THREE.Mesh(uArmGeo, this._mat(s.shirt));
      uArm.position.y = -UARM_L / 2;

      const elbowPiv = new THREE.Group();
      elbowPiv.position.y = -UARM_L;

      const elbowBump = new THREE.Mesh(new THREE.SphereGeometry(ARM_R * 1.08, 6, 5), this._mat(s.skin));

      // Forearm is skin-colored (rolled-up sleeve look)
      const fArm = new THREE.Mesh(fArmGeo, this._mat(s.skin));
      fArm.position.y = -FARM_L / 2;

      const hand = new THREE.Mesh(new THREE.SphereGeometry(ARM_R * 1.22, 7, 6), this._mat(s.skin));
      hand.position.y = -FARM_L;

      elbowPiv.add(elbowBump, fArm, hand);
      shoulder.add(uArm, elbowPiv);

      if (side < 0) this.lElbow = elbowPiv;
      else          this.rElbow = elbowPiv;
    }

    // ── Neck ────────────────────────────────────────────────────
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.065, NECK_H, 7),
      this._mat(s.skin)
    );
    neck.position.y = SHLDR_Y + NECK_H / 2;

    // ── Head pivot ──────────────────────────────────────────────
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = HEAD_CY;

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 12, 9), this._mat(s.skin));

    // Eyes face the NPC's forward direction (local −Z)
    const eyeGeo = new THREE.SphereGeometry(0.016, 5, 4);
    const eyeMat = this._mat(0x080606);
    const lEye   = new THREE.Mesh(eyeGeo, eyeMat);
    const rEye   = new THREE.Mesh(eyeGeo, eyeMat);
    lEye.position.set(-0.046, 0.02, -(HEAD_R * 0.88));
    rEye.position.set( 0.046, 0.02, -(HEAD_R * 0.88));

    this.headPivot.add(headMesh, lEye, rEye);
    this._buildHair(s);
    if (s.glasses) this._buildGlasses();

    this.group.add(
      this.lHip, this.rHip, pelvis, torso,
      this.lShoulder, this.rShoulder,
      neck, this.headPivot
    );
  }

  _buildHair(s) {
    const mat = this._mat(s.hair);
    const hp  = this.headPivot;
    const HS  = s.hairStyle;

    if (HS === 'short') {
      hp.add(Object.assign(
        new THREE.Mesh(new THREE.SphereGeometry(HEAD_R + 0.014, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.53), mat)
      ));
    } else if (HS === 'medium') {
      hp.add(Object.assign(
        new THREE.Mesh(new THREE.SphereGeometry(HEAD_R + 0.022, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.56), mat)
      ));
    } else if (HS === 'long') {
      hp.add(new THREE.Mesh(
        new THREE.SphereGeometry(HEAD_R + 0.014, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), mat
      ));
      const flow = new THREE.Mesh(new THREE.ConeGeometry(HEAD_R * 0.50, HEAD_R * 1.5, 7), mat);
      flow.position.set(0, -HEAD_R * 0.7, HEAD_R * 0.38);
      flow.rotation.x = -0.32;
      hp.add(flow);
    } else if (HS === 'bun') {
      hp.add(new THREE.Mesh(
        new THREE.SphereGeometry(HEAD_R + 0.014, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), mat
      ));
      const bun = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 0.36, 7, 6), mat);
      bun.position.set(0, HEAD_R * 0.78, HEAD_R * 0.52);
      hp.add(bun);
    } else if (HS === 'cap') {
      const capMat = this._mat(s.cap || 0x152840);
      // Dome
      hp.add(new THREE.Mesh(
        new THREE.SphereGeometry(HEAD_R + 0.026, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.47), capMat
      ));
      // Brim sticking forward (−Z = NPC face direction)
      const brim = new THREE.Mesh(new THREE.BoxGeometry(HEAD_R * 2.1, 0.022, HEAD_R * 1.1), capMat);
      brim.position.set(0, HEAD_R * 0.06, -(HEAD_R * 1.15));
      hp.add(brim);
    }
  }

  _buildGlasses() {
    const mat = this._mat(0x1a1008);
    const hp  = this.headPivot;
    const GZ  = -(HEAD_R * 0.89);
    const GY  = 0.018;
    // Two lens rings
    for (const gx of [-0.044, 0.044]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 6, 14), mat);
      ring.position.set(gx, GY, GZ);
      hp.add(ring);
    }
    // Nose bridge
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.007, 0.007), mat);
    bridge.position.set(0, GY, GZ);
    hp.add(bridge);
  }

  // ── Waypoint helpers ────────────────────────────────────────
  _nextWP()  { return Math.floor(Math.random() * WPS.length); }
  _aisleWP() {
    const ai = WPS.reduce((a, w, i) => (w.t === 'a' ? [...a, i] : a), []);
    return ai[Math.floor(Math.random() * ai.length)];
  }

  // ── Main update ─────────────────────────────────────────────
  update(delta, colliders, others) {
    this.phase += delta;
    if (this.state === 'walking') {
      this._walk(delta, colliders, others);
      if (colliders) this._resolveCollisions(colliders);
    } else {
      this._browse(delta);
    }
  }

  // ── Walking ─────────────────────────────────────────────────
  _walk(delta, colliders, others) {
    const pos  = this.group.position;
    const wp   = WPS[this.targetWP];
    const dx   = wp.x - pos.x;
    const dz   = wp.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.22) {
      pos.x = wp.x; pos.z = wp.z;
      if (wp.t === 's') {
        this.state       = 'browsing';
        this.browseState = 'scan';
        this.browseTimer  = 5 + Math.random() * 6;
        this.subTimer     = 0;
        this.yaw          = wp.y;
        this._restLimbs();
      } else {
        this.targetWP = this._nextWP();
      }
      this._stuckTimer = 0;
      return;
    }

    // Desired direction + NPC separation
    let vx = dx / dist, vz = dz / dist;
    if (others) {
      const MIN = NPC_RADIUS * 2 + 0.1;
      for (const o of others) {
        if (o === this) continue;
        const sx = pos.x - o.group.position.x;
        const sz = pos.z - o.group.position.z;
        const d2 = sx * sx + sz * sz;
        if (d2 < MIN * MIN && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          vx += (sx / d) * ((MIN - d) / MIN);
          vz += (sz / d) * ((MIN - d) / MIN);
        }
      }
    }
    const vl = Math.sqrt(vx * vx + vz * vz) || 1;
    vx /= vl; vz /= vl;
    pos.x += vx * this.speed * delta;
    pos.z += vz * this.speed * delta;

    // Stuck detection every 2 s
    this._stuckTimer += delta;
    if (this._stuckTimer > 2.0) {
      const moved = this._stuckCheck ? pos.distanceTo(this._stuckCheck) : 999;
      if (moved < 0.4) {
        pos.x += (Math.random() - 0.5) * 0.8;
        pos.z += (Math.random() - 0.5) * 0.8;
        this.targetWP = this._aisleWP();
      }
      this._stuckCheck = pos.clone();
      this._stuckTimer = 0;
    } else if (!this._stuckCheck) {
      this._stuckCheck = pos.clone();
    }

    // Smooth yaw toward movement direction
    const wy = Math.atan2(-vx, -vz);
    let diff = wy - this.yaw;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, delta * 7);
    this.group.rotation.y = this.yaw;
    this.group.rotation.z = Math.sin(this.phase * 3.8) * 0.024; // hip sway

    // Walk cycle with knee bend and elbow swing
    const t = this.phase * 3.8;
    this.lHip.rotation.x      =  Math.sin(t) * 0.44;
    this.rHip.rotation.x      = -Math.sin(t) * 0.44;
    this.lKnee.rotation.x     = -Math.max(0,  Math.sin(t)) * 0.65;
    this.rKnee.rotation.x     = -Math.max(0, -Math.sin(t)) * 0.65;
    this.lShoulder.rotation.x = -Math.sin(t) * 0.34;
    this.rShoulder.rotation.x =  Math.sin(t) * 0.34;
    this.lElbow.rotation.x    =  0.15 + Math.max(0, -Math.sin(t)) * 0.20;
    this.rElbow.rotation.x    =  0.15 + Math.max(0,  Math.sin(t)) * 0.20;
    this.group.position.y      = Math.abs(Math.sin(t)) * 0.026;
    this.headPivot.rotation.x  = 0;
    this.headPivot.rotation.y  = 0;
    this.headPivot.position.y  = HEAD_CY;
  }

  // ── Collision push-out ──────────────────────────────────────
  _resolveCollisions(colliders) {
    const R = NPC_RADIUS, pos = this.group.position;
    for (const col of colliders) {
      if (!(pos.x > col.min.x - R && pos.x < col.max.x + R &&
            pos.z > col.min.z - R && pos.z < col.max.z + R)) continue;
      const oXL = pos.x - (col.min.x - R), oXR = (col.max.x + R) - pos.x;
      const oZF = pos.z - (col.min.z - R), oZB = (col.max.z + R) - pos.z;
      if (Math.min(oXL, oXR) < Math.min(oZF, oZB))
        pos.x = oXL < oXR ? col.min.x - R : col.max.x + R;
      else
        pos.z = oZF < oZB ? col.min.z - R : col.max.z + R;
    }
  }

  // ── Browsing ────────────────────────────────────────────────
  _browse(delta) {
    this.browseTimer -= delta;
    this.subTimer    -= delta;

    if (this.browseTimer <= 0) {
      this.state    = 'walking';
      this.targetWP = this._nextWP();
      this._restLimbs();
      return;
    }

    this.group.rotation.y = this.yaw;
    this.group.rotation.z = 0;
    this.group.position.y = 0;

    if (this.subTimer <= 0) {
      if      (this.browseState === 'scan')    { this.browseState = 'reach';   this.subTimer = 1.5 + Math.random(); }
      else if (this.browseState === 'reach')   { this.browseState = 'examine'; this.subTimer = 1.5 + Math.random(); }
      else                                      { this.browseState = 'scan';   this.subTimer = 2.0 + Math.random() * 1.5; }
    }

    const t = this.phase;

    // Breathing: head rises and falls slightly, shoulders lift
    const breath = Math.sin(t * 0.38);
    this.headPivot.position.y = HEAD_CY + breath * 0.010;

    if (this.browseState === 'scan') {
      // Head slowly sweeps along the shelf row
      this.headPivot.rotation.y = Math.sin(t * 0.42) * 0.36;
      this.headPivot.rotation.x = -0.08 + breath * 0.02;
      this.rShoulder.rotation.x  = 0.14 + Math.sin(t * 0.5) * 0.05;
      this.lShoulder.rotation.x  = 0.06;
      this.rElbow.rotation.x     = 0.22;
      this.lElbow.rotation.x     = 0.15;
    } else if (this.browseState === 'reach') {
      // Fixes on a tape and reaches out to grab it
      const pick = Math.sin(t * 0.28) * 0.30;
      this.headPivot.rotation.y = pick * 0.55;
      this.headPivot.rotation.x = -0.24 + breath * 0.02;
      this.rShoulder.rotation.x  = 0.82 + pick * 0.28 + Math.sin(t * 1.1) * 0.03;
      this.rElbow.rotation.x     = 0.32 - pick * 0.08;
      this.lShoulder.rotation.x  = 0.12;
      this.lElbow.rotation.x     = 0.20;
    } else {
      // Examine: both hands up holding the tape case, head tilted down to read
      this.headPivot.rotation.y  = Math.sin(t * 0.18) * 0.06;
      this.headPivot.rotation.x  = -0.42 + breath * 0.015;
      this.rShoulder.rotation.x   = 0.62;
      this.lShoulder.rotation.x   = 0.58;
      this.rElbow.rotation.x      = 0.52;
      this.lElbow.rotation.x      = 0.56;
    }

    this.lHip.rotation.x = this.rHip.rotation.x = 0;
    this.lKnee.rotation.x = this.rKnee.rotation.x = 0;
  }

  _restLimbs() {
    this.lHip.rotation.x = this.rHip.rotation.x = 0;
    this.lKnee.rotation.x = this.rKnee.rotation.x = 0;
    this.lShoulder.rotation.x = this.rShoulder.rotation.x = 0;
    this.lElbow.rotation.x = this.rElbow.rotation.x = 0.15;
    this.headPivot.rotation.set(0, 0, 0);
    this.headPivot.position.y = HEAD_CY;
    this.group.position.y = 0;
    this.group.rotation.z = 0;
  }
}

// ── NPCManager ──────────────────────────────────────────────────
export class NPCManager {
  constructor(scene, colliders) {
    this.colliders = colliders || [];
    this.npcs = [];
    const starts = [0, 7, 13, 4, 10, 17];
    for (let i = 0; i < 6; i++) {
      this.npcs.push(new NPC(scene, i, starts[i]));
    }
  }

  update(delta) {
    for (const npc of this.npcs) npc.update(delta, this.colliders, this.npcs);
  }
}
