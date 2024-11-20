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

    const fileStream = fs.createWriteStream(fileName, { flags: "wx" });

    await finished(Readable.fromWeb(res.body).pipe(fileStream));
}

/**
 * Writes ID3 tags
 *
 * @param {string} json JSON data from the Card
 * @param {string} chapter Chapter name
 * @param {string} track Track name
 * @param {string} trackFileName Track file name
 */
export function writeTags(json, chapter, track, trackFileName) {
    const tags = {
        title: chapter.title,
        artist: json.card.metadata.author,
        album: json.card.title
    };

    if (track.overlayLabel) {
        tags.TRCK = track.key;
    }

    if (chapter.display && chapter.display.icon16x16) {
        tags.APIC = chapter.display.icon16x16.replace("yoto:#");
    }

    NodeID3.write(tags, trackFileName);
}
