import { useState, useEffect } from "react";
import { Badge, Surface, Text } from "@cloudflare/kumo";
import { usePatient } from "./PatientContext";
import {
  ArrowClockwiseIcon,
  WarningIcon,
  UserIcon,
  HeartIcon,
  CurrencyDollarIcon,
  HouseIcon,
  ArrowUpIcon,
  ArrowDownIcon
} from "@phosphor-icons/react";

// ── DB helper ─────────────────────────────────────────────────────────

const DB = "https://uic-hackathon-data.christian-7f4.workers.dev/query";

async function dbQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const res = await fetch(DB, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql })
  });
  const json = (await res.json()) as { success: boolean; results: T[] };
  return json.results ?? [];
}

// ── Types ─────────────────────────────────────────────────────────────

interface SummaryRow {
  id: string;
  first: string;
  last: string;
  age: number;
  gender: string;
  race: string;
  city: string;
  ed_visits: number;
  inpatient_visits: number;
  total_cost: number;
  ed_inpatient_total_cost: number;
  chronic_condition_count: number;
  has_active_careplan: number;
}

interface MedRow {
  PATIENT: string;
  med_count: number;
}

interface DebtRow {
  PATIENTID: string;
  debt: number;
}

interface SdohRow {
  PATIENT: string;
  sdoh_count: number;
}

export interface ScoredPatient {
  id: string;
  name: string;
  age: number;
  gender: string;
  race: string;
  city: string;
  ed_visits: number;
  chronic_condition_count: number;
  has_active_careplan: boolean;
  total_cost: number;
  ed_cost: number;
  debt: number;
  med_count: number;
  sdoh_flags: number;
  score: number;
  level: "low" | "medium" | "high" | "critical";
  factors: string[];
}

// ── Scoring ───────────────────────────────────────────────────────────

function scorePatient(
  s: SummaryRow,
  medCount: number,
  debt: number,
  sdohCount: number
): { score: number; level: ScoredPatient["level"]; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  if (s.ed_visits > 5) {
    score += 3;
    factors.push(`${s.ed_visits} ED visits`);
  }
  if (!s.has_active_careplan) {
    score += 2;
    factors.push("No care plan");
  }
  if (s.chronic_condition_count > 10) {
    score += 2;
    factors.push(`${s.chronic_condition_count} conditions`);
  }
  if (medCount >= 5) {
    score += 1;
    factors.push(`Polypharmacy (${medCount})`);
  }
  if (debt > 10000) {
    score += 1;
    factors.push(`$${Math.round(debt / 1000)}k debt`);
  }
  if (sdohCount > 0) {
    score += Math.min(sdohCount, 2);
    factors.push(`${sdohCount} SDOH flag${sdohCount > 1 ? "s" : ""}`);
  }

  const max = 14;
  const pct = score / max;
  const level =
    pct >= 0.6 ? "critical" : pct >= 0.43 ? "high" : pct >= 0.25 ? "medium" : "low";

  return { score, level, factors };
}

// ── Risk helpers ──────────────────────────────────────────────────────

const LEVEL_COLOR: Record<ScoredPatient["level"], string> = {
  critical: "text-kumo-danger",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-kumo-success"
};

const LEVEL_BAR: Record<ScoredPatient["level"], string> = {
  critical: "bg-kumo-danger",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-kumo-success"
};

const BADGE_VARIANT: Record<
  ScoredPatient["level"],
  "destructive" | "primary" | "secondary"
> = {
  critical: "destructive",
  high: "destructive",
  medium: "primary",
  low: "secondary"
};

// ── Stat card ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  danger
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Surface
      className={`p-4 rounded-xl ring ${danger ? "ring-kumo-danger" : "ring-kumo-line"} flex flex-col gap-1`}
    >
      <div className="flex items-center gap-1.5 text-kumo-inactive mb-1">
        {icon}
        <Text size="xs" variant="secondary">
          {label}
        </Text>
      </div>
      <span
        className={`text-2xl font-bold ${danger ? "text-kumo-danger" : "text-kumo-default"}`}
      >
        {value}
      </span>
      {sub && (
        <Text size="xs" variant="secondary">
          {sub}
        </Text>
      )}
    </Surface>
  );
}

