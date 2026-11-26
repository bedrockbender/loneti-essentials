# Loneti essentials

Draw on LONETI with editable ink curves, point pressure, polygon and color selections, and gradients. Collect Smiles from direct messages, Wall posts and replies, drawing comments, and room chats. Share them with friends as packs. The Android app and Tampermonkey userscript include the same tools.

[Install Loneti essentials](https://bedrockbender.github.io/loneti-essentials/) · [Android releases](https://github.com/bedrockbender/loneti-essentials/releases) · [Report a bug](https://github.com/bedrockbender/loneti-essentials/issues/new)

Loneti essentials is an independent project for LONETI. Its original code and documentation are available under the [MIT license](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for dependencies, icons, and screenshot artwork. See [SECURITY.md](SECURITY.md) for private vulnerability reports.

## Install on Android

1. Open the [English and Russian installation guide](https://bedrockbender.github.io/loneti-essentials/#android-setup) on a phone or tablet running Android 8.0 or newer. Tap **Download for Android** and open the file.
2. If Android asks, allow the browser or Files app that opened the download to **Install unknown apps**. Return to the installer and tap **Install**.
3. Open **Loneti essentials** and sign in to LONETI. Tap a Smile to preview it, then tap **Add to my Smiles** to keep it. To update, install the latest signed APK over your existing app to preserve your app data.

The app uses Android System WebView and has its own LONETI sign-in session. Keep WebView up to date. Use **Download pack** and **Install pack** in My emotes to move a named pack between the app and your browser. Android opens its Files picker to choose where to save or which file to install.

The app starts with the first supported language in your phone’s language list. To choose Russian or English yourself, open **Язык / Language** in the account menu or Settings. Before sign-in, the link is in the home page footer. It is also available on the connection error screen. The app remembers your choice. Switching between the Russian and English sites opens the other domain, which has its own sign-in and pack membership.

From Android 2.3.0, opening or returning to the app checks the published release at most once a day after a successful check. When a newer APK is available, **Download** opens it in your browser and **×** dismisses that version. Install 2.3.0 manually over older versions to start receiving notices.

## Install with Tampermonkey

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser. In Chrome, type `chrome://extensions` into a new tab. Find the Tampermonkey card, click **Details**, and turn on **Allow User Scripts**. In Edge, start at `edge://extensions`. If the switch is missing, enable **Developer mode** on the browser’s extensions list. Firefox users can go straight to step 2. [Tampermonkey permissions guide](https://www.tampermonkey.net/faq.php?locale=en&q=Q209)
2. Choose **I'm a PC user** on the [installation page](https://bedrockbender.github.io/loneti-essentials/) to open **Use the browser userscript**. Choose **Install the userscript** and confirm in Tampermonkey. If the drawing tools miss the editor at startup, choose **UserScripts API Dynamic** under **Content Script API** in the Tampermonkey dashboard settings, then reload the drawing. [Tampermonkey startup modes](https://www.tampermonkey.net/documentation.php?q=content_script_api)
3. Reload your LONETI tab after installing or updating. Hover over a Smile to see its outline, then click it. You can also use **Tab** to focus it and **Enter** to open the preview. Choose **Cancel** or press **Esc** to leave the preview without saving.

The userscript follows LONETI’s page language automatically. The installation guide starts in your browser’s preferred supported language and remembers your choice of **EN** or **Русский**.

## Local display settings

In **Settings → Loneti essentials**, **Hide my avatar and nickname on this device** replaces identifiable author names with “You” and masks your profile picture in supported views. The setting is local to the signed-in profile and site. Android also shows a dismissible link-posting warning on first use. The installation guide keeps the warning visible in English and Russian.

## Draw

Select an unlocked layer in a standalone drawing, room, Smile, or avatar editor. In LONETI’s tool palette, look for the polygon and wand beside the lasso and the gradient beside the paint bucket. Hover over an icon for its name and a short hint. On a phone, open the tools palette at the bottom of the editor. You can reopen it while drawing to adjust the active tool.

- **Curve** draws a smooth stroke through the points you tap. Choose **Round ink** or **Hand ink**, width and color. Double-click, right-click, press **Enter**, or choose **Finish** to paint it. **Undo point** removes the last point and **Cancel** discards the draft.
- **Pressure** adjusts one control point at a time. Drag right or up to thicken the line, left or down to thin it, all the way to zero.
- **Edit** moves, adds and deletes control points and can deform, duplicate, split, join, reorder or smooth strokes. Curves retain the selection they were drawn in. Deselect to edit across selections. Points are local to the open editor. Native Undo and Redo restore stroke revisions, and saved or shared drawings contain ordinary pixels.
- **Polygon** adds a vertex wherever you tap in the workspace, including outside the canvas. Tap the first vertex, press **Enter**, or choose **Finish** to close the shape. **Undo point** removes the last vertex. The selection is clipped to the canvas when you finish.
- **Magic wand** selects colors on the active layer. Adjust **Tolerance** before or after tapping a pixel. Clear **Contiguous pixels only** to include matching islands. Both selection tools can replace, add to, subtract from, or intersect the current selection.
- **Gradient** applies a linear or radial blend in the direction you drag. Tap the strip to add a color stop, drag the stop along the strip to move it, and use **Stop color** to change its color. You can also focus a stop and use the left and right arrow keys or adjust **Position**. Save, rename, or delete personal presets in the panel. Presets stay in the current app or browser on that LONETI domain.
- **Fill selection** and **Erase selection** act on the selected pixels. **Deselect** clears the boundary. Native Undo can undo a gradient or fill. Very detailed selections can still be used with these tools when LONETI cannot represent their outlines for the native brush.

In a drawing room the app uses the editor’s own history and sends the resulting layer as a PNG. If the standard PNG exceeds the connection’s message limit, it tries a smaller, lossless encoding before changing the drawing. Other participants can see the result with the ordinary LONETI client. If the room is disconnected, the layer is locked, or the image still exceeds the limit, the edit leaves the layer untouched.

## Organize and share packs

1. On **My emotes**, choose **New pack** and give it a name. Existing Smiles start under **Unsorted**. Use the dropdown below a Smile to move it.
2. Click a pack heading to expand it. **My emotes**, the comment picker, and the room picker all show newer library IDs first within each pack. **Rename** updates the pack name across these views. Click a Smile inside a picker to select or send it as usual.
3. Choose **Download pack** to save a `.lesp` file. Enter and confirm a password to encrypt the artwork and the pack name inside the file. A blank password creates a file anyone can install. The download filename also contains the pack name.
4. To install a friend's pack, choose **Install pack** beside **Draw emote**. Select the file, enter its password if prompted, then choose **Preview pack**. Review its name and pictures and choose **Install pack** to add them to My emotes.

Named packs and new exports hold up to **16 Smiles**. The file size limit is 16 MiB. Unsorted can hold the rest of your library. Older version 1 files with up to 100 Smiles remain readable. Oversized named packs are divided into numbered groups. The images stay in your LONETI account, while pack membership is local to the current app or browser, profile, and LONETI domain.

Collecting, saving a Smile from its editor, and installing a pack check the account’s full-size artwork before uploading. Existing artwork in Unsorted can join the destination pack. A matching Smile already in another named pack stays there, and the dialog identifies its pack. Retrying an interrupted installation rechecks the library. Distinct sharing preferences are preserved. Independent devices saving at precisely the same time can still race at LONETI.

## Set a Smile's sharing preference

- **While drawing**, check **Prevent copying this Smile** in the editor's save preview, then use the normal **Save** button.
- **For an existing Smile**, open its pack on **My emotes** and toggle **Copy protection** beneath the picture. After you confirm, the script creates or reuses a matching edition in that pack, verifies its full-size image, then removes the old library entry. Earlier posts still reference the image used when they were sent.
- **If you already have both editions**, switch on **Copy protection** on the unchecked copy. When the matching protected copy is in the same pack, the script reuses it. A small black lock with a white outline marks the protected Smile in the picker and preview.
- **When collecting**, click the Smile itself in a direct message, a Wall post or reply, a drawing comment, or a room chat. Review the preview and choose **Add to my Smiles**. The script checks the original 300×300 PNG. If only the thumbnail is available, collection is disabled because resizing can erase the preference.

The preference is a small mark in the least significant bits of the PNG pixels. This collector honors it when collecting, exporting, and installing. A pack download excludes protected Smiles and shows how many were skipped. Other software can still save or screenshot a visible image, and image processing can remove the mark. Password encryption protects the pack file until someone unlocks it. An authorized recipient can share the unlocked artwork.

## Build and verify from source

The userscript is `loneti-smile-collector.user.js`. After editing the drawing-tool sources under `editor/`, run `node editor/bundle.mjs` to rebuild it. Run `node editor/bundle.mjs --check` to verify the bundle. Version 3.1.2 directs updates to the new site. Existing installs can receive it at the original URL and keep the same userscript identity.

Run `node --test editor/pixels.test.mjs` for mask geometry and tolerance checks. With Node 22+, Chromium, and locally saved reference editors, `node tests/editor-ui.mjs` exercises the tool palette in the four drawing modes. `node tests/room-sync.mjs` verifies gradient replay, Undo, Redo, and rejection when a room update exceeds the size limit. The browser integration tests skip when their local fixtures are unavailable. They accept a fixture folder via `LONETI_FIXTURES`; keep saved LONETI pages outside Git.

To build Android on Windows, install JDK 21, Android SDK Platform 35, and Build-Tools 35.0.1. Set `JAVA_HOME` and `ANDROID_SDK_ROOT` or pass `-JavaHome` and `-AndroidSdk`. The build fetches hash-checked AndroidX dependencies from Google's Maven repository.

Create your own local signing key once. Run the following in PowerShell with `keytool` from your JDK on `PATH`. Enter the same new password in both prompts.

```powershell
$signingDir = Join-Path $env:LOCALAPPDATA 'LonetiEssentials/dev-signing'
New-Item -ItemType Directory -Force -Path $signingDir | Out-Null
keytool -genkeypair -keystore (Join-Path $signingDir 'release.p12') -storetype PKCS12 -alias release -keyalg RSA -keysize 3072 -validity 3650 -dname 'CN=Loneti essentials development'
Read-Host 'Keystore password' -AsSecureString | ConvertFrom-SecureString |
    Set-Content -LiteralPath (Join-Path $signingDir 'release-password.dpapi')
./android/build.ps1 -SigningDirectory $signingDir
```

The build verifies the APK signature, alignment, package identity, and bundled userscript before writing `android/build/Loneti-essentials.apk`. Android requires matching signing keys for an in-place update. Use a spare device or emulator to try a locally signed build if the official app is already installed.

The [Android 2.4.1 source](https://github.com/bedrockbender/loneti-essentials/tree/android-v2.4.1) bundles the [3.3.0 userscript](https://github.com/bedrockbender/loneti-essentials/tree/userscript-v3.3.0). For an Android release, publish the signed APK at `android-v<versionName>/Loneti-essentials.apk` on GitHub Releases before deploying the matching `versionCode` and `versionName` in `android/latest.json` to the website.
