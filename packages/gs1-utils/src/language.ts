/**
 * Language detection utilities for the public passport viewer.
 */

/**
 * Parse an Accept-Language header into a sorted array of language codes.
 *
 * Example: "en-US,en;q=0.9,de;q=0.7" → ["en-US", "en", "de"]
 */
export function parseAcceptLanguage(header: string): string[] {
  if (!header) return [];

  return header
    .split(",")
    .map((part) => {
      const [lang, qPart] = part.trim().split(";");
      const q = qPart ? parseFloat(qPart.replace(/^\s*q\s*=\s*/, "")) : 1;
      return { lang: lang.trim(), q: isNaN(q) ? 0 : q };
    })
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.lang)
    .filter(Boolean);
}

/**
 * Detect the best language for the passport viewer.
 *
 * Priority:
 * 1. ?lang= query parameter
 * 2. Accept-Language header (highest quality factor)
 * 3. Fallback to "en"
 *
 * Returns a 2-letter ISO 639-1 code (e.g. "en", "de", "fr").
 */
export function detectLanguage(request: Request): string {
  const url = new URL(request.url);
  const langParam = url.searchParams.get("lang");

  if (langParam && /^[a-z]{2}(-[A-Z]{2})?$/.test(langParam)) {
    return langParam.split("-")[0];
  }

  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    const langs = parseAcceptLanguage(acceptLanguage);
    if (langs.length > 0) {
      // Return just the 2-letter code
      return langs[0].split("-")[0].toLowerCase();
    }
  }

  return "en";
}
