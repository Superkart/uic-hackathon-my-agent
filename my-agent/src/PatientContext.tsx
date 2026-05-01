import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";
import { useAgent } from "agents/react";
import type { ChatAgent } from "./server";

// ─────────────────────────────────────────────────────────────────
// Cross-tab patient state. The "active patient" is the subject of
// the left rail and persists across §I Investigation, §II Patient
// Metrics, and §III Risk Dashboard. Tabs read+write through this
// context so clicking a row on the dashboard or selecting from the
// metrics dropdown updates the rail (and vice versa). The agent's
// recordDecision broadcast also moves the active patient to whoever
// the latest decision was for — closing the loop visually.
// ─────────────────────────────────────────────────────────────────

const DB = "https://uic-hackathon-data.christian-7f4.workers.dev/query";

export async function dbQuery<T = Record<string, unknown>>(
  sql: string
): Promise<T[]> {
  const res = await fetch(DB, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql })
  });
  const json = (await res.json()) as { success: boolean; results: T[] };
  return json.results ?? [];
}

interface PatientCtxValue {
  activePatientId: string | null;
  setActivePatient: (id: string) => void;
}

const PatientCtx = createContext<PatientCtxValue | null>(null);

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const [activePatientId, setActivePatientId] = useState<string | null>(null);

  // Bootstrap: pick top-1 risk patient on first load
  useEffect(() => {
    if (activePatientId) return;
    (async () => {
      try {
        const rows = await dbQuery<{ id: string }>(
          `SELECT id FROM patient_summary
           ORDER BY ed_visits DESC, has_active_careplan ASC,
                    chronic_condition_count DESC
           LIMIT 1`
        );
        if (rows[0]?.id) setActivePatientId(rows[0].id);
      } catch (e) {
        console.warn("Failed to bootstrap top-risk patient:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for decisions — when the agent records one, jump the rail
  // to that patient so the audit and rail stay in sync.
  useAgent<ChatAgent>({
    agent: "ChatAgent",
    onMessage: useCallback((message: MessageEvent) => {
      try {
        const data = JSON.parse(String(message.data));
        if (data.type === "decision-recorded" && data.patient_id) {
          setActivePatientId(data.patient_id);
        }
      } catch {
        // not our event
      }
    }, [])
  });

  return (
    <PatientCtx.Provider
      value={{ activePatientId, setActivePatient: setActivePatientId }}
    >
      {children}
    </PatientCtx.Provider>
  );
}

export function usePatient(): PatientCtxValue {
  const ctx = useContext(PatientCtx);
  if (!ctx) throw new Error("usePatient must be used inside <PatientProvider>");
  return ctx;
}

// ─────────────────────────────────────────────────────────────────
// useActivePatientData — fetches the active patient's full record
// (summary + active conditions + SDOH flags from conditions table)
// ─────────────────────────────────────────────────────────────────

export interface ActivePatientData {
  id: string;
  first: string;
  last: string;
  age: number;
  gender: string;
  race: string;
  ethnicity: string;
  income: number;
  city: string;
  state: string;
  ed_visits: number;
  inpatient_visits: number;
  total_visits: number;
  total_cost: number;
  ed_inpatient_total_cost: number;
  chronic_condition_count: number;
  has_active_careplan: number;
  top_conditions: string[];
  sdoh_flags: string[];
  outstanding_debt: number;
}

const SDOH_LIKE = [
  "%homeless%",
  "%housing%",
  "%transport%",
  "%food%",
  "%unemploy%",
  "%not in labor%",
  "%lack of access%",
  "%poverty%",
  "%limited social%",
  "%full-time%employment%",
  "%violence%",
  "%abuse%",
  "%stress%"
];

export function useActivePatientData(): {
  data: ActivePatientData | null;
  loading: boolean;
  refresh: () => void;
} {
  const { activePatientId } = usePatient();
  const [data, setData] = useState<ActivePatientData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!activePatientId) return;
    setLoading(true);
    (async () => {
      try {
        const sdohClause = SDOH_LIKE.map(
          (p) => `LOWER(DESCRIPTION) LIKE '${p}'`
        ).join(" OR ");
        const [summaryRows, conditionRows, sdohRows, debtRows] =
          await Promise.all([
            dbQuery<ActivePatientData>(
              `SELECT id, first, last, age, gender, race, ethnicity,
                      income, city, state,
                      ed_visits, inpatient_visits, total_visits,
                      total_cost, ed_inpatient_total_cost,
                      chronic_condition_count, has_active_careplan
               FROM patient_summary WHERE id = '${activePatientId}' LIMIT 1`
            ),
            dbQuery<{ DESCRIPTION: string }>(
              `SELECT DISTINCT DESCRIPTION FROM conditions
               WHERE PATIENT = '${activePatientId}' AND STOP IS NULL
               ORDER BY START DESC LIMIT 6`
            ),
            dbQuery<{ DESCRIPTION: string }>(
              `SELECT DISTINCT DESCRIPTION FROM conditions
               WHERE PATIENT = '${activePatientId}'
                 AND (${sdohClause})
               LIMIT 8`
            ),
            dbQuery<{ debt: number }>(
              `SELECT ROUND(SUM(OUTSTANDING), 2) AS debt
               FROM claims_transactions
               WHERE PATIENTID = '${activePatientId}' LIMIT 1`
            )
          ]);
        const s = summaryRows[0];
        if (!s) {
          setData(null);
          return;
        }
        const sdohList = sdohRows.map((r) => r.DESCRIPTION);
        const sdohSet = new Set(sdohList);
        const clinicalConditions = conditionRows
          .map((r) => r.DESCRIPTION)
          .filter((d) => !sdohSet.has(d));
        setData({
          ...s,
          top_conditions: clinicalConditions,
          sdoh_flags: sdohList,
          outstanding_debt: debtRows[0]?.debt ?? 0
        });
      } catch (e) {
        console.warn("useActivePatientData failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [activePatientId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, refresh };
}
