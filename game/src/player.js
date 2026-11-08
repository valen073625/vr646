/**
 * player.js — First person player controller
 * Handles: head pose (gyro → camera), movement (gesture-driven),
 * hand meshes (positioned from MediaPipe + camera orientation),
 * grab/throw logic, hit detection.
 */
import * as THREE from 'three';
import { GESTURE } from './handGestures.js';

const WALK_SPEED  = 3.5;  // m/s
const SPRINT_MULT = 1.7;
const HEAD_HEIGHT = 1.65; // camera height
const GRAVITY     = -18;
const JUMP_VEL    = 7;

// Deadzone for head rotation
const DEADZONE = 0.015;

export class Player extends EventTarget {
  constructor(scene, physics) {
    super();
    this.scene   = scene;
    this.physics = physics;

    // ── Position & velocity ──────────────────────────────────────────────
    this.position = new THREE.Vector3(0, HEAD_HEIGHT, 0);
    this._velY    = 0;
    this._onGround = true;

    // ── Camera ──────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(90, 1, 0.01, 200);
    this.camera.position.copy(this.position);
    scene.add(this.camera);

    // Gyro quaternion (from DeviceOrientation)
    this._gyroQuat  = new THREE.Quaternion();
    this._centerQuat = new THREE.Quaternion();
    this._smoothQuat = new THREE.Quaternion();
    this._hasCenter  = false;

    // ── Hand meshes ──────────────────────────────────────────────────────
    this._hands = this._makeHands(scene);

    // Grab state
    this._grabbed = { left: null, right: null }; // { body, offset }

    // ── Stats ──────────────────────────────────────────────────────────
    this.hp        = 100;
    this.score     = 0;
    this._punchCd  = { left: 0, right: 0 };

    // Movement state from gestures
    this._walkLeft  = false;
    this._walkRight = false;
  }

