const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');
const axios = require('axios');
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const cache = new NodeCache({ stdTTL: 180 });
const rssParser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'SIGINT-WorldWatch/1.0 (+https://sigint-worldwatch.app)' },
  customFields: { item: ['media:content', 'media:thumbnail', 'dc:creator'] },
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── USAGE TRACKING ──────────────────────────────────────────────────────────
const USAGE_FILE = path.join(__dirname, 'usage.json');

function loadUsage() {
  try {
    if (fs.existsSync(USAGE_FILE)) return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveUsage(data) {
  try { fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2)); } catch {}
}

function trackUsage(apiId) {
  const usage = loadUsage();
  if (!usage[apiId]) usage[apiId] = { calls: 0, lastUsed: null };
  usage[apiId].calls++;
  usage[apiId].lastUsed = new Date().toISOString();
  saveUsage(usage);
}

// ─── KEY RESOLUTION ───────────────────────────────────────────────────────────
// Priority: request header → .env file
function getKey(req, headerName, envName) {
  return req.headers[headerName] || process.env[envName] || null;
}


// ─── RSS FEED SOURCES ────────────────────────────────────────────────────────
const RSS_FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/worldNews',           source: 'Reuters',      weight: 3 },
  { url: 'https://feeds.reuters.com/reuters/topNews',             source: 'Reuters',      weight: 3 },
  { url: 'http://feeds.bbci.co.uk/news/world/rss.xml',            source: 'BBC World',    weight: 3 },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',             source: 'Al Jazeera',   weight: 3 },
  { url: 'https://www.theguardian.com/world/rss',                 source: 'The Guardian', weight: 2 },
  { url: 'https://apnews.com/rss/world-news',                     source: 'AP News',      weight: 3 },
  { url: 'https://www.france24.com/en/rss',                       source: 'France 24',    weight: 2 },
  { url: 'https://www.dw.com/en/rss/all/rss.xml',                 source: 'DW News',      weight: 2 },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',source: 'NY Times',     weight: 2 },
  { url: 'https://www.washingtontimes.com/rss/headlines/world/',  source: 'Washington Times', weight: 1 },
  { url: 'https://www.thehindu.com/news/international/feeder/default.rss', source: 'The Hindu', weight: 2 },
  { url: 'https://www.scmp.com/rss/2/feed',                       source: 'SCMP',         weight: 2 },
  { url: 'https://feeds.skynews.com/feeds/rss/world.xml',         source: 'Sky News',     weight: 2 },
  { url: 'https://www.euronews.com/rss?level=theme&name=news',    source: 'Euronews',     weight: 2 },
  { url: 'https://www.straitstimes.com/rss/world',                source: 'Straits Times',weight: 2 },
];

// ─── CLASSIFICATION DATA ─────────────────────────────────────────────────────
const REGION_KEYWORDS = {
  middle_east: [
    'iran','israel','gaza','palestine','hamas','hezbollah','lebanon','syria','iraq',
    'yemen','saudi','qatar','turkey','hormuz','tehran','tel aviv','baghdad','beirut',
    'middle east','persian gulf','idf','irgc','houthi','west bank','ramallah',
    'netanyahu','khamenei','erdogan','riyadh','doha','abu dhabi','dubai','jordan','egypt'
  ],
  europe: [
    'ukraine','russia','nato','europe','european','poland','germany','france','uk',
    'britain','brussels','moscow','kyiv','putin','zelensky','balkans','moldova','belarus',
    'finland','sweden','hungary','serbia','kosovo','crimea','donbas','eu sanctions',
    'macron','scholz','sunak','orbán','warsaw','berlin','paris'
  ],
  asia: [
    'china','taiwan','north korea','south korea','japan','india','pakistan','afghanistan',
    'myanmar','philippines','south china sea','xi jinping','kim jong','beijing','tokyo',
    'asia','pacific','pla','dprk','indo-pacific','strait of taiwan','ladakh','kashmir',
    'modi','abe','seoul','new delhi','islamabad','kabul','rangoon','manila'
  ],
  usa: [
    'trump','biden','congress','senate','pentagon','washington','white house','state department',
    'cia','fbi','sanctions','tariffs','us policy','american','united states','nato ally',
    'us military','us troops','us dollar','federal reserve','trump administration','doge'
  ],
  africa: [
    'africa','sudan','ethiopia','somalia','sahel','mali','niger','libya','nigeria','kenya',
    'congo','mozambique','eritrea','djibouti','burkina faso','chad','rwanda','zimbabwe',
    'south africa','wagner','au summit','addis ababa','nairobi','kinshasa','khartoum'
  ],
};

