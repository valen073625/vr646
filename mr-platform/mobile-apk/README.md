# MR Platform — Android APK

## Build con GitHub Actions
1. Subí `game/` + `mobile-apk/` al repo.
2. Actions → workflow de Android → Run.
3. Descargá el APK.

## Build local
```bash
cd mobile-apk
npm install
npm run prepare:web
npx cap add android   # solo la primera vez
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

Permisos necesarios en el teléfono:
- Cámara (frontal + trasera)
- Orientación / sensores de movimiento