// ── Patient row ───────────────────────────────────────────────────────

function PatientRow({
  p,
  rank,
  onSelect,
  isActive
}: {
  p: ScoredPatient;
  rank: number;
  onSelect: (id: string) => void;
  isActive: boolean;
}) {
  const barPct = Math.min((p.score / 14) * 100, 100);

  return (
    <Surface
      className={`p-4 rounded-xl ring transition-all cursor-pointer ${isActive ? "ring-kumo-danger" : "ring-kumo-line hover:ring-kumo-accent"}`}
      onClick={() => onSelect(p.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(p.id);
        }
      }}
    >
      <div className="flex items-start gap-4">
        {/* Rank */}
        <div className="shrink-0 w-8 text-center">
          <span
            className={`text-lg font-bold ${rank <= 3 ? "text-kumo-danger" : "text-kumo-inactive"}`}
          >
            #{rank}
          </span>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Text size="sm" bold>
              {p.name}
            </Text>
            <Badge variant={BADGE_VARIANT[p.level]}>
              {p.level.toUpperCase()}
            </Badge>
            <Text size="xs" variant="secondary">
              {p.age}y · {p.gender === "M" ? "M" : "F"} · {p.city}
            </Text>
          </div>

          {/* Score bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-kumo-control rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full ${LEVEL_BAR[p.level]}`}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <span className={`text-sm font-bold shrink-0 ${LEVEL_COLOR[p.level]}`}>
              {p.score}/14
            </span>
          </div>

          {/* Risk factor chips */}
          <div className="flex flex-wrap gap-1">
            {p.factors.map((f) => (
              <span
                key={f}
                className="text-xs px-2 py-0.5 rounded-full bg-kumo-control border border-kumo-line text-kumo-default"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Side metrics */}
        <div className="shrink-0 text-right space-y-1">
          <div className="flex items-center gap-1 justify-end text-kumo-danger">
            <WarningIcon size={12} weight="fill" />
            <Text size="xs" bold>
              {p.ed_visits} ED
            </Text>
          </div>
          <Text size="xs" variant="secondary">
            {p.chronic_condition_count} conditions
          </Text>
          <Text size="xs" variant="secondary">
            ${Math.round(p.ed_cost / 1000)}k ED cost
          </Text>
        </div>
      </div>
    </Surface>
  );
}

// ── Sort controls ─────────────────────────────────────────────────────

type SortKey = "score" | "ed_visits" | "chronic_condition_count" | "total_cost";

const SORT_LABELS: Record<SortKey, string> = {
  score: "Risk Score",
  ed_visits: "ED Visits",
  chronic_condition_count: "Conditions",
  total_cost: "Total Cost"
};

// ── Main component ────────────────────────────────────────────────────

export function RiskDashboard() {
  const { activePatientId, setActivePatient } = usePatient();
  const [patients, setPatients] = useState<ScoredPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<
    ScoredPatient["level"] | "all"
  >("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaries, meds, debts, sdoh] = await Promise.all([
        dbQuery<SummaryRow>(
          `SELECT id, first, last, age, gender, race, city,
                  ed_visits, inpatient_visits, total_cost,
                  ed_inpatient_total_cost, chronic_condition_count,
                  has_active_careplan
           FROM patient_summary LIMIT 200`
        ),
        dbQuery<MedRow>(
          `SELECT PATIENT, COUNT(*) AS med_count
           FROM medications WHERE STOP IS NULL
           GROUP BY PATIENT LIMIT 200`
        ),
        dbQuery<DebtRow>(
          `SELECT PATIENTID, ROUND(SUM(OUTSTANDING), 2) AS debt
           FROM claims_transactions
           GROUP BY PATIENTID LIMIT 200`
        ),
        dbQuery<SdohRow>(
          `SELECT PATIENT, COUNT(*) AS sdoh_count
           FROM observations
           WHERE DESCRIPTION LIKE '%PRAPARE%'
             AND (
               (LOWER(DESCRIPTION) LIKE '%housing%' AND VALUE = 'Yes') OR
               (LOWER(DESCRIPTION) LIKE '%transportation%' AND VALUE = 'Yes') OR
               (LOWER(DESCRIPTION) LIKE '%food%' AND VALUE = 'Yes') OR
               (LOWER(DESCRIPTION) LIKE '%physically and emotionally safe%' AND VALUE = 'No')
             )
           GROUP BY PATIENT LIMIT 200`
        )
      ]);

      // Build lookup maps
      const medMap = new Map(meds.map((r) => [r.PATIENT, r.med_count]));
      const debtMap = new Map(debts.map((r) => [r.PATIENTID, r.debt]));
      const sdohMap = new Map(sdoh.map((r) => [r.PATIENT, r.sdoh_count]));

      const scored: ScoredPatient[] = summaries.map((s) => {
        const medCount = medMap.get(s.id) ?? 0;
        const debt = debtMap.get(s.id) ?? 0;
        const sdohCount = sdohMap.get(s.id) ?? 0;
        const { score, level, factors } = scorePatient(s, medCount, debt, sdohCount);

        return {
          id: s.id,
          name: `${s.first} ${s.last}`,
          age: s.age,
          gender: s.gender,
          race: s.race,
          city: s.city,
          ed_visits: s.ed_visits,
          chronic_condition_count: s.chronic_condition_count,
          has_active_careplan: !!s.has_active_careplan,
          total_cost: s.total_cost,
          ed_cost: s.ed_inpatient_total_cost,
          debt,
          med_count: medCount,
          sdoh_flags: sdohCount,
          score,
          level,
          factors
        };
      });

      setPatients(scored);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Aggregate stats
  const critical = patients.filter((p) => p.level === "critical").length;
  const high = patients.filter((p) => p.level === "high").length;
  const noCarePlan = patients.filter((p) => !p.has_active_careplan).length;
  const avgScore =
    patients.length > 0
      ? (patients.reduce((s, p) => s + p.score, 0) / patients.length).toFixed(1)
      : "—";

  // Filter + sort
  const visible = patients
    .filter((p) => filterLevel === "all" || p.level === filterLevel)
    .sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? diff : -diff;
    });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-kumo-elevated">
      {/* Header */}
      <div className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WarningIcon size={20} weight="fill" className="text-kumo-danger" />
            <h2 className="text-lg font-semibold text-kumo-default">
              Population Risk Dashboard
            </h2>
            {!loading && (
              <Badge variant="secondary">{patients.length} patients</Badge>
            )}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-kumo-inactive hover:text-kumo-default transition-colors"
          >
            <ArrowClockwiseIcon
              size={14}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-5 py-6 space-y-6">
          {/* Error */}
          {error && (
            <Surface className="p-4 rounded-xl ring ring-kumo-danger">
              <Text size="sm" variant="secondary">
                {error}
              </Text>
            </Surface>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16 text-kumo-inactive gap-2">
              <ArrowClockwiseIcon size={20} className="animate-spin" />
              <Text variant="secondary">Loading all patient data...</Text>
            </div>
          )}

          {!loading && patients.length > 0 && (
            <>
              {/* Aggregate stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Critical Risk"
                  value={critical}
                  sub="Score ≥ 60% max"
                  icon={<WarningIcon size={14} weight="fill" />}
                  danger
                />
                <StatCard
                  label="High Risk"
                  value={high}
                  sub="Score ≥ 43% max"
                  icon={<WarningIcon size={14} />}
                />
                <StatCard
                  label="No Care Plan"
                  value={noCarePlan}
                  sub="Immediate gap"
                  icon={<HeartIcon size={14} />}
                />
                <StatCard
                  label="Avg Risk Score"
                  value={avgScore}
                  sub="Across all patients"
                  icon={<UserIcon size={14} />}
                />
              </div>

              {/* Risk distribution bar */}
              <Surface className="p-4 rounded-xl ring ring-kumo-line space-y-2">
                <Text size="sm" bold>
                  Risk Distribution
                </Text>
                <div className="flex rounded-full overflow-hidden h-4">
                  {(
                    ["critical", "high", "medium", "low"] as ScoredPatient["level"][]
                  ).map((lvl) => {
                    const count = patients.filter((p) => p.level === lvl).length;
                    const pct = (count / patients.length) * 100;
                    return (
                      <div
                        key={lvl}
                        title={`${lvl}: ${count} patients`}
                        className={`${LEVEL_BAR[lvl]} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    );
                  })}
                </div>
                <div className="flex gap-4 flex-wrap">
                  {(
                    ["critical", "high", "medium", "low"] as ScoredPatient["level"][]
                  ).map((lvl) => {
                    const count = patients.filter((p) => p.level === lvl).length;
                    return (
                      <div key={lvl} className="flex items-center gap-1.5">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${LEVEL_BAR[lvl]}`}
                        />
                        <Text size="xs" variant="secondary">
                          {lvl.charAt(0).toUpperCase() + lvl.slice(1)}: {count}
                        </Text>
                      </div>
                    );
                  })}
                </div>
              </Surface>

              {/* Filters + sort */}
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                  {(
                    [
                      "all",
                      "critical",
                      "high",
                      "medium",
                      "low"
                    ] as (ScoredPatient["level"] | "all")[]
                  ).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setFilterLevel(lvl)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        filterLevel === lvl
                          ? "bg-kumo-accent text-white border-kumo-accent"
                          : "border-kumo-line text-kumo-inactive hover:text-kumo-default"
                      }`}
                    >
                      {lvl === "all"
                        ? `All (${patients.length})`
                        : `${lvl.charAt(0).toUpperCase() + lvl.slice(1)} (${patients.filter((p) => p.level === lvl).length})`}
                    </button>
                  ))}
                </div>

                <div className="flex gap-1 flex-wrap">
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                        sortKey === key
                          ? "border-kumo-accent text-kumo-accent bg-kumo-accent/10"
                          : "border-kumo-line text-kumo-inactive hover:text-kumo-default"
                      }`}
                    >
                      {SORT_LABELS[key]}
                      {sortKey === key &&
                        (sortAsc ? (
                          <ArrowUpIcon size={10} />
                        ) : (
                          <ArrowDownIcon size={10} />
                        ))}
                    </button>
                  ))}
                </div>
              </div>

              {/* Patient list */}
              <div className="space-y-3">
                {visible.length === 0 && (
                  <div className="text-center py-8 text-kumo-inactive">
                    <Text variant="secondary">No patients at this risk level</Text>
                  </div>
                )}
                {visible.map((p, i) => (
                  <PatientRow
                    key={p.id}
                    p={p}
                    rank={i + 1}
                    onSelect={setActivePatient}
                    isActive={p.id === activePatientId}
                  />
                ))}
              </div>

              {/* Top insight */}
              {visible.length > 0 && (
                <Surface className="p-4 rounded-xl ring ring-kumo-line">
                  <div className="flex items-start gap-3">
                    <CurrencyDollarIcon
                      size={16}
                      className="text-kumo-inactive shrink-0 mt-0.5"
                    />
                    <div>
                      <Text size="sm" bold>
                        Top cost driver
                      </Text>
                      <Text size="xs" variant="secondary">
                        {
                          [...patients].sort(
                            (a, b) => b.ed_cost - a.ed_cost
                          )[0]?.name
                        }{" "}
                        —{" "}
                        $
                        {Math.round(
                          [...patients].sort(
                            (a, b) => b.ed_cost - a.ed_cost
                          )[0]?.ed_cost ?? 0
                        ).toLocaleString()}{" "}
                        in ED/inpatient costs
                      </Text>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 mt-3">
                    <HouseIcon
                      size={16}
                      className="text-kumo-inactive shrink-0 mt-0.5"
                    />
                    <div>
                      <Text size="sm" bold>
                        SDOH exposure
                      </Text>
                      <Text size="xs" variant="secondary">
                        {patients.filter((p) => p.sdoh_flags > 0).length} patients
                        have at least one social determinant flag
                      </Text>
                    </div>
                  </div>
                </Surface>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