const URGENCY_KEYWORDS = {
  CRITICAL: [
    'attack','killed','kills','killing','bombing','bombed','missile strike','airstrike',
    'air strike','troops advance','invasion','invade','nuclear','explosion','exploded',
    'casualties','dead','deaths','battle','combat','coup','coup attempt','assassination',
    'assassinated','hostage','war declared','ceasefire broken','ground offensive',
    'naval blockade','shoot down','shot down','chemical weapon','biological weapon'
  ],
  HIGH: [
    'crisis','escalation','escalate','military buildup','sanctions imposed','threat','tensions rise',
    'conflict','protest crackdown','clash','arrested','seized','blockade','ultimatum','deploy',
    'warship','fighter jet','mobilize','mobilization','emergency','martial law','evacuation',
    'expel','expelled','diplomatic crisis','condemn','condemns','retaliatory','retaliation'
  ],
  MEDIUM: [
    'diplomatic','talks','negotiations','warning','concern','dispute','agreement','treaty',
    'trade war','tariff','referendum','summit','ceasefire','peace talks','sanctions threat',
    'military exercise','drill','test missile','nuclear test','spy','espionage','cyber attack'
  ],
  LOW: [
    'election','vote','meeting','statement','accord','aid','cooperation','deal','alliance',
    'state visit','bilateral','multilateral','g7','g20','un resolution','speech','address'
  ],
};

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────
function classifyRegion(text) {
  const lower = (text || '').toLowerCase();
  const scores = {};
  for (const [region, keywords] of Object.entries(REGION_KEYWORDS)) {
    scores[region] = keywords.filter(kw => lower.includes(kw)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : 'global';
}

function classifyUrgency(text) {
  const lower = (text || '').toLowerCase();
  for (const [urgency, keywords] of Object.entries(URGENCY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return urgency;
  }
  return 'LOW';
}

function getTimeAgo(dateStr) {
  if (!dateStr) return 'Recently';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return 'Recently';
  const diffMs   = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs  = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);
  if (diffMins < 1)  return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs  < 24) return `${diffHrs}h ago`;
  if (diffDays < 7)  return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getPubTime(dateStr) {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  return isNaN(t) ? 0 : t;
}

const GEO_FILTER_KEYWORDS = [
  'war','conflict','military','attack','government','president','minister','sanctions',
  'treaty','nuclear','troops','border','diplomatic','crisis','election','protest',
  'coup','terrorism','refugee','ceasefire','nato','united nations','security council',
  'drone','missile','bombing','invasion','airstrike','navy','army','air force',
  'geopolitic','foreign policy','bilateral','multilateral','insurgent','rebel',
  ...Object.values(REGION_KEYWORDS).flat().slice(0, 60),
];

function isGeopolitical(text) {
  const lower = (text || '').toLowerCase();
  return GEO_FILTER_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── DATA SOURCES ────────────────────────────────────────────────────────────
async function fetchRSSFeeds(regionFilter = 'all') {
  const results = [];

  await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, source }) => {
      try {
        const feed = await rssParser.parseURL(url);
        const items = feed.items.slice(0, 20);
        for (const item of items) {
          const text = `${item.title || ''} ${item.contentSnippet || item.summary || item.content || ''}`;
          if (!isGeopolitical(text)) continue;

          const region = classifyRegion(text);
          if (regionFilter !== 'all' && region !== regionFilter && region !== 'global') continue;

          results.push({
            headline: (item.title || '').replace(/\s+/g, ' ').trim().slice(0, 130),
            summary:  (item.contentSnippet || item.summary || '').replace(/<[^>]*>/g, '').slice(0, 500),
            source,
            time:     getTimeAgo(item.pubDate || item.isoDate),
            pubDate:  getPubTime(item.pubDate || item.isoDate),
            region,
            urgency:  classifyUrgency(text),
            url:      item.link || '',
            tags:     [],
          });
        }
      } catch (e) {
        // Silent fail per feed — don't crash the whole request
      }
    })
  );

  return results;
}

