# 🌍 SIGINT // WORLDWATCH
### Real-Time Geopolitical Intelligence Dashboard

A full-stack, publishable geopolitical news dashboard with:
- **Multi-source real-time scraping** (RSS feeds, GDELT, NewsAPI, Mediastack)
- **Live timestamps** (Just now / 5m ago / 2h ago — color-coded for freshness)
- **AI chatbot analyst** (ask geopolitical questions, get expert analysis with predictions)
- **Auto-refresh** every 3 minutes in the background
- **Zero direct frontend API calls** — all scraping goes through your backend

---

## 🚀 Quick Start

### 1. Clone and Install
```bash
git clone <your-repo>
cd sigint-worldwatch

# Install all dependencies
npm run install:all
```

### 2. Configure API Keys
```bash
cp .env.example backend/.env
```

Edit `backend/.env` — **minimum required for chatbot:**
```
GROQ_API_KEY=your_groq_key_here    # FREE at console.groq.com
```

### 3. Run Development
```bash
# Terminal 1 — Backend
cd backend && npm start

# Terminal 2 — Frontend  
cd frontend && npm start
```

Open `http://localhost:3000`

---

## 📡 Data Sources (All Free)

| Source | What it provides | Setup |
|--------|-----------------|-------|
| **15+ RSS Feeds** | Reuters, BBC, Al Jazeera, AP, Guardian, France24, DW, NY Times, SCMP, Sky News... | ✅ No key needed |
| **GDELT Project** | Global event database, geopolitical focus | ✅ No key needed |
| **NewsAPI** | 100 req/day free tier | Optional — newsapi.org |
| **Mediastack** | 500 req/month free tier | Optional — mediastack.com |

---

## 🤖 AI Chatbot (Pick One Free Option)

| Provider | Model | Free Tier | Get Key |
|----------|-------|-----------|---------|
| **Groq** ⭐ | llama-3.3-70b | Very generous | console.groq.com |
| **OpenRouter** | llama-3.1-8b | Free models available | openrouter.ai |
| **Anthropic** | claude-haiku | Pay-per-use (cheap) | console.anthropic.com |
| **OpenAI** | gpt-4o-mini | Pay-per-use (cheap) | platform.openai.com |

The backend tries each provider in order. Set at least one.

---

## 📂 Project Structure

```
sigint-worldwatch/
├── backend/
│   ├── server.js          # Express API server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main dashboard + chatbot
│   │   └── index.js
│   ├── public/
│   │   └── index.html
│   └── package.json
├── .env.example           # Copy to backend/.env
├── package.json           # Root scripts
└── README.md
```

---

## 🚢 Deployment

### Deploy Backend (Railway / Render / Fly.io)
1. Push to GitHub
2. Connect to Railway/Render — set env vars from `.env.example`
3. Deploy `backend/` folder

### Deploy Frontend (Vercel / Netlify)
1. Set `REACT_APP_API_URL=https://your-backend-url.com` in frontend env
2. Build: `cd frontend && npm run build`
3. Deploy the `frontend/build/` folder

---

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/news?region=all` | Fetch aggregated news |
| `GET` | `/api/news?region=middle_east` | Filter by region |
| `GET` | `/api/news?refresh=1` | Force bypass cache |
| `POST` | `/api/chat` | Chat with AI analyst |
| `GET` | `/api/health` | Check which APIs are configured |

**Regions:** `all`, `middle_east`, `europe`, `asia`, `usa`, `africa`

---

## 💡 Features

- **Breaking / Today / Earlier** sections with live freshness indicators
- **Color-coded timestamps** — green = minutes ago, yellow = hours ago
- **Click any card** to expand and read the full summary
- **SOURCE ↗** links open original articles
- **AI Chatbot** in bottom-right — ask about impacts, history, predictions
- **Suggested questions** pre-loaded in chatbot on first open
- **Auto-refresh** runs silently every 3 minutes
- **GDELT + RSS** = coverage from 100+ international sources

---

## ⚠️ Notes

- RSS scraping respects robots.txt and rate limits automatically
- Cache is 3 minutes — balances freshness with API rate limits
- The GDELT API is completely free with no key required
- Add `NEWS_API_KEY` and `MEDIASTACK_KEY` for more coverage volume
