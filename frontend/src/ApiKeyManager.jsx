import { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.REACT_APP_API_URL || "";
const STORAGE_KEY = "sigint_api_keys";

// ─── API DEFINITIONS ─────────────────────────────────────────────────────────
export const API_PROVIDERS = [
  {
    id: "groq",
    name: "Groq",
    label: "GROQ API KEY",
    envKey: "GROQ_API_KEY",
    headerKey: "x-groq-key",
    placeholder: "gsk_...",
    purpose: "AI Chatbot (LLaMA 3.3 70B)",
    color: "#f97316",
    glow: "rgba(249,115,22,0.3)",
    freeUrl: "https://console.groq.com",
    freeNote: "Free — generous daily limits",
    icon: "⚡",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    label: "ANTHROPIC API KEY",
    envKey: "ANTHROPIC_API_KEY",
    headerKey: "x-anthropic-key",
    placeholder: "sk-ant-...",
    purpose: "AI Chatbot (Claude Haiku)",
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.3)",
    freeUrl: "https://console.anthropic.com",
    freeNote: "Pay-per-use, very affordable",
    icon: "🤖",
  },
  {
    id: "openai",
    name: "OpenAI",
    label: "OPENAI API KEY",
    envKey: "OPENAI_API_KEY",
    headerKey: "x-openai-key",
    placeholder: "sk-...",
    purpose: "AI Chatbot (GPT-4o mini)",
    color: "#34d399",
    glow: "rgba(52,211,153,0.3)",
    freeUrl: "https://platform.openai.com",
    freeNote: "Pay-per-use, cheap with mini",
    icon: "🧠",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    label: "OPENROUTER KEY",
    envKey: "OPENROUTER_KEY",
    headerKey: "x-openrouter-key",
    placeholder: "sk-or-...",
    purpose: "AI Chatbot (free models)",
    color: "#38bdf8",
    glow: "rgba(56,189,248,0.3)",
    freeUrl: "https://openrouter.ai",
    freeNote: "Many free models available",
    icon: "🔀",
  },
  {
    id: "newsapi",
    name: "NewsAPI",
    label: "NEWS API KEY",
    envKey: "NEWS_API_KEY",
    headerKey: "x-newsapi-key",
    placeholder: "abc123...",
    purpose: "News Feed (100 req/day free)",
    color: "#fb7185",
    glow: "rgba(251,113,133,0.3)",
    freeUrl: "https://newsapi.org/register",
    freeNote: "Free — 100 requests/day",
    icon: "📰",
  },
  {
    id: "mediastack",
    name: "Mediastack",
    label: "MEDIASTACK KEY",
    envKey: "MEDIASTACK_KEY",
    headerKey: "x-mediastack-key",
    placeholder: "abc123...",
    purpose: "News Feed (500 req/month free)",
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.3)",
    freeUrl: "https://mediastack.com",
    freeNote: "Free — 500 requests/month",
    icon: "📡",
  },
];

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────
export function loadKeys() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveKeys(keys) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    return true;
  } catch {
    return false;
  }
}

export function clearKeys() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function buildHeaders(keys = {}) {
  const headers = { "Content-Type": "application/json" };
  API_PROVIDERS.forEach(p => {
    if (keys[p.id]) headers[p.headerKey] = keys[p.id];
  });
  return headers;
}

// ─── MASKED KEY DISPLAY ───────────────────────────────────────────────────────
function maskKey(key) {
  if (!key || key.length < 8) return "••••••••";
  return key.slice(0, 6) + "••••••••" + key.slice(-4);
}

