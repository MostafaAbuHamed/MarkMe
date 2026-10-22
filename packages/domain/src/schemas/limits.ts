import { MAX_URL_LENGTH } from "../url/normalize";

export const LIMITS = Object.freeze({
  title: 300,
  description: 1000,
  siteName: 200,
  note: 1000,
  url: MAX_URL_LENGTH,
  name: 100,
  tagsPerItem: 20,
} as const);
