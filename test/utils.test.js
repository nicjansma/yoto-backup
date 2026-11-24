//
// Imports
//
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import NodeID3 from "node-id3";
import download from "image-downloader";
import sanitize from "sanitize-filename";

// local imports
import constants from "../src/constants.js";
import {
    compareCards,
    dedupeCards,
    downloadFile,
    downloadImage,
    resolveIcon,
    trackBaseName,
    writeTags
} from "../src/utils.js";

//
// Helpers
//

/**
 * Creates a fetch Response whose body streams the given chunks.
 *
 * @param {string[]} chunks Body chunks
 * @param {Error} [error] Error to raise after the chunks, simulating a dropped connection
 *
 * @returns {Response} Response
 */
function streamResponse(chunks, error) {
    const body = new ReadableStream({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(new TextEncoder().encode(chunk));
            }

            if (error) {
                controller.error(error);
            } else {
                controller.close();
            }
        }
    });

    return new Response(body, { status: 200 });
}

//
// Tests
//
describe("resolveIcon", () => {
    it("returns full http(s) URLs as-is with no id", () => {
        assert.deepEqual(resolveIcon("https://example.com/icon.png"), {
            url: "https://example.com/icon.png",
            id: null
        });

        assert.deepEqual(resolveIcon("HTTP://example.com/a"), {
            url: "HTTP://example.com/a",
            id: null
        });
    });

    it("resolves yoto:# URIs under ICON_URL", () => {
        assert.deepEqual(resolveIcon("yoto:#abc123"), {
            url: `${constants.ICON_URL}abc123`,
            id: "abc123"
        });
    });

    it("treats a bare hash as an icon id", () => {
        assert.deepEqual(resolveIcon("abc123"), {
            url: `${constants.ICON_URL}abc123`,
            id: "abc123"
        });
    });

    it("coerces non-string values", () => {
        assert.equal(resolveIcon(42).id, "42");
    });
});

describe("trackBaseName", () => {
    it("zero-pads the running track number", () => {
        assert.equal(trackBaseName(3, { title: "Song" }), "03. Song");
        assert.equal(trackBaseName(12, { title: "Song" }), "12. Song");
        assert.equal(trackBaseName(123, { title: "Song" }), "123. Song");
    });

    it("prefers overlayLabel over the track number", () => {
        assert.equal(trackBaseName(3, { title: "Song", overlayLabel: "7" }), "07. Song");
    });

    it("prefers overlayLabelOverride over overlayLabel", () => {
        assert.equal(
            trackBaseName(3, { title: "Song", overlayLabel: "7", overlayLabelOverride: "A" }),
            "0A. Song");
    });

    it("ignores empty labels", () => {
        assert.equal(
            trackBaseName(4, { title: "Song", overlayLabel: "", overlayLabelOverride: "" }),
            "04. Song");
    });
});

describe("dedupeCards", () => {
    it("keeps the first card for each cardId, preserving order", () => {
        const cards = [
            { cardId: "a", title: "A1" },
            { cardId: "b", title: "B" },
            { cardId: "a", title: "A2" },
            { cardId: "c", title: "C" }
        ];

        assert.deepEqual(dedupeCards(cards), [
            { cardId: "a", title: "A1" },
            { cardId: "b", title: "B" },
            { cardId: "c", title: "C" }
        ]);
    });

    it("handles an empty list", () => {
        assert.deepEqual(dedupeCards([]), []);
    });
});

describe("compareCards", () => {
    it("matches by cardId even when titles differ", () => {
        const online = [{ cardId: "a", title: "New Title" }];
        const downloaded = [{ cardId: "a", title: "Old Title", dirName: "Old Title" }];

        assert.deepEqual(compareCards(online, downloaded, sanitize), { added: [], removed: [] });
    });

    it("falls back to the sanitized title matching the directory name", () => {
        const online = [{ cardId: "a", title: "What? A: Story" }];
        const downloaded = [{ cardId: null, title: "x", dirName: sanitize("What? A: Story") }];

        assert.deepEqual(compareCards(online, downloaded, sanitize), { added: [], removed: [] });
    });

    it("reports added and removed cards", () => {
        const online = [
            { cardId: "a", title: "A" },
            { cardId: "b", title: "B" }
        ];
        const downloaded = [
            { cardId: "a", title: "A", dirName: "A" },
            { cardId: "z", title: "Z", dirName: "Z" },
            { cardId: null, title: "Orphan", dirName: "Orphan" }
        ];

        const { added, removed } = compareCards(online, downloaded, sanitize);

        assert.deepEqual(added, [{ cardId: "b", title: "B" }]);
        assert.deepEqual(removed, [downloaded[1], downloaded[2]]);
    });

    it("handles empty inputs", () => {
        assert.deepEqual(compareCards([], [], sanitize), { added: [], removed: [] });
    });
});