// ─── USAGE BAR ────────────────────────────────────────────────────────────────
function UsageBar({ used, limit, color }) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
  const barColor = pct > 80 ? "#ff1a1a" : pct > 50 ? "#f0c000" : color;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ color: "#445", fontSize: 9, letterSpacing: 1, fontFamily: "monospace" }}>
          USAGE
        </span>
        <span style={{ color: barColor, fontSize: 9, fontFamily: "monospace" }}>
          {used.toLocaleString()}{limit ? ` / ${limit.toLocaleString()}` : " calls"}
        </span>
      </div>
      {limit > 0 && (
        <div style={{
          height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: `linear-gradient(90deg, ${barColor}88, ${barColor})`,
            borderRadius: 2, transition: "width 0.5s ease",
          }} />
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ApiKeyManager({ open, onClose, onKeysChange }) {
  const [keys, setKeys]           = useState({});
  const [editing, setEditing]     = useState({});      // which fields are in edit mode
  const [tempVals, setTempVals]   = useState({});      // unsaved input values
  const [showVals, setShowVals]   = useState({});      // show/hide plaintext
  const [saved, setSaved]         = useState({});      // per-key save feedback
  const [usage, setUsage]         = useState({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("ai");   // "ai" | "news"
  const [confirmClear, setConfirmClear] = useState(false);

  // Load from localStorage on open
  useEffect(() => {
    if (open) {
      const stored = loadKeys();
      setKeys(stored);
      fetchUsage();
    }
  }, [open]);

  const fetchUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/usage`);
      if (res.ok) {
        const data = await res.json();
        setUsage(data);
      }
    } catch {
      // silent — usage is optional
    } finally {
      setUsageLoading(false);
    }
  }, []);

  const handleEdit = (id) => {
    setEditing(e => ({ ...e, [id]: true }));
    setTempVals(v => ({ ...v, [id]: keys[id] || "" }));
  };

  const handleSave = (id) => {
    const val = (tempVals[id] || "").trim();
    const newKeys = { ...keys };
    if (val) {
      newKeys[id] = val;
    } else {
      delete newKeys[id];
    }
    setKeys(newKeys);
    saveKeys(newKeys);
    setEditing(e => ({ ...e, [id]: false }));
    setSaved(s => ({ ...s, [id]: true }));
    onKeysChange?.(newKeys);
    setTimeout(() => setSaved(s => ({ ...s, [id]: false })), 2000);
  };

  const handleRemove = (id) => {
    const newKeys = { ...keys };
    delete newKeys[id];
    setKeys(newKeys);
    saveKeys(newKeys);
    setEditing(e => ({ ...e, [id]: false }));
    setTempVals(v => ({ ...v, [id]: "" }));
    onKeysChange?.(newKeys);
  };

  const handleClearAll = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    clearKeys();
    setKeys({});
    setEditing({});
    setTempVals({});
    onKeysChange?.({});
    setConfirmClear(false);
  };

  const configuredCount = Object.keys(keys).length;
  const aiProviders   = API_PROVIDERS.filter(p => ["groq","anthropic","openai","openrouter"].includes(p.id));
  const newsProviders = API_PROVIDERS.filter(p => ["newsapi","mediastack"].includes(p.id));
  const currentProviders = activeTab === "ai" ? aiProviders : newsProviders;

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 620,
        maxHeight: "90vh",
        background: "#08101a",
        border: "1px solid rgba(0,255,136,0.2)",
        borderRadius: 10,
        boxShadow: "0 0 80px rgba(0,255,136,0.08), 0 30px 80px rgba(0,0,0,0.8)",
        display: "flex", flexDirection: "column",
        fontFamily: "'Courier New', monospace",
        animation: "slideUp 0.25s ease",
        overflow: "hidden",
      }}>

        {/* ── HEADER ── */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(0,255,136,0.1)",
          background: "rgba(0,255,136,0.03)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              color: "#fff", fontSize: 13, fontWeight: 800,
              letterSpacing: 3, display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ color: "#00ff88", fontSize: 16 }}>⚙</span>
              API KEY MANAGEMENT
            </div>
            <div style={{ color: "#334", fontSize: 9, letterSpacing: 2, marginTop: 3 }}>
              KEYS STORED LOCALLY IN YOUR BROWSER — NEVER SENT TO ANY SERVER EXCEPT YOUR OWN BACKEND
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              background: configuredCount > 0 ? "rgba(0,255,136,0.1)" : "rgba(255,26,26,0.1)",
              border: `1px solid ${configuredCount > 0 ? "rgba(0,255,136,0.25)" : "rgba(255,26,26,0.25)"}`,
              color: configuredCount > 0 ? "#00ff88" : "#ff6b6b",
              padding: "4px 10px", borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}>
              {configuredCount} / {API_PROVIDERS.length} CONFIGURED
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "#556", cursor: "pointer", borderRadius: 4,
              width: 28, height: 28, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{
          display: "flex", padding: "10px 20px 0",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          gap: 4, flexShrink: 0,
        }}>
          {[
            { id: "ai",   label: "🤖 AI CHATBOT KEYS", count: Object.keys(keys).filter(k => ["groq","anthropic","openai","openrouter"].includes(k)).length },
            { id: "news", label: "📰 NEWS API KEYS",    count: Object.keys(keys).filter(k => ["newsapi","mediastack"].includes(k)).length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${activeTab === tab.id ? "#00ff88" : "transparent"}`,
                color: activeTab === tab.id ? "#00ff88" : "#445",
                padding: "8px 14px 10px",
                cursor: "pointer", fontSize: 10, letterSpacing: 1.5,
                fontFamily: "monospace", transition: "all 0.15s",
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span style={{
                  marginLeft: 6, background: "rgba(0,255,136,0.15)",
                  color: "#00ff88", borderRadius: 10, padding: "1px 6px", fontSize: 9,
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── PROVIDER CARDS ── */}
        <div style={{ overflowY: "auto", padding: "14px 20px", flex: 1 }}>
          {currentProviders.map(provider => {
            const hasKey     = !!keys[provider.id];
            const isEditing  = editing[provider.id];
            const isVisible  = showVals[provider.id];
            const isSaved    = saved[provider.id];
            const provUsage  = usage[provider.id] || { calls: 0, lastUsed: null };

            return (
              <div
                key={provider.id}
                style={{
                  background: "rgba(10,14,20,0.8)",
                  border: `1px solid ${hasKey ? `${provider.color}30` : "rgba(255,255,255,0.05)"}`,
                  borderLeft: `3px solid ${hasKey ? provider.color : "#1a2a3a"}`,
                  borderRadius: 6, padding: "14px 16px", marginBottom: 10,
                  transition: "border-color 0.2s",
                }}
              >
                {/* Card top row */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 6,
                      background: hasKey ? `${provider.color}18` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${hasKey ? `${provider.color}40` : "rgba(255,255,255,0.06)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                    }}>
                      {provider.icon}
                    </div>
                    <div>
                      <div style={{ color: hasKey ? provider.color : "#556", fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>
                        {provider.name}
                      </div>
                      <div style={{ color: "#334", fontSize: 9, letterSpacing: 0.8, marginTop: 2 }}>
                        {provider.purpose}
                      </div>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isSaved && (
                      <span style={{
                        color: "#00ff88", fontSize: 9, letterSpacing: 1,
                        animation: "fadeIn 0.2s ease",
                      }}>✓ SAVED</span>
                    )}
                    <div style={{
                      padding: "3px 8px", borderRadius: 3, fontSize: 9, letterSpacing: 1,
                      background: hasKey ? `${provider.color}15` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${hasKey ? `${provider.color}35` : "rgba(255,255,255,0.05)"}`,
                      color: hasKey ? provider.color : "#334",
                    }}>
                      {hasKey ? "● ACTIVE" : "○ NOT SET"}
                    </div>
                  </div>
                </div>

                {/* Key input / display row */}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {isEditing ? (
                    <>
                      <input
                        type={isVisible ? "text" : "password"}
                        value={tempVals[provider.id] || ""}
                        onChange={e => setTempVals(v => ({ ...v, [provider.id]: e.target.value }))}
                        placeholder={provider.placeholder}
                        autoFocus
                        onKeyDown={e => { if (e.key === "Enter") handleSave(provider.id); if (e.key === "Escape") setEditing(ed => ({ ...ed, [provider.id]: false })); }}
                        style={{
                          flex: 1, background: "rgba(0,0,0,0.4)",
                          border: `1px solid ${provider.color}50`,
                          borderRadius: 4, padding: "8px 10px",
                          color: "#c8d8e8", fontSize: 11,
                          fontFamily: "monospace", outline: "none",
                          letterSpacing: isVisible ? 0.5 : 2,
                        }}
                      />
                      <button onClick={() => setShowVals(s => ({ ...s, [provider.id]: !s[provider.id] }))}
                        style={iconBtn}>
                        {isVisible ? "🙈" : "👁"}
                      </button>
                      <button onClick={() => handleSave(provider.id)}
                        style={{ ...iconBtn, background: `${provider.color}20`, border: `1px solid ${provider.color}50`, color: provider.color }}>
                        ✓
                      </button>
                      <button onClick={() => setEditing(ed => ({ ...ed, [provider.id]: false }))}
                        style={iconBtn}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{
                        flex: 1, background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(255,255,255,0.04)",
                        borderRadius: 4, padding: "8px 10px",
                        color: hasKey ? "#7a9ab0" : "#2a3a4a",
                        fontSize: 11, fontFamily: "monospace", letterSpacing: 2,
                      }}>
                        {hasKey ? maskKey(keys[provider.id]) : "NOT CONFIGURED"}
                      </div>
                      <button
                        onClick={() => handleEdit(provider.id)}
                        title={hasKey ? "Edit key" : "Add key"}
                        style={{ ...iconBtn, ...(hasKey ? {} : { color: provider.color, borderColor: `${provider.color}40` }) }}
                      >
                        {hasKey ? "✎" : "+"}
                      </button>
                      {hasKey && (
                        <button onClick={() => handleRemove(provider.id)} title="Remove key" style={iconBtn}>
                          🗑
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Usage stats */}
                {hasKey && (
                  <UsageBar
                    used={provUsage.calls}
                    limit={provider.id === "newsapi" ? 100 : provider.id === "mediastack" ? 500 : 0}
                    color={provider.color}
                  />
                )}

                {/* Last used */}
                {hasKey && provUsage.lastUsed && (
                  <div style={{ color: "#2a3a4a", fontSize: 9, marginTop: 5, letterSpacing: 1 }}>
                    LAST USED: {new Date(provUsage.lastUsed).toLocaleString()}
                  </div>
                )}

                {/* Get key link */}
                {!hasKey && (
                  <div style={{ marginTop: 8, fontSize: 9, color: "#2a3a4a" }}>
                    <a href={provider.freeUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: `${provider.color}88`, textDecoration: "none", letterSpacing: 1 }}>
                      GET FREE KEY ↗ {provider.freeNote}
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ fontSize: 9, color: "#1a2a3a", letterSpacing: 1, lineHeight: 1.6 }}>
            <div>🔒 KEYS STORED IN BROWSER localStorage — ONLY SENT TO YOUR OWN BACKEND</div>
            <div style={{ marginTop: 2 }}>BACKEND FALLS BACK TO .env IF NO KEY PROVIDED HERE</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={fetchUsage}
              disabled={usageLoading}
              style={{
                background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)",
                color: usageLoading ? "#334" : "#00ff88",
                padding: "6px 12px", borderRadius: 3, cursor: "pointer",
                fontSize: 9, letterSpacing: 1.5, fontFamily: "monospace",
              }}
            >
              {usageLoading ? "..." : "↻ REFRESH USAGE"}
            </button>
            <button
              onClick={handleClearAll}
              style={{
                background: confirmClear ? "rgba(255,26,26,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${confirmClear ? "rgba(255,26,26,0.4)" : "rgba(255,255,255,0.06)"}`,
                color: confirmClear ? "#ff6b6b" : "#334",
                padding: "6px 12px", borderRadius: 3, cursor: "pointer",
                fontSize: 9, letterSpacing: 1.5, fontFamily: "monospace",
                transition: "all 0.15s",
              }}
              onMouseLeave={() => setConfirmClear(false)}
            >
              {confirmClear ? "⚠ CONFIRM CLEAR ALL" : "CLEAR ALL KEYS"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// shared mini-button style
const iconBtn = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#556", cursor: "pointer", borderRadius: 4,
  width: 32, height: 32, fontSize: 13,
  display: "flex", alignItems: "center", justifyContent: "center",
  flexShrink: 0, fontFamily: "monospace",
  transition: "background 0.15s",
};