  // ─── Hand mesh setup ────────────────────────────────────────────────────
  _makeHands(scene) {
    const matL = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.9, metalness: 0 });
    const matR = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.9, metalness: 0 });

    const makeHand = (mat) => {
      const g = new THREE.Group();

      // Palm
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.1), mat);
      g.add(palm);

      // Fingers
      for (let f = 0; f < 4; f++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.045), mat);
        seg.position.set(-0.03 + f * 0.02, 0, -0.07);
        g.add(seg);
      }
      // Thumb
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.025, 0.035), mat);
      thumb.position.set(0.05, 0, -0.03);
      thumb.rotation.y = 0.5;
      g.add(thumb);

      g.visible = false;
      scene.add(g);
      return g;
    };

    return {
      left:  { mesh: makeHand(matL), physics: physics.addHandBody(0.07) },
      right: { mesh: makeHand(matR), physics: physics.addHandBody(0.07) },
    };
  }

  // ─── Gyro input ─────────────────────────────────────────────────────────
  setGyro(alpha, beta, gamma) {
    // Convert DeviceOrientation angles to a quaternion (portrait mode)
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(beta),
      THREE.MathUtils.degToRad(alpha),
      THREE.MathUtils.degToRad(-gamma),
      'YXZ'
    );
    this._gyroQuat.setFromEuler(euler);

    if (!this._hasCenter) {
      this._centerQuat.copy(this._gyroQuat).invert();
      this._hasCenter = true;
    }
  }

  recenter() {
    this._centerQuat.copy(this._gyroQuat).invert();
  }

  // ─── Gesture input ──────────────────────────────────────────────────────
  applyGestures(leftTracker, rightTracker, dt) {
    const lGesture = leftTracker.current;
    const rGesture = rightTracker.current;

    // WALK: either hand shows victory/index-middle
    this._walkLeft  = (lGesture === GESTURE.VICTORY || lGesture === GESTURE.POINT);
    this._walkRight = (rGesture === GESTURE.VICTORY || rGesture === GESTURE.POINT);

    // RECENTER: Shaka with either hand
    if (lGesture === GESTURE.SHAKA || rGesture === GESTURE.SHAKA) {
      this.recenter();
    }

    // GRAB / RELEASE
    this._handleGrab('left',  leftTracker,  lGesture, dt);
    this._handleGrab('right', rightTracker, rGesture, dt);

    // THROW: thumbs up releases with velocity
    if (lGesture === GESTURE.THUMBS_UP && this._grabbed.left)  this._throw('left');
    if (rGesture === GESTURE.THUMBS_UP && this._grabbed.right) this._throw('right');
  }

  _handleGrab(side, tracker, gesture, dt) {
    const handObj = this._hands[side];
    if (!handObj) return;

    if (gesture === GESTURE.FIST) {
      if (!this._grabbed[side]) {
        // Try to grab nearby object
        this._tryGrab(side, handObj);
      } else {
        // Keep holding — move grabbed body to hand position
        this._holdObject(side, handObj, dt);
      }
    } else if (gesture === GESTURE.OPEN) {
      if (this._grabbed[side]) this._release(side);
    }

    // PUNCH — fist swinging fast
    if (gesture === GESTURE.FIST && !this._grabbed[side]) {
      if (this._punchCd[side] <= 0) {
        this._tryPunch(side, handObj);
        this._punchCd[side] = 20; // frames
      }
    }
    if (this._punchCd[side] > 0) this._punchCd[side]--;
  }

  _tryGrab(side, handObj) {
    // Find closest interactable within 0.3m of hand
    const scene = this.scene;
    const handPos = handObj.mesh.position;
    let best = null, bestDist = 0.4;

    scene.traverse((obj) => {
      if (obj.userData.interactable) {
        const d = obj.position.distanceTo(handPos);
        if (d < bestDist) { best = obj; bestDist = d; }
      }
    });

    if (best) {
      const body = this.physics.getBodyForMesh(best);
      if (body) {
        body.mass = 0; // kinematic while held
        body.updateMassProperties();
        const offset = best.position.clone().sub(handPos);
        this._grabbed[side] = { mesh: best, body, offset };
        this.dispatchEvent(new CustomEvent('grab', { detail: { side } }));
      }
    }
  }

  _holdObject(side, handObj, dt) {
    const grab = this._grabbed[side];
    if (!grab) return;
    const target = handObj.mesh.position.clone().add(grab.offset);
    // Smooth move body to hand
    grab.body.position.lerp(
      new CANNON.Vec3(target.x, target.y, target.z), 0.3
    );
    grab.body.velocity.set(0,0,0);
    grab.body.angularVelocity.set(0,0,0);
    grab.mesh.position.copy(grab.body.position);
  }

  _release(side) {
    const grab = this._grabbed[side];
    if (!grab) return;
    grab.body.mass = grab.mesh.userData.grabMass || 5;
    grab.body.updateMassProperties();
    grab.body.velocity.set(0, 0, 0);
    this._grabbed[side] = null;
    this.dispatchEvent(new CustomEvent('release', { detail: { side } }));
  }

  _throw(side) {
    const grab = this._grabbed[side];
    if (!grab) return;
    grab.body.mass = grab.mesh.userData.grabMass || 5;
    grab.body.updateMassProperties();

    // Throw in direction camera is looking
    const dir = new THREE.Vector3(0, 0.3, -1).applyQuaternion(this.camera.quaternion);
    const force = dir.multiplyScalar(18);
    grab.body.velocity.set(force.x, force.y, force.z);
    grab.body.angularVelocity.set(
      (Math.random()-0.5)*6,
      (Math.random()-0.5)*6,
      (Math.random()-0.5)*6
    );
    this._grabbed[side] = null;

    // Update light if it's a glowing cube
    if (grab.mesh.userData.light) {
      grab.mesh.userData.light.position.copy(grab.mesh.position);
    }
    this.dispatchEvent(new CustomEvent('throw', { detail: { side } }));
  }

  _tryPunch(side, handObj) {
    const handPos = handObj.mesh.position;
    // Check enemies via event — game.js listens
    this.dispatchEvent(new CustomEvent('punch', {
      detail: { pos: handPos.clone(), dir: this.camera.getWorldDirection(new THREE.Vector3()), side }
    }));
  }

  // ─── Position hand meshes from landmark data ─────────────────────────────
  updateHandMeshes(leftTracker, rightTracker) {
    this._positionHand('left',  leftTracker);
    this._positionHand('right', rightTracker);
  }

  _positionHand(side, tracker) {
    const handObj = this._hands[side];
    if (!handObj) return;

    if (!tracker.landmarks) {
      handObj.mesh.visible = false;
      return;
    }

    handObj.mesh.visible = true;
    const palm = tracker.palmCenter;

    // Map normalized image coords to 3D space in front of camera
    // palm.x ∈ [0,1] → [-0.5,0.5] from camera POV
    // palm.y ∈ [0,1] → [0.4,-0.4] (y axis is inverted in image)
    const camRight = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const camUp    = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const camFwd   = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2).negate();

    const basePos = this.camera.position.clone()
      .addScaledVector(camFwd,   0.45)
      .addScaledVector(camRight, (palm.x - 0.5) * 0.6)
      .addScaledVector(camUp,   -(palm.y - 0.5) * 0.5);

    handObj.mesh.position.lerp(basePos, 0.4);
    handObj.mesh.quaternion.slerp(this.camera.quaternion, 0.3);

    // Update physics kinematic body
    handObj.physics.position.set(
      handObj.mesh.position.x,
      handObj.mesh.position.y,
      handObj.mesh.position.z
    );
  }

  // ─── Update loop ─────────────────────────────────────────────────────────
  update(dt) {
    // Smooth camera quaternion from gyro
    const relQuat = this._gyroQuat.clone().premultiply(this._centerQuat);
    this._smoothQuat.slerp(relQuat, 0.25);
    this.camera.quaternion.copy(this._smoothQuat);

    // Movement direction (walk forward relative to yaw)
    const walking = this._walkLeft || this._walkRight;
    if (walking) {
      const yaw = new THREE.Euler(0, this._smoothQuat.y, 0, 'YXZ');
      // Extract yaw from quaternion
      const yawAngle = Math.atan2(
        2*(this._smoothQuat.w*this._smoothQuat.y + this._smoothQuat.x*this._smoothQuat.z),
        1-2*(this._smoothQuat.y*this._smoothQuat.y + this._smoothQuat.z*this._smoothQuat.z)
      );
      this.position.x += Math.sin(yawAngle) * -WALK_SPEED * dt;
      this.position.z += Math.cos(yawAngle) * -WALK_SPEED * dt;

      // Clamp to arena bounds
      this.position.x = THREE.MathUtils.clamp(this.position.x, -18, 18);
      this.position.z = THREE.MathUtils.clamp(this.position.z, -18, 18);
    }

    // Basic gravity / floor collision (no full physics for player — keep it simple)
    if (!this._onGround) {
      this._velY += GRAVITY * dt;
      this.position.y += this._velY * dt;
    }
    if (this.position.y <= HEAD_HEIGHT) {
      this.position.y = HEAD_HEIGHT;
      this._velY = 0;
      this._onGround = true;
    }

    this.camera.position.copy(this.position);

    // Update glowing cube lights
    this.scene.traverse((obj) => {
      if (obj.userData.light) {
        obj.userData.light.position.copy(obj.position);
      }
    });
  }

  takeDamage(dmg) {
    this.hp = Math.max(0, this.hp - dmg);
    this.dispatchEvent(new CustomEvent('damaged', { detail: { hp: this.hp } }));
    if (this.hp <= 0) this.dispatchEvent(new Event('died'));
  }

  get handLeft()  { return this._hands.left; }
  get handRight() { return this._hands.right; }
}
