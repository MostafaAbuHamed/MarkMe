import * as cheerio from "cheerio";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export function sanitizeText(value: string | undefined, max: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const $ = cheerio.load(value);
  $("script").remove();
  $("style").remove();
  let text = $.root().text().replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();

  if (text.length === 0) {
    return undefined;
  }

  if (text.length > max) {
    text = text.slice(0, max);
    const last = text.charCodeAt(text.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) {
      text = text.slice(0, -1);
    }
  }

  return text.length === 0 ? undefined : text;
}
