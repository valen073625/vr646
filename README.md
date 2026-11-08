# ⚡ VR Arena — Hand Tracking Game

Juego VR para teléfono estilo **BONELAB**: arena 3D con física, enemigos que reaccionan a golpes,
objetos agarrables/lanzables, y control completo por **señas de mano** (hand tracking con MediaPipe).
Sin instalar nada — corre directo en el navegador del teléfono, o instalable como PWA.

```
game/
├── index.html              Entry point — carga todo sin build steps
├── manifest.webmanifest    PWA (instalable, fullscreen landscape)
└── src/
    ├── main.js             Orquestador principal (loop de juego, eventos)
    ├── handGestures.js     Clasificador de gestos (21 landmarks → gesto)
    ├── handTracker.js      Wrapper MediaPipe Hands (cámara frontal)
    ├── physics.js          Cannon-ES: suelo, plataformas, objetos dinámicos
    ├── player.js           Movimiento gyro, agarrar/lanzar, daño
    ├── enemy.js            Enemigos dummy tipo ragdoll + EnemyManager (waves)
    ├── level.js            Arena neon-industrial: paredes, plataformas, props
    └── stereoRenderer.js   Render SBS + distorsión de barril para cardboard
```

## Gestos reconocidos

| Seña | Gesto | Acción |
|------|-------|--------|
| ✌️ Índice + medio | VICTORY | 🚶 Caminar hacia donde mirás |
| 👊 Puño cerrado | FIST | ✊ Agarrar objeto cercano / Golpear enemigo |
| 🖐️ Palma abierta | OPEN | 🤲 Soltar objeto |
| 👍 Pulgar arriba | THUMBS_UP | 🚀 Lanzar objeto agarrado |
| 🤙 Shaka | SHAKA | 🎯 Recalibrar centro de cabeza |
| ☝️ Solo índice | POINT | 👈 Apuntar |

Girar la cabeza (giroscopio del teléfono) = mirar en el juego.

## Cómo jugarlo

### Desde el navegador (cero instalación)

1. Habilitá GitHub Pages en el repo: **Settings → Pages → Source: GitHub Actions**.
2. Corré el workflow **Deploy VR Game to GitHub Pages** (o hacé push a `main`).
3. Abrí la URL `https://valen073625.github.io/vr646/` en el teléfono (Chrome/Android).
4. Girá el teléfono en **landscape (horizontal)** para modo VR estéreo.
5. Tocá **INICIAR JUEGO**, dale permisos de cámara y movimiento.
6. ¡Usá los gestos para pelear!

### Modo escritorio (testing)

Abrí `game/index.html` directo en Chrome con un servidor local:
```bash
npx serve game
# → http://localhost:3000
```
En la PC podés usar **W / ↑** para caminar y **Espacio** para recentrar.

## Arquitectura técnica

```
Cámara frontal → MediaPipe Hands (en device, sin servidor)
                       │
                 21 landmarks/mano
                       │
              GestureTracker (smoothing 3 frames)
                       │
            classifyGesture() → FIST / OPEN / VICTORY / …
                       │
            Player.applyGestures() ──────────────────┐
            Player.updateHandMeshes()                 │
                       │                             │
         DeviceOrientation (gyro) → camera quat      │
                       │                             │
         PhysicsWorld (cannon-es) ◄──────────────────┘
              │   rigidbodies, impulsos, colisiones
              │
         EnemyManager → waves, pathfinding simple, damage
              │
         StereoRenderer → 2× RenderTarget + barrel distortion shader
              │
         WebGL canvas (Three.js r165)
```

## Configuraciones

Dentro del juego podés ajustar en `src/stereoRenderer.js`:
- `ipd` (distancia entre pupilas, default 0.064m)
- `barrel` (distorsión de barril para cardboard, default 0.3)
- `vignette` (viñeta al moverse rápido)

## Lo que está implementado vs. extensiones futuras

### ✅ Implementado
- Render estéreo SBS con barrel distortion y aberración cromática
- Hand tracking completo (MediaPipe Hands, en device, 21 landmarks)
- 6 gestos distintos con debounce (3 frames de confirmación para evitar falsos)
- Manos 3D posicionadas en espacio de cámara según landmarks
- Física completa: gravedad, colisiones, impulsos, cuerpos kinematic para manos
- Agarrar / soltar / lanzar objetos con el puño
- Golpear enemigos con hitbox esférica
- Enemigos con caminata, animación de piernas, HP bar billboard, ragdoll al morir
- Sistema de waves (cada wave que limpiás spawna +2 enemigos)
- HUD: score, wave, HP bar, flash de daño
- Game over con restart
- PWA instalable (manifest, landscape fullscreen)
- Fallback WASD para testing en desktop

### 🔧 Extensiones posibles
- Streaming de video del juego al teléfono (WebRTC + captura de pantalla del PC)
- Controlador virtual vía WebXR `xr-gamepad-mappings`
- Más armas: pickup de pistola, espada (gestos específicos)
- Física de ragdoll completa en enemigos muertos
- Mapa más grande con spawns dinámicos
- Multijugador LAN con WebSockets
