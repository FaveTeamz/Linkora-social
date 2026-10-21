import { MediaValidationError, validateMediaFile } from "../validation";

describe("media upload validation", () => {
  it("accepts JPEG bytes and detects the MIME type from the signature", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(validateMediaFile(jpeg, "photo.jpg", "text/plain")).toEqual({
      mimeType: "image/jpeg",
      filename: "photo.jpg",
    });
  });

  it("rejects SVG and other unsupported signatures", () => {
    expect(() => validateMediaFile(Buffer.from("<svg></svg>"), "image.svg", "image/svg+xml"))
      .toThrow(expect.objectContaining<Partial<MediaValidationError>>({ statusCode: 415 }));
  });

  it("rejects files larger than 10 MB", () => {
    expect(() => validateMediaFile(Buffer.alloc(10 * 1024 * 1024 + 1), "large.jpg"))
      .toThrow(expect.objectContaining<Partial<MediaValidationError>>({ statusCode: 413 }));
  });

  it("rejects path separators in filenames", () => {
    expect(() => validateMediaFile(Buffer.from([0xff, 0xd8, 0xff]), "../photo.jpg"))
      .toThrow(expect.objectContaining<Partial<MediaValidationError>>({ statusCode: 400 }));
  });
});
