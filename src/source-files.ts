import type { Source } from "./shared/workspace.ts";

export function inferSourceKind(file?: File): Source["kind"] {
  if (!file) return "transcript";
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (/\.(txt|md|json|csv|tsv)$/i.test(file.name)) return "note";
  return "document";
}