describe("downloadImage", () => {
    afterEach(() => mock.restoreAll());

    it("downloads to the exact destination path", async() => {
        const image = mock.method(download, "image", async(opts) => ({ filename: opts.dest }));

        const result = await downloadImage("https://example.com/a.jpg", "/out/cover.jpg");

        assert.equal(image.mock.callCount(), 1);
        assert.deepEqual(image.mock.calls[0].arguments[0], {
            url: "https://example.com/a.jpg",
            dest: "/out/cover.jpg",
            extractFilename: false
        });
        assert.deepEqual(result, { filename: "/out/cover.jpg" });
    });
});

describe("downloadFile", () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yoto-backup-test-"));
    });

    afterEach(() => {
        mock.restoreAll();

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("writes the response body to the file", async() => {
        const fetchMock = mock.method(globalThis, "fetch", async() => streamResponse(["hello ", "world"]));
        const file = path.join(tmpDir, "track.mp3");

        await downloadFile("https://example.com/track", file);

        assert.equal(fetchMock.mock.calls[0].arguments[0], "https://example.com/track");
        assert.equal(fs.readFileSync(file, "utf-8"), "hello world");
        assert.equal(fs.existsSync(`${file}.part`), false);
    });

    it("throws on a non-OK response without creating a file", async() => {
        mock.method(globalThis, "fetch", async() =>
            new Response("denied", { status: 403, statusText: "Forbidden" }));
        const file = path.join(tmpDir, "track.mp3");

        await assert.rejects(downloadFile("https://example.com/track", file), /HTTP 403 Forbidden/);

        assert.equal(fs.existsSync(file), false);
        assert.equal(fs.existsSync(`${file}.part`), false);
    });

    it("removes the partial file when the stream fails", async() => {
        mock.method(globalThis, "fetch", async() =>
            streamResponse(["partial"], new Error("connection reset")));
        const file = path.join(tmpDir, "track.mp3");

        await assert.rejects(downloadFile("https://example.com/track", file), /connection reset/);

        assert.equal(fs.existsSync(file), false);
        assert.equal(fs.existsSync(`${file}.part`), false);
    });
});

describe("writeTags", () => {
    let tmpDir;
    let write;

    const json = {
        card: {
            title: "Album",
            metadata: { author: "Author" }
        }
    };

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yoto-backup-test-"));
        write = mock.method(NodeID3, "write", () => true);
    });

    afterEach(() => {
        mock.restoreAll();

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("writes title, artist and album", () => {
        writeTags(json, { title: "Chapter" }, { key: "01" }, "track.mp3");

        assert.equal(write.mock.callCount(), 1);
        assert.deepEqual(write.mock.calls[0].arguments, [
            { title: "Chapter", artist: "Author", album: "Album" },
            "track.mp3"
        ]);
    });

    it("writes the track number when the track has an overlayLabel", () => {
        writeTags(json, { title: "Chapter" }, { key: "05", overlayLabel: "5" }, "track.mp3");

        assert.equal(write.mock.calls[0].arguments[0].TRCK, "05");
    });

    it("embeds the icon as artwork when it exists", () => {
        const icon = path.join(tmpDir, "icon.jpg");

        fs.writeFileSync(icon, "jpg");

        writeTags(json, { title: "Chapter" }, {}, "track.mp3", icon);

        assert.equal(write.mock.calls[0].arguments[0].APIC, icon);
    });

    it("skips artwork when the icon file is missing", () => {
        writeTags(json, { title: "Chapter" }, {}, "track.mp3", path.join(tmpDir, "missing.jpg"));

        assert.equal("APIC" in write.mock.calls[0].arguments[0], false);
    });
});
