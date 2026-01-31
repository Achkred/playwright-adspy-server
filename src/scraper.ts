import { chromium, Page } from 'playwright';

// Type definitions
export interface ScrapeOptions {
  keyword: string;
  country: string;
  maxAds: number;
  scrollCount: number;
}

export interface AdData {
  ad_id: string;
  advertiser_name: string;
  advertiser_page_id?: string;
  landing_page_url?: string;
  preview_url: string;
  preview_image?: string;
  ad_start_date?: string;
  ad_copy?: string;
  cta_text?: string;
}

export interface ScrapeResult {
  ads: AdData[];
  rateLimited: boolean;
}

// Random user agents to avoid detection
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildSearchUrl(keyword: string, country: string): string {
  const params = new URLSearchParams({
    active_status: 'active',
    ad_type: 'all',
    country: country,
    q: keyword,
    media_type: 'all',
  });
  return `https://www.facebook.com/ads/library/?${params}`;
}

async function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function randomScroll(page: Page): Promise<void> {
  const scrollAmount = Math.floor(Math.random() * 400) + 800;
  await page.mouse.wheel(0, scrollAmount);
}

async function detectRateLimit(page: Page): Promise<boolean> {
  const content = await page.content();
  const lowerContent = content.toLowerCase();
  const indicators = [
    'rate limit',
    'too many requests',
    'please try again later',
    'temporarily blocked',
    'captcha',
    "verify you're human",
    'unusual traffic',
  ];
  return indicators.some(ind => lowerContent.includes(ind));
}

async function extractAdsFromPage(page: Page): Promise<AdData[]> {
  return page.evaluate(() => {
    const ads: AdData[] = [];
    
    // Multiple selector strategies for finding ad cards
    const cardSelectors = [
      'div[class*="xh8yej3"]',
      'div[class*="x1qjc9v5"]',
      '[data-testid="ad_library_card"]',
      'div[class*="x1dr59a3"]',
    ];
    
    let adCards: Element[] = [];
    for (const selector of cardSelectors) {
      const found = Array.from(document.querySelectorAll(selector));
      if (found.length > adCards.length) {
        adCards = found;
      }
    }
    
    console.log(`Found ${adCards.length} potential ad cards`);
    
    for (const card of adCards) {
      try {
        // Extract ad ID from links
        const adLink = card.querySelector('a[href*="/ads/library/?id="]');
        const href = adLink?.getAttribute('href') || '';
        const adIdMatch = href.match(/id=(\d+)/);
        if (!adIdMatch) continue;
        
        const adId = adIdMatch[1];
        
        // Extract advertiser name
        const advertiserSelectors = [
          'span[class*="x1lliihq"]',
          'strong',
          'a[href*="/ads/library/?active_status"] span',
          'div[class*="x1heor9g"] span',
        ];
        let advertiserName = 'Unknown';
        for (const sel of advertiserSelectors) {
          const el = card.querySelector(sel);
          if (el?.textContent?.trim() && el.textContent.trim().length > 1) {
            advertiserName = el.textContent.trim();
            break;
          }
        }
        
        // Extract landing page URL
        const landingLinks = card.querySelectorAll('a[href*="l.facebook.com/l.php"]');
        let landingPageUrl = '';
        for (const link of landingLinks) {
          const linkHref = link.getAttribute('href') || '';
          const match = linkHref.match(/u=([^&]+)/);
          if (match) {
            try {
              landingPageUrl = decodeURIComponent(match[1]);
              break;
            } catch (e) {
              // Ignore decode errors
            }
          }
        }
        
        // Also check for direct external links
        if (!landingPageUrl) {
          const externalLinks = card.querySelectorAll('a[href^="http"]');
          for (const link of externalLinks) {
            const linkHref = link.getAttribute('href') || '';
            if (!linkHref.includes('facebook.com') && !linkHref.includes('fb.com')) {
              landingPageUrl = linkHref;
              break;
            }
          }
        }
        
        // Extract preview image
        const imgSelectors = [
          'img[src*="scontent"]',
          'img[src*="fbcdn"]',
          'video[src*="scontent"]',
          'video[src*="fbcdn"]',
        ];
        let previewImage = '';
        for (const sel of imgSelectors) {
          const el = card.querySelector(sel);
          if (el) {
            previewImage = el.getAttribute('src') || el.getAttribute('poster') || '';
            if (previewImage) break;
          }
        }
        
        // Extract start date
        const cardText = card.textContent || '';
        const datePatterns = [
          /Started running on ([A-Za-z]+ \d+, \d{4})/,
          /Started running on (\d{1,2} [A-Za-z]+ \d{4})/,
          /Running since ([A-Za-z]+ \d+, \d{4})/,
        ];
        let adStartDate: string | undefined;
        for (const pattern of datePatterns) {
          const match = cardText.match(pattern);
          if (match) {
            adStartDate = match[1];
            break;
          }
        }
        
        // Extract ad copy
        const adCopySelectors = [
          'div[class*="x1iorvi4"]',
          'div[class*="xdj266r"]',
          'span[class*="x193iq5w"]',
        ];
        let adCopy = '';
        for (const sel of adCopySelectors) {
          const el = card.querySelector(sel);
          if (el?.textContent?.trim() && el.textContent.trim().length > 20) {
            adCopy = el.textContent.trim().substring(0, 500);
            break;
          }
        }
        
        // Extract CTA text
        const ctaPatterns = ['Shop Now', 'Learn More', 'Sign Up', 'Get Offer', 'Buy Now', 'Order Now', 'Subscribe'];
        let ctaText = '';
        for (const cta of ctaPatterns) {
          if (cardText.includes(cta)) {
            ctaText = cta;
            break;
          }
        }
        
        ads.push({
          ad_id: adId,
          advertiser_name: advertiserName,
          landing_page_url: landingPageUrl,
          preview_url: `https://www.facebook.com/ads/library/?id=${adId}`,
          preview_image: previewImage,
          ad_start_date: adStartDate,
          ad_copy: adCopy,
          cta_text: ctaText,
        });
        
      } catch (e) {
        console.error('Error extracting ad:', e);
      }
    }
    
    return ads;
  });
}

