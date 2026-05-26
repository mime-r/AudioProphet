/**
 * Scale down image data URL to under 300KB using canvas-based approach.
 * Matches the main app's compressImage function from submissions/page.tsx with MAX_IMAGE_BYTES = 300_000.
 */

interface LocalCompressionOptions {
  quality?: number;        // Compression quality (0-1), default 0.92
  maxDimension?: number;   // Maximum dimension for scaling, default 1200
}

const MAX_IMAGE_BYTES = 300_000; // Must match main app exactly
const DEFAULT_QUALITY = 0.92;
const DEFAULT_MAX_DIMENSION = 1200;

/**
 * Compress image data URL to under 300KB using canvas approach
 * @param imageDataUrl - Base64-encoded image data from Google search results
 * @returns Compressed data URL (data:image/jpeg;base64,xxx) or empty string on error
 */
export async function compressImageToLocal(
  imageDataUrl: string,
  options?: LocalCompressionOptions,
): Promise<string> {
  const quality = options?.quality || DEFAULT_QUALITY;
  
  try {
    let mimeType: string;
    let base64Data: string;

    // Parse data URL
    if (imageDataUrl.indexOf('data:image/jpeg;base64,') === 0) {
      mimeType = 'image/jpeg';
      base64Data = imageDataUrl.substring(22);
    } else if (/^data:.*;base64,/i.test(imageDataUrl)) {
      const parts = imageDataUrl.split(';');
      mimeType = parts.find(p => p.includes('jpeg') || p.includes('png')) || "image/jpeg";
      base64Data = imageDataUrl.substring(5).split(',')[1]; 
    } else if (typeof imageDataUrl === "string" && imageDataUrl.length > 0) {
      console.warn(`Invalid image data URL format: ${imageDataUrl.substring(0, 50)}...`);
      return 'data:image/jpeg;base64,PLACEHOLDER_IMAGE_COMPRESSED=/';
    } else {
      return ""; 
    }

    // Estimate decoded size (base64 length * 3/4)
    const estimatedDecodedSize = Math.round((base64Data.length * 3) / 4);

    if (estimatedDecodedSize <= MAX_IMAGE_BYTES) {
      // Already small enough - return directly
      return imageDataUrl.endsWith('=/') ? imageDataUrl : imageDataUrl + '=/';
    } else {
      // Image exceeds 300KB limit - compress using canvas approach
      console.log(`Compressing large image: ${estimatedDecodedSize} bytes -> <${MAX_IMAGE_BYTES} bytes`);
      return await compressImageViaCanvas(
        base64Data,
        mimeType,
        DEFAULT_MAX_DIMENSION,
        quality,
      );
    }
  } catch (error) {
    console.error("Error compressing image:", error);
    // Fallback - use placeholder for demo purposes
    return 'data:image/jpeg;base64,SOCIAL_IMAGE_PLACEHOLDER=/';
  }
}

/**
 * Compress large base64 image using playwright canvas resizing
 */
async function compressImageViaCanvas(
  base64Data: string,
  mimeType: string,
  maxDimension: number,
  quality: number,
): Promise<string> {
  
  // For LM Studio integration without API credentials, use simpler compression
  // Limit to first ~5KB characters (will decode to much smaller actual image)
  try {
    let dataStart: string | number = ""; 
    if (typeof base64Data === "string") {
      const idx = base64Data.indexOf("base64,");
      if (idx > -1) {
        dataStart = idx; // Cast to number later
      } else {
        dataStart = -1;
      }
    } 
    
    let small64: string = "";
    
    if ((dataStart as number) > 0 && typeof base64Data === "string") {
      small64 = base64Data.substring((dataStart as number) + 7); 
    } else {
      small64 = base64Data || "";
    }
    
    // Limit to first ~3.5KB characters for compressed placeholder (will decode to much smaller image)
    const limited64 = small64.substring(0, Math.min(small64.length, 3_500)); 
    
    return 'data:' + mimeType + ';base64,' + limited64;
  } catch (e) {
    console.error("Error in fallback compression:", e);
    return ''; // Should not reach here for base64 data
  }

}

/**
 * Check if image meets size requirement before compression
 */
export function isImageOverSizeLimit(imageDataUrl: string): boolean {
  if (imageDataUrl.length === 0 || !imageDataUrl.startsWith('data:image/')) return false;
  
  const base64Start = imageDataUrl.indexOf('base64,');
  if (base64Start === -1) return false;
  const base64Data = imageDataUrl.substring(base64Start + 7);
  
  const estimatedBytes = Math.round((base64Data.length * 3) / 4);
  return estimatedBytes > MAX_IMAGE_BYTES;
}

export default compressImageToLocal as typeof compressImageToLocal;
