/**
 * @module contentFilter
 *
 * Client-side and server-side content moderation rules for Linkora posts,
 * display names, and external URLs.
 *
 * The filter is intentionally **lightweight**: it catches obvious violations
 * (spam patterns, blocked words, oversized payloads, disallowed domains)
 * without requiring a round-trip to a moderation service. Deeper analysis
 * (AI classifiers, on-chain moderation contract calls) happens later in the
 * pipeline and is out of scope here.
 *
 * ## Quick usage
 *
 * ```ts
 * import { filterContent, ContentViolation } from "@/lib/contentFilter";
 *
 * const result = filterContent(userInput);
 *
 * if (!result.ok) {
 *   console.error(result.violation, result.message);
 *   // e.g. ContentViolation.POST_TOO_LONG — "Post exceeds the 280-character limit."
 * }
 * ```
 *
 * ## Adding new rules
 *
 * 1. Add a new member to the {@link ContentViolation} enum with a
 *    SCREAMING_SNAKE_CASE key. Document the trigger condition and
 *    user-facing message in the enum JSDoc.
 * 2. Implement the check inside {@link filterContent} (or extract a helper).
 * 3. Add a unit test in `apps/web/src/lib/__tests__/contentFilter.test.ts`.
 * 4. If the rule depends on a list of patterns (blocked words, domains),
 *    add the list as a typed `const` near the top of this file.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum number of characters allowed in a single post body.
 *
 * This mirrors `POST_MAX_CHARS` from `lib/validate.ts` and the
 * `MAX_POST_LENGTH` constant in the Soroban contract
 * (`packages/contracts/contracts/linkora/src/posts.rs`).
 *
 * Changing this value requires a matching contract upgrade and a migration
 * of the indexer's `posts.content` column size.
 *
 * @see {@link ContentViolation.POST_TOO_LONG}
 */
export const MAX_POST_LENGTH = 280;

/**
 * Allowed external URL domains for link previews and post embeds.
 *
 * Links pointing to domains **not** in this list are stripped from the
 * rendered output and trigger {@link ContentViolation.DISALLOWED_DOMAIN}.
 *
 * ### Rationale
 * An allowlist (rather than a denylist) prevents phishing links and
 * malicious redirects from appearing in the feed without requiring
 * continuous updates to a blocklist.
 *
 * ### Extending the list
 * Add the bare hostname (no `https://`, no trailing slash) to the array
 * below. Subdomains are **not** automatically allowed; add them
 * explicitly (e.g. `"gist.github.com"` in addition to `"github.com"`).
 */
export const ALLOWED_LINK_DOMAINS: readonly string[] = [
  // Social / developer platforms
  "github.com",
  "gist.github.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "youtu.be",
  "twitch.tv",
  "linkedin.com",
  // Media & publishing
  "medium.com",
  "substack.com",
  "mirror.xyz",
  // Stellar ecosystem
  "stellar.org",
  "stellarchain.io",
  "stellarexpert.io",
  "soroban.stellar.org",
  // General reference
  "wikipedia.org",
  "en.wikipedia.org",
  "linkora.xyz",
] as const;

/**
 * Regex patterns whose presence anywhere in post content signals spam.
 *
 * A match triggers {@link ContentViolation.SPAM_DETECTED}.
 * All patterns are tested case-insensitively.
 *
 * Keep this list short and high-precision; false positives are worse
 * than false negatives at this layer.
 */
const SPAM_PATTERNS: RegExp[] = [
  /\b(buy|earn|win)\s+(crypto|nft|token|coin)\s+(now|fast|free)/i,
  /\bclick\s+here\s+to\s+(claim|get|earn)\b/i,
  /\b(free\s+)?airdrop\s+(claim|link|now)\b/i,
  /(.)\1{9,}/,                // 10+ identical consecutive characters
];

// ─── Violation enum ───────────────────────────────────────────────────────────