// Track last GDELT call time to self-rate-limit
let lastGdeltCall = 0;
const GDELT_MIN_INTERVAL = 10000; // 10s between GDELT calls

async function fetchGDELT(query) {
  const now = Date.now();
  if (now - lastGdeltCall < GDELT_MIN_INTERVAL) {
    return []; // too soon, skip silently
  }
  lastGdeltCall = now;
  try {
    const encoded = encodeURIComponent(query);
    // Use a longer timespan and fewer results to reduce hitting rate limits
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encoded}&mode=artlist&maxrecords=15&format=json&timespan=12h&sort=DateDesc&sourcelang=english`;
    const res = await axios.get(url, { timeout: 12000 });
    const articles = res.data?.articles || [];

    return articles
      .filter(a => a.title && a.title.length > 20)
      .map(a => ({
        headline: a.title.replace(/\s+/g, ' ').trim().slice(0, 130),
        summary:  `Source: ${a.domain || 'Unknown'} — ${a.url || ''}`.slice(0, 300),
        source:   a.domain ? a.domain.replace(/^www\./, '').split('.')[0].toUpperCase() : 'GDELT',
        time:     a.seendate ? getTimeAgo(
          `${a.seendate.slice(0,4)}-${a.seendate.slice(4,6)}-${a.seendate.slice(6,8)}T${a.seendate.slice(9,11)}:${a.seendate.slice(11,13)}:00Z`
        ) : 'Recently',
        pubDate:  a.seendate ? new Date(
          `${a.seendate.slice(0,4)}-${a.seendate.slice(4,6)}-${a.seendate.slice(6,8)}T${a.seendate.slice(9,11)}:${a.seendate.slice(11,13)}:00Z`
        ).getTime() : 0,
        region:   classifyRegion(a.title),
        urgency:  classifyUrgency(a.title),
        url:      a.url || '',
        tags:     ['gdelt'],
      }));
  } catch (e) {
    if (e.response?.status === 429) {
      console.warn('GDELT rate limited — will retry on next refresh cycle');
    } else {
      console.warn('GDELT fetch failed:', e.message);
    }
    return [];
  }
}

async function fetchNewsAPI(query, apiKey) {
  if (!apiKey) return [];
  try {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&sortBy=publishedAt&pageSize=30&apiKey=${apiKey}`;
    const res = await axios.get(url, { timeout: 10000 });
    return (res.data?.articles || [])
      .filter(a => a.title && a.title !== '[Removed]')
      .map(a => ({
        headline: (a.title || '').slice(0, 130),
        summary:  (a.description || '').slice(0, 500),
        source:   a.source?.name || 'NewsAPI',
        time:     getTimeAgo(a.publishedAt),
        pubDate:  getPubTime(a.publishedAt),
        region:   classifyRegion(`${a.title} ${a.description}`),
        urgency:  classifyUrgency(`${a.title} ${a.description}`),
        url:      a.url || '',
        tags:     [],
      }));
  } catch (e) {
    console.warn('NewsAPI fetch failed:', e.message);
    return [];
  }
}

