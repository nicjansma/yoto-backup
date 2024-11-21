//
// backup-cards-from-web.js
//
// Backup of your Yoto card content from the web.
//

//
// Imports
//
import fs, { readFileSync } from "fs";
import path from "path";
import chalk from "chalk";
import sanitize from "sanitize-filename";
import { readFile } from "fs/promises";

// local imports
import YotoApi from "./src/yoto-api.js";
import { downloadFile, downloadImage, writeTags } from "./src/utils.js";

//
// Constants
//

//
// Run
//
if (process.argv.length !== 3) {
    console.error("Usage: node backup-cards.js [output directory]");
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

if (!YotoApi.loggedIn()) {
    console.error(chalk.red("Error: Could not login, check config.json"));
    process.exit(1);
}

console.log(chalk.green("✓ config.json read OK"));

// ensure directories exist
let outputDir = path.resolve(process.argv[2]);

if (!fs.existsSync(outputDir)) {
    console.log(chalk.green(`✓ Creating ${outputDir}`));

    fs.mkdirSync(outputDir);
}

console.log(chalk.green("... Fetching My Cards"));

// get My Cards first
let myCards = (await YotoApi.myCards()).cards.map(c => {
    return {
        title: c.title,
        cardId: c.cardId
    };
});

console.log(chalk.green("    ✓ Complete"));

console.log(chalk.green("... Fetching Family Cards"));

// get Family Cards
let familyCards = (await YotoApi.familyCards()).cards.map(c => {
    return {
        title: c.card.title,
        cardId: c.cardId
    };
});

console.log(chalk.green("    ✓ Complete"));

let cards = myCards.concat(familyCards);

let copiedCards  = [];
let completeCards = [];
let missingContentCards = [];

let cardN = 0;

for (let card of cards) {
    cardN++;

    let cardId = card.cardId;

    let missingContent = false;
    let copied = false;

    let title = sanitize(card.title);

    let cardPath = path.join(outputDir, title);

    if (!fs.existsSync(cardPath)) {
        fs.mkdirSync(cardPath);
    }

    let jsonFile = path.join(cardPath, "card.json");

    console.log(`${title} (${cardId}/) (${cardN}/${cards.length})`);

    //
    // card.json
    //
    let cardData = null;

    if (!fs.existsSync(jsonFile)) {
        console.log(`  ${chalk.yellow("…")} JSON data`);

        cardData = await YotoApi.card(cardId);

        // write the card.json
        fs.writeFileSync(jsonFile, JSON.stringify(cardData));

        copied = true;
    } else {
        console.log(`  ${chalk.green("✓")} JSON data`);

        cardData = JSON.parse(readFileSync(jsonFile, "utf-8"));
    }

    //
    // album art
    //
    if (cardData.card.content.cover && cardData.card.content.cover.imageL) {
        let cardImagePath = path.join(cardPath, "cover.jpg");

        if (!fs.existsSync(cardImagePath)) {
            console.log(`  ${chalk.yellow("…")} Album Art: ${cardData.card.content.cover.imageL} (${cardImagePath})`);

            await downloadImage(cardData.card.content.cover.imageL, cardImagePath);

            copied = true;
        } else {
            console.log(`  ${chalk.green("✓")} Album Art: ${cardData.card.content.cover.imageL}`);
        }
    }

    //
    // chapters and tracks
    //
    let trackNumber = 0;

    for (let c in cardData.card.content.chapters) {
        let chapter = cardData.card.content.chapters[c];

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

            let trackFileName = path.join(cardPath, baseFileName);

            // see if we can download
            if (!fs.existsSync(trackFileName)) {
                // get the signed track URL
                let trackUrl = cardData?.card?.content?.chapters[c]?.tracks[t]?.trackUrl;

                if (trackUrl) {
                    console.log(`  ${chalk.yellow("…")} ${baseFileName} (${track.trackUrl}) - downloading...`);

                    await downloadFile(trackUrl, trackFileName);

                    // write ID3 tags
                    writeTags(cardData, chapter, track, trackFileName);

                    copied = true;
                }
            }

            // does the final track exist?
            if (!fs.existsSync(trackFileName)) {
                console.log(`  ${chalk.red("…")} ${baseFileName} (${track.trackUrl}) - missing`);

                missingContent = true;
            } else {
                console.log(`  ${chalk.green("✓")} ${baseFileName}`);
            }

            // icons
            if (chapter.display && chapter.display.icon16x16) {
                let iconPath = chapter.display.icon16x16;
                let iconFileName = path.join(cardPath, baseIconFileName);

                if (!fs.existsSync(iconFileName)) {
                    console.log(`  ${chalk.yellow("…")} ${iconFileName} - ${iconPath} downloading...`);

                    await downloadImage(iconPath, iconFileName);

                    copied = true;
                }
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
