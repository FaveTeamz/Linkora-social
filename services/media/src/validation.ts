export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILENAME_LENGTH = 255;

const SIGNATURES: Array<{ mimeType: string; matches: (bytes: Buffer) => boolean }> = [
  { mimeType: "image/jpeg", matches: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mimeType: "image/png", matches: (bytes) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mimeType: "image/gif", matches: (bytes) => bytes.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/) !== null },
  { mimeType: "image/webp", matches: (bytes) => bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" },
];

export class MediaValidationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "MediaValidationError";
  }
}

export interface ValidatedMediaFile {
  mimeType: string;
  filename: string;
}

/** Validate file bytes and a client filename. The caller supplied MIME type is intentionally ignored. */
export function validateMediaFile(
  bytes: Buffer,
  filename: string,
  _declaredMimeType?: string,
): ValidatedMediaFile {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new MediaValidationError("File is empty or invalid", 400);
  }
  if (bytes.length > MAX_FILE_SIZE_BYTES) {
    throw new MediaValidationError("File exceeds the 10 MB size limit", 413);
  }
  if (typeof filename !== "string" || filename.length === 0 || filename.length > MAX_FILENAME_LENGTH) {
    throw new MediaValidationError("Filename must be between 1 and 255 characters", 400);
  }
  if (/[\\/]/.test(filename) || filename === "." || filename === "..") {
    throw new MediaValidationError("Filename must not contain path separators", 400);
  }

  const detected = SIGNATURES.find((signature) => signature.matches(bytes));
  if (!detected) {
    throw new MediaValidationError("Unsupported or invalid media file type", 415);
  }

  return { mimeType: detected.mimeType, filename };
}
