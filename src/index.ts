import express, { Request, Response, NextFunction } from 'express';
import { scrapeAdLibrary } from './scraper';

const app = express();
app.use(express.json());

const API_KEY = process.env.PLAYWRIGHT_API_KEY;

// Health check - NO auth required
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    browser: 'chromium',
    timestamp: new Date().toISOString() 
  });
});

// Auth middleware for other routes
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authKey = req.headers['x-api-key'] || req.body?.apiKey;
  if (!API_KEY || authKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.post('/scrape', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { keyword, country = 'US', maxAds = 50, scrollCount = 5 } = req.body;
    
    if (!keyword) {
      return res.status(400).json({ error: 'keyword is required' });
    }
    
    console.log(`Starting scrape: keyword="${keyword}", country="${country}", maxAds=${maxAds}`);
    
    const result = await scrapeAdLibrary({ keyword, country, maxAds, scrollCount });
    
    console.log(`Scrape complete: found ${result.ads.length} ads, rateLimited=${result.rateLimited}`);
    
    res.json({ success: true, ...result, adsFound: result.ads.length });
  } catch (error: any) {
    console.error('Scrape error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CRITICAL: Use process.env.PORT and bind to 0.0.0.0
const PORT = process.env.PORT || 3000;
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Playwright server listening on 0.0.0.0:${PORT}`);
});