async function fetchMediastack(query, apiKey) {
  if (!apiKey) return [];
  try {
    const url = `http://api.mediastack.com/v1/news?access_key=${apiKey}&keywords=${encodeURIComponent(query)}&languages=en&sort=published_desc&limit=25`;
    const res = await axios.get(url, { timeout: 10000 });
    return (res.data?.data || [])
      .filter(a => a.title)
      .map(a => ({
        headline: (a.title || '').slice(0, 130),
        summary:  (a.description || '').slice(0, 500),
        source:   a.source || 'Mediastack',
        time:     getTimeAgo(a.published_at),
        pubDate:  getPubTime(a.published_at),
        region:   classifyRegion(`${a.title} ${a.description}`),
        urgency:  classifyUrgency(`${a.title} ${a.description}`),
        url:      a.url || '',
        tags:     [],
      }));
  } catch (e) {
    console.warn('Mediastack fetch failed:', e.message);
    return [];
  }
}

// ─── REGION QUERIES ───────────────────────────────────────────────────────────
const REGION_QUERIES = {
  all:         'world war conflict geopolitics military politics 2026',
  middle_east: 'Iran Israel Gaza Lebanon Houthi Middle East war attack 2026',
  europe:      'Ukraine Russia NATO war Europe missile attack 2026',
  asia:        'China Taiwan North Korea South China Sea military 2026',
  usa:         'US foreign policy Trump sanctions Pentagon military 2026',
  africa:      'Africa conflict Sudan Ethiopia Sahel militia 2026',
};

