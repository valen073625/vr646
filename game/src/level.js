/**
 * level.js — Builds the BONELAB-style arena
 * Neon-lit industrial room with platforms, interactable props, and atmosphere.
 */
import * as THREE from 'three';

export function buildLevel(scene, physics) {
  const objects = []; // interactable dynamic objects

  // ─── MATERIALS ────────────────────────────────────────────────────────────
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e, roughness: 0.9, metalness: 0.1
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x16213e, roughness: 0.95, metalness: 0.05
  });
  const platformMat = new THREE.MeshStandardMaterial({
    color: 0x0f3460, roughness: 0.6, metalness: 0.3,
    emissive: 0x0a1a40, emissiveIntensity: 0.3
  });
  const neonMat = (color) => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 2, roughness: 1
  });
  const propMat = new THREE.MeshStandardMaterial({
    color: 0x8B6914, roughness: 0.7, metalness: 0.2
  });
  const metalPropMat = new THREE.MeshStandardMaterial({
    color: 0x607080, roughness: 0.3, metalness: 0.8
  });

  // ─── FLOOR ────────────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.4, 40), floorMat);
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  scene.add(floor);
  physics.addStaticBox(40, 0.4, 40, 0, -0.2, 0);

  // Grid overlay on floor
  const gridHelper = new THREE.GridHelper(40, 40, 0x0a2a5a, 0x0a2a5a);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // ─── CEILING ──────────────────────────────────────────────────────────────
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(40, 0.4, 40), floorMat);
  ceiling.position.y = 8.2;
  scene.add(ceiling);
  physics.addStaticBox(40, 0.4, 40, 0, 8.2, 0);

  // ─── WALLS ────────────────────────────────────────────────────────────────
  const wallDefs = [
    { size: [40, 8, 0.4], pos: [0, 4, -20] },
    { size: [40, 8, 0.4], pos: [0, 4,  20] },
    { size: [0.4, 8, 40], pos: [-20, 4, 0] },
    { size: [0.4, 8, 40], pos: [ 20, 4, 0] },
  ];
  for (const { size: [w,h,d], pos: [x,y,z] } of wallDefs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), wallMat);
    mesh.position.set(x,y,z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    physics.addStaticBox(w,h,d, x,y,z);
  }

  // ─── PLATFORMS ────────────────────────────────────────────────────────────
  const platformDefs = [
    { size: [4,0.3,3], pos: [-7, 1.5, -6] },
    { size: [3,0.3,4], pos: [ 7, 2.5, -8] },
    { size: [5,0.3,2], pos: [ 0, 3.5,  6] },
    { size: [2,0.3,2], pos: [-9, 1.0,  4] },
    { size: [3,0.3,3], pos: [ 9, 2.0,  2] },
    // central raised platform
    { size: [6,0.3,6], pos: [ 0, 1.0, -4] },
    // stairs (approximated as steps)
    { size: [1.5,0.2,1], pos: [-2.5, 0.2, -1.5] },
    { size: [1.5,0.2,1], pos: [-2.5, 0.4,   -3] },
    { size: [1.5,0.2,1], pos: [-2.5, 0.6, -4.5] },
  ];
  for (const { size: [w,h,d], pos: [x,y,z] } of platformDefs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), platformMat);
    mesh.position.set(x,y,z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    physics.addStaticBox(w,h,d, x,y,z);
  }

  // ─── NEON TRIM LIGHTS ─────────────────────────────────────────────────────
  const neonDefs = [
    { color: 0x00ffcc, pos: [-19.8, 1, 0], rot: [0,0,Math.PI/2], len: 38 },
    { color: 0xff0066, pos: [ 19.8, 1, 0], rot: [0,0,Math.PI/2], len: 38 },
    { color: 0x0066ff, pos: [0, 1, -19.8], rot: [0,Math.PI/2,0], len: 38 },
    { color: 0xffaa00, pos: [0, 1,  19.8], rot: [0,Math.PI/2,0], len: 38 },
  ];
  for (const { color, pos, rot, len } of neonDefs) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, len, 0.06),
      neonMat(color)
    );
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    scene.add(mesh);

    const light = new THREE.PointLight(color, 1.5, 12);
    light.position.set(...pos);
    scene.add(light);
  }

  // Ceiling neon cross
  const ceilNeon1 = new THREE.Mesh(new THREE.BoxGeometry(38,0.06,0.06), neonMat(0x9900ff));
  ceilNeon1.position.set(0, 7.9, 0);
  scene.add(ceilNeon1);
  const ceilNeon2 = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.06,38), neonMat(0x9900ff));
  ceilNeon2.position.set(0, 7.9, 0);
  scene.add(ceilNeon2);

  // ─── PILLAR COLUMNS ───────────────────────────────────────────────────────
  const pillarPositions = [[-8,4,-8],[-8,4,8],[8,4,-8],[8,4,8]];
  for (const [x,,z] of pillarPositions) {
    const pMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6,8,0.6), wallMat);
    pMesh.position.set(x,4,z);
    pMesh.castShadow = true;
    scene.add(pMesh);
    physics.addStaticBox(0.6,8,0.6,x,4,z);

    // Neon ring on pillar
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 24), neonMat(0x00ffcc));
    ring.position.set(x, 2, z);
    ring.rotation.x = Math.PI/2;
    scene.add(ring);
  }

  // ─── INTERACTABLE PROPS ───────────────────────────────────────────────────
  // Wooden crates
  const crateDefs = [
    { pos: [ 3, 0.3, -2], size: 0.6 },
    { pos: [-4, 0.3,  3], size: 0.5 },
    { pos: [ 5, 0.3,  5], size: 0.7 },
    { pos: [-3, 0.3, -5], size: 0.55 },
    { pos: [ 0, 0.3,  2], size: 0.5 },
    // On central platform
    { pos: [-1, 1.45, -4], size: 0.4 },
    { pos: [ 1, 1.45, -4], size: 0.45 },
  ];
  for (const { pos: [x,y,z], size: s } of crateDefs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s,s,s), propMat);
    mesh.position.set(x,y,z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const body = physics.addDynamicBox(mesh, 8, s, s, s);
    mesh.userData.interactable = true;
    mesh.userData.grabMass    = 8;
    mesh.userData.type        = 'crate';
    objects.push({ mesh, body });
  }

  // Metal barrels (spheres for fun rolling)
  const barrelDefs = [
    { pos: [ 6, 0.35,  1] },
    { pos: [-5, 0.35, -3] },
    { pos: [ 2, 0.35,  7] },
  ];
  for (const { pos: [x,y,z] } of barrelDefs) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), metalPropMat);
    mesh.position.set(x,y,z);
    mesh.castShadow = true;
    scene.add(mesh);
    const body = physics.addDynamicSphere(mesh, 15, 0.35);
    mesh.userData.interactable = true;
    mesh.userData.grabMass    = 15;
    mesh.userData.type        = 'barrel';
    objects.push({ mesh, body });
  }

  // "Energy cube" — glowing throwable
  const cubeColors = [0x00ffcc, 0xff0066, 0xffaa00];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.3,0.3,0.3),
      new THREE.MeshStandardMaterial({ color: cubeColors[i], emissive: cubeColors[i], emissiveIntensity: 1.5 })
    );
    mesh.position.set(-6+i*4, 1.6, -6);
    mesh.castShadow = true;
    scene.add(mesh);
    const body = physics.addDynamicBox(mesh, 2, 0.3, 0.3, 0.3);
    body.linearDamping = 0.1;
    mesh.userData.interactable = true;
    mesh.userData.grabMass    = 2;
    mesh.userData.type        = 'energyCube';
    mesh.userData.glowColor   = cubeColors[i];
    objects.push({ mesh, body });

    const pt = new THREE.PointLight(cubeColors[i], 1, 3);
    pt.position.copy(mesh.position);
    mesh.userData.light = pt;
    scene.add(pt);
  }

  // ─── AMBIENT / FOG / SKYBOX ───────────────────────────────────────────────
  scene.fog = new THREE.FogExp2(0x06060f, 0.04);
  scene.background = new THREE.Color(0x060610);

  // Ambient + hemisphere
  scene.add(new THREE.AmbientLight(0x112244, 0.8));
  const hemi = new THREE.HemisphereLight(0x2244aa, 0x110022, 0.5);
  scene.add(hemi);

  // Central spot light
  const spot = new THREE.SpotLight(0xffffff, 2, 25, Math.PI/5, 0.4, 1);
  spot.position.set(0, 7.5, -4);
  spot.castShadow = true;
  spot.shadow.mapSize.set(512, 512);
  scene.add(spot);
  scene.add(spot.target);

  return objects;
}
