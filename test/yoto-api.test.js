/* eslint camelcase: [ "error", { properties: "never" } ] */

//
// Imports
//
import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

// local imports
import constants from "../src/constants.js";
import YotoApi from "../src/yoto-api.js";

//
// Helpers
//

/**
 * Mocks global fetch to respond with JSON.
 *
 * @param {*} data JSON response data
 *
 * @returns {object} Mock function
 */
function mockFetchJson(data) {
    return mock.method(globalThis, "fetch", async() => new Response(JSON.stringify(data)));
}

/**
 * Builds an (unsigned) JWT with the given payload.
 *
 * @param {object} payload Payload
 *
 * @returns {string} JWT
 */
function makeJwt(payload) {
    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

    return `${encode({ alg: "none" })}.${encode(payload)}.sig`;
}

/**
 * Returns the URLSearchParams sent as a fetch body.
 *
 * @param {object} fetchMock Mock fetch
 *
 * @returns {URLSearchParams} Body params
 */
function sentParams(fetchMock) {
    return new URLSearchParams(String(fetchMock.mock.calls[0].arguments[1].body));
}

const config = { clientId: "client-1", userName: "user", password: "pass" };

//
// Tests
//
// Note: the module keeps the access token as module state, so the "not logged
// in" tests must run before anything logs in.
//
afterEach(() => mock.restoreAll());

describe("before login", () => {
    it("loggedIn() is false", () => {
        assert.equal(YotoApi.loggedIn(), false);
    });

    for (const method of ["myCards", "familyCards", "card"]) {
        it(`${method}() rejects without calling fetch`, async() => {
            const fetchMock = mockFetchJson({});

            await assert.rejects(YotoApi[method]("id"), /Not yet logged in/);

            assert.equal(fetchMock.mock.callCount(), 0);
        });
    }
});

describe("deviceAuth", () => {
    it("posts the client ID and returns the device code data", async() => {
        const data = { device_code: "dc", verification_uri_complete: "https://x", interval: 5 };
        const fetchMock = mockFetchJson(data);

        assert.deepEqual(await YotoApi.deviceAuth(config), data);

        const [url, opts] = fetchMock.mock.calls[0].arguments;

        assert.equal(url, constants.DEVICE_AUTH_URL);
        assert.equal(opts.method, "POST");

        const params = sentParams(fetchMock);

        assert.equal(params.get("client_id"), "client-1");
        assert.equal(params.get("audience"), constants.BASE_URL);
        assert.equal(params.get("scope"), "offline_access");
    });

    it("throws on an error response", async() => {
        mockFetchJson({ error: "invalid_client", error_description: "Bad client" });

        await assert.rejects(YotoApi.deviceAuth(config), /Login failed: Bad client/);
    });

    it("throws on an empty response", async() => {
        mockFetchJson(null);

        await assert.rejects(YotoApi.deviceAuth(config), /Login failed: Unknown error/);
    });

    it("does not log in", () => {
        assert.equal(YotoApi.loggedIn(), false);
    });
});

describe("getAccessToken", () => {
    it("returns null while authorization is pending", async() => {
        mockFetchJson({ error: "authorization_pending" });

        assert.equal(await YotoApi.getAccessToken(config, "dc"), null);
        assert.equal(YotoApi.loggedIn(), false);
    });

    it("throws on other errors", async() => {
        mockFetchJson({ error: "expired_token", error_description: "Expired" });

        await assert.rejects(YotoApi.getAccessToken(config, "dc"), /Token request failed: Expired/);
    });

    it("throws on an empty response", async() => {
        mockFetchJson(null);

        await assert.rejects(YotoApi.getAccessToken(config, "dc"), /Token request failed: Unknown error/);
    });

    it("posts the device code and logs in", async() => {
        const data = { access_token: "at-device", refresh_token: "rt" };
        const fetchMock = mockFetchJson(data);

        assert.deepEqual(await YotoApi.getAccessToken(config, "dc"), data);

        assert.equal(fetchMock.mock.calls[0].arguments[0], constants.DEVICE_TOKEN_URL);

        const params = sentParams(fetchMock);

        assert.equal(params.get("grant_type"), "urn:ietf:params:oauth:grant-type:device_code");
        assert.equal(params.get("device_code"), "dc");
        assert.equal(params.get("client_id"), "client-1");

        assert.equal(YotoApi.loggedIn(), true);
    });
});

