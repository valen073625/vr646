# MR Platform — Android APK

Capacitor shell around `mr-platform/www/`. A Quest-style dock rendered with
Three.js: camera passthrough (back camera), a dock of app icons, and hand
tracking (MediaPipe `HandLandmarker`) so you point with your index finger and
pinch to select. The tracked hand is drawn as a neon 2D sketch, not a 3D hand
model.

`npm run prepare:web` copies `mr-platform/www/` into `www/` before `cap
sync`. Do not edit `www/` by hand — edit `mr-platform/www/index.html`.

## Build in GitHub Actions

1. Repo → **Actions** → **Build MR Platform APK** → **Run workflow**.
2. The workflow also runs on pushes that touch `mr-platform/` or
   `mr-platform-apk/`.
3. On success it publishes `MR-Platform.apk` to **Releases**.

The phone needs internet the first time it runs: Three.js and MediaPipe's
`tasks-vision` + hand landmarker model load from a CDN.

## Build locally

Requires Node.js, a JDK 17, and the Android SDK (Android Studio).

```bash
cd mr-platform-apk
npm install
npm run add:android
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

On the phone: open the app, allow the camera, turn the phone sideways
(landscape) — orientation stays locked — and point/pinch at the dock icons.
