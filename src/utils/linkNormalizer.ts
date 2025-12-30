/**
 * Normalizes a URL by removing tracking parameters and standardizing format
 * This helps detect duplicate links even if they have different UTM params
 */
export function normalizeLink(url: string): string {
  try {
    // Trim and lowercase
    const trimmed = url.trim().toLowerCase();

    // Parse the URL
    const urlObj = new URL(trimmed);

    // Remove common tracking parameters
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'ref',
      'source',
      '_ga',
      'mc_cid',
      'mc_eid',
    ];

    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });

    // Sort remaining params for consistency
    urlObj.searchParams.sort();

    // Return normalized URL
    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, just return trimmed lowercase version
    return url.trim().toLowerCase();
  }
}

/**
 * Checks if two URLs are the same after normalization
 */
export function areLinksSame(url1: string, url2: string): boolean {
  return normalizeLink(url1) === normalizeLink(url2);
}

/**
 * Creates a hash from a normalized link for database indexing
 * This ensures atomic duplicate detection with unique constraints
 */
export function createLinkHash(url: string): string {
  const normalized = normalizeLink(url);

  // Use a simple hash function (in production, consider crypto.createHash)
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `link_${Math.abs(hash).toString(36)}_${normalized.length}`;
}
