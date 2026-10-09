export const ALLOWED_MIME_TYPES = [
  "application/pdf", "image/jpeg", "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const PR_DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export function safeFileName(name: string): string {
  // Drop directory parts (including "." / ".." segments) so paths cannot be smuggled in.
  const base = name.split(/[\\/]/).filter((p) => p && !/^\.+$/.test(p)).join("_");
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_+|_+$/g, "");
  const ext = dot > 0 ? base.slice(dot).replace(/[^A-Za-z0-9.]/g, "") : "";
  return `${(stem || "file").slice(0, 100 - ext.length)}${ext}`;
}

export function validateFile(f: { name: string; size: number; type: string }, maxMb: number, prDocument = false): string | null {
  if (prDocument && !(PR_DOCUMENT_MIME_TYPES as readonly string[]).includes(f.type)) return "The PR document must be a PDF, JPG or PNG file.";
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(f.type)) return "File type not allowed. Use PDF, JPG, PNG, DOCX or XLSX.";
  if (f.size <= 0) return "File is empty.";
  if (f.size > maxMb * 1024 * 1024) return `File is larger than ${maxMb} MB.`;
  return null;
}
