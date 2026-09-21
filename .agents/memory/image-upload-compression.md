---
name: Client-side image compression convention
description: Image uploaders must compress to a small file before upload, and must never silently send a large original, or photos stall mid-transfer.
---

# Image uploaders must compress client-side before upload

**Rule:** Any component uploading user-selected images must run `compressImage()`
from `@/lib/imageCompression` before sending the file to the upload endpoint, and
must never fall back to silently uploading a large original. Videos are exempt.

**Why:** Raw phone photos (multi-MB HEIC/JPEG/PNG) stall mid-transfer through the
upload proxy and never complete — the XHR upload progress freezes at a fixed low
percentage (observed ~15%, i.e. the point the proxy buffer fills) and hangs
forever. The freeze percentage is roughly constant per file size, which is the
tell that a too-large body (not a flaky network) is the cause.

**Two silent-fallback traps that re-introduce the bug:**
- `canvas.toBlob()` can return `null` on Safari/iOS — fall back to `toDataURL`,
  do not return the original.
- `new Image()` decode can fail (e.g. HEIC `heic2any` didn't convert) — prefer
  `createImageBitmap` (decodes large/HEIC images and applies EXIF orientation
  more reliably), with `<img>` as fallback.
- After encoding, if the result is still over the transfer-safe target, keep
  shrinking; if it truly cannot get small enough, throw so the UI shows an error
  instead of uploading a large file that stalls.

**How to apply:** When adding or auditing an image upload path, confirm it
compresses to a small bounded size, surfaces compression/upload errors loudly,
and gives the XHR a finite `timeout` + `ontimeout` reject. Featured-image upload
stays small because it crops first; that is why it never exhibited this stall.
