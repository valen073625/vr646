/**
 * player.js — First person player controller
 */
import * as THREE from 'three';
import CANNON from './cannon.js';
import { GESTURE } from './handGestures.js';

const WALK_SPEED  = 3.5;
const HEAD_HEIGHT = 1.65;
const GRAVITY     = -18;

// MediaPipe Hand landmark connections, used to draw the hand sketch.
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];
const HAND_TIPS = [4, 8, 12, 16, 20];

export class Player extends EventTarget {
  constructor(scene, physics) {
    super();
    this.scene   = scene;
    this.physics = physics;
    this.position = new THREE.Vector3(0, HEAD_HEIGHT, 0);
    this._velY    = 0;
    this._onGround = true;
    this.camera = new THREE.PerspectiveCamera(90, 1, 0.01, 200);
    this.camera.position.copy(this.position);
    scene.add(this.camera);
    this._gyroQuat  = new THREE.Quaternion();
    this._centerQuat = new THREE.Quaternion();
    this._smoothQuat = new THREE.Quaternion();
    this._hasCenter  = false;
    this._hands = this._makeHands(scene);
    this._grabbed = { left: null, right: null };
    this.hp        = 100;
    this.score     = 0;
    this._punchCd  = { left: 0, right: 0 };
    this._walkLeft  = false;
    this._walkRight = false;
  }

  _makeHands(scene) {
    // Hands are drawn as a glowing neon sketch (canvas texture on a
    // camera-facing sprite) redrawn every frame from the live MediaPipe
    // landmarks, instead of a static 3D hand model.
    const makeHand = (color) => {
      const size = 160;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(0.45, 0.45, 1);
      sprite.visible = false;
      scene.add(sprite);
      return { mesh: sprite, canvas, ctx, texture, color };
    };
    return {
      left:  { ...makeHand('#00eaff'), physics: this.physics.addHandBody(0.07) },
      right: { ...makeHand('#ff2bd6'), physics: this.physics.addHandBody(0.07) },
    };
  }

  _drawHandSketch(handObj, landmarks) {
    const { ctx, canvas, color } = handObj;
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    if (!landmarks || landmarks.length < 21) return;

    // Mirror X (front camera is a selfie view) so the sketch matches
    // what the player sees of their own hand.
    const pts = landmarks.map((p) => ({ x: 1 - p.x, y: p.y }));
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const padX = (maxX - minX) * 0.3 + 0.03;
    const padY = (maxY - minY) * 0.3 + 0.03;
    minX -= padX; maxX += padX; minY -= padY; maxY += padY;
    const bw = Math.max(maxX - minX, 0.01);
    const bh = Math.max(maxY - minY, 0.01);
    const scale = Math.min(size / bw, size / bh);
    const offX = (size - bw * scale) / 2;
    const offY = (size - bh * scale) / 2;
    const toXY = (p) => [offX + (p.x - minX) * scale, offY + (p.y - minY) * scale];

    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle    = color;
    ctx.lineWidth   = size * 0.045;
    ctx.shadowColor = color;
    ctx.shadowBlur  = size * 0.1;

    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const [ax, ay] = toXY(pts[a]);
      const [bx, by] = toXY(pts[b]);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();

    ctx.shadowBlur = size * 0.05;
    for (const i of HAND_TIPS) {
      const [x, y] = toXY(pts[i]);
      ctx.beginPath();
      ctx.arc(x, y, size * 0.032, 0, Math.PI * 2);
      ctx.fill();
    }
    const [wx, wy] = toXY(pts[0]);
    ctx.beginPath();
    ctx.arc(wx, wy, size * 0.05, 0, Math.PI * 2);
    ctx.fill();

    handObj.texture.needsUpdate = true;
  }

