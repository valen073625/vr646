/**
 * enemy.js — Ragdoll dummy enemy
 * Simple enemy that walks toward player and can be knocked around.
 */
import * as THREE from 'three';

const ENEMY_COLORS = [0xcc3300, 0xaa0033, 0x880055, 0xdd2200];

export class Enemy {
  constructor(scene, physics, position, id) {
    this.id      = id;
    this.hp      = 100;
    this.dead    = false;
    this.stunned = 0; // frames
    this.scene   = scene;
    this.physics = physics;

    this._group = new THREE.Group();
    this._group.position.copy(position);
    scene.add(this._group);

    const col = ENEMY_COLORS[id % ENEMY_COLORS.length];
    const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111111 });

    // Body
    this._torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), mat);
    this._torso.position.y = 0.9;
    this._torso.castShadow = true;
    this._group.add(this._torso);

    // Head
    this._head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), mat);
    this._head.position.y = 1.32;
    this._head.castShadow = true;
    this._group.add(this._head);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.04);
    const eye1 = new THREE.Mesh(eyeGeo, dark);
    const eye2 = new THREE.Mesh(eyeGeo, dark);
    eye1.position.set(-0.07, 1.34, 0.145);
    eye2.position.set( 0.07, 1.34, 0.145);
    this._group.add(eye1, eye2);

    // Arms
    this._armL = this._makeArm(-1, mat);
    this._armR = this._makeArm( 1, mat);

    // Legs
    this._legL = this._makeLeg(-1, mat);
    this._legR = this._makeLeg( 1, mat);

    // HP bar (always faces camera via billboarding)
    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide })
    );
    hpBg.position.y = 1.72;
    this._group.add(hpBg);

    this._hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xff2200, side: THREE.DoubleSide })
    );
    this._hpFill.position.y = 1.72;
    this._hpFill.position.z = 0.001;
    this._group.add(this._hpFill);

    // Physics body for the torso
    this.body = physics.addDynamicBox(this._torso, 60, 0.4, 0.5, 0.25);
    this.body.position.set(position.x, position.y + 0.9, position.z);
    this.body.linearDamping  = 0.9;
    this.body.angularDamping = 0.95;

    // Animation state
    this._walkPhase = Math.random() * Math.PI * 2;
    this._wobble = 0;
  }

  _makeArm(side, mat) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), mat);
    arm.position.set(side * 0.28, 0.72, 0);
    arm.castShadow = true;
    this._group.add(arm);
    return arm;
  }

  _makeLeg(side, mat) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.14), mat);
    leg.position.set(side * 0.11, 0.42, 0);
    leg.castShadow = true;
    this._group.add(leg);
    return leg;
  }

  takeDamage(dmg, impulse) {
    if (this.dead) return;
    this.hp -= dmg;
    this.stunned = 20;

    // Physical knockback
    if (impulse && this.body) {
      this.body.wakeUp();
      this.body.applyImpulse(
        new CANNON.Vec3(impulse.x * 25, impulse.y * 25 + 5, impulse.z * 25),
        new CANNON.Vec3(0, 0.3, 0)
      );
    }

    if (this.hp <= 0) this._die();
  }

  _die() {
    this.dead = true;
    // Ragdoll fall effect
    if (this.body) {
      this.body.applyImpulse(
        new CANNON.Vec3((Math.random()-0.5)*20, 8, (Math.random()-0.5)*20),
        new CANNON.Vec3(0,0,0)
      );
    }
    // Fade out after 3s
    setTimeout(() => {
      this.scene.remove(this._group);
      this.physics.removePair(this._torso);
    }, 3000);
  }

  update(dt, playerPos, camDir) {
    if (this.dead) return;

    this._walkPhase += dt * 3.5;
    if (this.stunned > 0) { this.stunned--; }

    // Sync group to physics body (torso drives the group)
    this._group.position.copy(this.body.position);
    this._group.position.y -= 0.9; // offset: group origin is at feet

    // Face player
    const dx = playerPos.x - this._group.position.x;
    const dz = playerPos.z - this._group.position.z;
    const angle = Math.atan2(dx, dz);
    this._group.rotation.y = angle;

    const dist = Math.sqrt(dx*dx + dz*dz);

    if (!this.stunned && dist > 0.8) {
      // Walk toward player
      const speed = 2.5;
      this.body.velocity.x += Math.sin(angle) * speed * dt * 15;
      this.body.velocity.z += Math.cos(angle) * speed * dt * 15;
      // Clamp horizontal speed
      const hv = Math.sqrt(this.body.velocity.x**2 + this.body.velocity.z**2);
      if (hv > speed) {
        this.body.velocity.x *= speed / hv;
        this.body.velocity.z *= speed / hv;
      }

      // Walk animation
      this._legL.rotation.x = Math.sin(this._walkPhase) * 0.5;
      this._legR.rotation.x = Math.sin(this._walkPhase + Math.PI) * 0.5;
      this._armL.rotation.x = Math.sin(this._walkPhase + Math.PI) * 0.4;
      this._armR.rotation.x = Math.sin(this._walkPhase) * 0.4;
    } else {
      // Idle bob
      this._head.position.y = 1.32 + Math.sin(this._walkPhase * 0.8) * 0.03;
    }

    // HP bar always faces camera
    this._hpFill.scale.x = Math.max(0, this.hp / 100);
    this._hpFill.position.x = -(1 - this._hpFill.scale.x) * 0.2;
    this._hpFill.lookAt(camDir);
    this._torso.lookAt?.(camDir);

    // Attack player when close
    if (dist < 1.0 && !this.stunned) {
      return 8 * dt; // damage per second
    }
    return 0;
  }

  get position() { return this._group.position; }
}

export class EnemyManager {
  constructor(scene, physics) {
    this.scene   = scene;
    this.physics = physics;
    this.enemies = [];
    this._nextId = 0;
    this._wave   = 1;
  }

  spawnWave(count) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r     = 7 + Math.random() * 4;
      const pos   = new THREE.Vector3(Math.sin(angle)*r, 0.9, Math.cos(angle)*r - 5);
      this.enemies.push(new Enemy(this.scene, this.physics, pos, this._nextId++));
    }
  }

  update(dt, playerPos, camPos) {
    let totalDmg = 0;
    this.enemies = this.enemies.filter(e => {
      if (e.dead) {
        const p = e._group.parent;
        if (!p) return false; // already removed
        return true; // keep until timeout removes them
      }
      totalDmg += e.update(dt, playerPos, camPos);
      return true;
    });
    return totalDmg;
  }

  get aliveCount() {
    return this.enemies.filter(e => !e.dead).length;
  }

  get wave() { return this._wave; }

  nextWave() {
    this._wave++;
    this.spawnWave(3 + this._wave * 2);
  }
}
