import { useState, useEffect, useRef, useCallback } from "react";
import ApiKeyManager, { loadKeys, buildHeaders } from "./ApiKeyManager";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_API_URL || "";
const REFRESH_INTERVAL = 3 * 60 * 1000; // auto-refresh every 3 minutes

const REGIONS = [
  { id: "all",         label: "ALL SIGNALS",   icon: "◈" },
  { id: "middle_east", label: "MIDDLE EAST",   icon: "⬡" },
  { id: "europe",      label: "EUROPE / NATO", icon: "⬡" },
  { id: "asia",        label: "ASIA-PACIFIC",  icon: "⬡" },
  { id: "usa",         label: "US POLITICS",   icon: "⬡" },
  { id: "africa",      label: "AFRICA",        icon: "⬡" },
];

const URGENCY = {
  CRITICAL: { bg: "#ff1a1a", text: "#fff", glow: "rgba(255,26,26,0.45)",  border: "#ff1a1a" },
  HIGH:     { bg: "#ff6b00", text: "#fff", glow: "rgba(255,107,0,0.4)",   border: "#ff6b00" },
  MEDIUM:   { bg: "#f0c000", text: "#000", glow: "rgba(240,192,0,0.35)",  border: "#f0c000" },
  LOW:      { bg: "#00c896", text: "#000", glow: "rgba(0,200,150,0.3)",   border: "#00c896" },
};

const SUGGESTED_QUESTIONS = [
  "What happens if the Strait of Hormuz is closed?",
  "How does the Russia-Ukraine war affect global wheat supply?",
  "What are the military capabilities of Iran vs Israel?",
  "How would a Taiwan conflict impact global tech supply chains?",
  "What is the Wagner Group and where do they operate?",
  "Explain the BRICS expansion and its geopolitical significance",
  "How do US sanctions on Iran affect India?",
  "What is the current status of the Israel-Hamas war in 2026?",
];

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────
function TerminalCursor() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn(v => !v), 530);
    return () => clearInterval(t);
  }, []);
  return <span style={{ opacity: on ? 1 : 0, color: "#00ff88" }}>█</span>;
}

function LiveDot({ color = "#00ff88", size = 10 }) {
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size, flexShrink: 0 }}>
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: color, animation: "ping 1.5s ease-out infinite", opacity: 0.5,
      }} />
      <span style={{ position: "absolute", inset: "2px", borderRadius: "50%", background: color }} />
    </span>
  );
}

function UrgencyBadge({ level }) {
  const u = URGENCY[level] || URGENCY.LOW;
  return (
    <span style={{
      background: u.bg, color: u.text,
      fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
      padding: "2px 7px", borderRadius: 2, flexShrink: 0,
      fontFamily: "monospace", marginTop: 1, whiteSpace: "nowrap",
    }}>
      {level}
    </span>
  );
}

