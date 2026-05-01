import { useCallback, useEffect, useRef, useState } from "react";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useAgent } from "agents/react";
import App from "./app";
import PillIcon from "./components/PillIcon";
import {
  PatientProvider,
  useActivePatientData
} from "./PatientContext";
import type { ChatAgent, Decision } from "./server";

// ─────────────────────────────────────────────────────────────────
// Real-time decisions hook — fetches the audit ledger from the DO
// and refreshes on broadcast events from recordDecision / createTask.
// ─────────────────────────────────────────────────────────────────

function useDecisions(): Decision[] {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const refreshRef = useRef<() => void>(() => {});

  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    onMessage: useCallback((message: MessageEvent) => {
      try {
        const data = JSON.parse(String(message.data));
        if (
          data.type === "decision-recorded" ||
          data.type === "task-created"
        ) {
          refreshRef.current();
        }
      } catch {
        // Not our event
      }
    }, [])
  });

  const refresh = useCallback(async () => {
    try {
      const rows = await agent.stub.getRecentDecisions(10);
      setDecisions(rows);
    } catch (e) {
      console.warn("getRecentDecisions failed:", e);
    }
  }, [agent]);

  refreshRef.current = refresh;

  useEffect(() => {
    refresh();
  }, [refresh]);

  return decisions;
}


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
      <div className="px-4 py-3 md:px-8 md:py-4">
        <div className="flex items-end justify-between gap-3 md:gap-8">
          {/* Left: lockup */}
          <div className="flex items-end gap-3 md:gap-4 min-w-0">
            <PillIcon
              className="w-10 h-5 md:w-16 md:h-8 mb-1 md:mb-1.5 flex-shrink-0"
              rotate
            />
            <div className="min-w-0">
              <div className="display-eyebrow text-[13px] md:text-[15px] -mb-0.5 text-[color:var(--color-text-muted)]">
                the preventable
              </div>
              <h1 className="display-title text-[28px] sm:text-[36px] md:text-[42px] lg:text-[48px] leading-[0.95]">
                Visit{" "}
                <span style={{ color: "var(--color-primary)" }}>Detector</span>
              </h1>
            </div>
          </div>

          {/* Right: meta + theme */}
          <div className="flex items-center gap-3 md:gap-5 pb-1 flex-shrink-0">
            <div className="text-right hidden md:block">
              <div className="folio">UIC · INFORMS · MAY 1, 2026</div>
              <div
                className="text-sm italic mt-0.5"
                style={{
                  fontFamily: "var(--font-body)",
                  color: "var(--color-text-muted)"
                }}
              >
                Care Coordinator Console
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Masthead lockup row — desktop only (the right-side meta carries
            the same info on tablet and the eyebrow does on mobile) */}
        <div className="mt-3 masthead-lockup hidden lg:flex">
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

