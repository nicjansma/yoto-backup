//
// login.js
//
// Logs into Yoto and verifies credentials
//

//
// Imports
//
import fs from "fs";
import chalk from "chalk";
import { readFile } from "fs/promises";

// local imports
import YotoApi from "./src/yoto-api.js";

//
// Constants
//

//
// Run
//
if (process.argv.length !== 2) {
    console.error("Usage: node login.js");
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
if (!config || !config.userName || !config.password) {
    console.log(chalk.yellow("Warning: No login credentials specified in config.json"));

    process.exit(1);
}

let auth = await YotoApi.deviceAuth(config);

if (!auth) {
    console.error(chalk.red("Error: Could not login, check config.json"));

    process.exit(1);
}

// write auth data to device-auth.json
fs.writeFileSync("device-auth.json", JSON.stringify(auth, null, 4));

console.log(`Please head to ${chalk.cyan(auth.verification_uri_complete)} to authorize this application.`);
console.log("Waiting for authorization...");

let pollInterval = auth.interval * 1000;

let attempt = 0;
let accessToken = false;

while (attempt < 60) {
    attempt++;

    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    accessToken = await YotoApi.getAccessToken(config, auth.device_code);

    if (accessToken !== null) {
        break;
    }
}

if (attempt === 60 || accessToken === null) {
    console.error(chalk.red("Error: Login timed out, please try again."));

    process.exit(1);
}

auth = Object.assign(auth, accessToken);

// write auth data to device-auth.json with new auth data
fs.writeFileSync("device-auth.json", JSON.stringify(auth, null, 4));

console.log(chalk.green("✓ Login successful"));
