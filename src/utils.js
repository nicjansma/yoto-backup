//
// Imports
//
import NodeID3 from "node-id3";
import download from "image-downloader";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import fs from "fs";

// local imports
import constants from "./constants.js";

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
 * Resolves a chapter icon (display.icon16x16), which is either a full URL or a
 * "yoto:#<hash>" URI naming an icon under ICON_URL.
 *
 * @param {string} icon icon16x16 value
 *
 * @returns {object} { url: download URL, id: icon hash (null for full URLs) }
 */
export function resolveIcon(icon) {
    icon = String(icon);

    if (/^https?:\/\//i.test(icon)) {
        return { url: icon, id: null };
    }

    const id = icon.replace(/^yoto:#/, "");

    return { url: constants.ICON_URL + id, id };
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

    // e.g. an expired signed URL; don't save the error body as the track
    if (!res.ok) {
        throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
    }

    // download to a .part file and rename on success, so an interrupted download
    // never leaves a truncated file that later runs would treat as complete
    const tmpName = `${fileName}.part`;

    try {
        // pipeline (unlike .pipe) propagates source errors, e.g. a dropped connection
        await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmpName));
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

    // embed the icon as artwork
    if (iconFilePath && fs.existsSync(iconFilePath)) {
        tags.APIC = iconFilePath;
    }

    NodeID3.write(tags, trackFileName);
}

/**
 * Builds a track's base file name (without extension), e.g. "01. Title".
 *
 * The number is the running track number, unless the track has an
 * overlayLabel or overlayLabelOverride (the latter wins).
 *
 * @param {number} trackNumber Running (1-based) track number on the card
 * @param {object} track Track data (title, overlayLabel, overlayLabelOverride)
 *
 * @returns {string} Base file name
 */
export function trackBaseName(trackNumber, track) {
    let label = String(trackNumber);

    if (track.overlayLabel) {
        label = track.overlayLabel;
    }

    if (track.overlayLabelOverride) {
        label = track.overlayLabelOverride;
    }

    return `${label.padStart(2, "0")}. ${track.title}`;
}

/**
 * De-duplicates cards by cardId, keeping the first occurrence.
 *
 * @param {object[]} cards Cards ({ cardId, title })
 *
 * @returns {object[]} De-duplicated cards
 */
export function dedupeCards(cards) {
    const seen = new Set();

    return cards.filter((card) => {
        if (seen.has(card.cardId)) {
            return false;
        }

        seen.add(card.cardId);

        return true;
    });
}

/**
 * Compares online cards against downloaded cards.
 *
 * A downloaded card matches an online card if their cardIds match, or - when
 * no cardId is available on disk - if the sanitized online title matches the
 * downloaded directory name.
 *
 * @param {object[]} onlineCards Online cards ({ cardId, title })
 * @param {object[]} downloadedCards Downloaded cards ({ cardId, title, dirName })
 * @param {Function} sanitize Title-to-directory-name function
 *
 * @returns {object} { added: online but not downloaded, removed: downloaded but not online }
 */
export function compareCards(onlineCards, downloadedCards, sanitize) {
    const downloadedById = new Map();
    const downloadedByDir = new Map();

    for (const card of downloadedCards) {
        if (card.cardId) {
            downloadedById.set(card.cardId, card);
        }

        downloadedByDir.set(card.dirName, card);
    }

    const matchedDownloaded = new Set();
    const added = [];

    for (const card of onlineCards) {
        const match = downloadedById.get(card.cardId) || downloadedByDir.get(sanitize(card.title));

        if (match) {
            matchedDownloaded.add(match);
        } else {
            added.push(card);
        }
    }

    const removed = downloadedCards.filter((card) => !matchedDownloaded.has(card));

    return { added, removed };
}
