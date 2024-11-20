//
// Imports
//
import constants from "./constants.js";

//
// Locals
//
let accessToken = null;

export function loggedIn() {
    return accessToken !== null;
}

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
            accessToken = data.access_token;
        });
}

export async function myCards() {
    if (!accessToken) {
        throw new Error("YotoAPI: Not yet logged in");
    }

    return fetch(
        `${constants.BASE_URL}/card/mine`,
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

export default {
    login: login,
    card: card,
    myCards: myCards,
    familyCards: familyCards,
    loggedIn: loggedIn
};