/**
 * Enumeration of all content violation codes produced by {@link filterContent}.
 *
 * Each member documents:
 * - **Trigger condition** — what input causes this violation.
 * - **User-facing message** — the exact string returned in
 *   {@link FilterResult.message} so the UI can display it verbatim.
 *
 * ---
 *
 * ### POST_TOO_LONG
 * **Trigger:** The post body (after whitespace trimming) exceeds
 * {@link MAX_POST_LENGTH} characters.
 *
 * **User-facing message:**
 * `"Post exceeds the 280-character limit."`
 *
 * ---
 *
 * ### POST_EMPTY
 * **Trigger:** The post body is empty or contains only whitespace after
 * trimming.
 *
 * **User-facing message:**
 * `"Post content cannot be empty."`
 *
 * ---
 *
 * ### DISALLOWED_DOMAIN
 * **Trigger:** The post contains a URL whose hostname is not present in
 * {@link ALLOWED_LINK_DOMAINS}.
 *
 * **User-facing message:**
 * `"Links to this domain are not permitted. Use a supported platform link."`
 *
 * ---
 *
 * ### SPAM_DETECTED
 * **Trigger:** The post body matches one or more patterns in the internal
 * `SPAM_PATTERNS` list (see module source).
 *
 * **User-facing message:**
 * `"Your post was flagged as potential spam. Please revise and try again."`
 *
 * ---
 *
 * ### EXECUTABLE_CONTENT
 * **Trigger:** The post body contains HTML tags (`<script>`, `<iframe>`,
 * inline event handlers such as `onerror=`, or the `javascript:` URI
 * scheme) that could execute code in a browser renderer.
 *
 * **User-facing message:**
 * `"Posts may not contain HTML tags or executable code."`
 *
 * ---
 *
 * ### DISPLAY_NAME_INVALID
 * **Trigger:** The display name is empty, shorter than 1 character, or
 * longer than 64 characters after trimming.
 *
 * **User-facing message:**
 * `"Display name must be between 1 and 64 characters."`
 *
 * ---
 *
 * ### PROFANITY
 * **Trigger:** Reserved for future use. Will be raised when a configurable
 * word-filter list (not yet populated) matches content.
 *
 * **User-facing message:**
 * `"Your post contains language that violates our community guidelines."`
 */
export enum ContentViolation {
  POST_TOO_LONG = "POST_TOO_LONG",
  POST_EMPTY = "POST_EMPTY",
  DISALLOWED_DOMAIN = "DISALLOWED_DOMAIN",
  SPAM_DETECTED = "SPAM_DETECTED",
  EXECUTABLE_CONTENT = "EXECUTABLE_CONTENT",
  DISPLAY_NAME_INVALID = "DISPLAY_NAME_INVALID",
  PROFANITY = "PROFANITY",
}

// ─── Result types ─────────────────────────────────────────────────────────────

/** Returned by {@link filterContent} when no violation is found. */
export interface FilterResultOk {
  /** Always `true` for a clean result. */
  ok: true;
  /** The sanitised content, safe to persist or display. */
  sanitised: string;
}

/** Returned by {@link filterContent} when a violation is detected. */
export interface FilterResultViolation {
  /** Always `false` when a violation was found. */
  ok: false;
  /** The specific violation code. */
  violation: ContentViolation;
  /**
   * User-facing error message.
   *
   * This string is safe to display verbatim in the UI. It does not contain
   * internal implementation details.
   */
  message: string;
}

/** Union of the two possible outcomes of {@link filterContent}. */
export type FilterResult = FilterResultOk | FilterResultViolation;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts all hostnames from URLs found in `text`.
 *
 * Matches `http://` and `https://` links. Does not attempt to match bare
 * hostnames without a scheme (they would require a much broader regex and
 * produce far more false positives).
 */
