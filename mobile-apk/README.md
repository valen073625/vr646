# VR Arena — Android APK

Capacitor shell around `game/`. The debug APK is the hand-tracking arena itself (camera, gyro, stereo view). It does not talk to the PC app.

`npm run prepare:web` copies `game/` into `www/` before `cap sync`. Do not edit `www/` by hand.

## Build in GitHub Actions

1. Repo → **Actions** → **Build Android APK** → **Run workflow**.
2. When the run is green, download the artifact `vr-arena-debug-apk` (`app-debug.apk`).
3. Copy it to the phone and install it (allow unknown sources).

The workflow also runs on pushes that touch `game/` or `mobile-apk/`.

The phone needs internet the first time you play: Three.js, MediaPipe and cannon-es load from a CDN.

## Build locally

Requires Node.js, a JDK 17, and the Android SDK (Android Studio).

```bash
cd mobile-apk
npm install
npm run add:android
npx cap sync android
cd android && ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

On the phone: open the app, allow the camera, turn the phone sideways, and start the game.
