# LONETI Smile Collector

Collect a Smile from a drawing comment or drawing-room chat, organize your library into packs, and share a whole pack with a friend. Each person uses their own signed-in LONETI account.

## Install with Tampermonkey

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser. On Chrome 138+ enable **Allow User Scripts** in Tampermonkey’s extension settings. If your Chromium browser lacks that switch, use **Developer mode** on the extensions page. [Tampermonkey permissions guide](https://www.tampermonkey.net/faq.php?locale=en&q=Q209)
2. Open the [English and Russian installation guide](https://bedrockbender.github.io/loneti-smile-collector/), choose **Install userscript**, and confirm in Tampermonkey.
3. Reload your LONETI drawing or room. Hover over a Smile to see its outline, then click it. You can also use **Tab** to focus it and **Enter** to open the preview. Choose **Cancel** or press **Esc** to leave the preview without saving.

The userscript follows LONETI’s page language automatically. The installation guide starts in your browser’s preferred supported language and remembers your choice of **EN** or **Русский**.

## Organize and share packs

1. On **My emotes**, choose **New pack** and give it a name. Existing Smiles start under **Unsorted**. Use the dropdown below a Smile to move it.
2. Click a pack heading to expand it. **My emotes**, the comment picker, and the room picker all show newer library IDs first within each pack. **Rename** updates the pack name across these views. Click a Smile inside a picker to select or send it as usual.
3. Choose **Download pack** to save a `.lesp` file. Enter and confirm a password to encrypt the artwork and the pack name inside the file. A blank password creates a file anyone can install. The download filename also contains the pack name.
4. To install a friend's pack, choose **Install pack** beside **Draw emote**. Select the file, enter its password if prompted, then choose **Preview pack**. Review its name and pictures and choose **Install pack** to add them to My emotes.

The images are saved in your LONETI account. Pack names and assignments are stored in this browser for the current profile and LONETI domain. Export a pack to take its grouping to another browser. Files support up to 100 Smiles and 16 MiB per pack.

Installing into a named pack merges with a pack of the same name. Matching artwork already in that pack or in Unsorted is reused. Other named packs keep their copies. If LONETI stops an install, the dialog reports how far it got. Installing the same file again checks the library before continuing. An interrupted request whose result is still uncertain requires confirmation before another upload.

## Set a Smile's sharing preference

- **While drawing**, check **Prevent copying this Smile** in the editor's save preview, then use the normal **Save** button.
- **For an existing Smile**, open its pack on **My emotes** and toggle **Copy protection** beneath the picture. After you confirm, the script creates or reuses a matching edition in that pack, verifies its full-size image, then removes the old library entry. Earlier posts still reference the image used when they were sent.
- **If you already have both editions**, switch on **Copy protection** on the unchecked copy. When the matching protected copy is in the same pack, the script reuses it. A small black lock with a white outline marks the protected Smile in the picker and preview.
- **When collecting**, click a Smile in a comment or room, review the preview, and choose **Add to my Smiles**. The script checks the original 300×300 PNG. If only the thumbnail is available, collection is disabled because resizing can erase the preference.

The preference is a small mark in the least significant bits of the PNG pixels. This collector honors it when collecting, exporting, and installing. A pack download excludes protected Smiles and shows how many were skipped. Other software can still save or screenshot a visible image, and image processing can remove the mark. Password encryption protects the pack file until someone unlocks it. An authorized recipient can share the unlocked artwork.
