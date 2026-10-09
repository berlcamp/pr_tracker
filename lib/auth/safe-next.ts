const DUMMY_ORIGIN = "http://x.invalid";

export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (/[\x00-\x1f\x7f]/.test(raw)) return "/";
  try {
    const u = new URL(raw, DUMMY_ORIGIN);
    if (u.origin !== DUMMY_ORIGIN) return "/";
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return "/";
  }
}
