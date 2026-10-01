# Media Service

The media service is embedded inside the **indexer** (`services/indexer`). It
exposes two HTTP endpoints under `/api/posts/media` that handle file uploads,
serve previously-uploaded files, and report the server's upload budget to
clients.

---

## Upload Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Client (browser / mobile)                                                  │
│                                                                             │
│  1. User selects file(s) in the composer                                    │
│     └─ useMediaUpload hook  ──►  fetchUploadConfig()                        │
│                                  GET /api/posts/media/config                │
│                                  ◄── { max_upload_bytes, allowed_image_types}│
│                                                                             │
│  2. Client-side validation & compression                                    │
│     └─ validateImageFile()  — type + size check against server limit        │
│     └─ compressImage()      — browser-image-compression (max 1 MB / 1920 px)│
│     └─ fileToDataURL()      — local preview rendered immediately            │
│                                                                             │
│  3. Upload                                                                  │
│     └─ uploadMediaFile()                                                    │
│        POST /api/posts/media                                                │
│        multipart/form-data  { file: <compressed blob> }                     │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Next.js API layer  (apps/web)                                              │
│                                                                             │
│  No dedicated Next.js API route for media — the fetch calls hit the         │
│  indexer directly via NEXT_PUBLIC_INDEXER_URL.                              │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Media Service  (services/indexer — src/api/routes/posts.ts)                │
│                                                                             │
│  a. readRawBody()   — stream body into memory, abort if > maxBytes + 8 KB   │
│     └─ UploadTooLargeError  ──►  HTTP 413                                   │
│                                                                             │
│  b. parseBoundary() + parseMultipartFile()                                  │
│     └─ missing boundary or no file field  ──►  HTTP 400                    │
│                                                                             │
│  c. MIME type check against allowedImageTypes                               │
│     └─ unsupported type  ──►  HTTP 415                                      │
│                                                                             │
│  d. Second size check on the extracted file content                         │
│     └─ exceeds maxUploadBytes  ──►  HTTP 413                                │
│                                                                             │
│  e. Write file to disk                                                      │
│     └─ randomUUID() + original extension  →  MEDIA_UPLOAD_DIR/<uuid>.ext   │
│     └─ disk error  ──►  HTTP 500                                            │
│                                                                             │
│  f. HTTP 201  { url: "/api/posts/media/<uuid>.ext", size: <bytes> }         │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Storage  (local disk / S3 / R2)                                            │
│                                                                             │
│  Default (development): files written to MEDIA_UPLOAD_DIR on the local      │
│  filesystem and served by express.static from the same path.                │
│                                                                             │
│  Production: mount an S3-compatible object store (AWS S3 or Cloudflare R2) │
│  as a FUSE volume, or replace the write/serve logic with an S3 SDK and a   │
│  CDN distribution in front of the bucket.                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  CDN / static serving                                                       │
│                                                                             │
│  Development: the indexer serves files directly.                            │
│     GET /api/posts/media/<uuid>.ext  ──►  file from MEDIA_UPLOAD_DIR        │
│                                                                             │
│  Production: a CDN (e.g. Cloudflare, CloudFront) sits in front of the      │
│  bucket and rewrites the origin URL to a public CDN URL (see below).       │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Client — resolved URL stored in the post payload                           │
│                                                                             │
│  useMediaUpload sets  MediaItem.url = result.url  once the upload resolves  │
│  The composer passes media URLs to the Soroban contract as part of the      │
│  post content.                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## API Reference

### `GET /api/posts/media/config`

Returns the server's current upload budget. Clients **must** call this before
presenting a file picker so the UI can reject oversized files before any
transfer starts.

**Response `200 OK`**

```jsonc
{
  "max_upload_bytes": 20971520, // 20 MB default
  "allowed_image_types": ["image/jpeg", "image/png", "image/webp"],
}
```

---

### `POST /api/posts/media`

Uploads a single image file. The request body must be `multipart/form-data`
with a single field named `file`.

**Request**

```
Content-Type: multipart/form-data; boundary=<boundary>

--<boundary>
Content-Disposition: form-data; name="file"; filename="photo.png"
Content-Type: image/png

<binary data>
--<boundary>--
```

**Response `201 Created`**

```jsonc
{
  "url": "/api/posts/media/3f2a1b4c-…-7e9d.png",
  "size": 204800,
}
```

**Error responses**

| Status | Code                     | Cause                                           |
| ------ | ------------------------ | ----------------------------------------------- |
| 400    | `UPLOAD_ABORTED`         | Connection dropped before the upload finished   |
| 400    | `INVALID_UPLOAD`         | Malformed multipart body or missing file field  |
| 413    | `PAYLOAD_TOO_LARGE`      | Body or file content exceeds `max_upload_bytes` |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | MIME type not in `allowed_image_types`          |
| 500    | `INTERNAL_SERVER_ERROR`  | Disk write failed                               |

