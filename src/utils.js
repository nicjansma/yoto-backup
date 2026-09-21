//
// Imports
//
import NodeID3 from "node-id3";
import download from "image-downloader";
import { Readable } from "stream";
import { finished } from "stream/promises";
import fs from "fs";

//
// Functions
//

/**
 * Downloads an image.
 *
 * @param {string} url Image URL
 * @param {string} filepath Output file path
 *
 * @returns {Promise} Promise
 */
export function downloadImage(url, filepath) {
    return download.image({
        url,
        dest: filepath,
        extractFilename: false
    });
}

/**
 * Downloads a file.
 *
 * @param {string} url Download URL
 * @param {string} fileName Output file path
 *
 * @returns {Promise} Promise
 */
export async function downloadFile(url, fileName) {
    const res = await fetch(url);

    // Signed track URLs expire. Without this check the error body (e.g. S3's
    // AccessDenied XML) gets written out as a .mp3 and the caller reports success.
    if (!res.ok) {
        throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
    }

    // Write to a temporary file and rename on success, so an interrupted download can
    // only ever leave a stray .part behind — never a truncated .mp3 that the next run's
    // "file already exists" check would treat as complete.
    const tmpName = `${fileName}.part`;

    const fileStream = fs.createWriteStream(tmpName, { flags: "w" });

    try {
        await finished(Readable.fromWeb(res.body).pipe(fileStream));
    } catch (error) {
        try {
            fs.unlinkSync(tmpName);
        } catch {
            // already gone
        }

        throw error;
    }

    fs.renameSync(tmpName, fileName);
}

/**
 * Writes ID3 tags
 *
 * @param {string} json JSON data from the Card
 * @param {string} chapter Chapter name
 * @param {string} track Track name
 * @param {string} trackFileName Track file name
 * @param {string} [iconFilePath] Path to the already-downloaded icon, embedded as artwork
 */
export function writeTags(json, chapter, track, trackFileName, iconFilePath) {
    const tags = {
        title: chapter.title,
        artist: json.card.metadata.author,
        album: json.card.title
    };

    if (track.overlayLabel) {
        tags.TRCK = track.key;
    }

    // APIC needs a path to image data. It used to be set to the icon16x16 field, which is
    // a "yoto:#<hash>" URI, not a file — and .replace("yoto:#") with no second argument
    // substituted the literal string "undefined" rather than stripping the prefix.
    if (iconFilePath && fs.existsSync(iconFilePath)) {
        tags.APIC = iconFilePath;
    }

    NodeID3.write(tags, trackFileName);
}