function PatientPanel() {
  const { data: p, loading } = useActivePatientData();

  if (!p) {
    return (
      <aside
        className="w-[300px] flex-shrink-0 overflow-y-auto anim-fade-up stagger-2 relative z-10 hidden lg:block"
        style={{
          background: "var(--color-bg-raised)",
          borderRight: "1px solid var(--color-border)"
        }}
      >
        <div className="p-6">
          <div className="folio mb-1">§ I — Active Subject</div>
          <p
            className="mt-3 italic text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            {loading
              ? "Pulling top-risk patient…"
              : "No active subject. Select one from §II Patient Metrics or click a row on §III Risk Dashboard."}
          </p>
        </div>
      </aside>
    );
  }

  const fullName = `${p.first} ${p.last}`;
  const displayName = fullName.replace(/\d+/g, "").trim();
  const syntheaId = fullName.match(/\d+/)?.[0] ?? "";
  const isHighUtilizer = p.ed_visits >= 5 || p.inpatient_visits >= 3;
  const debtFlag = p.outstanding_debt > 10_000;

  return (
    <aside
      className="w-[300px] flex-shrink-0 overflow-y-auto anim-fade-up stagger-2 relative z-10 hidden lg:block"
      style={{
        background: "var(--color-bg-raised)",
        borderRight: "1px solid var(--color-border)"
      }}
    >
      <div className="p-6">
        <div className="folio mb-1">§ I — Active Subject</div>
        <h2 className="display-title text-[26px] mt-2">{displayName}</h2>
        <p
          className="mt-1 italic"
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--color-text-muted)"
          }}
        >
          {syntheaId && (
            <>
              synthea id ·{" "}
              <span className="numeral not-italic">{syntheaId}</span>
              {", "}
            </>
          )}
          age <span className="numeral not-italic">{p.age}</span>
          {p.gender && <>, {p.gender === "M" ? "male" : "female"}</>}
        </p>
        {p.city && (
          <p
            className="text-xs mt-1"
            style={{ color: "var(--color-text-muted)" }}
          >
            {p.city}, {p.state}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {!p.has_active_careplan && (
            <span className="risk-pill risk-pill--danger pulse-glow">
              No care plan
            </span>
          )}
          {isHighUtilizer && (
            <span className="risk-pill risk-pill--warn">High utilizer</span>
          )}
          {debtFlag && (
            <span className="risk-pill risk-pill--danger">Debt</span>
          )}
        </div>
      </div>

      <hr className="rule-ekg" />

      <div
        className="grid grid-cols-2"
        style={{ borderBottom: "1px solid var(--color-border)" }}
      >
        <StatCell
          label="ED visits"
          value={p.ed_visits}
          emphasis={p.ed_visits >= 5 ? "danger" : "default"}
        />
        <StatCell
          label="Inpatient"
          value={p.inpatient_visits}
          emphasis={p.inpatient_visits >= 3 ? "danger" : "default"}
        />
        <StatCell
          label="Cohort cost"
          value={
            p.total_cost >= 1_000_000
              ? `$${(p.total_cost / 1_000_000).toFixed(1)}M`
              : `$${Math.round(p.total_cost / 1000)}K`
          }
        />
        <StatCell
          label="Care plan"
          value={p.has_active_careplan ? "✓" : "—"}
          emphasis={p.has_active_careplan ? "default" : "danger"}
        />
      </div>

      <div className="p-6">
        <div className="label-mono mb-3">§ II — Active Conditions</div>
        {p.top_conditions.length === 0 ? (
          <p
            className="text-sm italic"
            style={{ color: "var(--color-text-muted)" }}
          >
            No active conditions on record.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {p.top_conditions.slice(0, 6).map((c, i) => (
              <li
                key={c}
                className="flex items-baseline gap-3"
                style={{ fontFamily: "var(--font-body)" }}
              >
                <span className="numeral text-xs text-[color:var(--color-text-muted)] w-5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[14px] leading-snug">{c}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <hr className="rule-ekg" />

      <div className="p-6">
        <div className="label-mono mb-3">§ III — Barriers</div>
        {p.sdoh_flags.length === 0 ? (
          <p
            className="text-sm italic"
            style={{ color: "var(--color-text-muted)" }}
          >
            No SDOH flags on record.
          </p>
        ) : (
          <ul className="space-y-2">
            {p.sdoh_flags.slice(0, 6).map((f) => (
              <li
                key={f}
                className="flex items-baseline gap-2"
                style={{ fontFamily: "var(--font-body)" }}
              >
                <span
                  style={{ color: "var(--color-primary)" }}
                  aria-hidden="true"
                >
                  ✕
                </span>
                <span className="text-[14px] italic leading-snug">{f}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <hr className="rule-ekg" />

      <div className="p-6 pt-4">
        <div className="folio">End of subject record · cont. p. ii →</div>
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
  const decisions = useDecisions();
  const isEmpty = decisions.length === 0;

  return (
    <aside
      className="w-[340px] flex-shrink-0 overflow-y-auto anim-fade-up stagger-3 relative z-10 hidden lg:block"
      style={{
        background: "var(--color-bg-raised)",
        borderLeft: "1px solid var(--color-border)"
      }}
    >
      <div className="p-6">
        <div className="folio mb-1">§ V — Decision Ledger</div>
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
        <div
          className="mt-3 numeral text-[10.5px] uppercase tracking-[0.18em]"
          style={{ color: "var(--color-text-muted)" }}
        >
          {decisions.length} decision{decisions.length === 1 ? "" : "s"}
          {" · "}live ledger
        </div>
      </div>

      <hr className="rule-ekg" />

      {isEmpty ? (
        <div className="p-6">
          <div
            className="rounded-md p-4 border-dashed border"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-bg-surface)"
            }}
          >
            <div className="label-mono mb-2">Ledger empty</div>
            <p
              className="text-sm leading-relaxed"
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-muted)"
              }}
            >
              Ask the agent for at-risk patients, draft an outreach message,
              and approve it in chat. Each approval lands here.
            </p>
            <p
              className="mt-3 text-xs italic"
              style={{ color: "var(--color-text-muted)" }}
            >
              Try: <em>"Find the top 3 patients at risk of a preventable ED visit."</em>
            </p>
          </div>
        </div>
      ) : (
        <div className="px-6 py-5 timeline-rail">
          <ol className="space-y-6 ml-6">
            {decisions.map((d, i) => (
              <li
                key={d.id}
                className="relative anim-fade-up"
                style={{ animationDelay: `${0.05 + i * 0.06}s` }}
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
      )}
    </aside>
  );
}

// Wraps the tabbed App in the editorial frame. The App's tab bar IS the
// section navigation, so we don't add another header here.
function ChatFrame({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="flex-1 min-w-0 flex flex-col anim-fade-up stagger-1 relative z-0"
      style={{ background: "var(--color-bg)" }}
    >
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
    <PatientProvider>
      <div
        className="h-full w-full flex flex-col"
        style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
      >
        <Header />
        <div className="flex-1 flex min-h-0">
          <PatientPanel />
          <ChatFrame>
            <App />
          </ChatFrame>
          <AuditTrail />
        </div>
      </div>
    </PatientProvider>
  );
}
