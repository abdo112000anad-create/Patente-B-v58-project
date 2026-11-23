# Firebase config placeholder — not functional

`google-services.json` in this directory is a deliberately fake placeholder for a local debug/test build only. Its project number, project ID, app ID and API key are invented dummy values. It is not connected to Firebase and cannot provide Firebase Authentication, Google sign-in, Firestore, cloud sync, or production services.

The web config at `../../src/firebase-config.mjs` is also intentionally empty in this local test copy, so Firebase Auth and Firestore are not initialized. The welcome-screen Google action remains disabled; study progress is stored locally and may be exported as a local backup.

Do not publish or distribute an APK/AAB built with these placeholders as a functioning Firebase app. Enabling account sync requires a separately approved configuration and a deliberate release build.
