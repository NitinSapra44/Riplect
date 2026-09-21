/**
 * Converts HEIC/HEIF files to JPEG before upload.
 * Falls back to returning the original file if conversion fails or is not needed.
 */

function isHeicFile(file: File): boolean {
  const heicMimes = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
  if (heicMimes.includes(file.type.toLowerCase())) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'heic' || ext === 'heif';
}

export async function convertIfHeic(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;

  try {
    const heic2any = (await import('heic2any')).default;
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    // heic2any may return a single Blob or an array (for HEIC sequences)
    const blob: Blob = Array.isArray(result) ? result[0] : result;
    const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], jpegName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (err) {
    console.error('[heicConvert] Conversion failed, using original file:', err);
    return file;
  }
}