function StatBox({ label, value, sub, color = "#00ff88" }) {
  return (
    <div style={{
      background: "rgba(10,14,20,0.85)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderTop: `2px solid ${color}`,
      padding: "12px 16px", borderRadius: 4, flex: 1, minWidth: 100,
    }}>
      <div style={{ color, fontSize: 22, fontWeight: 800, fontFamily: "monospace", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ color: "#445", fontSize: 10, letterSpacing: 1.5, marginTop: 3, fontFamily: "monospace" }}>
        {label}
      </div>
      {sub && <div style={{ color: "#556", fontSize: 10, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── NEWS CARD ────────────────────────────────────────────────────────────────
function NewsCard({ item, index }) {
  const [expanded, setExpanded] = useState(false);
  const urg = URGENCY[item.urgency] || URGENCY.LOW;

  // Color-code time freshness
  const timeFresh = (() => {
    const t = item.time || '';
    if (t.includes('Just') || (t.match(/^\d+m ago/) && parseInt(t) < 30)) return '#00ff88';
    if (t.match(/^\d+m ago/)) return '#7bffb0';
    if (t.match(/^\d+h ago/) && parseInt(t) < 6) return '#f0c000';
    return '#556';
  })();

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: "rgba(10,14,20,0.85)",
        border: `1px solid rgba(255,255,255,0.06)`,
        borderLeft: `3px solid ${urg.bg}`,
        borderRadius: 4,
        padding: "14px 16px",
        cursor: "pointer",
        transition: "background 0.15s, box-shadow 0.15s",
        animation: `slideIn 0.35s ease both`,
        animationDelay: `${Math.min(index * 60, 600)}ms`,
        boxShadow: expanded ? `0 0 24px ${urg.glow}` : "none",
        marginBottom: 6,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = "rgba(18,24,36,0.95)";
        e.currentTarget.style.boxShadow = `0 0 16px ${urg.glow}`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "rgba(10,14,20,0.85)";
        e.currentTarget.style.boxShadow = expanded ? `0 0 24px ${urg.glow}` : "none";
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
        <UrgencyBadge level={item.urgency} />
        <span style={{
          fontSize: 13, fontWeight: 600, lineHeight: 1.45,
          color: "#e8edf5", fontFamily: "'Georgia', serif", flex: 1,
        }}>
          {item.headline}
        </span>
        <span style={{ color: "#334", fontSize: 18, flexShrink: 0, marginLeft: 4, lineHeight: 1 }}>
          {expanded ? "−" : "+"}
        </span>
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "#00ff88", fontSize: 10, fontFamily: "monospace", letterSpacing: 0.8 }}>
          {item.source}
        </span>
        <span style={{ color: "#334", fontSize: 10 }}>•</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {item.time?.includes('m ago') && parseInt(item.time) < 60 && (
            <LiveDot color={timeFresh} size={6} />
          )}
          <span style={{ color: timeFresh, fontSize: 10, fontFamily: "monospace", fontWeight: 600 }}>
            {item.time}
          </span>
        </span>
        {item.region && item.region !== 'global' && (
          <>
            <span style={{ color: "#334", fontSize: 10 }}>•</span>
            <span style={{ color: "#5a7a90", fontSize: 10, fontFamily: "monospace", letterSpacing: 0.5 }}>
              {item.region.replace('_', ' ').toUpperCase()}
            </span>
          </>
        )}
        {item.url && (
          <>
            <span style={{ color: "#334", fontSize: 10 }}>•</span>
            <a
              href={item.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: "#2a5a8a", fontSize: 10, fontFamily: "monospace", textDecoration: "none" }}
            >
              SOURCE ↗
            </a>
          </>
        )}
      </div>

      {/* Expanded summary */}
      {expanded && item.summary && (
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingTop: 10, marginTop: 10,
          color: "#8a9bb0", fontSize: 12.5, lineHeight: 1.75,
          fontFamily: "'Georgia', serif",
        }}>
          {item.summary}
        </div>
      )}
    </div>
  );
}