describe("login", () => {
    it("posts credentials and uses the returned token", async() => {
        const fetchMock = mockFetchJson({ access_token: "at-login" });

        assert.deepEqual(await YotoApi.login(config), { access_token: "at-login" });

        assert.equal(fetchMock.mock.calls[0].arguments[0], `${constants.BASE_URL}/auth/token`);

        const params = sentParams(fetchMock);

        assert.equal(params.get("username"), "user");
        assert.equal(params.get("password"), "pass");
        assert.equal(params.get("grant_type"), "password");
        assert.equal(params.get("client_id"), "client-1");

        // the new token is used for API calls
        const cardFetch = mockFetchJson({});

        await YotoApi.card("x");

        assert.equal(cardFetch.mock.calls[0].arguments[1].headers.Authorization, "Bearer at-login");
    });

    it("throws on an error response", async() => {
        mockFetchJson({ error: "invalid_grant", error_description: "Wrong password" });

        await assert.rejects(YotoApi.login(config), /Login failed: Wrong password/);
    });
});

describe("refreshAccessToken", () => {
    it("posts the refresh token and uses the new token", async() => {
        const fetchMock = mockFetchJson({ access_token: "at-refreshed" });

        assert.deepEqual(await YotoApi.refreshAccessToken(config, "rt"), { access_token: "at-refreshed" });

        assert.equal(fetchMock.mock.calls[0].arguments[0], constants.DEVICE_TOKEN_URL);

        const params = sentParams(fetchMock);

        assert.equal(params.get("grant_type"), "refresh_token");
        assert.equal(params.get("refresh_token"), "rt");
        assert.equal(params.get("client_id"), "client-1");

        const cardFetch = mockFetchJson({});

        await YotoApi.myCards();

        assert.equal(cardFetch.mock.calls[0].arguments[1].headers.Authorization, "Bearer at-refreshed");
    });

    it("throws on an error response", async() => {
        mockFetchJson({ error: "invalid_grant", error_description: "Revoked" });

        await assert.rejects(YotoApi.refreshAccessToken(config, "rt"), /Token refresh failed: Revoked/);
    });

    it("throws on an empty response", async() => {
        mockFetchJson(null);

        await assert.rejects(YotoApi.refreshAccessToken(config, "rt"), /Token refresh failed: Unknown error/);
    });
});

describe("loginFromFile", () => {
    it("reads auth data from the file and uses its token", async() => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yoto-backup-test-"));
        const file = path.join(tmpDir, "device-auth.json");
        const auth = { access_token: "at-file", refresh_token: "rt" };

        try {
            fs.writeFileSync(file, JSON.stringify(auth));

            assert.deepEqual(await YotoApi.loginFromFile(file), auth);
            assert.equal(YotoApi.loggedIn(), true);

            const cardFetch = mockFetchJson({});

            await YotoApi.familyCards();

            assert.equal(cardFetch.mock.calls[0].arguments[1].headers.Authorization, "Bearer at-file");
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it("rejects on a missing file", async() => {
        await assert.rejects(YotoApi.loginFromFile(path.join(os.tmpdir(), "does-not-exist-yoto.json")));
    });
});

describe("card endpoints", () => {
    const endpoints = [
        ["myCards", [], "/content/mine"],
        ["familyCards", [], "/card/family/library"],
        ["card", ["card-123"], "/card/card-123"]
    ];

    for (const [method, args, urlPath] of endpoints) {
        it(`${method}() GETs ${urlPath} and returns the JSON`, async() => {
            const data = { cards: [{ cardId: "a" }] };
            const fetchMock = mockFetchJson(data);

            assert.deepEqual(await YotoApi[method](...args), data);

            const [url, opts] = fetchMock.mock.calls[0].arguments;

            assert.equal(url, `${constants.BASE_URL}${urlPath}`);
            assert.equal(opts.method, "GET");
            assert.match(opts.headers.Authorization, /^Bearer /);
        });
    }
});

describe("isTokenExpired", () => {
    it("is false for a token expiring well in the future", () => {
        const exp = Math.floor(Date.now() / 1000) + 3600;

        assert.equal(YotoApi.isTokenExpired(makeJwt({ exp })), false);
    });

    it("is true for an already-expired token", () => {
        const exp = Math.floor(Date.now() / 1000) - 60;

        assert.equal(YotoApi.isTokenExpired(makeJwt({ exp })), true);
    });

    it("is true within the 30-second refresh buffer", () => {
        const exp = Math.floor(Date.now() / 1000) + 10;

        assert.equal(YotoApi.isTokenExpired(makeJwt({ exp })), true);
    });

    it("decodes base64url payloads", () => {
        // "~~~" etc. produce "-" / "_" characters in base64url
        const exp = Math.floor(Date.now() / 1000) + 3600;

        assert.equal(YotoApi.isTokenExpired(makeJwt({ exp, sub: "~~~???>>>" })), false);
    });

    it("throws on a malformed token", () => {
        assert.throws(() => YotoApi.isTokenExpired("not-a-jwt"), /Unable to decode access token/);
        assert.throws(() => YotoApi.isTokenExpired(null), /Unable to decode access token/);
    });
});
