#!/usr/bin/env bash
set -euo pipefail

apk=${1:?Usage: bash android/tests/run-smoke.sh /path/to/signed.apk}
tests="$(cd "$(dirname "$0")" && pwd)"
sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:?Set ANDROID_HOME or ANDROID_SDK_ROOT}}
platform="${ANDROID_SMOKE_PLATFORM:-android-35}"
build_tools="$sdk/build-tools/${ANDROID_SMOKE_BUILD_TOOLS:-35.0.1}"
android_jar="$sdk/platforms/$platform/android.jar"
adb="$sdk/platform-tools/adb"
app=org.bedrockbender.lonetismiles
runner=test.loneti.smoke/.SmokeTest
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

test -f "$apk"
"$build_tools/apksigner" verify "$apk"
keytool -genkeypair -keystore "$work/ci.jks" -storepass android -keypass android \
    -alias smoke -keyalg RSA -keysize 2048 -validity 30 -dname 'CN=Disposable Android smoke test' >/dev/null
sign() {
    "$build_tools/apksigner" sign --ks "$work/ci.jks" --ks-pass pass:android \
        --key-pass pass:android --out "$2" "$1"
}

mkdir "$work/classes" "$work/dex"
javac -encoding UTF-8 --release 8 -classpath "$android_jar" -d "$work/classes" "$tests"/*.java
jar cf "$work/classes.jar" -C "$work/classes" .
"$build_tools/d8" --min-api 29 --lib "$android_jar" --output "$work/dex" "$work/classes.jar"

build_test() {
    local target="$1"
    local apk_name="$2"
    sed "s/android:targetPackage=\"test.loneti.smoke\"/android:targetPackage=\"$target\"/" \
        "$tests/AndroidManifest.xml" > "$work/AndroidManifest.xml"
    "$build_tools/aapt2" link -o "$work/base.apk" --manifest "$work/AndroidManifest.xml" \
        --min-sdk-version 29 --target-sdk-version 34 --debug-mode -I "$android_jar"
    zip -q -j "$work/base.apk" "$work/dex/classes.dex"
    "$build_tools/zipalign" -f 4 "$work/base.apk" "$work/aligned.apk"
    sign "$work/aligned.apk" "$apk_name"
}

run_test() {
    local output
    output="$("$adb" shell am instrument -w -r -e app_package "$app" "$@" "$runner")"
    printf '%s\n' "$output"
    grep -q 'LONETI_ANDROID_SMOKE_OK' <<<"$output"
}

build_test test.loneti.smoke "$work/launcher-test.apk"
build_test "$app" "$work/flow-test.apk"
sign "$apk" "$work/instrumented-app.apk"
"$adb" shell cmd connectivity airplane-mode enable
"$adb" shell input keyevent 82
"$adb" shell dumpsys webviewupdate

"$adb" install "$apk"
"$adb" install "$work/launcher-test.apk"
run_test -e launch_only true
"$adb" uninstall test.loneti.smoke
"$adb" uninstall "$app"

"$adb" install "$work/instrumented-app.apk"
"$adb" install "$work/flow-test.apk"
run_test
