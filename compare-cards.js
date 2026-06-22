//
// compare-cards.js
//
// Compares the online list of owned Yoto cards against the cards in the
// downloaded library and shows which cards have been added or removed.
//

//
// Imports
//
import fs, { readFileSync } from "fs";
import path from "path";
import chalk from "chalk";
import sanitize from "sanitize-filename";

// local imports
import YotoApi from "./src/yoto-api.js";

//
// Constants
//

//
// Run
//
if (process.argv.length !== 3) {
    console.error("Usage: node compare-cards.js [library directory]");
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

// ensure the library directory exists
let libraryDir = path.resolve(process.argv[2]);

if (!fs.existsSync(libraryDir)) {
    console.error(chalk.red(`Error: Library directory does not exist: ${libraryDir}`));

    process.exit(1);
}

//
// Fetch the online cards (My Cards + Family Cards)
//
console.log(chalk.green("... Fetching My Cards"));

let yotoCallback = await YotoApi.myCards();

if (!yotoCallback || !yotoCallback.cards) {
    console.error(chalk.red("Error: Could not fetch My Cards"));

    console.log(yotoCallback);

    process.exit(1);
}

let myCards = yotoCallback.cards.map(c => {
    return {
        title: c.title,
        cardId: c.cardId
    };
});

console.log(chalk.green("    ✓ Complete"));

console.log(chalk.green("... Fetching Family Cards"));

let familyCards = (await YotoApi.familyCards()).cards.map(c => {
    return {
        title: c.card.title,
        cardId: c.cardId
    };
});

console.log(chalk.green("    ✓ Complete"));

// de-duplicate online cards by cardId (a card can appear in both lists)
let onlineCards = [];
let onlineSeen = new Set();

for (let card of myCards.concat(familyCards)) {
    if (!onlineSeen.has(card.cardId)) {
        onlineSeen.add(card.cardId);

        onlineCards.push(card);
    }
}

//
// Read the downloaded library
//
console.log(chalk.green(`... Reading downloaded library (${libraryDir})`));

let downloadedCards = [];

for (let entry of fs.readdirSync(libraryDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
        continue;
    }

    let cardPath = path.join(libraryDir, entry.name);
    let jsonFile = path.join(cardPath, "card.json");

    let cardId = null;
    let title = entry.name;

    // prefer the cardId / title from card.json, fall back to the directory name
    if (fs.existsSync(jsonFile)) {
        try {
            let cardData = JSON.parse(readFileSync(jsonFile, "utf-8"));

            cardId = cardData?.card?.cardId || cardData?.cardId || null;
            title = cardData?.card?.title || title;
        } catch (e) {
            console.log(chalk.yellow(`    ! Could not parse ${jsonFile}: ${e.message}`));
        }
    }

    downloadedCards.push({
        cardId: cardId,
        title: title,
        dirName: entry.name
    });
}

console.log(chalk.green(`    ✓ Found ${downloadedCards.length} downloaded card(s)`));

//
// Compare
//
// A downloaded card matches an online card if their cardIds match, or - when
// no cardId is available on disk - if the sanitized online title matches the
// downloaded directory name.
//
let downloadedById = new Map();
let downloadedByDir = new Map();

for (let card of downloadedCards) {
    if (card.cardId) {
        downloadedById.set(card.cardId, card);
    }

    downloadedByDir.set(card.dirName, card);
}

let matchedDownloaded = new Set();

// added = online but not in the downloaded library
let added = [];

for (let card of onlineCards) {
    let match = downloadedById.get(card.cardId);

    if (!match) {
        match = downloadedByDir.get(sanitize(card.title));
    }

    if (match) {
        matchedDownloaded.add(match);
    } else {
        added.push(card);
    }
}

// removed = downloaded but no longer online
let removed = downloadedCards.filter(card => !matchedDownloaded.has(card));

//
// Results
//
console.log();
console.log(chalk.bold("--- Added (online, not yet downloaded) ---"));

if (added.length === 0) {
    console.log(chalk.gray("  (none)"));
} else {
    for (let card of added) {
        console.log(chalk.green(`  + ${card.title} (${card.cardId})`));
    }
}

console.log();
console.log(chalk.bold("--- Removed (downloaded, no longer online) ---"));

if (removed.length === 0) {
    console.log(chalk.gray("  (none)"));
} else {
    for (let card of removed) {
        console.log(chalk.red(`  - ${card.title}${card.cardId ? ` (${card.cardId})` : ""}`));
    }
}

//
// Summary
//
console.log();
console.log("--- Summary ---");
console.log(`Online cards:     ${onlineCards.length}`);
console.log(`Downloaded cards: ${downloadedCards.length}`);
console.log(`Added:            ${added.length}`);
console.log(`Removed:          ${removed.length}`);
