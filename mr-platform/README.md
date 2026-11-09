# 🥽 MR Platform (estilo EnJoyTheMR)

Plataforma de **Mixed Reality** para smartphone.  
No es un juego: es un **runtime + launcher** que te deja ver el mundo real y abrir experiencias encima.

## Características principales

- **Passthrough** → ves la vida real con la cámara trasera
- Vista **estereoscópica** (cardboard / visor barato)
- **Hand tracking** (MediaPipe)
- **Launcher** en el espacio MR
- Sistema simple de “apps” / experiencias
- Listo para generar **APK** con Capacitor

## Diferencias con EnJoyTheMR

| EnJoyTheMR              | Esta plataforma          |
|-------------------------|--------------------------|
| Formato `.emr` + Lua    | Experiencias web / JS    |
| Store + cifrado         | Lista local de apps      |
| Unity AssetBundles      | Three.js nativo          |
| iOS + Android           | Enfocado en Android APK  |

La idea es tener la **misma sensación de plataforma**, no copiar el formato de archivos.

## Estructura

```
game/
├── index.html          ← Entry point
├── manifest.webmanifest
└── src/
    ├── main.js         ← Orquestador de la plataforma
    ├── passthrough.js  ← Cámara del mundo real
    ├── stereo.js       ← Render side-by-side + barrel
    ├── hands.js        ← Hand tracking
    ├── launcher.js     ← Menú / home en MR
    └── apps/           ← Experiencias que se pueden abrir
mobile-apk/             ← Capacitor para generar el APK
```

## Cómo generar el APK

### GitHub Actions (recomendado)
1. Subí esta carpeta `game/` + `mobile-apk/` a tu repo.
2. Actions → Build Android APK → Run workflow.
3. Descargá el artifact `app-debug.apk`.

### Local
```bash
cd mobile-apk
npm install
npm run prepare:web
npx cap add android   # solo primera vez
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## Controles

- **Mirar** → giroscopio del teléfono
- **Manos** → gestos para apuntar / seleccionar en el launcher
- **Botón en pantalla** → toggle passthrough / settings

---

Hecho para que se sienta como una **plataforma MR**, no como un juego suelto.
