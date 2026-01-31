import { chromium, Page } from 'playwright';

interface ScrapeOptions {
  keyword: string;
  country: string;
  maxAds: number;
  scrollCount: number;
}

interface AdData {
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

export async function scrapeAdLibrary(options: ScrapeOptions): Promise<{
  ads: AdData[];
  rateLimited: boolean;
}> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: getRandomUserAgent(),
  });

  const page = await context.newPage();
  
  try {
    const searchUrl = buildSearchUrl(options.keyword, options.country);
    console.log(`Navigating to: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Check for rate limiting
    if (await detectRateLimit(page)) {
      console.log('Rate limit detected');
      return { ads: [], rateLimited: true };
    }
    
    // Wait for content to load
    await page.waitForTimeout(2000);
    
    // Scroll to load more ads
    const ads: AdData[] = [];
    for (let i = 0; i < options.scrollCount; i++) {
      await randomScroll(page);
      await randomDelay(1500, 3000);
      
      const newAds = await extractAdsFromPage(page);
      for (const ad of newAds) {
        if (!ads.find(a => a.ad_id === ad.ad_id)) {
          ads.push(ad);
        }
      }
      
      console.log(`Scroll ${i + 1}/${options.scrollCount}: found ${ads.length} ads`);
      
      if (ads.length >= options.maxAds) break;
    }
    
    return { ads: ads.slice(0, options.maxAds), rateLimited: false };
  } finally {
    await browser.close();
  }
}

async function extractAdsFromPage(page: Page): Promise<AdData[]> {
  return page.evaluate(() => {
    const ads: AdData[] = [];
    
    // Find all ad links containing ad IDs
    const adLinks = document.querySelectorAll('a[href*="/ads/library/?id="]');
    const processedIds = new Set<string>();
    
    for (const link of adLinks) {
      const href = link.getAttribute('href') || '';
      const adIdMatch = href.match(/id=(\d+)/);
      if (!adIdMatch) continue;
      
      const adId = adIdMatch[1];
      if (processedIds.has(adId)) continue;
      processedIds.add(adId);
      
      // Find the parent card container
      let card = link.closest('div[class*="x1dr59a3"]') || 
                 link.closest('div[class*="xh8yej3"]') ||
                 link.parentElement?.parentElement?.parentElement;
      
      if (!card) continue;
      
      // Extract advertiser name
      const advertiserEl = card.querySelector('span[class*="x1lliihq"]') || 
                           card.querySelector('strong') ||
                           card.querySelector('a[href*="facebook.com/"]');
      const advertiserName = advertiserEl?.textContent?.trim() || 'Unknown';
      
      // Extract landing page URL
      let landingPageUrl = '';
      const landingLinks = card.querySelectorAll('a[href*="l.facebook.com/l.php"]');
      for (const lLink of landingLinks) {
        const lHref = lLink.getAttribute('href') || '';
        const match = lHref.match(/u=([^&]+)/);
        if (match) {
          landingPageUrl = decodeURIComponent(match[1]);
          break;
        }
      }
      
      // Extract preview image
      const imgEl = card.querySelector('img[src*="scontent"]');
      const previewImage = imgEl?.getAttribute('src') || '';
      
      // Extract start date
      const cardText = card.textContent || '';
      const dateMatch = cardText.match(/Started running on ([A-Za-z]+ \d+, \d{4})/);
      const adStartDate = dateMatch ? dateMatch[1] : undefined;
      
      // Extract ad copy (longer text content)
      let adCopy = '';
      const textNodes = card.querySelectorAll('span, div');
      for (const node of textNodes) {
        const text = node.textContent?.trim() || '';
        if (text.length > 50 && text.length < 1000 && !text.includes('Started running')) {
          adCopy = text;
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
        cta_text: '',
      });
    }
    
    return ads;
  });
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

async function randomScroll(page: Page): Promise<void> {
  const scrollAmount = Math.floor(Math.random() * 400) + 800;
  await page.mouse.wheel(0, scrollAmount);
}

async function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function detectRateLimit(page: Page): Promise<boolean> {
  const content = await page.content();
  const indicators = [
    'rate limit', 'too many requests',
    'please try again later', 'temporarily blocked',
    'captcha', "verify you're human",
  ];
  const lowerContent = content.toLowerCase();
  return indicators.some(ind => lowerContent.includes(ind));
}

function getRandomUserAgent(): string {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}
