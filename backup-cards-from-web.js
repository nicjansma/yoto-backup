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

if (!fs.existsSync("device-auth.json")) {
    console.error(chalk.red("Error: No device-auth.json file found, please run login.js first"));

    process.exit(1);
}

// login to Yoto from device-auth.json
let deviceAuth = await YotoApi.loginFromFile("device-auth.json");

if (!deviceAuth) {
    console.error(chalk.red("Error: device-auth.json could not be read, please run login.js first"));

    process.exit(1);
}

// check for token expiry
if (YotoApi.isTokenExpired(deviceAuth.access_token)) {
    console.log(chalk.yellow("Info: Access token expired, refreshing..."));

    let refreshedAuth = await YotoApi.refreshAccessToken(config, deviceAuth.refresh_token);

    if (!refreshedAuth) {
        console.error(chalk.red("Error: Could not refresh access token, please run login.js again"));

        process.exit(1);
    }

    // merge refreshed auth data
    deviceAuth = Object.assign(deviceAuth, refreshedAuth);

    // write updated auth data to device-auth.json
    fs.writeFileSync("device-auth.json", JSON.stringify(deviceAuth, null, 4));

    console.log(chalk.green("✓ Access token refreshed"));
}

if (!YotoApi.loggedIn()) {
    console.error(chalk.red("Error: Could not login, run login.js"));

    process.exit(1);
}

console.log(chalk.green("✓ device-auth.json read OK"));

// ensure directories exist
let outputDir = path.resolve(process.argv[2]);

if (!fs.existsSync(outputDir)) {
    console.log(chalk.green(`✓ Creating ${outputDir}`));

    fs.mkdirSync(outputDir);
}

console.log(chalk.green("... Fetching My Cards"));

let yotoCallback = await YotoApi.myCards();

if (!yotoCallback || !yotoCallback.cards) {
    console.error(chalk.red("Error: Could not fetch My Cards"));

    console.log(yotoCallback);

    process.exit(1);
}

// get My Cards first
let myCards = yotoCallback.cards.map(c => {
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
    let freshCardDataFetched = false;

    if (!fs.existsSync(jsonFile)) {
        console.log(`  ${chalk.yellow("…")} JSON data`);

        cardData = await YotoApi.card(cardId);

        // write the card.json
        fs.writeFileSync(jsonFile, JSON.stringify(cardData));

        freshCardDataFetched = true;
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
                // we may need new card data for this run
                if (!freshCardDataFetched) {
                    console.log(`  ${chalk.yellow("…")} JSON data`);

                    cardData = await YotoApi.card(cardId);

                    // write the card.json
                    fs.writeFileSync(jsonFile, JSON.stringify(cardData));

                    freshCardDataFetched = true;
                    copied = true;
                }

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