// ─── MAIN NEWS ENDPOINT ──────────────────────────────────────────────────────
app.get('/api/news', async (req, res) => {
  const region = req.query.region || 'all';
  const forceRefresh = req.query.refresh === '1';
  const cacheKey = `news_${region}`;

  if (!forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      cached.meta.fromCache = true;
      return res.json(cached);
    }
  }

  const query = REGION_QUERIES[region] || REGION_QUERIES.all;

  // Resolve keys: header first, then .env
  const newsApiKey    = getKey(req, 'x-newsapi-key',    'NEWS_API_KEY');
  const mediastackKey = getKey(req, 'x-mediastack-key', 'MEDIASTACK_KEY');

  const [rssArticles, gdeltArticles, newsApiArticles, mediastackArticles] = await Promise.all([
    fetchRSSFeeds(region),
    fetchGDELT(query),
    fetchNewsAPI(query, newsApiKey),
    fetchMediastack(query, mediastackKey),
  ]);

  // Track usage for paid APIs
  if (newsApiKey    && newsApiArticles.length    > 0) trackUsage('newsapi');
  if (mediastackKey && mediastackArticles.length > 0) trackUsage('mediastack');

  let all = [...rssArticles, ...gdeltArticles, ...newsApiArticles, ...mediastackArticles];

  const seen = new Set();
  const deduped = all.filter(a => {
    if (!a.headline || a.headline.length < 10) return false;
    const key = a.headline.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sorted = deduped.sort((a, b) => b.pubDate - a.pubDate).slice(0, 50);

  const result = {
    articles: sorted,
    meta: {
      total:       sorted.length,
      critical:    sorted.filter(a => a.urgency === 'CRITICAL').length,
      high:        sorted.filter(a => a.urgency === 'HIGH').length,
      sources:     new Set(sorted.map(a => a.source)).size,
      lastUpdated: new Date().toISOString(),
      fromCache:   false,
      breakdown: {
        rss:        rssArticles.length,
        gdelt:      gdeltArticles.length,
        newsapi:    newsApiArticles.length,
        mediastack: mediastackArticles.length,
      }
    },
  };

  cache.set(cacheKey, result);
  res.json(result);
});

// ─── CHAT ENDPOINT ────────────────────────────────────────────────────────────
const ANALYST_SYSTEM = `You are the SIGINT WorldWatch geopolitical intelligence analyst — an expert in international relations, military strategy, economics, history, and geopolitics. Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

Your role:
- Explain geopolitical events clearly with historical context
- Analyze downstream impacts on countries, economies, trade, and alliances
- Provide data-driven predictions with confidence levels (e.g., "High confidence 70%")
- Use specific numbers: trade volumes, military units, GDP impact, refugee numbers, etc.
- Be concise but thorough — use bullet points for key facts
- Never be sensational; be analytical and objective
- Cover ripple effects (e.g., if asked about Strait of Hormuz, cover India's oil imports, shipping costs, global inflation)

Response format:
📍 **SITUATION** — brief current status
📚 **BACKGROUND** — key historical context (2-3 sentences)  
🌍 **IMPACT ANALYSIS** — bullet points per affected region/country
📊 **KEY DATA** — relevant statistics
🔮 **ASSESSMENT** — probability-weighted prediction
⚠️ **WATCH POINTS** — what to monitor next

Keep responses under 600 words unless the topic demands more depth.`;

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  // Resolve keys: header first, then .env
  const groqKey       = getKey(req, 'x-groq-key',       'GROQ_API_KEY');
  const anthropicKey  = getKey(req, 'x-anthropic-key',  'ANTHROPIC_API_KEY');
  const openaiKey     = getKey(req, 'x-openai-key',     'OPENAI_API_KEY');
  const openrouterKey = getKey(req, 'x-openrouter-key', 'OPENROUTER_KEY');

  // Try Groq first (recommended — free & fast)
  if (groqKey) {
    try {
      const groqRes = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        { model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: ANALYST_SYSTEM }, ...messages], max_tokens: 1200, temperature: 0.65 },
        { headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
      );
      trackUsage('groq');
      return res.json({ response: groqRes.data.choices[0]?.message?.content || 'No response', provider: 'groq' });
    } catch (e) { console.warn('Groq error:', e.message); }
  }

  // Try Anthropic Claude Haiku
  if (anthropicKey) {
    try {
      const anthRes = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: 'claude-haiku-20240307', max_tokens: 1200, system: ANALYST_SYSTEM, messages },
        { headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 30000 }
      );
      trackUsage('anthropic');
      return res.json({ response: anthRes.data.content[0]?.text || 'No response', provider: 'anthropic' });
    } catch (e) { console.warn('Anthropic error:', e.message); }
  }

  // Try OpenAI GPT-4o mini
  if (openaiKey) {
    try {
      const oaiRes = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        { model: 'gpt-4o-mini', messages: [{ role: 'system', content: ANALYST_SYSTEM }, ...messages], max_tokens: 1200, temperature: 0.65 },
        { headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
      );
      trackUsage('openai');
      return res.json({ response: oaiRes.data.choices[0]?.message?.content || 'No response', provider: 'openai' });
    } catch (e) { console.warn('OpenAI error:', e.message); }
  }

  // Try OpenRouter
  if (openrouterKey) {
    try {
      const orRes = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        { model: 'meta-llama/llama-3.1-8b-instruct:free', messages: [{ role: 'system', content: ANALYST_SYSTEM }, ...messages], max_tokens: 1000 },
        { headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://sigint-worldwatch.app' }, timeout: 30000 }
      );
      trackUsage('openrouter');
      return res.json({ response: orRes.data.choices[0]?.message?.content || 'No response', provider: 'openrouter' });
    } catch (e) { console.warn('OpenRouter error:', e.message); }
  }

  res.status(503).json({
    error: 'No AI API key configured. Click ⚙ in the top bar to add your API keys.',
  });
});

// Usage stats endpoint
app.get('/api/usage', (req, res) => {
  res.json(loadUsage());
});

// Reset usage for a specific API
app.post('/api/usage/reset', (req, res) => {
  const { apiId } = req.body;
  const usage = loadUsage();
  if (apiId) {
    delete usage[apiId];
  } else {
    Object.keys(usage).forEach(k => delete usage[k]);
  }
  saveUsage(usage);
  res.json({ success: true, usage });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'operational',
    time: new Date().toISOString(),
    apis: {
      newsapi:    !!process.env.NEWS_API_KEY,
      mediastack: !!process.env.MEDIASTACK_KEY,
      groq:       !!process.env.GROQ_API_KEY,
      anthropic:  !!process.env.ANTHROPIC_API_KEY,
      openai:     !!process.env.OPENAI_API_KEY,
      openrouter: !!process.env.OPENROUTER_KEY,
    },
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🌍 SIGINT WorldWatch Backend — Port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   News:   http://localhost:${PORT}/api/news`);
  console.log(`   Chat:   http://localhost:${PORT}/api/chat\n`);
});
