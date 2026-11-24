//
// backup-cards-from-sd.js
//
// Backup of your Yoto card content from an extracted Yoto player's SD card.
//

//
// Imports
//
import fs from "fs";
import path from "path";
import chalk from "chalk";
import sanitize from "sanitize-filename";
import { readFile } from "fs/promises";

// local imports
import YotoApi from "./src/yoto-api.js";
import { downloadFile, downloadImage, resolveIcon, writeTags } from "./src/utils.js";

//
// Constants
//

//
// Run
//
if (process.argv.length !== 4) {
    console.error("Usage: node backup-cards.js [input directory] [output directory]");
    process.exit(1);
}

let config = null;

// load config.json
if (fs.existsSync("config.json")) {
    config = JSON.parse(
        await readFile(
            new URL("./config.json", import.meta.url)
        )
    );
}

// login to Yoto if credentials are specified
if (config && config.userName && config.password) {
    await YotoApi.login(config);
} else {
    console.log(chalk.yellow("Warning: No login credentials specified in config.json"));
}

// ensure directories exist
let inputDir = path.resolve(process.argv[2]);
let outputDir = path.resolve(process.argv[3]);

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

if (!fs.existsSync(inputDir)) {
    console.error(`${inputDir} does not exist!`);
    process.exit(1);
}

let dirs = fs.readdirSync(inputDir);

let copiedCards  = [];
let completeCards = [];
let missingContentCards = [];

let dirN = 0;

// loop through all input directories from the SD card
for (let dir of dirs) {
    dirN++;

    let missingContent = false;
    let copied = false;
    let cardData = null;

    let fullDir = path.join(inputDir, dir);

    // only look at directories
    if (!fs.statSync(fullDir).isDirectory()) {
        continue;
    }

    // read the JSON file (named same as the directory)
    let jsonFile = path.join(fullDir, dir);

    if (!fs.existsSync(jsonFile)) {
        console.error(`${jsonFile} does not exist!`);

        continue;
    }

    let contents = fs.readFileSync(jsonFile, "utf-8");
    let json = JSON.parse(contents);

    // get the title and output path
    let title = sanitize(json.card.title);
    let outputPath = path.join(outputDir, title);

    console.log(`${title} (${dir}/) (${dirN}/${dirs.length})`);

    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath);
    }

    //
    // card.json
    //
    let outputJsonFile = path.join(outputPath, "card.json");

    if (!fs.existsSync(outputJsonFile)) {
        console.log(`  ${chalk.yellow("…")} JSON data`);

        fs.copyFileSync(jsonFile, outputJsonFile);

        copied = true;
    } else {
        console.log(`  ${chalk.green("✓")} JSON data`);
    }

    //
    // album art
    //
    if (json.card.content.cover && json.card.content.cover.imageL) {
        let cardImagePath = path.join(outputPath, "cover.jpg");

        if (!fs.existsSync(cardImagePath)) {
            console.log(`  ${chalk.yellow("…")} Album Art: ${json.card.content.cover.imageL} (${cardImagePath})`);

            await downloadImage(json.card.content.cover.imageL, cardImagePath);

            copied = true;
        } else {
            console.log(`  ${chalk.green("✓")} Album Art: ${json.card.content.cover.imageL}`);
        }
    }

    //
    // chapters and tracks
    //
    let trackNumber = 0;

    for (let c in json.card.content.chapters) {
        let chapter = json.card.content.chapters[c];

        // each chapter can have multiple tracks
        for (let t in chapter.tracks) {
            trackNumber++;

            let track = chapter.tracks[t];

            // streams aren't downloadable
            if (track.type === "stream") {
                console.log(`  ${chalk.green("✓")} Skipping stream...`);
                continue;
            }

            track.title = track.title.trim();

            // file name on SD card
            let origFileName = path.join(fullDir, track.trackUrl.replace("yoto:#", ""));

            // file name in output directory
            let baseFileName = `${(trackNumber + "").padStart(2, "0")}. ${track.title}`;

            if (track.overlayLabel) {
                baseFileName = `${track.overlayLabel.padStart(2, "0")}. ${track.title}`;
            }

            if (track.overlayLabelOverride) {
                baseFileName = `${track.overlayLabelOverride.padStart(2, "0")}. ${track.title}`;
            }

            // icon for the track
            let baseIconFileName = sanitize(`${baseFileName}.jpg`);

            baseFileName = sanitize(`${baseFileName}.mp3`);

            let trackFileName = path.join(outputPath, baseFileName);

            // icons — fetched before the track so the artwork can be embedded in its tags
            let iconFileName = null;

            if (chapter.display && chapter.display.icon16x16) {
                let { url: iconSrc, id: iconId } = resolveIcon(chapter.display.icon16x16);

                // only "yoto:#<hash>" icons can be on the SD card
                let origIconFileName = iconId ? path.join(fullDir, iconId) : null;

                iconFileName = path.join(outputPath, baseIconFileName);

                if (origIconFileName && fs.existsSync(origIconFileName) && !fs.existsSync(iconFileName)) {
                    fs.copyFileSync(origIconFileName, iconFileName);

                    copied = true;
                } else if (!fs.existsSync(iconFileName)) {
                    // an icon failure shouldn't stop the track (or the rest of the backup)
                    try {
                        await downloadImage(iconSrc, iconFileName);

                        copied = true;
                    } catch (error) {
                        console.log(`  ${chalk.red("…")} ${baseIconFileName} - icon download failed: ${error.message}`);

                        iconFileName = null;
                    }
                }
            }

            // see if we can download
            if (!fs.existsSync(trackFileName) && !fs.existsSync(origFileName) && YotoApi.loggedIn()) {
                if (!cardData) {
                    cardData = await YotoApi.card(dir);
                }

                // get the signed track URL
                let trackUrl = cardData?.card?.content?.chapters[c]?.tracks[t]?.trackUrl;

                if (trackUrl) {
                    console.log(`  ${chalk.yellow("…")} ${baseFileName} (${track.trackUrl}) - downloading...`);

                    // a failed track is reported as missing below, rather than aborting the run
                    try {
                        await downloadFile(trackUrl, trackFileName);

                        // write ID3 tags
                        writeTags(json, chapter, track, trackFileName, iconFileName);

                        copied = true;
                    } catch (error) {
                        console.log(`  ${chalk.red("…")} ${baseFileName} - download failed: ${error.message}`);
                    }
                }
            }

            // does the final track exist?
            if (!fs.existsSync(trackFileName) && !fs.existsSync(origFileName)) {
                console.log(`  ${chalk.red("…")} ${baseFileName} (${track.trackUrl}) - missing`);

                missingContent = true;
            } else if (!fs.existsSync(trackFileName)) {
                console.log(`  ${chalk.yellow("…")} ${baseFileName} (${track.trackUrl})`);

                fs.copyFileSync(origFileName, trackFileName);

                copied = true;

                // write ID3 tags
                writeTags(json, chapter, track, trackFileName, iconFileName);
            } else {
                console.log(`  ${chalk.green("✓")} ${baseFileName}`);
            }
        }
    }

    completeCards.push(title);

    if (copied) {
        copiedCards.push(title);
    }

    if (missingContent) {
        missingContentCards.push(title);
    }
}

//
// Summary
//
console.log();
console.log("--- Summary ---");
console.log(`Total cards:        ${completeCards.length}`);
console.log(`Copied new content: ${copiedCards.length}`);
console.log(`Missing content:    ${missingContentCards.length}`);
