import { useCallback, useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import App from "./app";
import PillIcon from "./components/PillIcon";

// ─────────────────────────────────────────────────────────────────
// Mock data — replace with real fetches once the writeback work merges.
// Shape stays stable; the swap is a one-line change to a hook.
// ─────────────────────────────────────────────────────────────────

const MOCK_RECENT_DECISIONS = [
  {
    id: "d_003",
    patient_name: "Lindsay928 Brekke496",
    action: "Outreach: schedule migraine follow-up",
    approved_at: "2026-05-01T13:42:00Z",
    coordinator_note: "Tuesday afternoons (daughter drives)"
  },
  {
    id: "d_002",
    patient_name: "Giovanni385 Paucek755",
    action: "Outreach: discharge planning + behavioral health referral",
    approved_at: "2026-05-01T13:18:00Z",
    coordinator_note: ""
  },
  {
    id: "d_001",
    patient_name: "Chantelle310 Oberbrunner298",
    action: "Outreach: pharmacy reconciliation",
    approved_at: "2026-05-01T13:04:00Z",
    coordinator_note: "Spanish-preferred coordinator"
  }
];

const MOCK_ACTIVE_PATIENT = {
  name: "Lindsay928 Brekke496",
  age: 47,
  ed_visits: 44,
  inpatient_visits: 3,
  total_cost: 287_412,
  has_active_careplan: false,
  top_conditions: ["Chronic migraine", "Generalized anxiety", "Hypertension"],
  sdoh_flags: ["Transportation barrier", "Not in labor force"]
};

// ─────────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme", mode);
  }, [dark]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="btn-lift inline-flex items-center justify-center rounded-full border w-9 h-9 shadow-sm"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-bg-raised)",
        color: "var(--color-text-muted)"
      }}
    >
      {dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
    </button>
  );
}

function Header() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  return (
    <header
      className="anim-fade-down relative z-10"
      style={{
        background: "var(--color-bg-surface)",
        borderBottom: "1px solid var(--color-border)"
      }}
    >
      <div className="px-8 py-4">
        <div className="flex items-end justify-between gap-8">
          {/* Left: lockup */}
          <div className="flex items-end gap-4">
            <PillIcon className="w-16 h-8 mb-1.5" rotate />
            <div>
              <div className="display-eyebrow text-[15px] -mb-0.5 text-[color:var(--color-text-muted)]">
                the preventable
              </div>
              <h1 className="display-title text-[42px] sm:text-[48px] leading-[0.95]">
                Visit{" "}
                <span style={{ color: "var(--color-primary)" }}>Detector</span>
              </h1>
            </div>
          </div>

          {/* Right: meta + theme */}
          <div className="flex items-center gap-5 pb-1">
            <div className="text-right">
              <div className="folio">UIC · INFORMS · MAY 1, 2026</div>
              <div
                className="text-sm mt-0.5"
                style={{
                  fontFamily: "var(--font-body)",
                  color: "var(--color-text)"
                }}
              >
                <span className="italic text-[color:var(--color-text-muted)]">
                  on call ·{" "}
                </span>
                <span className="font-medium">Sarah Chen, RN</span>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Masthead lockup row — full-width editorial rule */}
        <div className="mt-3 masthead-lockup">
          <span className="label-mono">Vol. I</span>
          <span className="masthead-rule" />
          <span className="label-mono">Care Coordinator Console</span>
          <span className="masthead-rule" />
          <span className="label-mono">{today}</span>
          <span className="masthead-rule" />
          <span className="label-mono">No. 001</span>
        </div>
      </div>
    </header>
  );
}

