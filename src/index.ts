import express, { Request, Response, NextFunction } from 'express';
import { scrapeAdLibrary, ScrapeOptions } from './scraper';

const app = express();
app.use(express.json());

// Get API key from environment
const API_KEY = process.env.PLAYWRIGHT_API_KEY;

// Authentication middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  // Skip auth for health check
  if (req.path === '/health') {
    return next();
  }
  
  const authKey = req.headers['x-api-key'] || req.body?.apiKey;
  if (!API_KEY || authKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Playwright server is running'
  });
});

// Main scraping endpoint
app.post('/scrape', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { 
      keyword, 
      country = 'US', 
      maxAds = 50, 
      scrollCount = 5 
    } = req.body;
    
    // Validate input
    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'keyword is required and must be a string' 
      });
    }
    
    console.log(`[SCRAPE] Starting: keyword="${keyword}", country=${country}, maxAds=${maxAds}`);
    
    const options: ScrapeOptions = { 
      keyword: keyword.trim(), 
      country, 
      maxAds, 
      scrollCount 
    };
    
    const result = await scrapeAdLibrary(options);
    
    const duration = Date.now() - startTime;
    console.log(`[SCRAPE] Completed: ${result.ads.length} ads found in ${duration}ms`);
    
    res.json({ 
      success: true, 
      ...result,
      adsFound: result.ads.length,
      durationMs: duration
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SCRAPE] Error:', errorMessage);
    
    res.status(500).json({ 
      success: false, 
      error: errorMessage,
      ads: [],
      rateLimited: false
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`Playwright Ad Spy Server`);
  console.log(`Running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`========================================`);
});
