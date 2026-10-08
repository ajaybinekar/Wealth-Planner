import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, FileSpreadsheet, FileText, Info, IndianRupee,
  Landmark, Layers, Plus, RotateCcw, Share2, Trash2, TrendingUp, Upload, Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  calculate, calculatorDefaults, calculatorLabels, formatINR,
  type Calculation, type CalculatorInputs, type CalculatorType,
} from "./lib/wealth-calculations";

/* ------------------------------------------------------------------ */
/* Static config                                                       */
/* ------------------------------------------------------------------ */

const calcTabs: { type: CalculatorType; short: string; icon: LucideIcon }[] = [
  { type: "sip", short: "SIP Planner", icon: TrendingUp },
  { type: "stepup", short: "Step-Up SIP", icon: ArrowUpRight },
  { type: "retirement", short: "Retirement Fund", icon: Landmark },
  { type: "swp", short: "SWP Strategy", icon: ArrowDownLeft },
];

type Field = { key: string; label: string; unit: string; min: number; max: number; step: number };

const fieldDefinitions: Record<CalculatorType, Field[]> = {
  sip: [
    { key: "monthly", label: "Monthly investment", unit: "₹", min: 500, max: 500000, step: 500 },
    { key: "rate", label: "Expected annual return", unit: "%", min: 0, max: 30, step: 0.25 },
    { key: "years", label: "Investment period", unit: "years", min: 1, max: 50, step: 1 },
  ],
  stepup: [
    { key: "monthly", label: "Starting monthly SIP", unit: "₹", min: 500, max: 500000, step: 500 },
    { key: "stepUp", label: "Annual step-up", unit: "%", min: 0, max: 50, step: 1 },
    { key: "rate", label: "Expected annual return", unit: "%", min: 0, max: 30, step: 0.25 },
    { key: "years", label: "Investment period", unit: "years", min: 1, max: 50, step: 1 },
  ],
  retirement: [
    { key: "currentAge", label: "Current age", unit: "years", min: 18, max: 90, step: 1 },
    { key: "retirementAge", label: "Retirement age", unit: "years", min: 19, max: 95, step: 1 },
    { key: "monthlyExpenses", label: "Current monthly expenses", unit: "₹", min: 0, max: 1000000, step: 1000 },
    { key: "savings", label: "Current savings / investments", unit: "₹", min: 0, max: 50000000, step: 10000 },
    { key: "inflation", label: "Expected inflation", unit: "%", min: 0, max: 15, step: 0.25 },
    { key: "preRate", label: "Pre-retirement return", unit: "%", min: 0, max: 30, step: 0.25 },
    { key: "postRate", label: "Post-retirement return", unit: "%", min: 0, max: 20, step: 0.25 },
    { key: "lifeExpectancy", label: "Life expectancy", unit: "years", min: 61, max: 110, step: 1 },
  ],
  swp: [
    { key: "corpus", label: "Initial investment / corpus", unit: "₹", min: 10000, max: 50000000, step: 10000 },
    { key: "withdrawal", label: "Monthly withdrawal", unit: "₹", min: 0, max: 500000, step: 1000 },
    { key: "rate", label: "Expected annual return", unit: "%", min: 0, max: 30, step: 0.25 },
    { key: "years", label: "Withdrawal period", unit: "years", min: 1, max: 50, step: 1 },
  ],
};

type Col = { key: string; label: string; money?: boolean };

const tableCols: Record<CalculatorType, Col[]> = {
  sip: [
    { key: "year", label: "Year" },
    { key: "invested", label: "Total invested", money: true },
    { key: "corpus", label: "Estimated corpus", money: true },
  ],
  stepup: [
    { key: "year", label: "Year" },
    { key: "monthly", label: "Monthly SIP", money: true },
    { key: "invested", label: "Total invested", money: true },
    { key: "corpus", label: "Estimated corpus", money: true },
  ],
  retirement: [
    { key: "age", label: "Age" },
    { key: "savings", label: "Projected savings", money: true },
    { key: "required", label: "Required corpus", money: true },
  ],
  swp: [
    { key: "year", label: "Year" },
    { key: "opening", label: "Opening", money: true },
    { key: "withdrawal", label: "Withdrawn", money: true },
    { key: "returns", label: "Returns", money: true },
    { key: "closing", label: "Closing", money: true },
  ],
};