function extractHostnames(text: string): string[] {
  const matches = text.match(/https?:\/\/([^/\s?#]+)/gi) ?? [];
  return matches.map((url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }).filter(Boolean);
}

/**
 * Returns `true` if `text` contains any HTML tags or executable patterns.
 */
function containsExecutableContent(text: string): boolean {
  return (
    /<script[\s\S]*?>/i.test(text) ||
    /<iframe[\s\S]*?>/i.test(text) ||
    /javascript:/i.test(text) ||
    /on\w+\s*=/i.test(text)
  );
}

// ─── Main filter function ─────────────────────────────────────────────────────

/**
 * Applies all content moderation rules to `raw` and returns a
 * {@link FilterResult}.
 *
 * Rules are evaluated in priority order:
 * 1. Empty / whitespace-only check ({@link ContentViolation.POST_EMPTY})
 * 2. Executable content check ({@link ContentViolation.EXECUTABLE_CONTENT})
 * 3. Length check ({@link ContentViolation.POST_TOO_LONG})
 * 4. Domain allowlist check ({@link ContentViolation.DISALLOWED_DOMAIN})
 * 5. Spam pattern check ({@link ContentViolation.SPAM_DETECTED})
 *
 * If all checks pass the function returns `{ ok: true, sanitised }` where
 * `sanitised` is the trimmed input with any remaining HTML stripped.
 *
 * @param raw - The raw post content string submitted by the user.
 * @returns A {@link FilterResult} indicating whether the content is allowed.
 *
 * @example
 * ```ts
 * const r = filterContent("Hello world!");
 * // r.ok === true, r.sanitised === "Hello world!"
 *
 * const r2 = filterContent("x".repeat(300));
 * // r2.ok === false, r2.violation === ContentViolation.POST_TOO_LONG
 * ```
 */
export function filterContent(raw: string): FilterResult {
  const trimmed = raw.trim();

  // 1. Empty check
  if (!trimmed) {
    return {
      ok: false,
      violation: ContentViolation.POST_EMPTY,
      message: "Post content cannot be empty.",
    };
  }

  // 2. Executable content check (run before length so we don't expose long scripts)
  if (containsExecutableContent(trimmed)) {
    return {
      ok: false,
      violation: ContentViolation.EXECUTABLE_CONTENT,
      message: "Posts may not contain HTML tags or executable code.",
    };
  }

  // 3. Length check
  if (trimmed.length > MAX_POST_LENGTH) {
    return {
      ok: false,
      violation: ContentViolation.POST_TOO_LONG,
      message: `Post exceeds the ${MAX_POST_LENGTH}-character limit.`,
    };
  }

  // 4. Domain allowlist check
  const hostnames = extractHostnames(trimmed);
  const disallowed = hostnames.find(
    (h) => !ALLOWED_LINK_DOMAINS.includes(h as (typeof ALLOWED_LINK_DOMAINS)[number])
  );
  if (disallowed) {
    return {
      ok: false,
      violation: ContentViolation.DISALLOWED_DOMAIN,
      message: "Links to this domain are not permitted. Use a supported platform link.",
    };
  }

  // 5. Spam pattern check
  const isSpam = SPAM_PATTERNS.some((re) => re.test(trimmed));
  if (isSpam) {
    return {
      ok: false,
      violation: ContentViolation.SPAM_DETECTED,
      message: "Your post was flagged as potential spam. Please revise and try again.",
    };
  }

  // All checks passed — strip any residual tags and return
  const sanitised = trimmed.replace(/<[^>]+>/g, "").trim();
  return { ok: true, sanitised };
}

// ─── Display name filter ──────────────────────────────────────────────────────

/**
 * Validates and sanitises a creator display name.
 *
 * @param raw - The raw display-name string.
 * @returns A {@link FilterResult}. On success, `sanitised` is the trimmed name.
 *
 * @example
 * ```ts
 * filterDisplayName("Alice")      // ok: true
 * filterDisplayName("")           // violation: DISPLAY_NAME_INVALID
 * filterDisplayName("x".repeat(65)) // violation: DISPLAY_NAME_INVALID
 * ```
 */
export function filterDisplayName(raw: string): FilterResult {
  const trimmed = raw.trim();

  if (trimmed.length === 0 || trimmed.length > 64) {
    return {
      ok: false,
      violation: ContentViolation.DISPLAY_NAME_INVALID,
      message: "Display name must be between 1 and 64 characters.",
    };
  }

  return { ok: true, sanitised: trimmed };
}
