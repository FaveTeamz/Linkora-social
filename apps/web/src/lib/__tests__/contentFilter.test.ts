import {
  ContentViolation,
  filterContent,
  filterDisplayName,
  MAX_POST_LENGTH,
} from "../contentFilter";

describe("contentFilter", () => {
  it("rejects empty content as required for a post", () => {
    expect(filterContent("")).toMatchObject({ ok: false, violation: ContentViolation.POST_EMPTY });
  });

  it("reports posts longer than the configured character limit", () => {
    expect(filterContent("x".repeat(MAX_POST_LENGTH + 1))).toMatchObject({
      ok: false,
      violation: ContentViolation.POST_TOO_LONG,
    });
  });

  it("rejects executable content", () => {
    expect(filterContent("<script>alert(1)</script>")).toMatchObject({
      ok: false,
      violation: ContentViolation.EXECUTABLE_CONTENT,
    });
  });

  it("rejects links outside the supported domain allowlist", () => {
    expect(filterContent("Read this: https://malicious.example/path")).toMatchObject({
      ok: false,
      violation: ContentViolation.DISALLOWED_DOMAIN,
    });
  });

  it("rejects known profanity", () => {
    expect(filterContent("This post says shit.")).toMatchObject({
      ok: false,
      violation: ContentViolation.PROFANITY,
    });
  });

  it("rejects spam patterns", () => {
    expect(filterContent("Buy crypto now free")).toMatchObject({
      ok: false,
      violation: ContentViolation.SPAM_DETECTED,
    });
  });

  it("allows a valid post with no violations", () => {
    expect(filterContent("A useful update from Linkora.")).toEqual({
      ok: true,
      sanitised: "A useful update from Linkora.",
    });
  });

  it("validates display names", () => {
    expect(filterDisplayName(" ")).toMatchObject({
      ok: false,
      violation: ContentViolation.DISPLAY_NAME_INVALID,
    });
    expect(filterDisplayName("Alice")).toEqual({ ok: true, sanitised: "Alice" });
  });
});