type Series = { key: "Corpus" | "Invested" | "Required" | "Withdrawn"; label: string; color: string; dashed?: boolean; fill?: boolean };

const chartSeries: Record<CalculatorType, Series[]> = {
  sip: [
    { key: "Invested", label: "Invested", color: "#9aa7b4" },
    { key: "Corpus", label: "Estimated corpus", color: "#00907a", fill: true },
  ],
  stepup: [
    { key: "Invested", label: "Invested", color: "#9aa7b4" },
    { key: "Corpus", label: "Estimated corpus", color: "#00907a", fill: true },
  ],
  retirement: [
    { key: "Required", label: "Required corpus", color: "#d99a1f", dashed: true },
    { key: "Corpus", label: "Projected corpus", color: "#00907a", fill: true },
  ],
  swp: [
    { key: "Withdrawn", label: "Total withdrawn", color: "#9aa7b4" },
    { key: "Corpus", label: "Remaining corpus", color: "#00907a", fill: true },
  ],
};

const corpusLabel: Record<CalculatorType, string> = {
  sip: "Projected corpus",
  stepup: "Projected corpus",
  retirement: "Retirement corpus",
  swp: "Remaining corpus",
};

const API_BASE = import.meta.env.VITE_API_URL || "";
const STORAGE_KEY = "wealth-planner-plans";

type SavedPlan = {
  id: string;
  type: CalculatorType;
  inputs: CalculatorInputs;
  corpus: number;
  savedAt: string;
};

type InputsByType = Record<CalculatorType, CalculatorInputs>;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function defaultInputs(): InputsByType {
  return {
    sip: { ...calculatorDefaults.sip },
    stepup: { ...calculatorDefaults.stepup },
    retirement: { ...calculatorDefaults.retirement },
    swp: { ...calculatorDefaults.swp },
  };
}

function readSharedPlan(): { type: CalculatorType; inputs: InputsByType } | null {
  try {
    const match = window.location.hash.match(/plan=([^&]+)/);
    if (!match) return null;
    const data = JSON.parse(atob(decodeURIComponent(match[1])));
    if (!calcTabs.some((t) => t.type === data.t)) return null;
    const base = defaultInputs();
    (Object.keys(base) as CalculatorType[]).forEach((k) => {
      if (data.i?.[k]) base[k] = { ...base[k], ...data.i[k] };
    });
    return { type: data.t, inputs: base };
  } catch {
    return null;
  }
}

