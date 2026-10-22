import { describe, expect, it } from "vitest";

import { YOUTUBE_ID_PATTERN, detectProvider, extractYouTubeId } from "./provider";

const YOUTUBE_ID = "dQw4w9WgXcQ";

const youtubeHosts = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
] as const;

const youtubePaths = [
  `/watch?v=${YOUTUBE_ID}`,
  `/shorts/${YOUTUBE_ID}`,
  `/embed/${YOUTUBE_ID}`,
  `/live/${YOUTUBE_ID}`,
] as const;

const youtubeProviderRows: [string, string][] = [
  ...youtubeHosts.flatMap((host) =>
    youtubePaths.map((path) => [`https://${host}${path}`, "youtube"] as [string, string]),
  ),
  [`https://youtu.be/${YOUTUBE_ID}`, "youtube"],
  ["https://youtu.be/", "youtube"],
];

const xHosts = [
  "x.com",
  "twitter.com",
  "www.x.com",
  "www.twitter.com",
  "mobile.x.com",
  "mobile.twitter.com",
] as const;

const xProviderRows: [string, string][] = xHosts.map((host) => [`https://${host}/a/status/1`, "x"]);

const instagramHosts = ["instagram.com", "www.instagram.com"] as const;

const instagramPaths = ["/p/abc/", "/reel/abc/", "/tv/abc/"] as const;

const instagramProviderRows: [string, string][] = instagramHosts.flatMap((host) =>
  instagramPaths.map((path) => [`https://${host}${path}`, "instagram"] as [string, string]),
);

const nullProviderRows: [string, null][] = [
  ["https://youtube.com/", null],
  ["https://youtube.com/feed", null],
  ["https://youtube.com/watchlater", null],
  [`https://studio.youtube.com/watch?v=${YOUTUBE_ID}`, null],
  [`https://notyoutube.com/watch?v=${YOUTUBE_ID}`, null],
  ["https://x.com.evil.com/a", null],
  ["https://www.instagram.com/explore", null],
  ["https://help.instagram.com/p/abc", null],
  ["https://a.com", null],
  ["not a url", null],
];

const extractIdRows: [string, string][] = [
  [`https://youtube.com/watch?v=${YOUTUBE_ID}`, YOUTUBE_ID],
  [`https://youtube.com/shorts/${YOUTUBE_ID}`, YOUTUBE_ID],
  [`https://youtube.com/shorts/${YOUTUBE_ID}/`, YOUTUBE_ID],
  [`https://youtube.com/embed/${YOUTUBE_ID}`, YOUTUBE_ID],
  [`https://youtube.com/live/${YOUTUBE_ID}`, YOUTUBE_ID],
  [`https://youtu.be/${YOUTUBE_ID}`, YOUTUBE_ID],
  [`https://youtu.be/${YOUTUBE_ID}/extra`, YOUTUBE_ID],
];

const nullIdRows: [string, null][] = [
  [`https://youtube.com/watch?v=${"a".repeat(10)}`, null],
  [`https://youtube.com/watch?v=${"a".repeat(12)}`, null],
  [`https://youtube.com/watch?v=${YOUTUBE_ID}!`, null],
  ["https://youtube.com/watch", null],
  ["https://youtu.be/", null],
  ["https://youtube.com/shorts/", null],
  [`https://a.com?v=${YOUTUBE_ID}`, null],
  ["not a url", null],
];

describe("detectProvider YouTube", () => {
  it.each(youtubeProviderRows)("%s → %s", (input, expected) => {
    expect(detectProvider(input)).toBe(expected);
  });
});

describe("detectProvider X", () => {
  it.each(xProviderRows)("%s → %s", (input, expected) => {
    expect(detectProvider(input)).toBe(expected);
  });
});

describe("detectProvider Instagram", () => {
  it.each(instagramProviderRows)("%s → %s", (input, expected) => {
    expect(detectProvider(input)).toBe(expected);
  });
});

describe("detectProvider null", () => {
  it.each(nullProviderRows)("%s → %s", (input, expected) => {
    expect(detectProvider(input)).toBe(expected);
  });
});

describe("extractYouTubeId", () => {
  it.each(extractIdRows)("%s → %s", (input, expected) => {
    expect(extractYouTubeId(input)).toBe(expected);
  });
});

describe("extractYouTubeId null", () => {
  it.each(nullIdRows)("%s → %s", (input, expected) => {
    expect(extractYouTubeId(input)).toBe(expected);
  });
});

describe("YOUTUBE_ID_PATTERN", () => {
  // Must match items_embed_youtube_chk in packages/database/supabase/migrations/20261021123948_item_rules.sql
  it("matches the M1 embed id check", () => {
    expect(YOUTUBE_ID_PATTERN.source).toBe("^[A-Za-z0-9_-]{11}$");
  });
});
