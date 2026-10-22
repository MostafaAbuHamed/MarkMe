import { describe, expect, it } from "vitest";

import { detectMediaType, type MediaType } from "./media-type";
import type { Provider } from "./url/provider";

const DEFAULT_URL = "https://a.com/page";

type Row = {
  name: string;
  input: {
    url?: string;
    contentType?: string;
    ogType?: string;
    oembedType?: string;
    provider?: Provider | null;
  };
  expected: MediaType;
};

const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"] as const;
const videoExtensions = [".mp4", ".webm"] as const;

const rows: Row[] = [
  // Step 1
  {
    name: "provider youtube",
    input: { provider: "youtube", ogType: "article" },
    expected: "video",
  },
  { name: "oembedType video", input: { oembedType: "video" }, expected: "video" },
  { name: "oembedType VIDEO trimmed", input: { oembedType: " VIDEO " }, expected: "video" },
  // Step 2
  { name: "provider x", input: { provider: "x" }, expected: "post" },
  {
    name: "provider instagram reel",
    input: { provider: "instagram", url: "https://www.instagram.com/reel/abc/" },
    expected: "post",
  },
  {
    name: "provider x with rich oembed",
    input: { provider: "x", oembedType: "rich" },
    expected: "post",
  },
  // Step 3
  { name: "oembedType photo", input: { oembedType: "photo" }, expected: "image" },
  { name: "contentType image/png", input: { contentType: "image/png" }, expected: "image" },
  {
    name: "contentType IMAGE/PNG with params",
    input: { contentType: "IMAGE/PNG; charset=binary" },
    expected: "image",
  },
  { name: "contentType text/html", input: { contentType: "text/html" }, expected: "link" },
  // Step 4
  { name: "ogType video.movie", input: { ogType: "video.movie" }, expected: "video" },
  { name: "ogType video.other", input: { ogType: "video.other" }, expected: "video" },
  { name: "ogType article", input: { ogType: "article" }, expected: "article" },
  { name: "ogType Article trimmed", input: { ogType: " Article " }, expected: "article" },
  { name: "ogType website", input: { ogType: "website" }, expected: "link" },
  { name: "ogType profile", input: { ogType: "profile" }, expected: "link" },
  { name: "ogType music.song", input: { ogType: "music.song" }, expected: "link" },
  // Step 5
  ...imageExtensions.map((ext): Row => ({
    name: `path ends ${ext}`,
    input: { url: `https://a.com/file${ext}` },
    expected: "image",
  })),
  ...videoExtensions.map((ext): Row => ({
    name: `path ends ${ext}`,
    input: { url: `https://a.com/file${ext}` },
    expected: "video",
  })),
  {
    name: "path extension case",
    input: { url: "https://a.com/X.PNG" },
    expected: "image",
  },
  {
    name: "png in query not path",
    input: { url: "https://a.com/x?f=a.png" },
    expected: "link",
  },
  {
    name: "png as path segment not extension",
    input: { url: "https://a.com/png" },
    expected: "link",
  },
  // Ties
  {
    name: "ogType website loses to mp4 path",
    input: { ogType: "website", url: "https://a.com/v.mp4" },
    expected: "video",
  },
  {
    name: "rich oembed loses to article ogType",
    input: { oembedType: "rich", ogType: "article" },
    expected: "article",
  },
  { name: "oembedType rich alone", input: { oembedType: "rich" }, expected: "link" },
  {
    name: "image contentType beats article ogType",
    input: { contentType: "image/jpeg", ogType: "article" },
    expected: "image",
  },
  {
    name: "article ogType beats png path",
    input: { ogType: "article", url: "https://a.com/a.png" },
    expected: "article",
  },
  {
    name: "unparseable url",
    input: { url: "not a url" },
    expected: "link",
  },
];

describe("detectMediaType", () => {
  it.each(rows)("$name → $expected", ({ input, expected }) => {
    const fullInput = { url: DEFAULT_URL, ...input };
    expect(detectMediaType(fullInput)).toBe(expected);
  });
});