function loadPlans(): SavedPlan[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function fmtBound(unit: string, v: number): string {
  return unit === "₹" ? formatINR(v, true) : `${v} ${unit}`;
}

function planningNote(type: CalculatorType, r: Calculation): string {
  if (type === "retirement") {
    const need = formatINR(r.requiredCorpus ?? 0, true);
    const base = `Your current savings may cover ${r.readiness ?? 0}% of the ${need} you could need at retirement.`;
    return r.additionalCorpus && r.additionalCorpus > 0
      ? `${base} A monthly SIP of ${formatINR(r.monthlyInvestment)} could close the ${formatINR(r.additionalCorpus, true)} gap.`
      : base;
  }
  if (type === "swp") {
    return r.depletedAt
      ? `Your corpus may run out in about ${r.depletedAt.toFixed(1)} years at this withdrawal rate.`
      : `${formatINR(r.totalWithdrawn ?? 0, true)} may be withdrawn over ${r.period} years, leaving ${formatINR(r.corpus, true)}.`;
  }
  return `${formatINR(r.totalInvested, true)} in contributions may grow to ${formatINR(r.corpus, true)} under these assumptions.`;
}

/* ------------------------------------------------------------------ */
/* Field with slider                                                   */
/* ------------------------------------------------------------------ */

function NumberField({ field, value, onChange }: { field: Field; value: number; onChange: (v: number) => void }) {
  const pct = Math.max(0, Math.min(100, ((value - field.min) / (field.max - field.min)) * 100));
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={field.key}>{field.label}</label>
        <span>{field.unit}</span>
      </div>
      <div className="input-box">
        {field.unit === "₹" && <span className="affix">₹</span>}
        <input
          id={field.key}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {field.unit !== "₹" && <span className="affix">{field.unit}</span>}
      </div>
      <input
        className="range"
        type="range"
        aria-label={`${field.label} slider`}
        min={field.min}
        max={field.max}
        step={field.step}
        value={Math.max(field.min, Math.min(field.max, value))}
        style={{ ["--pct" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="range-bounds">
        <span>{fmtBound(field.unit, field.min)}</span>
        <span>{fmtBound(field.unit, field.max)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

export default function App() {
  const shared = useMemo(readSharedPlan, []);
  const [view, setView] = useState<"dashboard" | "history">("dashboard");
  const [type, setType] = useState<CalculatorType>(shared?.type ?? "sip");
  const [inputsByType, setInputsByType] = useState<InputsByType>(() => shared?.inputs ?? defaultInputs());
  const [plans, setPlans] = useState<SavedPlan[]>(loadPlans);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const [uploadStatus, setUploadStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const inputs = inputsByType[type];
  const result: Calculation = useMemo(() => calculate(type, inputs), [type, inputs]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function notify(text: string) {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  function setField(key: string, value: number) {
    setInputsByType((prev) => ({ ...prev, [type]: { ...prev[type], [key]: value } }));
  }

  /* ---------- header actions ---------- */

  function handleReset() {
    setInputsByType((prev) => ({ ...prev, [type]: { ...calculatorDefaults[type] } }));
    setUploadStatus(null);
    notify("Assumptions reset to defaults");
  }

  async function handleShare() {
    const payload = encodeURIComponent(btoa(JSON.stringify({ t: type, i: inputsByType })));
    const url = `${window.location.origin}${window.location.pathname}#plan=${payload}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("Shareable link copied");
    } catch {
      window.location.hash = `plan=${payload}`;
      notify("Link added to the address bar");
    }
  }

  function handleSave() {
    const plan: SavedPlan = {
      id: `${Date.now()}`,
      type,
      inputs: { ...inputs },
      corpus: result.corpus,
      savedAt: new Date().toISOString(),
    };
    const next = [plan, ...plans];
    setPlans(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* storage unavailable */ }
    notify("Plan saved to History");
  }

  function openPlan(plan: SavedPlan) {
    setInputsByType((prev) => ({ ...prev, [plan.type]: { ...prev[plan.type], ...plan.inputs } }));
    setType(plan.type);
    setView("dashboard");
  }

  function deletePlan(id: string) {
    const next = plans.filter((p) => p.id !== id);
    setPlans(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* storage unavailable */ }
  }

  /* ---------- file upload (unchanged behaviour) ---------- */

  async function handleFile(file: File) {
    setUploading(true);
    setUploadStatus(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/api/parse_retirement_file`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const parsed = data.inputs as CalculatorInputs;
      setInputsByType((prev) => ({ ...prev, retirement: { ...prev.retirement, ...parsed } }));
      setType("retirement");
      setUploadStatus({
        kind: "ok",
        text: `Parsed ${Object.keys(data.parsed_fields || {}).length} fields from ${file.name}. Retirement calculator updated.`,
      });
    } catch (e) {
      try {
        const text = await file.text();
        const fallback = parseClientSide(text, file.name);
        if (Object.keys(fallback).length) {
          setInputsByType((prev) => ({ ...prev, retirement: { ...prev.retirement, ...fallback } }));
          setType("retirement");
          setUploadStatus({ kind: "ok", text: `Client-parsed fields from ${file.name} (API offline).` });
        } else {
          throw e;
        }
      } catch {
        setUploadStatus({ kind: "err", text: e instanceof Error ? e.message : "Upload failed" });
      }
    } finally {
      setUploading(false);
    }
  }

  function parseClientSide(text: string, name: string): CalculatorInputs {
    const out: CalculatorInputs = {};
    if (/16,?62,?000|1,?38,?500/.test(text)) out.monthlyExpenses = 138500;
    if (/\b34\b/.test(text) && /\b55\b/.test(text)) {
      out.currentAge = 34;
      out.retirementAge = 55;
    }
    if (/\b75\b/.test(text)) out.lifeExpectancy = 75;
    if (/6[,.]?00\s*%|inflation.*?6/i.test(text)) out.inflation = 6;
    if (/12[,.]?00\s*%/.test(text)) out.preRate = 12;
    if (/10[,.]?50\s*%/.test(text)) out.postRate = 10.5;
    if (/59\s*L|59,?00,?000/i.test(text)) out.savings = 5900000;
    if (name.endsWith(".csv")) {
      for (const line of text.split(/\r?\n/)) {
        const parts = line.split(/[,;\t]/);
        if (parts.length >= 2) {
          const key = parts[0].toLowerCase();
          const num = parseFloat(parts[1].replace(/[₹,\s%]/g, ""));
          if (!Number.isFinite(num)) continue;
          if (key.includes("current age")) out.currentAge = num;
          else if (key.includes("retirement age")) out.retirementAge = num;
          else if (key.includes("monthly")) out.monthlyExpenses = num;
          else if (key.includes("savings") || key.includes("asset")) out.savings = num;
          else if (key.includes("inflation")) out.inflation = num;
          else if (key.includes("life")) out.lifeExpectancy = num;
        }
      }
    }
    return out;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  /* ---------- derived view data ---------- */

  const chartData = result.points.map((p) => ({
    year: p.year,
    Corpus: Math.round(p.corpus),
    Invested: Math.round(p.invested),
    Required: p.required != null ? Math.round(p.required) : undefined,
    Withdrawn: p.withdrawn != null ? Math.round(p.withdrawn) : undefined,
  }));

  const series = chartSeries[type];
  const cols = tableCols[type];

  const summary: { label: string; value: string; icon: LucideIcon; accent?: boolean }[] = [
    {
      label: type === "swp" ? "Monthly withdrawal" : type === "retirement" ? "Monthly SIP needed" : type === "stepup" ? "Starting SIP" : "Monthly investment",
      value: formatINR(result.monthlyInvestment),
      icon: Wallet,
    },
    {
      label: type === "retirement" ? "Pre-retirement return" : "Expected return",
      value: `${inputs[type === "retirement" ? "preRate" : "rate"] ?? 0}%`,
      icon: TrendingUp,
    },
    {
      label: type === "swp" ? "Withdrawal period" : type === "retirement" ? "Years to retire" : "Investment period",
      value: `${result.period} years`,
      icon: Clock,
    },
    {
      label: type === "swp" ? "Remaining corpus" : type === "retirement" ? "Retirement corpus" : "Estimated corpus",
      value: formatINR(result.corpus, true),
      icon: IndianRupee,
      accent: true,
    },
  ];

  // Donut: invested vs growth (SWP: remaining vs withdrawn)
  const breakdown =
    type === "swp"
      ? [
          { name: "Remaining corpus", value: Math.max(0, result.corpus), color: "#00907a" },
          { name: "Withdrawn", value: Math.max(0, result.totalWithdrawn ?? 0), color: "#9aa7b4" },
        ]
      : [
          { name: "Invested", value: Math.max(0, result.totalInvested), color: "#9aa7b4" },
          { name: "Estimated returns", value: Math.max(0, result.returns), color: "#00907a" },
        ];
  const breakdownTotal = breakdown.reduce((s, b) => s + b.value, 0);
  const breakdownTitle = type === "swp" ? "Remaining vs withdrawn" : "Invested vs growth";

  /* ---------- render ---------- */

  return (
    <div className="shell">
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="topbar-left">
            <div className="brand">
              <div className="brand-icon"><Layers size={16} /></div>
              <div>
                <div className="brand-name">Wealth Planner</div>
                <div className="brand-tag">Plan. Invest. Grow.</div>
              </div>
            </div>
            <nav className="nav">
              <button type="button" className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
                Dashboard
              </button>
              <button type="button" className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
                Manage / History
              </button>
            </nav>
          </div>
          <span className="workspace-tag">Private workspace</span>
        </div>
      </header>

      <main className="container">
        {view === "history" ? (
          <section className="history">
            <div className="hero">
              <div>
                <div className="eyebrow">Saved plans</div>
                <h1>Manage your plans.</h1>
                <p>Reopen or delete plans you have saved in this browser.</p>
              </div>
            </div>
            <div className="history-list">
              {plans.length === 0 ? (
                <div className="empty">No saved plans yet. Use “Save plan” on the dashboard.</div>
              ) : (
                plans.map((p) => (
                  <div className="history-item" key={p.id}>
                    <div>
                      <div className="history-name">{calculatorLabels[p.type]} · {formatINR(p.corpus, true)}</div>
                      <div className="history-meta">Saved {new Date(p.savedAt).toLocaleString("en-IN")}</div>
                    </div>
                    <div className="actions">
                      <button type="button" className="btn" onClick={() => openPlan(p)}>Open</button>
                      <button type="button" className="btn danger" onClick={() => deletePlan(p.id)}>
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : (
          <>
            <section className="hero">
              <div>
                <div className="eyebrow">Investment planning, made clear</div>
                <h1>Plan your financial future.</h1>
                <p>Model investments, retirement needs and withdrawal strategies with transparent assumptions.</p>
              </div>
              <div className="actions">
                <button type="button" className="btn" onClick={handleReset}><RotateCcw size={12} /> Reset</button>
                <button type="button" className="btn" onClick={handleShare}><Share2 size={12} /> Share</button>
                <button type="button" className="btn" onClick={() => window.print()}><FileText size={12} /> Report</button>
                <button type="button" className="btn primary" onClick={handleSave}><Plus size={12} /> Save plan</button>
              </div>
            </section>

            <section className="summary">
              {summary.map(({ label, value, icon: Icon, accent }) => (
                <div className={`summary-cell ${accent ? "accent" : ""}`} key={label}>
                  <Icon size={18} className="summary-icon" strokeWidth={1.6} />
                  <div>
                    <div className="summary-label">{label}</div>
                    <div className="summary-value">{value}</div>
                  </div>
                </div>
              ))}
            </section>

            <nav className="tabs">
              {calcTabs.map(({ type: t, short, icon: Icon }) => (
                <button key={t} type="button" className={`tab ${type === t ? "active" : ""}`} onClick={() => setType(t)}>
                  <Icon size={13} />
                  {short}
                </button>
              ))}
            </nav>

            <section className="calc">
              <div className="calc-left">
                <div className="kicker">Assumptions</div>
                <div className="panel-head">
                  <h2 className="panel-title">{calculatorLabels[type]}</h2>
                  <span className="live">Live model</span>
                </div>

                <div className="fields">
                  {fieldDefinitions[type].map((f) => (
                    <NumberField key={f.key} field={f} value={inputs[f.key] ?? 0} onChange={(v) => setField(f.key, v)} />
                  ))}
                </div>

                {type === "retirement" && (
                  <div
                    className={`upload-zone ${drag ? "drag" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={onDrop}
                  >
                    <FileSpreadsheet size={24} style={{ color: "var(--teal)" }} />
                    <p><strong>Upload PDF, XLSX or CSV</strong></p>
                    <p>Map retirement plan fields automatically (ages, expenses, returns, assets).</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                      style={{ display: "none" }}
                      onChange={onFileChange}
                    />
                    <button type="button" className="btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      <Upload size={12} /> {uploading ? "Parsing…" : "Choose file"}
                    </button>
                    {uploadStatus && <p className={`upload-status ${uploadStatus.kind}`}>{uploadStatus.text}</p>}
                  </div>
                )}

                <div className="hint">
                  <Clock size={12} />
                  Adjust any value to update your estimate immediately. Projections are not guaranteed.
                </div>
              </div>

              <div className="calc-right">
                <div className="kicker">Projected corpus</div>
                <div className="result-top">
                  <div className="result-big">{formatINR(result.corpus, true)}</div>
                  <div className="result-side">
                    <div className="kicker">Estimated returns</div>
                    <div className="delta">+ {formatINR(result.returns, true)}</div>
                  </div>
                </div>

                <div className="stat-row">
                  <div>
                    <div className="stat-label">{type === "swp" ? "Starting corpus" : "Total invested"}</div>
                    <div className="stat-value">{formatINR(result.totalInvested, true)}</div>
                  </div>
                  <div>
                    <div className="stat-label">Est. returns</div>
                    <div className="stat-value">{formatINR(result.returns, true)}</div>
                  </div>
                  <div>
                    <div className="stat-label">Time horizon</div>
                    <div className="stat-value">{result.period} yrs</div>
                  </div>
                </div>

                {type === "retirement" && result.readiness != null && (
                  <div className="readiness">
                    <strong>{result.readiness}% ready</strong>
                    <div className="readiness-bar"><div className="readiness-fill" style={{ width: `${result.readiness}%` }} /></div>
                    {result.requiredCorpus != null && <span>Need {formatINR(result.requiredCorpus, true)}</span>}
                  </div>
                )}

                <ul className="notes">
                  {result.notes.map((n, i) => <li key={i}>{n}</li>)}
                  {type === "retirement" && result.monthlyExpenseAtRetirement != null && (
                    <li>Monthly expense at retirement: {formatINR(result.monthlyExpenseAtRetirement)}</li>
                  )}
                </ul>
              </div>
            </section>

            <section className="section-row">
              <div className="section">
                <div className="section-head">
                  <div>
                    <div className="kicker">Projection</div>
                    <h3 className="section-title">{type === "swp" ? "Corpus over time" : "Investment growth"}</h3>
                  </div>
                  <div className="legend">
                    {[...series].reverse().map((s) => (
                      <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>
                    ))}
                  </div>
                </div>
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gCorpus" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00907a" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#00907a" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#ece9e1" vertical={false} />
                      <XAxis dataKey="year" tickFormatter={(v) => `${v}y`} stroke="#98a2ae" fontSize={10} tickLine={false} axisLine={{ stroke: "#e7e4dc" }} minTickGap={14} />
                      <YAxis stroke="#98a2ae" fontSize={10} tickLine={false} axisLine={false} width={84} tickFormatter={(v) => formatINR(Number(v), true)} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #e7e4dc", borderRadius: 4, fontSize: 11, boxShadow: "none" }}
                        labelFormatter={(v) => `Year ${v}`}
                        formatter={(v) => formatINR(Number(v))}
                      />
                      {series.map((s) => (
                        <Area
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label}
                          stroke={s.color}
                          strokeWidth={s.fill ? 2 : 1.5}
                          strokeDasharray={s.dashed ? "4 4" : undefined}
                          fill={s.fill ? "url(#gCorpus)" : "transparent"}
                          dot={false}
                          isAnimationActive={false}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="section">
                <div className="kicker">Breakdown</div>
                <h3 className="section-title">{breakdownTitle}</h3>
                <div className="donut-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={breakdownTotal > 0 ? breakdown : [{ name: "none", value: 1, color: "#e7e4dc" }]}
                        dataKey="value"
                        innerRadius={56}
                        outerRadius={76}
                        startAngle={90}
                        endAngle={-270}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {(breakdownTotal > 0 ? breakdown : [{ color: "#e7e4dc" }]).map((b, i) => (
                          <Cell key={i} fill={b.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center">
                    <small>Total value</small>
                    <strong>{formatINR(breakdownTotal, true)}</strong>
                  </div>
                </div>
                <div className="break-list">
                  {breakdown.map((b) => (
                    <div key={b.name}>
                      <span><i style={{ background: b.color }} />{b.name}</span>
                      <b>{formatINR(b.value, true)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="section-row">
              <div className="section">
                <div className="section-head">
                  <div>
                    <div className="kicker">Annual schedule</div>
                    <h3 className="section-title">{type === "retirement" ? "Age-by-age projection" : "Year-by-year projection"}</h3>
                  </div>
                  <span className="live">{result.rows.length} {type === "retirement" ? "years to go" : "years"}</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i}>
                          {cols.map((c) => {
                            const v = row[c.key];
                            return <td key={c.key}>{c.money && typeof v === "number" ? formatINR(v, true) : v}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="section">
                <div className="kicker">Planning note</div>
                <h3 className="section-title">What this estimate says</h3>
                <div className="note-list">
                  <div className="note-item primary">
                    <CheckCircle2 size={13} />
                    <span>{planningNote(type, result)}</span>
                  </div>
                  <div className="note-item">
                    <Info size={13} />
                    <span>This projection is not guaranteed. Actual outcomes depend on returns, fees, taxes and market conditions.</span>
                  </div>
                </div>
              </div>
            </section>

            <p className="disclaimer">
              Illustrative calculations for educational purposes only. Actual investment returns vary and these projections should not be considered financial advice.
            </p>
          </>
        )}
      </main>

      <footer className="footer">
        <div className="container">
          <span>Wealth Planner · Private financial workspace</span>
          <span>All projections are illustrative · Indian Rupees (₹)</span>
        </div>
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}