  setGyro(alpha, beta, gamma) {
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

  applyGestures(leftTracker, rightTracker, dt) {
    const lGesture = leftTracker.current;
    const rGesture = rightTracker.current;
    this._walkLeft  = (lGesture === GESTURE.VICTORY || lGesture === GESTURE.POINT);
    this._walkRight = (rGesture === GESTURE.VICTORY || rGesture === GESTURE.POINT);
    if (lGesture === GESTURE.SHAKA || rGesture === GESTURE.SHAKA) this.recenter();
    this._handleGrab('left',  leftTracker,  lGesture, dt);
    this._handleGrab('right', rightTracker, rGesture, dt);
    if (lGesture === GESTURE.THUMBS_UP && this._grabbed.left)  this._throw('left');
    if (rGesture === GESTURE.THUMBS_UP && this._grabbed.right) this._throw('right');
  }

  _handleGrab(side, tracker, gesture, dt) {
    const handObj = this._hands[side];
    if (!handObj) return;
    if (gesture === GESTURE.FIST) {
      if (!this._grabbed[side]) this._tryGrab(side, handObj);
      else this._holdObject(side, handObj, dt);
    } else if (gesture === GESTURE.OPEN) {
      if (this._grabbed[side]) this._release(side);
    }
    if (gesture === GESTURE.FIST && !this._grabbed[side]) {
      if (this._punchCd[side] <= 0) {
        this._tryPunch(side, handObj);
        this._punchCd[side] = 20;
      }
    }
    if (this._punchCd[side] > 0) this._punchCd[side]--;
  }

  _tryGrab(side, handObj) {
    const handPos = handObj.mesh.position;
    let best = null, bestDist = 0.4;
    this.scene.traverse((obj) => {
      if (obj.userData.interactable) {
        const d = obj.position.distanceTo(handPos);
        if (d < bestDist) { best = obj; bestDist = d; }
      }
    });
    if (best) {
      const body = this.physics.getBodyForMesh(best);
      if (body) {
        body.mass = 0;
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
    grab.body.position.lerp(new CANNON.Vec3(target.x, target.y, target.z), 0.3);
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
    const dir = new THREE.Vector3(0, 0.3, -1).applyQuaternion(this.camera.quaternion);
    const force = dir.multiplyScalar(18);
    grab.body.velocity.set(force.x, force.y, force.z);
    grab.body.angularVelocity.set(
      (Math.random()-0.5)*6,
      (Math.random()-0.5)*6,
      (Math.random()-0.5)*6
    );
    this._grabbed[side] = null;
    if (grab.mesh.userData.light) grab.mesh.userData.light.position.copy(grab.mesh.position);
    this.dispatchEvent(new CustomEvent('throw', { detail: { side } }));
  }

  _tryPunch(side, handObj) {
    this.dispatchEvent(new CustomEvent('punch', {
      detail: { pos: handObj.mesh.position.clone(), dir: this.camera.getWorldDirection(new THREE.Vector3()), side }
    }));
  }

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
    this._drawHandSketch(handObj, tracker.landmarks);
    const palm = tracker.palmCenter;
    const camRight = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const camUp    = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const camFwd   = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2).negate();
    const basePos = this.camera.position.clone()
      .addScaledVector(camFwd,   0.45)
      .addScaledVector(camRight, (palm.x - 0.5) * 0.6)
      .addScaledVector(camUp,   -(palm.y - 0.5) * 0.5);
    handObj.mesh.position.lerp(basePos, 0.4);
    // Sprite is always camera-facing — no quaternion needed for billboarding.
    handObj.physics.position.set(
      handObj.mesh.position.x,
      handObj.mesh.position.y,
      handObj.mesh.position.z
    );
  }

  update(dt) {
    const relQuat = this._gyroQuat.clone().premultiply(this._centerQuat);
    this._smoothQuat.slerp(relQuat, 0.25);
    this.camera.quaternion.copy(this._smoothQuat);
    const walking = this._walkLeft || this._walkRight;
    if (walking) {
      const yawAngle = Math.atan2(
        2*(this._smoothQuat.w*this._smoothQuat.y + this._smoothQuat.x*this._smoothQuat.z),
        1-2*(this._smoothQuat.y*this._smoothQuat.y + this._smoothQuat.z*this._smoothQuat.z)
      );
      this.position.x += Math.sin(yawAngle) * -WALK_SPEED * dt;
      this.position.z += Math.cos(yawAngle) * -WALK_SPEED * dt;
      this.position.x = THREE.MathUtils.clamp(this.position.x, -18, 18);
      this.position.z = THREE.MathUtils.clamp(this.position.z, -18, 18);
    }
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
    this.scene.traverse((obj) => {
      if (obj.userData.light) obj.userData.light.position.copy(obj.position);
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
