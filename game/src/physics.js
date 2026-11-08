/**
 * physics.js — cannon-es world wrapper
 * Bridges Three.js meshes ↔ Cannon-ES rigid bodies.
 */

export class PhysicsWorld {
  constructor() {
    // cannon-es is loaded as a global via script tag
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -18, 0),
    });

    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.restitution = 0.3;
    this.world.defaultContactMaterial.friction    = 0.5;

    this._pairs = []; // { mesh, body }
    this._fixedStep = 1/60;
    this._maxSubSteps = 3;

    // Materials
    this.groundMat = new CANNON.Material('ground');
    this.objectMat = new CANNON.Material('object');
    this.handMat   = new CANNON.Material('hand');

    const groundObj = new CANNON.ContactMaterial(this.groundMat, this.objectMat, {
      restitution: 0.2, friction: 0.6,
    });
    const handObj = new CANNON.ContactMaterial(this.handMat, this.objectMat, {
      restitution: 0.1, friction: 0.8,
    });
    this.world.addContactMaterial(groundObj);
    this.world.addContactMaterial(handObj);
  }

  /** Create a static floor */
  addFloor(y = 0) {
    const shape = new CANNON.Plane();
    const body  = new CANNON.Body({ mass: 0, material: this.groundMat });
    body.addShape(shape);
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    body.position.set(0, y, 0);
    this.world.addBody(body);
    return body;
  }

  /** Create a static box (walls, platforms) */
  addStaticBox(w, h, d, x, y, z) {
    const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
    const body  = new CANNON.Body({ mass: 0, material: this.groundMat });
    body.addShape(shape);
    body.position.set(x, y, z);
    this.world.addBody(body);
    return body;
  }

  /** Create a dynamic rigid body for an interactable object */
  addDynamicBox(mesh, mass, w, h, d) {
    const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
    const body  = new CANNON.Body({ mass, material: this.objectMat, linearDamping: 0.4, angularDamping: 0.6 });
    body.addShape(shape);
    body.position.copy(mesh.position);
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.5;
    this.world.addBody(body);
    this._pairs.push({ mesh, body });
    return body;
  }

  addDynamicSphere(mesh, mass, r) {
    const shape = new CANNON.Sphere(r);
    const body  = new CANNON.Body({ mass, material: this.objectMat, linearDamping: 0.3, angularDamping: 0.5 });
    body.addShape(shape);
    body.position.copy(mesh.position);
    body.allowSleep = true;
    this.world.addBody(body);
    this._pairs.push({ mesh, body });
    return body;
  }

  /** Kinematic body for a hand (no physics forces affect it, but it pushes objects) */
  addHandBody(r = 0.06) {
    const shape = new CANNON.Sphere(r);
    const body  = new CANNON.Body({ mass: 0, material: this.handMat, type: CANNON.Body.KINEMATIC });
    body.addShape(shape);
    body.collisionFilterGroup = 2;
    body.collisionFilterMask  = 1;
    this.world.addBody(body);
    return body;
  }

  step(dt) {
    this.world.step(this._fixedStep, dt, this._maxSubSteps);
    for (const { mesh, body } of this._pairs) {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }

  removePair(mesh) {
    const idx = this._pairs.findIndex(p => p.mesh === mesh);
    if (idx !== -1) {
      this.world.removeBody(this._pairs[idx].body);
      this._pairs.splice(idx, 1);
    }
  }

  getBodyForMesh(mesh) {
    return this._pairs.find(p => p.mesh === mesh)?.body;
  }
}
