/* eslint camelcase: [ "error", { properties: "never" } ] */

//
// Imports
//
import fs from "fs";
import constants from "./constants.js";

//
// Locals
//
let accessToken = null;

/**
 * Returns whether the user is logged in.
 *
 * @returns {boolean} Logged in
 */
export function loggedIn() {
    return accessToken !== null;
}

/**
 * Logs in using auth data from a file.
 *
 * @param {string} authFile Auth file path
 *
 * @returns {object} Auth data
 */
export async function loginFromFile(authFile) {
    let authData = JSON.parse(
        fs.readFileSync(authFile, "utf-8")
    );

    accessToken = authData.access_token;

    return authData;
}

/**
 * Logs in using a config object.
 *
 * @param {object} config Config object
 *
 * @returns {object} Auth data
 */
export async function login(config) {
    return fetch(
        `${constants.BASE_URL}/auth/token`,
        {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                "username": config.userName,
                "password": config.password,
                "grant_type": "password",
                "audience": constants.BASE_URL,
                "client_id": config.clientId,
                "scope": "user-cards users yoto-cards-read offline_access"
            }).toString()
        })
        .then((response) => response.json())
        .then((data) => {
            if (data && data.error) {
                throw new Error(`YotoAPI: Login failed: ${data.error_description}`);
            }

            accessToken = data.access_token;

            return data;
        });
}

/**
 * Initiates device authorization.
 *
 * @param {object} config Config object
 *
 * @returns {object} Auth data
 */
export async function deviceAuth(config) {
    return fetch(
        `${constants.DEVICE_AUTH_URL}`,
        {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                client_id: config.clientId,
                scope: "profile offline_access",
                audience: constants.BASE_URL
            })
        })
        .then((response) => response.json())
        .then((data) => {
            if (!data || data.error) {
                throw new Error(`YotoAPI: Login failed: ${data ? data.error_description : "Unknown error"}`);
            }

            return data;
        });
}

/**
 * Gets an access token using a device code.
 *
 * @param {object} config Config object
 * @param {string} deviceCode Device code
 *
 * @returns {object} Auth data
 */
export async function getAccessToken(config, deviceCode) {
    return fetch(
        `${constants.DEVICE_TOKEN_URL}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: deviceCode,
                client_id: config.clientId,
                audience: constants.BASE_URL
            })
        })
        .then((response) => response.json())
        .then((data) => {
            if (!data || data.error) {
                if (data.error === "authorization_pending") {
                    // User hasn't completed authorization yet, wait and continue polling
                    return null;
                }

                throw new Error(`YotoAPI: Token request failed: ${data ? data.error_description : "Unknown error"}`);
            }

            accessToken = data.access_token;

            return data;
        });
}

/**
 * Decodes a JWT token.
 *
 * @param {string} token JWT token
 *
 * @returns {object} Decoded token
 */
function decodeJwt(token) {
    const base64Url = token.split(".")[1];

    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");

    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");

    return JSON.parse(jsonPayload);
}

/**
 * Returns whether a token is expired.
 *
 * @param {string} token JWT token
 *
 * @returns {boolean} Token expired
 */
export function isTokenExpired(token) {
    try {
        const decoded = decodeJwt(token);

        // console.log(`Decoded token exp: ${decoded.exp * 1000}, now: ${Date.now() + 30000}`);

        // exp is in seconds, Date.now() is in milliseconds
        // Add a 30-second buffer to refresh before it actually expires
        return (decoded.exp * 1000) < (Date.now() + 30000);
    } catch (error) {
        throw new Error("YotoAPI: Unable to decode access token");
    }
}

/**
 * Refreshes an access token using a refresh token.
 *
 * @param {object} config Config object
 * @param {string} refreshToken Refresh token
 *
 * @returns {object} Auth data
 */
export async function refreshAccessToken(config, refreshToken) {
    return fetch(
        `${constants.DEVICE_TOKEN_URL}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                client_id: config.clientId,
                refresh_token: refreshToken
            })
        })
        .then((response) => response.json())
        .then((data) => {
            if (!data || data.error) {
                throw new Error(`YotoAPI: Token refresh failed: ${data ? data.error_description : "Unknown error"}`);
            }

            accessToken = data.access_token;

            return data;
        });
}

/**
 * Fetches the user's cards.
 *
 * @returns {object} Cards data
 */
export async function myCards() {
    if (!accessToken) {
        throw new Error("YotoAPI: Not yet logged in");
    }

    return fetch(
        `${constants.BASE_URL}/content/mine`,
        {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`
            }
        })
        .then((response) => response.json())
        .then((data) => {
            return data;
        });
}

/**
 * Fetches the user's family cards.
 *
 * @returns {object} Cards data
 */
export async function familyCards() {
    if (!accessToken) {
        throw new Error("YotoAPI: Not yet logged in");
    }

    return fetch(
        `${constants.BASE_URL}/card/family/library`,
        {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`
            }
        })
        .then((response) => response.json())
        .then((data) => {
            return data;
        });
}

/**
 * Fetches a card by ID.
 *
 * @param {string} cardId Card ID
 *
 * @returns {object} Card data
 */
export async function card(cardId) {
    if (!accessToken) {
        throw new Error("YotoAPI: Not yet logged in");
    }

    return fetch(
        `${constants.BASE_URL}/card/${cardId}`,
        {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`
            }
        })
        .then((response) => response.json())
        .then((data) => {
            return data;
        });
}

//
// Exports
//
export default {
    login: login,
    card: card,
    myCards: myCards,
    familyCards: familyCards,
    loggedIn: loggedIn,
    deviceAuth: deviceAuth,
    getAccessToken: getAccessToken,
    isTokenExpired: isTokenExpired,
    refreshAccessToken: refreshAccessToken,
    loginFromFile: loginFromFile
};
