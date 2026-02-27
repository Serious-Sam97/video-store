import * as THREE from 'three';

export class FirstPersonControls {
  constructor(camera, canvas) {
    this.camera   = camera;
    this.canvas   = canvas;
    this.isLocked = false;

    // Movement state
    this.fwd = this.bwd = this.left = this.right = this.running = false;
    this.velocity = new THREE.Vector3();

    // Look angles
    this.yaw   = 0; // horizontal
    this.pitch = 0; // vertical (clamped)

    this.SPEED     = 10;
    this.RUN_SPEED = 22;
    this.DAMPING   = 12;
    this.MOUSE_SEN = 0.0042;
    this.PLAYER_H  = 1.6;

    this.zoomed   = false;
    this.FOV_NORM = 72;
    this.FOV_ZOOM = 25;

    this._bind();
  }

  _bind() {
    this._onPLChange = () => {
      this.isLocked = document.pointerLockElement === this.canvas;
      if (this.isLocked) {
        document.addEventListener('mousemove', this._onMouseMove);
      } else {
        document.removeEventListener('mousemove', this._onMouseMove);
      }
    };
    this._onMouseMove = (e) => {
      if (!this.isLocked) return;
      const sen = this.zoomed ? this.MOUSE_SEN * 0.35 : this.MOUSE_SEN;
      this.yaw   -= e.movementX * sen;
      this.pitch -= e.movementY * sen;
      this.pitch  = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.pitch));
    };
    this._onKeyDown = (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp')    this.fwd     = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown')  this.bwd     = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft')  this.left    = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.right   = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.running = true;
    };
    this._onKeyUp = (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp')    this.fwd     = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown')  this.bwd     = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft')  this.left    = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.right   = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.running = false;
    };

    this._onMouseDown = (e) => {
      if (e.button === 2 && this.isLocked) { this.zoomed = true;  this._applyFOV(); }
    };
    this._onMouseUp = (e) => {
      if (e.button === 2)                  { this.zoomed = false; this._applyFOV(); }
    };
    this._onCtxMenu = (e) => e.preventDefault();

    document.addEventListener('pointerlockchange', this._onPLChange);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup',   this._onMouseUp);
    document.addEventListener('contextmenu', this._onCtxMenu);
  }

  lock()   { this.canvas.requestPointerLock(); }
  unlock() { this.zoomed = false; this._applyFOV(); document.exitPointerLock(); }

  _applyFOV() {
    // Smooth FOV transition via CSS-less lerp in update(); just flag the target
    this._fovTarget = this.zoomed ? this.FOV_ZOOM : this.FOV_NORM;
  }

  update(delta, colliders) {
    if (!this.isLocked) return;

    // Smooth FOV zoom
    if (this.camera.fov !== undefined && this._fovTarget !== undefined) {
      this.camera.fov += (this._fovTarget - this.camera.fov) * Math.min(1, delta * 14);
      this.camera.updateProjectionMatrix();
    }

    // Apply camera rotation from yaw/pitch
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);

    // Compute forward/right on XZ plane
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right   = new THREE.Vector3( Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const accel = new THREE.Vector3();
    if (this.fwd)   accel.addScaledVector(forward,  1);
    if (this.bwd)   accel.addScaledVector(forward, -1);
    if (this.left)  accel.addScaledVector(right,   -1);
    if (this.right) accel.addScaledVector(right,    1);

    if (accel.lengthSq() > 0) accel.normalize();

    // Velocity with damping
    const speed = this.running ? this.RUN_SPEED : this.SPEED;
    this.velocity.addScaledVector(accel, speed * delta * 10);
    this.velocity.multiplyScalar(1 - this.DAMPING * delta);
    if (this.velocity.lengthSq() < 0.0001) this.velocity.set(0, 0, 0);

    const oldPos = this.camera.position.clone();

    this.camera.position.addScaledVector(this.velocity, delta);
    this.camera.position.y = this.PLAYER_H;

    // Room bounds
    this.camera.position.x = Math.max(-15.3, Math.min(15.3, this.camera.position.x));
    this.camera.position.z = Math.max(-21.3, Math.min(21.3, this.camera.position.z));

    // Shelf collisions — push out separately on X and Z
    if (colliders) {
      const R = 0.45; // player radius
      const px = this.camera.position.x;
      const pz = this.camera.position.z;

      for (const col of colliders) {
        const ox = px > col.min.x - R && px < col.max.x + R;
        const oz = pz > col.min.z - R && pz < col.max.z + R;
        if (ox && oz) {
          // Check which axis had less overlap or use old position
          const inOldX = oldPos.x > col.min.x - R && oldPos.x < col.max.x + R;
          const inOldZ = oldPos.z > col.min.z - R && oldPos.z < col.max.z + R;
          if (!inOldX) {
            this.camera.position.x = oldPos.x;
            this.velocity.x = 0;
          } else if (!inOldZ) {
            this.camera.position.z = oldPos.z;
            this.velocity.z = 0;
          } else {
            this.camera.position.copy(oldPos);
            this.velocity.set(0, 0, 0);
          }
          break;
        }
      }
    }
  }

  dispose() {
    document.removeEventListener('pointerlockchange', this._onPLChange);
    document.removeEventListener('mousemove',   this._onMouseMove);
    document.removeEventListener('keydown',     this._onKeyDown);
    document.removeEventListener('keyup',       this._onKeyUp);
    document.removeEventListener('mousedown',   this._onMouseDown);
    document.removeEventListener('mouseup',     this._onMouseUp);
    document.removeEventListener('contextmenu', this._onCtxMenu);
  }
}
