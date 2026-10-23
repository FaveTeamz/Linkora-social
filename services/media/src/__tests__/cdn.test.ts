import { createHmac } from "node:crypto";
import { createCdnUrl } from "../cdn";

describe("createCdnUrl", () => {
  it("returns a configurable URL for public objects", () => {
    expect(createCdnUrl("users/a photo.webp", true, { baseUrl: "https://cdn.example.test/" }))
      .toBe("https://cdn.example.test/users/a%20photo.webp");
  });

  it("signs private URLs with an expiry", () => {
    const url = new URL(createCdnUrl("private/photo.webp", false, {
      baseUrl: "https://cdn.example.test",
      signingSecret: "a-secure-signing-secret-that-is-at-least-32-bytes",
      now: 1_700_000_000_000,
      expiresInSeconds: 60,
    }));
    const expires = "1700000060";
    const secret = "a-secure-signing-secret-that-is-at-least-32-bytes";
    const expected = createHmac("sha256", secret).update(`/private/photo.webp\n${expires}`).digest("hex");
    expect(url.searchParams.get("expires")).toBe(expires);
    expect(url.searchParams.get("signature")).toBe(expected);
  });

  it("requires the signing key for private objects and bounds the TTL", () => {
    expect(() => createCdnUrl("a", false, { baseUrl: "https://cdn.test", signingSecret: "" })).toThrow(/CDN_SIGNING_SECRET/);
    const secret = "a-secure-signing-secret-that-is-at-least-32-bytes";
    expect(() => createCdnUrl("a", false, { baseUrl: "https://cdn.test", signingSecret: secret, expiresInSeconds: 0 })).toThrow(/expiresInSeconds/);
  });
});
