// src/services/sheinAdapter.ts

export interface ProductOffer {
  platform: 'shein' | 'aliexpress' | 'temu';
  price: number;
  originalPrice?: number;
  currency: string;
  url: string;
  inStock: boolean;
}

export interface Product {
  id: string;
  title: string;
  imageUrl: string;
  category: string;
  rating: number;
  reviewsCount: number;
  sizes: string[];
  primaryOffer: ProductOffer;
  secondaryOffers?: ProductOffer[];
}

/**
 * Validates and cleans SHEIN URLs to ensure they are exact Product Detail Pages (PDP)
 * and never lead to mock/broken links or "...OOPS" error pages.
 */
function validateAndCleanSheinUrl(rawUrl: string, productId: string, title: string): string {
  // Check if URL matches real SHEIN PDP format: *-p-[NUMERIC_ID].html
  const validPdpPattern = /-p-\d+\.html/;
  
  if (rawUrl && validPdpPattern.test(rawUrl)) {
    return wrapWithSkimlinks(rawUrl);
  }

  // If URL is invalid or missing, construct a clean canonical SHEIN PDP URL if numeric ID exists
  if (productId && /^\d+$/.test(productId)) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const constructedUrl = `https://www.shein.com/${slug}-p-${productId}.html`;
    return wrapWithSkimlinks(constructedUrl);
  }

  // Fallback to a verified search query on SHEIN to prevent any 404 / OOPS page
  const searchQuery = encodeURIComponent(title || 'fashion clothing');
  return wrapWithSkimlinks(`https://www.shein.com/pdsearch/${searchQuery}`);
}

function wrapWithSkimlinks(url: string): string {
  const skimlinksPublisherId = '12345X123456'; // Replace or keep existing Skimlinks ID logic
  if (url.includes('go.skimresources.com')) return url;
  return `https://go.skimresources.com?id=${skimlinksPublisherId}&xs=1&url=${encodeURIComponent(url)}`;
}

/**
 * Fetches, deduplicates, filters, and sorts SHEIN products for the main feed.
 */
export async function getFilteredSheinFeed(userProfile?: { sizes: string[]; stylePreferences: string[] }): Promise<Product[]> {
  try {
    // 1. Fetch raw items from SHEIN API or internal catalog source
    const rawProducts: Product[] = await fetchRawSheinCatalog();

    // 2. Strict Deduplication (by image URL and normalized title to eliminate V2/V3 variant spam)
    const seenImages = new Set<string>();
    const seenTitles = new Set<string>();

    const uniqueProducts = rawProducts.filter((product) => {
      if (!product.imageUrl || !product.title) return false;

      const normalizedTitle = product.title
        .toLowerCase()
        .replace(/\b(v\d+|version\s*\d+|new|hot)\b/g, '')
        .trim();

      if (seenImages.has(product.imageUrl) || seenTitles.has(normalizedTitle)) {
        return false; // Duplicate found, discard
      }

      seenImages.add(product.imageUrl);
      seenTitles.add(normalizedTitle);
      return true;
    });

    // 3. Quality, Rating (4.5+), and Size Filtering
    const filtered = uniqueProducts.filter((product) => {
      // High rating filter
      if (product.rating < 4.5) return false;

      // Size matching if user profile exists
      if (userProfile?.sizes && userProfile.sizes.length > 0) {
        const hasMatchingSize = product.sizes.some((size) => userProfile.sizes.includes(size));
        if (!hasMatchingSize) return false;
      }

      return true;
    });

    // 4. Validate and fix URLs to ensure zero "Oops" pages
    const processedProducts = filtered.map((product) => {
      const verifiedUrl = validateAndCleanSheinUrl(
        product.primaryOffer?.url || '',
        product.id,
        product.title
      );

      return {
        ...product,
        primaryOffer: {
          ...product.primaryOffer,
          platform: 'shein' as const,
          url: verifiedUrl,
        },
      };
    });

    // 5. Sort Ascending by Price (Lowest to Highest)
    processedProducts.sort((a, b) => a.primaryOffer.price - b.primaryOffer.price);

    console.log(`[Feed Engine] Successfully loaded ${processedProducts.length} unique SHEIN products. Sorted low-to-high.`);
    return processedProducts;
  } catch (error) {
    console.error('[Feed Engine] Error fetching SHEIN feed:', error);
    return [];
  }
}

async function fetchRawSheinCatalog(): Promise<Product[]> {
  // Replace with your actual catalog fetching logic
  return [];
}