function StatCell({
  label,
  value,
  emphasis
}: {
  label: string;
  value: string | number;
  emphasis?: "danger" | "default";
}) {
  return (
    <div
      className="px-3 py-3 border-b last:border-b-0"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="label-mono-tight">{label}</div>
      <div
        className="numeral text-2xl mt-0.5"
        style={{
          color:
            emphasis === "danger"
              ? "var(--color-primary)"
              : "var(--color-text)",
          fontWeight: emphasis === "danger" ? 600 : 500
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PatientContext() {
  const p = MOCK_ACTIVE_PATIENT;
  return (
    <aside
      className="w-[300px] flex-shrink-0 overflow-y-auto anim-fade-up stagger-2 relative z-10"
      style={{
        background: "var(--color-bg-raised)",
        borderRight: "1px solid var(--color-border)"
      }}
    >
      <div className="p-6">
        <div className="folio mb-1">§ I — Active Subject</div>
        <h2 className="display-title text-[26px] mt-2">
          {p.name.replace(/\d+/g, "")}
        </h2>
        <p
          className="mt-1 italic"
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--color-text-muted)"
          }}
        >
          synthea id ·{" "}
          <span className="numeral not-italic">
            {p.name.match(/\d+/)?.[0]}
          </span>
          , age <span className="numeral not-italic">{p.age}</span>
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {!p.has_active_careplan && (
            <span className="risk-pill risk-pill--danger pulse-glow">
              No care plan
            </span>
          )}
          <span className="risk-pill risk-pill--warn">High utilizer</span>
        </div>
      </div>

      <hr className="rule-ekg" />

      <div
        className="grid grid-cols-2"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <StatCell label="ED visits" value={p.ed_visits} emphasis="danger" />
        <StatCell label="Inpatient" value={p.inpatient_visits} />
        <StatCell
          label="Cohort cost"
          value={`$${(p.total_cost / 1000).toFixed(0)}K`}
        />
        <StatCell label="Care plan" value={p.has_active_careplan ? "✓" : "—"} />
      </div>

      <div className="p-6">
        <div className="label-mono mb-3">§ II — Active Conditions</div>
        <ul className="space-y-1.5">
          {p.top_conditions.map((c, i) => (
            <li
              key={c}
              className="flex items-baseline gap-3"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <span className="numeral text-xs text-[color:var(--color-text-muted)] w-5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[15px]">{c}</span>
            </li>
          ))}
        </ul>
      </div>

      <hr className="rule-ekg" />

      <div className="p-6">
        <div className="label-mono mb-3">§ III — Barriers</div>
        <ul className="space-y-2">
          {p.sdoh_flags.map((f) => (
            <li
              key={f}
              className="flex items-center gap-2"
              style={{ fontFamily: "var(--font-body)" }}
            >
              <span
                style={{ color: "var(--color-primary)" }}
                aria-hidden="true"
              >
                ✕
              </span>
              <span className="text-[15px] italic">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <hr className="rule-ekg" />

      <div className="p-6 pt-4">
        <div className="folio">
          End of subject record · cont. p. ii →
        </div>
      </div>
    </aside>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
  return <span className="numeral">{time}</span>;
}

function AuditTrail() {
  return (
    <aside
      className="w-[340px] flex-shrink-0 overflow-y-auto anim-fade-up stagger-3 relative z-10"
      style={{
        background: "var(--color-bg-raised)",
        borderLeft: "1px solid var(--color-border)"
      }}
    >
      <div className="p-6">
        <div className="folio mb-1">§ IV — Decision Ledger</div>
        <h3 className="display-title text-[26px] mt-2">
          The Audit{" "}
          <span
            className="display-eyebrow text-lg"
            style={{ color: "var(--color-text-muted)" }}
          >
            (today)
          </span>
        </h3>
        <p
          className="mt-1 text-sm italic"
          style={{ color: "var(--color-text-muted)" }}
        >
          Every approval becomes a task. Every task has an owner.
        </p>
      </div>

      <hr className="rule-ekg" />

      <div className="px-6 py-5 timeline-rail">
        <ol className="space-y-6 ml-6">
          {MOCK_RECENT_DECISIONS.map((d, i) => (
            <li
              key={d.id}
              className="relative anim-fade-up"
              style={{ animationDelay: `${0.3 + i * 0.1}s` }}
            >
              <span
                className={
                  i === 0
                    ? "timeline-marker timeline-marker--latest"
                    : "timeline-marker"
                }
                style={{ left: "-24px" }}
              />
              <div className="flex items-baseline justify-between gap-2">
                <div
                  className="numeral text-[10.5px] uppercase tracking-[0.18em]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {d.id.replace("_", "-")}
                </div>
                <div
                  className="numeral text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <RelativeTime iso={d.approved_at} />
                </div>
              </div>
              <div
                className="mt-1 text-[15px] font-medium"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {d.patient_name.replace(/\d+/g, "")}
              </div>
              <div
                className="mt-0.5 text-sm leading-snug"
                style={{
                  fontFamily: "var(--font-body)",
                  color: "var(--color-text)"
                }}
              >
                {d.action}
              </div>
              {d.coordinator_note && (
                <blockquote
                  className="mt-2 pl-3 italic text-sm border-l-2"
                  style={{
                    borderColor: "var(--color-primary)",
                    color: "var(--color-text-muted)",
                    fontFamily: "var(--font-body)"
                  }}
                >
                  “{d.coordinator_note}”
                </blockquote>
              )}
            </li>
          ))}
        </ol>
      </div>

      <hr className="rule-ekg" />

      <div className="p-6">
        <div
          className="label-mono mb-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          Awaiting your review
        </div>
        <div
          className="rounded-md p-3 border-dashed border"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-bg-surface)"
          }}
        >
          <div className="numeral text-[10.5px] uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]">
            queue · empty
          </div>
          <div
            className="text-sm mt-1 italic"
            style={{ color: "var(--color-text-muted)" }}
          >
            Ask the agent for today's at-risk patients to begin.
          </div>
        </div>
      </div>
    </aside>
  );
}

// Wraps the chat in an editorial frame with an "issue header" feel
function ChatFrame({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex-1 min-w-0 flex flex-col anim-fade-up stagger-1 relative z-0"
      style={{ background: "var(--color-bg)" }}
    >
      <div
        className="px-8 py-3 flex items-baseline justify-between gap-4"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex items-baseline gap-3">
          <span className="folio">§ Investigation</span>
          <span
            className="display-eyebrow"
            style={{ color: "var(--color-text)" }}
          >
            a conversation with the agent
          </span>
        </div>
        <span
          className="label-mono"
          style={{ color: "var(--color-text-muted)" }}
        >
          claude · workers ai · live d1
        </span>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────
// Shell composition
// ─────────────────────────────────────────────────────────────────

export default function AppShell() {
  // Initialize theme from localStorage on first render
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      document.documentElement.setAttribute("data-mode", "dark");
      document.documentElement.style.colorScheme = "dark";
    }
  }, []);

  return (
    <div
      className="h-full w-full flex flex-col"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      <Header />
      <div className="flex-1 flex min-h-0">
        <PatientContext />
        <ChatFrame>
          <App />
        </ChatFrame>
        <AuditTrail />
      </div>
    </div>
  );
}
