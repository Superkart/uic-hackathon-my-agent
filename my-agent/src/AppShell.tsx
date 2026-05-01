import App from "./app";

// ─────────────────────────────────────────────────────────────────
// Mock data — replace with real data once feat/writeback merges.
// Keep the shape stable so the swap is a one-line change.
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
  has_active_careplan: false,
  top_conditions: ["Chronic migraine", "Anxiety", "Hypertension"],
  sdoh_flags: ["Transport barrier", "Not in labor force"]
};

// ─────────────────────────────────────────────────────────────────
// Layout primitives — edit these freely. Tailwind + kumo are wired up.
// ─────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold">
          P
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">
            Preventable Visit Detector
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Care coordinator console · UIC INFORMS Hackathon
          </p>
        </div>
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400">
        Coordinator: <span className="font-medium">Sarah Chen</span>
      </div>
    </header>
  );
}

function PatientContext() {
  const p = MOCK_ACTIVE_PATIENT;
  return (
    <aside className="w-72 border-r border-gray-200 dark:border-gray-800 p-4 overflow-y-auto">
      <h2 className="text-xs uppercase tracking-wide text-gray-500 mb-3">
        Active patient
      </h2>
      <div className="space-y-3">
        <div>
          <div className="font-semibold">{p.name}</div>
          <div className="text-sm text-gray-500">Age {p.age}</div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={
              p.has_active_careplan
                ? "px-2 py-0.5 rounded bg-green-100 text-green-800"
                : "px-2 py-0.5 rounded bg-red-100 text-red-800"
            }
          >
            {p.has_active_careplan ? "Care plan active" : "No care plan"}
          </span>
          <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800">
            {p.ed_visits} ED visits
          </span>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
            Top conditions
          </div>
          <ul className="text-sm space-y-0.5">
            {p.top_conditions.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
            SDOH flags
          </div>
          <ul className="text-sm space-y-0.5">
            {p.sdoh_flags.map((f) => (
              <li key={f} className="text-orange-700 dark:text-orange-400">
                ⚠ {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

function AuditTrail() {
  return (
    <aside className="w-80 border-l border-gray-200 dark:border-gray-800 p-4 overflow-y-auto">
      <h2 className="text-xs uppercase tracking-wide text-gray-500 mb-3">
        Recent decisions
      </h2>
      <ol className="space-y-3">
        {MOCK_RECENT_DECISIONS.map((d) => (
          <li
            key={d.id}
            className="border-l-2 border-blue-500 pl-3 py-1 text-sm"
          >
            <div className="font-medium">{d.patient_name}</div>
            <div className="text-gray-700 dark:text-gray-300">{d.action}</div>
            {d.coordinator_note && (
              <div className="mt-1 text-xs italic text-gray-500">
                Note: {d.coordinator_note}
              </div>
            )}
            <div className="mt-1 text-xs text-gray-400">
              {new Date(d.approved_at).toLocaleTimeString()}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────
// Shell composition. Adjust the layout, drop sidebars, add nav, etc.
// ─────────────────────────────────────────────────────────────────

export default function AppShell() {
  return (
    <div className="h-full w-full flex flex-col">
      <Header />
      <div className="flex-1 flex min-h-0">
        <PatientContext />
        <main className="flex-1 min-w-0 flex flex-col">
          <App />
        </main>
        <AuditTrail />
      </div>
    </div>
  );
}