// Main scraping function
export async function scrapeAdLibrary(options: ScrapeOptions): Promise<ScrapeResult> {
  console.log(`[Scraper] Starting browser for keyword: "${options.keyword}"`);
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: getRandomUserAgent(),
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  // Add extra headers to appear more human-like
  await context.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  });

  const page = await context.newPage();
  
  try {
    const searchUrl = buildSearchUrl(options.keyword, options.country);
    console.log(`[Scraper] Navigating to: ${searchUrl}`);
    
    await page.goto(searchUrl, { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    // Wait a bit for dynamic content
    await randomDelay(2000, 4000);
    
    // Check for rate limiting
    if (await detectRateLimit(page)) {
      console.log('[Scraper] Rate limit detected!');
      return { ads: [], rateLimited: true };
    }
    
    // Collect ads with scrolling
    const allAds: AdData[] = [];
    const seenAdIds = new Set<string>();
    
    for (let i = 0; i < options.scrollCount; i++) {
      console.log(`[Scraper] Scroll ${i + 1}/${options.scrollCount}`);
      
      // Extract current ads
      const pageAds = await extractAdsFromPage(page);
      
      for (const ad of pageAds) {
        if (!seenAdIds.has(ad.ad_id)) {
          seenAdIds.add(ad.ad_id);
          allAds.push(ad);
        }
      }
      
      console.log(`[Scraper] Total unique ads: ${allAds.length}`);
      
      // Stop if we have enough
      if (allAds.length >= options.maxAds) {
        console.log('[Scraper] Reached maxAds limit');
        break;
      }
      
      // Scroll and wait
      await randomScroll(page);
      await randomDelay(1500, 3000);
      
      // Re-check for rate limiting
      if (await detectRateLimit(page)) {
        console.log('[Scraper] Rate limit detected during scroll!');
        return { ads: allAds.slice(0, options.maxAds), rateLimited: true };
      }
    }
    
    console.log(`[Scraper] Finished. Found ${allAds.length} ads total`);
    return { 
      ads: allAds.slice(0, options.maxAds), 
      rateLimited: false 
    };
    
  } catch (error) {
    console.error('[Scraper] Error:', error);
    throw error;
  } finally {
    await browser.close();
    console.log('[Scraper] Browser closed');
  }
}
