#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -n "${ANDROID_PROJECT_DIR:-}" ]]; then
  ANDROID_ROOT="$ANDROID_PROJECT_DIR"
elif [[ -d "$SOURCE_ROOT/android" ]]; then
  ANDROID_ROOT="$SOURCE_ROOT/android"
else
  ANDROID_ROOT="$SOURCE_ROOT/../android"
fi
ANDROID_ROOT="$(cd "$ANDROID_ROOT" && pwd)"
ANDROID_APP="$ANDROID_ROOT/app"

if [[ ! -f "$SOURCE_ROOT/package-lock.json" || ! -f "$SOURCE_ROOT/package.json" ]]; then
  echo "Expected npm source root at $SOURCE_ROOT" >&2
  exit 1
fi
if [[ ! -x "$ANDROID_ROOT/gradlew" ]]; then
  echo "Gradle wrapper not found/executable at $ANDROID_ROOT/gradlew" >&2
  exit 1
fi

# Android Studio's local.properties takes precedence when it names a valid SDK.
SDK_DIR=""
if [[ -f "$ANDROID_ROOT/local.properties" ]]; then
  SDK_DIR="$(sed -n 's/^sdk\.dir=//p' "$ANDROID_ROOT/local.properties" | head -n 1 | sed 's/\\\\:/\:/g; s/\\\\\\\\/\\\\/g')"
fi
if [[ -n "$SDK_DIR" && ! -d "$SDK_DIR" ]]; then
  SDK_DIR=""
fi
if [[ -z "$SDK_DIR" ]]; then
  SDK_DIR="${ANDROID_HOME:-}"
fi
if [[ -z "$SDK_DIR" ]]; then
  echo "Set ANDROID_HOME or provide sdk.dir in $ANDROID_ROOT/local.properties" >&2
  exit 1
fi
if [[ ! -d "$SDK_DIR" ]]; then
  echo "Android SDK directory does not exist: $SDK_DIR" >&2
  exit 1
fi
export ANDROID_HOME="$SDK_DIR"

cd "$SOURCE_ROOT"
npm ci
npx cap sync android
python3 "$SOURCE_ROOT/scripts/build_dictionary_db.py"
npm run build

ASSETS_PUBLIC="$ANDROID_APP/src/main/assets/public"
rm -rf "$ASSETS_PUBLIC"
mkdir -p "$ASSETS_PUBLIC"
cp -a "$SOURCE_ROOT/dist/." "$ASSETS_PUBLIC/"
cp "$SOURCE_ROOT/capacitor.config.json" "$ANDROID_APP/src/main/assets/capacitor.config.json"
cp "$SOURCE_ROOT/native/android/capacitor.plugins.json" "$ANDROID_APP/src/main/assets/capacitor.plugins.json"
if [[ ! -f "$ANDROID_APP/google-services.json" ]]; then
  echo "Missing Firebase Android config: $ANDROID_APP/google-services.json" >&2
  exit 1
fi

# Source-controlled native plugin Java may be supplied by a later source bundle.
# Keep the wrapper's existing Java sources intact if this source bundle has none.
JAVA_SOURCE="$SOURCE_ROOT/native/android/src/main/java"
JAVA_TARGET="$ANDROID_APP/src/main/java"
if [[ -d "$JAVA_SOURCE" ]]; then
  mkdir -p "$JAVA_TARGET"
  cp -a "$JAVA_SOURCE/." "$JAVA_TARGET/"
fi

GRADLE_ARGS=(--no-daemon)
if [[ -n "${PATENTE_DEBUG_KEYSTORE:-}" ]]; then
  if [[ ! -f "$PATENTE_DEBUG_KEYSTORE" ]]; then
    echo "PATENTE_DEBUG_KEYSTORE does not name a file: $PATENTE_DEBUG_KEYSTORE" >&2
    exit 1
  fi
  GRADLE_ARGS+=("-PpatenteDebugKeystore=$(cd "$(dirname "$PATENTE_DEBUG_KEYSTORE")" && pwd)/$(basename "$PATENTE_DEBUG_KEYSTORE")")
fi
cd "$ANDROID_ROOT"
./gradlew "${GRADLE_ARGS[@]}" clean :app:assembleDebug :app:testDebugUnitTest

echo "Debug APK: $ANDROID_APP/build/outputs/apk/debug/app-debug.apk"
echo "No release variant, release signing, upload, or publication was requested or performed."