// ─── CHATBOT ──────────────────────────────────────────────────────────────────
function ChatBot({ apiKeys = {}, onOpenSettings }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "**SIGINT ANALYST ONLINE** 🌍\n\nI'm your geopolitical intelligence analyst. Ask me anything about world events, conflicts, sanctions, military capabilities, or how events affect different countries.\n\n*Try: \"How will it affect India if the Strait of Hormuz is closed?\"*",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const sendMessage = useCallback(async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;

    setInput("");
    setShowSuggestions(false);
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    const apiMessages = messages
      .filter(m => m.role !== "system")
      .concat({ role: "user", content: userMsg })
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: buildHeaders(apiKeys),
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `⚠️ **ANALYST OFFLINE** — ${e.message}\n\nEnsure the backend server is running and an AI API key is configured in your .env file.`,
      }]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, loading, messages]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Simple markdown-ish renderer
  function renderContent(text) {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      // Bold
      let rendered = line.replace(/\*\*(.*?)\*\*/g, (_, t) =>
        `<strong style="color:#e8edf5;font-weight:700">${t}</strong>`
      );
      // Italic
      rendered = rendered.replace(/\*(.*?)\*/g, (_, t) =>
        `<em style="color:#9ab0c8">${t}</em>`
      );
      // Emoji section headers (📍, 📚, etc)
      const isHeader = /^[📍📚🌍📊🔮⚠️]/.test(line);

      return (
        <div key={i} style={{
          marginBottom: line === '' ? 8 : isHeader ? 10 : 2,
          marginTop: isHeader ? 8 : 0,
          lineHeight: 1.65,
        }}
          dangerouslySetInnerHTML={{ __html: rendered || '&nbsp;' }}
        />
      );
    });
  }

  const unreadCount = messages.filter(m => m.role === "assistant").length - 1;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 1000,
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, #0a3a2a, #0d4a35)",
          border: "2px solid rgba(0,255,136,0.4)",
          boxShadow: "0 0 30px rgba(0,255,136,0.25), 0 4px 20px rgba(0,0,0,0.5)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, transition: "all 0.2s",
          color: "#00ff88",
        }}
        title="Open Geopolitical Analyst"
        onMouseEnter={e => e.currentTarget.style.boxShadow = "0 0 40px rgba(0,255,136,0.4), 0 4px 20px rgba(0,0,0,0.5)"}
        onMouseLeave={e => e.currentTarget.style.boxShadow = "0 0 30px rgba(0,255,136,0.25), 0 4px 20px rgba(0,0,0,0.5)"}
      >
        {open ? "✕" : "🌍"}
        {!open && unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            background: "#ff1a1a", borderRadius: "50%",
            width: 18, height: 18, fontSize: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontFamily: "monospace",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Chat Window */}
      {open && (
        <div style={{
          position: "fixed", bottom: 92, right: 24, zIndex: 999,
          width: 420, maxWidth: "calc(100vw - 32px)",
          height: 580, maxHeight: "calc(100vh - 120px)",
          background: "#08101a",
          border: "1px solid rgba(0,255,136,0.2)",
          borderRadius: 8, boxShadow: "0 0 60px rgba(0,255,136,0.1), 0 20px 60px rgba(0,0,0,0.7)",
          display: "flex", flexDirection: "column",
          animation: "slideUp 0.25s ease",
          fontFamily: "'Courier New', monospace",
        }}>
          {/* Chat Header */}
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(0,255,136,0.12)",
            background: "rgba(0,255,136,0.04)",
            borderRadius: "8px 8px 0 0",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "linear-gradient(135deg, #0a3a2a, #1a6a4a)",
                border: "1px solid rgba(0,255,136,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14,
              }}>🌍</div>
              <div>
                <div style={{ color: "#00ff88", fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>
                  GEOINT ANALYST
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                  <LiveDot color="#00ff88" size={6} />
                  <span style={{ color: "#334", fontSize: 9, letterSpacing: 1 }}>ONLINE — CLEARANCE LEVEL 5</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowSuggestions(true)}
              style={{
                background: "transparent", border: "1px solid rgba(0,255,136,0.15)",
                color: "#334", cursor: "pointer", borderRadius: 3,
                fontSize: 9, padding: "3px 8px", fontFamily: "monospace", letterSpacing: 1,
              }}
            >
              PROMPTS
            </button>
          </div>

          {/* No AI key warning */}
          {!["groq","anthropic","openai","openrouter"].some(k => apiKeys[k]) && (
            <div
              onClick={onOpenSettings}
              style={{
                margin: "8px 14px 0",
                background: "rgba(255,107,0,0.08)",
                border: "1px solid rgba(255,107,0,0.2)",
                borderRadius: 4, padding: "8px 12px",
                cursor: "pointer", fontSize: 10,
                color: "#ff9955", letterSpacing: 1, lineHeight: 1.5,
                fontFamily: "monospace",
              }}
            >
              🔑 No AI key — click to add a <strong>free Groq key</strong> and activate the analyst
            </div>
          )}

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "12px 14px",
            scrollbarWidth: "thin", scrollbarColor: "#1a2a3a #08101a",
          }}>
            {/* Suggested questions */}
            {showSuggestions && messages.length <= 1 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#334", fontSize: 9, letterSpacing: 2, marginBottom: 8 }}>
                  SUGGESTED INTEL QUERIES
                </div>
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      background: "rgba(0,255,136,0.04)",
                      border: "1px solid rgba(0,255,136,0.1)",
                      color: "#7a9ab0", fontSize: 11, padding: "7px 10px",
                      borderRadius: 3, cursor: "pointer", marginBottom: 4,
                      fontFamily: "'Georgia', serif", lineHeight: 1.4,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,136,0.08)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(0,255,136,0.04)"}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{
                marginBottom: 14,
                display: "flex",
                flexDirection: msg.role === "user" ? "row-reverse" : "row",
                alignItems: "flex-start",
                gap: 8,
                animation: "fadeIn 0.2s ease",
              }}>
                {/* Avatar */}
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  background: msg.role === "user"
                    ? "linear-gradient(135deg, #1a2a4a, #2a4a6a)"
                    : "linear-gradient(135deg, #0a3a2a, #1a6a4a)",
                  border: `1px solid ${msg.role === "user" ? "rgba(100,150,255,0.3)" : "rgba(0,255,136,0.3)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, marginTop: 2,
                }}>
                  {msg.role === "user" ? "👤" : "🌍"}
                </div>

                {/* Bubble */}
                <div style={{
                  maxWidth: "82%",
                  background: msg.role === "user"
                    ? "rgba(30,50,90,0.6)"
                    : "rgba(10,20,30,0.8)",
                  border: `1px solid ${msg.role === "user"
                    ? "rgba(60,100,180,0.2)"
                    : "rgba(0,255,136,0.1)"}`,
                  borderRadius: msg.role === "user" ? "10px 2px 10px 10px" : "2px 10px 10px 10px",
                  padding: "9px 12px",
                  color: "#aabbc8",
                  fontSize: 12,
                  lineHeight: 1.65,
                  fontFamily: msg.role === "assistant" ? "'Georgia', serif" : "'Courier New', monospace",
                }}>
                  {renderContent(msg.content)}
                </div>
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: "linear-gradient(135deg, #0a3a2a, #1a6a4a)",
                  border: "1px solid rgba(0,255,136,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                }}>🌍</div>
                <div style={{
                  background: "rgba(10,20,30,0.8)",
                  border: "1px solid rgba(0,255,136,0.1)",
                  borderRadius: "2px 10px 10px 10px",
                  padding: "9px 14px",
                  display: "flex", alignItems: "center", gap: 3,
                }}>
                  {[0, 1, 2].map(j => (
                    <div key={j} style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: "#00ff88", opacity: 0.6,
                      animation: "pulse 1.2s ease infinite",
                      animationDelay: `${j * 0.2}s`,
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "10px 12px",
            borderTop: "1px solid rgba(0,255,136,0.1)",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "0 0 8px 8px",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about any geopolitical situation..."
                disabled={loading}
                rows={1}
                style={{
                  flex: 1,
                  background: "rgba(10,20,30,0.8)",
                  border: "1px solid rgba(0,255,136,0.15)",
                  borderRadius: 4, padding: "8px 10px",
                  color: "#c8d8e8", fontSize: 11.5, fontFamily: "'Georgia', serif",
                  resize: "none", outline: "none", lineHeight: 1.5,
                  maxHeight: 80, overflowY: "auto",
                }}
                onInput={e => {
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px";
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                style={{
                  background: loading || !input.trim()
                    ? "rgba(0,255,136,0.05)"
                    : "rgba(0,255,136,0.15)",
                  border: "1px solid rgba(0,255,136,0.25)",
                  color: loading || !input.trim() ? "#334" : "#00ff88",
                  padding: "8px 12px", borderRadius: 4,
                  cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  fontSize: 14, transition: "all 0.15s", flexShrink: 0,
                  height: 36,
                }}
              >
                ↑
              </button>
            </div>
            <div style={{ color: "#2a3a4a", fontSize: 9, marginTop: 5, letterSpacing: 1, textAlign: "center" }}>
              ENTER TO SEND • SHIFT+ENTER FOR NEW LINE
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function App() {
  const [articles, setArticles]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [activeRegion, setActiveRegion] = useState("all");
  const [searchQuery, setSearchQuery]   = useState("");
  const [lastUpdated, setLastUpdated]   = useState(null);
  const [streamText, setStreamText]     = useState("");
  const [error, setError]               = useState(null);
  const [stats, setStats]               = useState({ critical: 0, high: 0, sources: 0, total: 0 });
  const [meta, setMeta]                 = useState(null);
  const [serverStatus, setServerStatus] = useState("checking");
  const [apiKeys, setApiKeys]           = useState(() => loadKeys());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const refreshTimerRef                 = useRef(null);

  // Check server health on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then(r => r.json())
      .then(() => setServerStatus("online"))
      .catch(() => setServerStatus("offline"));
  }, []);

  const fetchNews = useCallback(async (region = activeRegion, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    const stages = [
      "SCANNING RSS WIRE SERVICES...",
      "QUERYING GDELT DATABASE...",
      "CROSS-REFERENCING SOURCES...",
      "RUNNING THREAT CLASSIFICATION...",
      "COMPILING INTELLIGENCE BRIEF...",
    ];

    let stageIdx = 0;
    let stageInterval = null;

    if (!silent) {
      setStreamText(stages[0]);
      stageInterval = setInterval(() => {
        stageIdx = Math.min(stageIdx + 1, stages.length - 1);
        setStreamText(stages[stageIdx]);
      }, 700);
    }

    try {
      const currentKeys = loadKeys();
      const res = await fetch(`${API_BASE}/api/news?region=${region}`, {
        headers: buildHeaders(currentKeys),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();

      clearInterval(stageInterval);

      const arts = data.articles || [];
      setArticles(arts);
      setMeta(data.meta);
      setLastUpdated(new Date());
      setStats({
        critical: data.meta?.critical  || arts.filter(a => a.urgency === "CRITICAL").length,
        high:     data.meta?.high      || arts.filter(a => a.urgency === "HIGH").length,
        sources:  data.meta?.sources   || new Set(arts.map(a => a.source)).size,
        total:    data.meta?.total     || arts.length,
      });
      setStreamText("");
      setServerStatus("online");
    } catch (err) {
      clearInterval(stageInterval);
      setError(err.message.includes("fetch")
        ? "BACKEND OFFLINE — Start the server: cd backend && npm start"
        : `FETCH ERROR — ${err.message}`);
      setStreamText("");
      setServerStatus("offline");
    } finally {
      setLoading(false);
    }
  }, [activeRegion]);

  // Initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchNews("all"); }, []);

  // Auto-refresh
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => {
      fetchNews(activeRegion, true);
    }, REFRESH_INTERVAL);
    return () => clearInterval(refreshTimerRef.current);
  }, [activeRegion]);

  const handleRegion = (id) => {
    setActiveRegion(id);
    fetchNews(id);
  };

  const filtered = articles.filter(a => {
    const matchRegion = activeRegion === "all" || a.region === activeRegion || a.region === "global";
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      (a.headline || "").toLowerCase().includes(q) ||
      (a.summary  || "").toLowerCase().includes(q) ||
      (a.source   || "").toLowerCase().includes(q);
    return matchRegion && matchSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const urgDiff = (order[a.urgency] ?? 4) - (order[b.urgency] ?? 4);
    if (urgDiff !== 0) return urgDiff;
    return b.pubDate - a.pubDate;
  });

  // Group by freshness buckets
  const NOW = Date.now();
  const fresh  = sorted.filter(a => a.pubDate > 0 && NOW - a.pubDate < 60  * 60 * 1000); // <1h
  const recent = sorted.filter(a => a.pubDate > 0 && NOW - a.pubDate >= 60 * 60 * 1000 && NOW - a.pubDate < 24 * 60 * 60 * 1000); // 1–24h
  const older  = sorted.filter(a => a.pubDate === 0 || NOW - a.pubDate >= 24 * 60 * 60 * 1000);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#060810",
      backgroundImage: `
        radial-gradient(ellipse at 15% 15%, rgba(0,60,35,0.1) 0%, transparent 55%),
        radial-gradient(ellipse at 85% 85%, rgba(25,0,60,0.12) 0%, transparent 55%),
        repeating-linear-gradient(0deg,  transparent, transparent 40px, rgba(255,255,255,0.01) 40px, rgba(255,255,255,0.01) 41px),
        repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.01) 40px, rgba(255,255,255,0.01) 41px)
      `,
      fontFamily: "'Courier New', monospace",
      color: "#c8d8e8",
      paddingBottom: 60,
    }}>
      <style>{`
        @keyframes ping     { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(2.6);opacity:0} }
        @keyframes slideIn  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes scanline { 0%{top:-5%} 100%{top:105%} }
        ::-webkit-scrollbar       { width:4px; height:4px }
        ::-webkit-scrollbar-track { background:#060810 }
        ::-webkit-scrollbar-thumb { background:#1a2a3a; border-radius:2px }
        textarea:focus { border-color:rgba(0,255,136,0.35)!important }
        input:focus    { border-color:rgba(0,255,136,0.2)!important; box-shadow:0 0 0 2px rgba(0,255,136,0.05) }
        a:hover { color:#00ff88!important }
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{
        background: "rgba(6,8,16,0.97)",
        borderBottom: "1px solid rgba(0,255,136,0.12)",
        padding: "14px 24px",
        position: "sticky", top: 0, zIndex: 100,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ maxWidth: 1140, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>

            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ position: "relative" }}>
                <div style={{
                  width: 38, height: 38, border: "2px solid #00ff88",
                  borderRadius: "50%", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 16,
                  boxShadow: "0 0 24px rgba(0,255,136,0.3)",
                }}>◈</div>
                <div style={{ position: "absolute", top: -2, right: -2 }}>
                  <LiveDot color="#00ff88" />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 4, color: "#fff" }}>
                  SIGINT <span style={{ color: "#00ff88" }}>{"// "}</span> WORLDWATCH
                </div>
                <div style={{ fontSize: 9, color: "#334", letterSpacing: 2.5 }}>
                  REAL-TIME GEOPOLITICAL INTELLIGENCE — 2026
                </div>
              </div>
            </div>

            {/* Right side controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>

              {/* Server status */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, letterSpacing: 1.5 }}>
                <LiveDot color={serverStatus === "online" ? "#00ff88" : serverStatus === "offline" ? "#ff1a1a" : "#f0c000"} size={7} />
                <span style={{ color: serverStatus === "online" ? "#00ff88" : serverStatus === "offline" ? "#ff6b6b" : "#f0c000" }}>
                  {serverStatus.toUpperCase()}
                </span>
              </div>

              {/* Last updated */}
              {lastUpdated && (
                <div style={{ fontSize: 9, color: "#334", fontFamily: "monospace" }}>
                  SYNCED {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              )}

              {/* Source count */}
              {meta && (
                <div style={{ fontSize: 9, color: "#2a4a6a", fontFamily: "monospace" }}>
                  RSS+GDELT{meta.breakdown?.newsapi > 0 ? "+NEWSAPI" : ""}
                  {meta.breakdown?.mediastack > 0 ? "+MEDIASTACK" : ""}
                </div>
              )}

              {/* Refresh button */}
              <button
                onClick={() => fetchNews(activeRegion)}
                disabled={loading}
                style={{
                  background: loading ? "transparent" : "rgba(0,255,136,0.08)",
                  border: "1px solid rgba(0,255,136,0.25)",
                  color: loading ? "#334" : "#00ff88",
                  padding: "6px 14px", borderRadius: 3,
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 10, letterSpacing: 1.5, fontFamily: "monospace",
                  transition: "all 0.15s",
                }}
              >
                {loading ? "SCANNING..." : "↻ REFRESH"}
              </button>

              {/* Settings / API Key button */}
              <button
                onClick={() => setSettingsOpen(true)}
                title="Manage API Keys"
                style={{
                  background: Object.keys(apiKeys).length === 0
                    ? "rgba(255,107,0,0.1)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${Object.keys(apiKeys).length === 0
                    ? "rgba(255,107,0,0.35)" : "rgba(255,255,255,0.08)"}`,
                  color: Object.keys(apiKeys).length === 0 ? "#ff9955" : "#556",
                  padding: "6px 10px", borderRadius: 3,
                  cursor: "pointer", fontSize: 13, transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 5,
                }}
                onMouseEnter={e => e.currentTarget.style.color = "#aac"}
                onMouseLeave={e => e.currentTarget.style.color = Object.keys(apiKeys).length === 0 ? "#ff9955" : "#556"}
              >
                ⚙
                {Object.keys(apiKeys).length === 0 && (
                  <span style={{ fontSize: 9, letterSpacing: 1, fontFamily: "monospace" }}>
                    ADD KEYS
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "20px 24px 0" }}>

        {/* ── STATS ROW ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <StatBox label="TOTAL SIGNALS" value={stats.total}    color="#00ff88" />
          <StatBox label="CRITICAL"      value={stats.critical} color="#ff1a1a" sub="active threats"  />
          <StatBox label="HIGH ALERT"    value={stats.high}     color="#ff6b00" sub="escalating"      />
          <StatBox label="SOURCES"       value={stats.sources}  color="#6b8fff" sub="verified feeds"  />
          {meta && (
            <StatBox
              label="LAST HOUR"
              value={fresh.length}
              color="#00e5ff"
              sub="fresh signals"
            />
          )}
        </div>

        {/* ── NO-KEY NUDGE BANNER ── */}
        {Object.keys(apiKeys).length === 0 && !loading && (
          <div
            onClick={() => setSettingsOpen(true)}
            style={{
              background: "rgba(255,107,0,0.07)",
              border: "1px solid rgba(255,107,0,0.25)",
              borderRadius: 4, padding: "11px 16px", marginBottom: 16,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer", transition: "background 0.15s",
              animation: "fadeIn 0.4s ease",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,107,0,0.12)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,107,0,0.07)"}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14 }}>🔑</span>
              <div>
                <div style={{ color: "#ff9955", fontSize: 11, letterSpacing: 1, fontWeight: 700 }}>
                  NO API KEYS CONFIGURED
                </div>
                <div style={{ color: "#775533", fontSize: 9, letterSpacing: 1, marginTop: 2 }}>
                  Add a free Groq key to enable the AI chatbot • Add NewsAPI/Mediastack for richer coverage
                </div>
              </div>
            </div>
            <span style={{ color: "#ff9955", fontSize: 10, letterSpacing: 1.5, fontFamily: "monospace", flexShrink: 0 }}>
              ⚙ CONFIGURE →
            </span>
          </div>
        )}

        {/* ── REGION TABS ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 14, overflowX: "auto", paddingBottom: 4, flexWrap: "wrap" }}>
          {REGIONS.map(r => (
            <button
              key={r.id}
              onClick={() => handleRegion(r.id)}
              style={{
                background: activeRegion === r.id ? "rgba(0,255,136,0.1)" : "rgba(10,14,20,0.8)",
                border:     activeRegion === r.id ? "1px solid rgba(0,255,136,0.35)" : "1px solid rgba(255,255,255,0.05)",
                color:      activeRegion === r.id ? "#00ff88" : "#445",
                padding: "7px 14px", borderRadius: 3,
                cursor: "pointer", fontSize: 10, letterSpacing: 1.5,
                fontFamily: "monospace", transition: "all 0.12s", whiteSpace: "nowrap",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* ── SEARCH ── */}
        <div style={{ position: "relative", marginBottom: 20 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#334", fontSize: 13 }}>
            ⌕
          </span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="FILTER INTELLIGENCE BY KEYWORD, SOURCE, OR REGION..."
            style={{
              width: "100%", background: "rgba(10,14,20,0.8)",
              border: "1px solid rgba(255,255,255,0.05)", borderRadius: 3,
              padding: "10px 36px 10px 34px", color: "#c8d8e8",
              fontSize: 11, fontFamily: "monospace", letterSpacing: 1,
              outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "#445", cursor: "pointer", fontSize: 16,
            }}>×</button>
          )}
        </div>

        {/* ── LOADING STATE ── */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 20px", animation: "fadeIn 0.3s ease" }}>
            <div style={{
              fontSize: 10, letterSpacing: 3, color: "#00ff88",
              marginBottom: 20, animation: "pulse 1.1s ease infinite",
            }}>
              {streamText || "PROCESSING..."}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 3 }}>
              {[...Array(14)].map((_, i) => (
                <div key={i} style={{
                  width: 3, height: 22, background: "#00ff88",
                  borderRadius: 2, opacity: 0.25,
                  animation: "pulse 1s ease infinite",
                  animationDelay: `${i * 0.07}s`,
                }} />
              ))}
            </div>
          </div>
        )}

        {/* ── ERROR STATE ── */}
        {error && !loading && (
          <div style={{
            background: "rgba(255,26,26,0.06)",
            border: "1px solid rgba(255,26,26,0.18)",
            borderRadius: 4, padding: "14px 16px", marginBottom: 16,
            color: "#ff7070", fontSize: 11, fontFamily: "monospace", letterSpacing: 0.8, lineHeight: 1.6,
          }}>
            <div>⚠ {error}</div>
            {error.includes("BACKEND") && (
              <div style={{ marginTop: 8, color: "#885555", fontSize: 10 }}>
                → Run: <span style={{ color: "#ff9999" }}>cd backend && npm install && npm start</span>
              </div>
            )}
          </div>
        )}

        {/* ── ARTICLE SECTIONS ── */}
        {!loading && sorted.length > 0 && (
          <div>
            <div style={{
              fontSize: 9, color: "#2a3a4a", letterSpacing: 2, marginBottom: 14,
              display: "flex", gap: 16, flexWrap: "wrap",
            }}>
              <span>SHOWING {sorted.length} SIGNALS</span>
              {fresh.length > 0  && <span style={{ color: "#00ff88" }}>🟢 {fresh.length} IN LAST HOUR</span>}
              {recent.length > 0 && <span style={{ color: "#f0c000" }}>🟡 {recent.length} TODAY</span>}
              {searchQuery && <span>FILTERED: "{searchQuery.toUpperCase()}"</span>}
            </div>

            {/* Fresh section */}
            {fresh.length > 0 && !searchQuery && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginBottom: 10, paddingBottom: 6,
                  borderBottom: "1px solid rgba(0,255,136,0.1)",
                }}>
                  <LiveDot color="#00ff88" />
                  <span style={{ color: "#00ff88", fontSize: 10, letterSpacing: 2, fontFamily: "monospace" }}>
                    BREAKING — LAST 60 MINUTES
                  </span>
                </div>
                {fresh.map((item, i) => <NewsCard key={`f${i}`} item={item} index={i} />)}
              </div>
            )}

            {/* Recent section */}
            {recent.length > 0 && !searchQuery && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  marginBottom: 10, paddingBottom: 6,
                  borderBottom: "1px solid rgba(240,192,0,0.1)",
                }}>
                  <span style={{ color: "#f0c000", fontSize: 16 }}>◉</span>
                  <span style={{ color: "#f0c000", fontSize: 10, letterSpacing: 2, fontFamily: "monospace" }}>
                    TODAY — LAST 24 HOURS
                  </span>
                </div>
                {recent.map((item, i) => <NewsCard key={`r${i}`} item={item} index={i} />)}
              </div>
            )}

            {/* Older section or search results */}
            {(older.length > 0 || searchQuery) && (
              <div>
                {!searchQuery && older.length > 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    marginBottom: 10, paddingBottom: 6,
                    borderBottom: "1px solid rgba(90,120,150,0.1)",
                  }}>
                    <span style={{ color: "#445", fontSize: 16 }}>◎</span>
                    <span style={{ color: "#445", fontSize: 10, letterSpacing: 2, fontFamily: "monospace" }}>
                      EARLIER SIGNALS
                    </span>
                  </div>
                )}
                {(searchQuery ? sorted : older).map((item, i) => <NewsCard key={`o${i}`} item={item} index={i} />)}
              </div>
            )}
          </div>
        )}

        {/* ── EMPTY STATE ── */}
        {!loading && sorted.length === 0 && articles.length > 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#2a3a4a", fontSize: 11, letterSpacing: 2 }}>
            NO SIGNALS MATCH CURRENT FILTER
          </div>
        )}

        {/* ── SOURCE BREAKDOWN ── */}
        {!loading && meta?.breakdown && (
          <div style={{
            marginTop: 24, padding: "12px 16px",
            background: "rgba(10,14,20,0.6)",
            border: "1px solid rgba(255,255,255,0.04)",
            borderRadius: 4, display: "flex", gap: 20, flexWrap: "wrap",
          }}>
            <span style={{ color: "#2a3a4a", fontSize: 9, letterSpacing: 2 }}>DATA SOURCES:</span>
            {Object.entries(meta.breakdown).map(([k, v]) => v > 0 && (
              <span key={k} style={{ color: "#334", fontSize: 9, fontFamily: "monospace" }}>
                {k.toUpperCase()}: <span style={{ color: "#00ff88" }}>{v}</span>
              </span>
            ))}
          </div>
        )}

        {/* ── FOOTER ── */}
        <div style={{
          marginTop: 32, paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,0.03)",
          display: "flex", justifyContent: "space-between",
          fontSize: 9, color: "#1a2a3a", letterSpacing: 1.5, flexWrap: "wrap", gap: 8,
        }}>
          <span>SIGINT {" // "} WORLDWATCH — GEOPOLITICAL INTELLIGENCE TERMINAL © 2026</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <TerminalCursor />
            <span>AUTO-REFRESH: 3 MIN</span>
          </span>
        </div>
      </div>

      {/* ── CHATBOT ── */}
      <ChatBot apiKeys={apiKeys} onOpenSettings={() => setSettingsOpen(true)} />

      {/* ── API KEY MANAGER ── */}
      <ApiKeyManager
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onKeysChange={(newKeys) => setApiKeys(newKeys)}
      />
    </div>
  );
}
