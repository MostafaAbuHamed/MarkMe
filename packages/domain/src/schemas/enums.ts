import { Constants } from "@markme/database";
import { z } from "zod";

export const mediaType = z.enum(Constants.public.Enums.media_type);
export const previewStatus = z.enum(Constants.public.Enums.preview_status);
export const embedProvider = z.enum(Constants.public.Enums.embed_provider);
