# Loneti essentials

Draw on LONETI with polygon and color selections and editable gradients. Collect Smiles from comments and rooms and share them with friends as packs. The Android app and Tampermonkey userscript include the same tools.

## Install on Android

1. Open the [English and Russian installation guide](https://bedrockbender.github.io/loneti-smile-collector/#android-setup) on a phone or tablet running Android 8.0 or newer. Tap **Download for Android** and open the file.
2. If Android asks, allow the browser or Files app that opened the download to **Install unknown apps**. Return to the installer and tap **Install**.
3. Open **Loneti essentials** and sign in to LONETI. Tap a Smile in a comment or drawing room to preview it. Tap **Add to my Smiles** to keep it. The **⋮** menu opens **My emotes**. Installing over the earlier Smile Collector APK preserves your app data.

The app uses Android System WebView and has its own LONETI sign-in session. Keep WebView up to date. Use **Download pack** and **Install pack** in My emotes to move a named pack between the app and your browser. Android opens its Files picker to choose where to save or which file to install.

## Install with Tampermonkey

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser. In Chrome, type `chrome://extensions` into a new tab. Find the Tampermonkey card, click **Details**, and turn on **Allow User Scripts**. In Edge, start at `edge://extensions`. If the switch is missing, enable **Developer mode** on the browser’s extensions list. Firefox users can go straight to step 2. [Tampermonkey permissions guide](https://www.tampermonkey.net/faq.php?locale=en&q=Q209)
2. Open the [English and Russian installation guide](https://bedrockbender.github.io/loneti-smile-collector/#browser), expand **Use the browser userscript**, choose **Install the userscript**, and confirm in Tampermonkey. If the drawing tools miss the editor at startup, choose **UserScripts API Dynamic** under **Content Script API** in the Tampermonkey dashboard settings, then reload the drawing. [Tampermonkey startup modes](https://www.tampermonkey.net/documentation.php?q=content_script_api)
3. Reload your LONETI drawing or room. Hover over a Smile to see its outline, then click it. You can also use **Tab** to focus it and **Enter** to open the preview. Choose **Cancel** or press **Esc** to leave the preview without saving.

The userscript follows LONETI’s page language automatically. The installation guide starts in your browser’s preferred supported language and remembers your choice of **EN** or **Русский**.

## Draw

Open **Drawing tools** in a standalone drawing, room, Smile, or avatar editor and select an unlocked layer you can edit.

- **Polygon** adds a vertex wherever you tap in the workspace, including outside the canvas. Tap the first vertex, press **Enter**, or choose **Finish** to close the shape. **Undo point** removes the last vertex. The selection is clipped to the canvas when you finish.
- **Magic wand** selects colors on the active layer. Adjust **Tolerance** before or after tapping a pixel. Clear **Contiguous pixels only** to include matching islands. Both selection tools can replace, add to, subtract from, or intersect the current selection.
- **Gradient** applies a linear or radial blend in the direction you drag. Tap the gradient strip to add a color stop, then edit its color and position. Save, rename, or delete personal presets in the panel. Presets stay in the current app or browser on that LONETI domain.
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
- **When collecting**, click a Smile in a comment or room, review the preview, and choose **Add to my Smiles**. The script checks the original 300×300 PNG. If only the thumbnail is available, collection is disabled because resizing can erase the preference.

The preference is a small mark in the least significant bits of the PNG pixels. This collector honors it when collecting, exporting, and installing. A pack download excludes protected Smiles and shows how many were skipped. Other software can still save or screenshot a visible image, and image processing can remove the mark. Password encryption protects the pack file until someone unlocks it. An authorized recipient can share the unlocked artwork.

## Build the Android release

After editing the drawing-tool sources under `editor/`, run `node editor/bundle.mjs` to rebuild the self-contained userscript. Use `node editor/bundle.mjs --check` to verify it is current. The original userscript installation URL and namespace are retained for existing installations.

Run `node --test editor/pixels.test.mjs` for mask geometry and tolerance checks. With Node 22+, local Chromium, and a private reference dump available locally, `node tests/editor-ui.mjs` also exercises the native Smile and avatar editors.

On the project's Windows build machine, run `./android/build.ps1` in PowerShell. The script uses JDK 21, Android SDK Platform 35, and Build-Tools 35.0.1. You can pass `-JavaHome`, `-AndroidSdk`, and `-SigningDirectory` to select other local installations. It verifies the APK signature, alignment, package identity, and bundled userscript before writing `android/build/Loneti-essentials.apk`.

The release key is held outside Git in the publishing Windows account. Android updates must use the same signing key. A separate build needs its own PKCS12 keystore named `release.p12`, alias `release`, and a matching password saved as `release-password.dpapi` with PowerShell’s `ConvertFrom-SecureString` under the Windows account that will build it.