All error responses share a common envelope:

```jsonc
{
  "error": {
    "code": "PAYLOAD_TOO_LARGE",
    "message": "Upload exceeds the maximum size of 20971520 bytes.",
    "details": { "max_upload_bytes": 20971520 },
    "requestId": "<uuid>", // present when X-Request-ID middleware is active
  },
}
```

---

### `GET /api/posts/media/<filename>`

Serves a previously uploaded file directly from `MEDIA_UPLOAD_DIR`. In
production this path is typically handled by the CDN and never reaches the
indexer.

---

## Supported File Types and Size Limits

| MIME type    | Extension(s)   | Client pre-compress limit  | Server hard limit     |
| ------------ | -------------- | -------------------------- | --------------------- |
| `image/jpeg` | `.jpg` `.jpeg` | 5 MB (`MAX_IMAGE_SIZE_MB`) | `MEDIA_UPLOAD_MAX_MB` |
| `image/png`  | `.png`         | 5 MB                       | `MEDIA_UPLOAD_MAX_MB` |
| `image/webp` | `.webp`        | 5 MB                       | `MEDIA_UPLOAD_MAX_MB` |

**Default server limit**: 20 MB (`MEDIA_UPLOAD_MAX_MB=20`).

The client runs browser-image-compression before upload targeting 1 MB /
1920 px. The server enforces its own independent cap — an oversize body is
rejected as soon as the byte counter crosses `max_upload_bytes + 8 KB` (the
extra headroom covers multipart framing bytes).

Up to **4 images** may be attached to a single post (`MAX_MEDIA_COUNT=4`).

---

## CDN URL Format

In development the indexer itself serves uploaded files:

```
http://localhost:3000/api/posts/media/<uuid>.<ext>
```

In production, set `MEDIA_CDN_BASE_URL` (or configure your CDN's origin) so
that the served URL becomes:

```
https://cdn.example.com/media/<uuid>.<ext>
```

The filename is always a random UUID v4 with the original file extension
preserved (e.g. `3f2a1b4c-8e6d-4a2f-b19c-7e9d0f1a2b3c.webp`). There is no
directory hierarchy — all files live at the root of the upload directory /
bucket prefix.

---

## Environment Variables

All variables are read by the indexer's `loadConfig()` in
`services/indexer/src/config.ts`.

| Variable              | Required | Default           | Description                                                                             |
| --------------------- | -------- | ----------------- | --------------------------------------------------------------------------------------- |
| `MEDIA_UPLOAD_MAX_MB` | No       | `20`              | Hard per-file size cap in **megabytes**. Converted to bytes internally (`× 1 048 576`). |
| `MEDIA_UPLOAD_DIR`    | No       | `./uploads/media` | Filesystem path where uploaded files are written and served from.                       |

The complete indexer environment reference (database, RPC, Redis, etc.) is in
[`services/indexer/.env.example`](../indexer/.env.example).

### Example `.env` snippet

```dotenv
# Media uploads
MEDIA_UPLOAD_MAX_MB=20
MEDIA_UPLOAD_DIR=/var/lib/linkora/media
```

For S3 / Cloudflare R2, mount the bucket as a volume at `MEDIA_UPLOAD_DIR` or
extend `src/api/routes/posts.ts` to use the AWS SDK / R2 SDK directly and set
`MEDIA_CDN_BASE_URL` to your distribution hostname.

---

## Local Development

The media endpoints start automatically with the indexer. No additional setup
is required beyond the standard quick-start:

```bash
cd services/indexer
cp .env.example .env      # fill in DATABASE_URL, STELLAR_RPC_URL, CONTRACT_ID
pnpm dev
```

Uploaded files land in `./uploads/media/` relative to where the indexer is
started (overridable with `MEDIA_UPLOAD_DIR`). The directory is created
automatically on the first upload.

To exercise the endpoints manually:

```bash
# 1. Check the configured budget
curl http://localhost:3000/api/posts/media/config

# 2. Upload an image
curl -X POST http://localhost:3000/api/posts/media \
  -F "file=@/path/to/photo.png;type=image/png"

# 3. Fetch the uploaded file (use the url from step 2)
curl http://localhost:3000/api/posts/media/<uuid>.png --output out.png
```

---

## Testing

Unit tests for the media upload API are in:

```
services/indexer/src/api/routes/__tests__/posts.media.test.ts
```

Run them with:

```bash
pnpm --filter indexer test
```

The test suite covers: successful upload and URL shape, 413 on body exceeding
the limit, 413 on exact-limit boundary, 415 on an unsupported MIME type, and
the `/media/config` config endpoint with a custom limit.
