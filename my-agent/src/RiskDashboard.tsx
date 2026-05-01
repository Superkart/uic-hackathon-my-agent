import { useState, useEffect, useCallback, useRef } from "react";
import { Badge, Button, Surface, Text } from "@cloudflare/kumo";
import { usePatient } from "./PatientContext";
import { useAgent } from "agents/react";
import type { ChatAgent } from "./server";
import {
  ArrowClockwiseIcon,
  WarningIcon,
  HeartIcon,
  CurrencyDollarIcon,
  HouseIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CaretDownIcon,
  CaretUpIcon,
  ChatCircleDotsIcon,
  CheckCircleIcon,
  XCircleIcon,
  PillIcon,
  ChartBarIcon,
  ClipboardTextIcon
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
  ethnicity: string;
  income: number;
  city: string;
  state: string;
  ed_visits: number;
  inpatient_visits: number;
  total_visits: number;
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

interface ExpandedDetail {
  conditions: { DESCRIPTION: string }[];
  meds: { DESCRIPTION: string }[];
  careplans: { DESCRIPTION: string; REASONDESCRIPTION: string | null }[];
  sdoh: { DESCRIPTION: string; VALUE: string }[];
  debt: number;
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
    pct >= 0.6
      ? "critical"
      : pct >= 0.43
        ? "high"
        : pct >= 0.25
          ? "medium"
          : "low";
  return { score, level, factors };
}

// ── Visual helpers ────────────────────────────────────────────────────

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

// ── Expanded detail panel ─────────────────────────────────────────────

function ExpandedPanel({
  detail,
  loading,
  patient,
  onSendToAgent,
  onApproveOutreach
}: {
  detail: ExpandedDetail | null;
  loading: boolean;
  patient: ScoredPatient;
  onSendToAgent: (name: string, id: string) => void;
  onApproveOutreach: (
    patientId: string,
    patientName: string,
    action: string,
    note?: string
  ) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const actionRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const handleApprove = async () => {
    const action = actionRef.current?.value.trim();
    if (!action) return;
    setSubmitting(true);
    await onApproveOutreach(
      patient.id,
      patient.name,
      action,
      noteRef.current?.value.trim() || undefined
    );
    setSubmitting(false);
    setShowForm(false);
    setDone(true);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 pl-12 text-kumo-inactive">
        <ArrowClockwiseIcon size={14} className="animate-spin" />
        <Text size="xs" variant="secondary">
          Loading patient profile...
        </Text>
      </div>
    );
  }
  if (!detail) return null;

  return (
    <div className="pl-12 pr-4 pb-4 space-y-4 border-t border-kumo-line mt-3 pt-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Conditions */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <HeartIcon size={13} className="text-kumo-danger" />
            <Text size="xs" bold>
              Active Conditions ({detail.conditions.length})
            </Text>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {detail.conditions.length === 0 ? (
              <Text size="xs" variant="secondary">
                None on record
              </Text>
            ) : (
              detail.conditions.map((c, i) => (
                <div
                  key={i}
                  className="text-xs text-kumo-default bg-kumo-control rounded px-2 py-1"
                >
                  {c.DESCRIPTION}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Medications */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <PillIcon size={13} className="text-orange-500" />
            <Text size="xs" bold>
              Active Meds ({detail.meds.length})
              {detail.meds.length >= 5 && (
                <span className="ml-1 text-orange-500">⚠ Polypharmacy</span>
              )}
            </Text>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {detail.meds.length === 0 ? (
              <Text size="xs" variant="secondary">
                No active medications
              </Text>
            ) : (
              detail.meds.map((m, i) => (
                <div
                  key={i}
                  className="text-xs text-kumo-default bg-kumo-control rounded px-2 py-1"
                >
                  {m.DESCRIPTION}
                </div>
              ))
            )}
          </div>
        </div>

        {/* SDOH + financials */}
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <HouseIcon size={13} className="text-kumo-inactive" />
              <Text size="xs" bold>
                SDOH Signals
              </Text>
            </div>
            {detail.sdoh.length === 0 ? (
              <Text size="xs" variant="secondary">
                No PRAPARE flags
              </Text>
            ) : (
              detail.sdoh.map((s, i) => (
                <div key={i} className="text-xs flex items-start gap-1.5">
                  <WarningIcon
                    size={10}
                    className="text-yellow-500 shrink-0 mt-0.5"
                    weight="fill"
                  />
                  <span className="text-kumo-default leading-tight">
                    {s.DESCRIPTION.replace(" [PRAPARE]", "")}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="space-y-1 pt-2 border-t border-kumo-line">
            <div className="flex justify-between">
              <Text size="xs" variant="secondary">
                Outstanding debt
              </Text>
              <span
                className={`text-xs font-bold ${detail.debt > 10000 ? "text-kumo-danger" : "text-kumo-default"}`}
              >
                $
                {detail.debt.toLocaleString(undefined, {
                  maximumFractionDigits: 0
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <Text size="xs" variant="secondary">
                Care plan
              </Text>
              {patient.has_active_careplan ? (
                <span className="text-xs text-kumo-success flex items-center gap-1">
                  <CheckCircleIcon size={10} /> Active
                </span>
              ) : (
                <span className="text-xs text-kumo-danger flex items-center gap-1">
                  <XCircleIcon size={10} /> None
                </span>
              )}
            </div>
            <div className="flex justify-between">
              <Text size="xs" variant="secondary">
                Annual income
              </Text>
              <Text size="xs">${patient.income.toLocaleString()}</Text>
            </div>
            <div className="flex justify-between">
              <Text size="xs" variant="secondary">
                Race / ethnicity
              </Text>
              <Text size="xs">
                {patient.race} / {patient.ethnicity}
              </Text>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="pt-2 border-t border-kumo-line space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="primary"
            size="sm"
            icon={<ChatCircleDotsIcon size={14} />}
            onClick={() => onSendToAgent(patient.name, patient.id)}
          >
            Analyze in Agent Chat
          </Button>
          {!done ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<ClipboardTextIcon size={14} />}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "Cancel" : "Approve Outreach"}
            </Button>
          ) : (
            <span className="flex items-center gap-1 text-xs text-kumo-success">
              <CheckCircleIcon size={13} /> Logged to Decision Ledger
            </span>
          )}
        </div>

        {showForm && (
          <div className="rounded-lg border border-kumo-line bg-kumo-control p-3 space-y-2">
            <Text size="xs" bold>
              Log outreach decision for{" "}
              {patient.name.replace(/\d+/g, "").trim()}
            </Text>
            <div>
              <Text size="xs" variant="secondary">
                Action (required)
              </Text>
              <input
                ref={actionRef}
                type="text"
                defaultValue={`Schedule outreach call — ${patient.level} risk, ${patient.factors[0] ?? "review needed"}`}
                className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-accent"
              />
            </div>
            <div>
              <Text size="xs" variant="secondary">
                Coordinator note (optional)
              </Text>
              <textarea
                ref={noteRef}
                rows={2}
                placeholder='e.g. "Daughter drives on Tuesdays, call before noon"'
                className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                icon={<CheckCircleIcon size={13} />}
                disabled={submitting}
                onClick={handleApprove}
              >
                {submitting ? "Saving…" : "Approve & Log"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Patient row ───────────────────────────────────────────────────────

function PatientRow({
  p,
  rank,
  expanded,
  expandedDetail,
  expandLoading,
  onToggle,
  onSendToAgent,
  onApproveOutreach
}: {
  p: ScoredPatient;
  rank: number;
  expanded: boolean;
  expandedDetail: ExpandedDetail | null;
  expandLoading: boolean;
  onToggle: () => void;
  onSendToAgent: (name: string, id: string) => void;
  onApproveOutreach: (
    patientId: string,
    patientName: string,
    action: string,
    note?: string
  ) => Promise<void>;
}) {
  const barPct = Math.min((p.score / 14) * 100, 100);
  return (
    <Surface
      className={`rounded-xl ring transition-all cursor-pointer ${expanded ? "ring-kumo-accent" : "ring-kumo-line hover:ring-kumo-accent/50"}`}
    >
      <button type="button" className="w-full p-4 text-left" onClick={onToggle}>
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-7 text-center">
            <span
              className={`text-lg font-bold ${rank <= 3 ? "text-kumo-danger" : "text-kumo-inactive"}`}
            >
              #{rank}
            </span>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Text size="sm" bold>
                {p.name}
              </Text>
              <Badge variant={BADGE_VARIANT[p.level]}>
                {p.level.toUpperCase()}
              </Badge>
              <Text size="xs" variant="secondary">
                {p.age}y · {p.gender === "M" ? "M" : "F"} · {p.race} · {p.city}
              </Text>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-kumo-control rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${LEVEL_BAR[p.level]}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <span
                className={`text-sm font-bold shrink-0 ${LEVEL_COLOR[p.level]}`}
              >
                {p.score}/14
              </span>
            </div>
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
          <div className="shrink-0 text-right space-y-1 mr-2">
            <div className="flex items-center gap-1 justify-end text-kumo-danger">
              <WarningIcon size={11} weight="fill" />
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
          <div className="shrink-0 text-kumo-inactive">
            {expanded ? <CaretUpIcon size={16} /> : <CaretDownIcon size={16} />}
          </div>
        </div>
      </button>
      {expanded && (
        <ExpandedPanel
          detail={expandedDetail}
          loading={expandLoading}
          patient={p}
          onSendToAgent={onSendToAgent}
          onApproveOutreach={onApproveOutreach}
        />
      )}
    </Surface>
  );
}

// ── Sort ──────────────────────────────────────────────────────────────

type SortKey = "score" | "ed_visits" | "chronic_condition_count" | "total_cost";
const SORT_LABELS: Record<SortKey, string> = {
  score: "Risk Score",
  ed_visits: "ED Visits",
  chronic_condition_count: "Conditions",
  total_cost: "Total Cost"
};

// ── Main ──────────────────────────────────────────────────────────────

interface RiskDashboardProps {
  onSendToAgent: (name: string, id: string) => void;
}

export function RiskDashboard({ onSendToAgent }: RiskDashboardProps) {
  const { setActivePatient } = usePatient();
  const agent = useAgent<ChatAgent>({ agent: "ChatAgent" });
  const [patients, setPatients] = useState<ScoredPatient[]>([]);

  const handleApproveOutreach = useCallback(
    async (
      patientId: string,
      patientName: string,
      action: string,
      note?: string
    ) => {
      await agent.stub.approvePatientOutreach(
        patientId,
        patientName,
        action,
        note
      );
    },
    [agent.stub]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<
    ScoredPatient["level"] | "all"
  >("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandCache, setExpandCache] = useState<Map<string, ExpandedDetail>>(
    new Map()
  );
  const [expandLoading, setExpandLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaries, meds, debts, sdoh] = await Promise.all([
        dbQuery<SummaryRow>(
          `SELECT id, first, last, age, gender, race, ethnicity, income, city, state,
                  ed_visits, inpatient_visits, total_visits, total_cost,
                  ed_inpatient_total_cost, chronic_condition_count, has_active_careplan
           FROM patient_summary LIMIT 200`
        ),
        dbQuery<MedRow>(
          `SELECT PATIENT, COUNT(*) AS med_count FROM medications WHERE STOP IS NULL GROUP BY PATIENT LIMIT 200`
        ),
        dbQuery<DebtRow>(
          `SELECT PATIENTID, ROUND(SUM(OUTSTANDING), 2) AS debt FROM claims_transactions GROUP BY PATIENTID LIMIT 200`
        ),
        dbQuery<SdohRow>(
          `SELECT PATIENT, COUNT(*) AS sdoh_count FROM observations
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

      const medMap = new Map(meds.map((r) => [r.PATIENT, r.med_count]));
      const debtMap = new Map(debts.map((r) => [r.PATIENTID, r.debt]));
      const sdohMap = new Map(sdoh.map((r) => [r.PATIENT, r.sdoh_count]));

      const scored: ScoredPatient[] = summaries.map((s) => {
        const medCount = medMap.get(s.id) ?? 0;
        const debt = debtMap.get(s.id) ?? 0;
        const sdohCount = sdohMap.get(s.id) ?? 0;
        const { score, level, factors } = scorePatient(
          s,
          medCount,
          debt,
          sdohCount
        );
        return {
          id: s.id,
          name: `${s.first} ${s.last}`,
          age: s.age,
          gender: s.gender,
          race: s.race,
          ethnicity: s.ethnicity,
          income: s.income,
          city: s.city,
          state: s.state,
          ed_visits: s.ed_visits,
          inpatient_visits: s.inpatient_visits,
          total_visits: s.total_visits,
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

  const toggleExpand = useCallback(
    async (p: ScoredPatient) => {
      if (expandedId === p.id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(p.id);
      setActivePatient(p.id);
      if (expandCache.has(p.id)) return;
      setExpandLoading(true);
      try {
        const [conditions, meds, careplans, sdoh, debtRows] = await Promise.all(
          [
            dbQuery<{ DESCRIPTION: string }>(
              `SELECT DESCRIPTION FROM conditions WHERE PATIENT = '${p.id}' AND STOP IS NULL ORDER BY START LIMIT 20`
            ),
            dbQuery<{ DESCRIPTION: string }>(
              `SELECT DESCRIPTION FROM medications WHERE PATIENT = '${p.id}' AND STOP IS NULL LIMIT 20`
            ),
            dbQuery<{ DESCRIPTION: string; REASONDESCRIPTION: string | null }>(
              `SELECT DESCRIPTION, REASONDESCRIPTION FROM careplans WHERE PATIENT = '${p.id}' AND STOP IS NULL LIMIT 5`
            ),
            dbQuery<{ DESCRIPTION: string; VALUE: string }>(
              `SELECT DESCRIPTION, VALUE FROM observations
           WHERE PATIENT = '${p.id}' AND DESCRIPTION LIKE '%PRAPARE%'
             AND (
               (LOWER(DESCRIPTION) LIKE '%housing%' AND VALUE = 'Yes') OR
               (LOWER(DESCRIPTION) LIKE '%transportation%' AND VALUE = 'Yes') OR
               (LOWER(DESCRIPTION) LIKE '%food%' AND VALUE = 'Yes') OR
               (LOWER(DESCRIPTION) LIKE '%physically and emotionally safe%' AND VALUE = 'No')
             )
           LIMIT 10`
            ),
            dbQuery<{ debt: number }>(
              `SELECT ROUND(SUM(OUTSTANDING), 2) AS debt FROM claims_transactions WHERE PATIENTID = '${p.id}' LIMIT 1`
            )
          ]
        );
        const detail: ExpandedDetail = {
          conditions,
          meds,
          careplans,
          sdoh,
          debt: debtRows[0]?.debt ?? 0
        };
        setExpandCache((prev) => new Map(prev).set(p.id, detail));
      } finally {
        setExpandLoading(false);
      }
    },
    [expandedId, expandCache, setActivePatient]
  );

  // Derived stats
  const critical = patients.filter((p) => p.level === "critical").length;
  const high = patients.filter((p) => p.level === "high").length;
  const noCarePlan = patients.filter((p) => !p.has_active_careplan).length;
  const totalEdCost = patients.reduce((s, p) => s + p.ed_cost, 0);
  const actionableEdCost = patients
    .filter((p) => p.level === "critical" || p.level === "high")
    .reduce((s, p) => s + p.ed_cost, 0);

  // Health equity
  const raceMap = new Map<string, { total: number; highRisk: number }>();
  for (const p of patients) {
    const r = raceMap.get(p.race) ?? { total: 0, highRisk: 0 };
    r.total++;
    if (p.level === "critical" || p.level === "high") r.highRisk++;
    raceMap.set(p.race, r);
  }
  const raceEquity = [...raceMap.entries()]
    .map(([race, d]) => ({
      race,
      ...d,
      pct: Math.round((d.highRisk / d.total) * 100)
    }))
    .sort((a, b) => b.pct - a.pct);

  // Act Now
  const actNow = [...patients]
    .filter((p) => p.level === "critical" && !p.has_active_careplan)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Visible list
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
          {error && (
            <Surface className="p-4 rounded-xl ring ring-kumo-danger">
              <Text size="sm" variant="secondary">
                {error}
              </Text>
            </Surface>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16 text-kumo-inactive gap-2">
              <ArrowClockwiseIcon size={20} className="animate-spin" />
              <Text variant="secondary">Scoring all patients...</Text>
            </div>
          )}

          {!loading && patients.length > 0 && (
            <>
              {/* Aggregate stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Critical Risk"
                  value={critical}
                  sub="Immediate action needed"
                  icon={<WarningIcon size={14} weight="fill" />}
                  danger
                />
                <StatCard
                  label="High Risk"
                  value={high}
                  sub="Monitor closely"
                  icon={<WarningIcon size={14} />}
                />
                <StatCard
                  label="No Care Plan"
                  value={noCarePlan}
                  sub="Biggest gap"
                  icon={<XCircleIcon size={14} />}
                />
                <StatCard
                  label="Preventable ED Cost"
                  value={`$${Math.round(actionableEdCost / 1000)}k`}
                  sub="Critical + high patients"
                  icon={<CurrencyDollarIcon size={14} />}
                  danger
                />
              </div>

              {/* Act Now */}
              {actNow.length > 0 && (
                <Surface className="p-4 rounded-xl ring-2 ring-kumo-danger space-y-3">
                  <div className="flex items-center gap-2">
                    <WarningIcon
                      size={16}
                      weight="fill"
                      className="text-kumo-danger"
                    />
                    <Text size="sm" bold>
                      Act Now — Critical patients with no care plan
                    </Text>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {actNow.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left p-3 rounded-lg bg-kumo-control border border-kumo-danger/30 space-y-2 cursor-pointer hover:border-kumo-danger transition-colors"
                        onClick={() => toggleExpand(p)}
                      >
                        <div className="flex justify-between items-start">
                          <Text size="xs" bold>
                            {p.name}
                          </Text>
                          <span className="text-xs font-bold text-kumo-danger">
                            {p.score}/14
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {p.factors.slice(0, 3).map((f) => (
                            <span
                              key={f}
                              className="text-xs px-1.5 py-0.5 rounded bg-kumo-danger/10 text-kumo-danger border border-kumo-danger/20"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<ChatCircleDotsIcon size={12} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSendToAgent(p.name, p.id);
                          }}
                        >
                          Analyze
                        </Button>
                      </button>
                    ))}
                  </div>
                </Surface>
              )}

              {/* Risk distribution */}
              <Surface className="p-4 rounded-xl ring ring-kumo-line space-y-3">
                <Text size="sm" bold>
                  Risk Distribution — All {patients.length} Patients
                </Text>
                <div className="flex rounded-full overflow-hidden h-5">
                  {(
                    [
                      "critical",
                      "high",
                      "medium",
                      "low"
                    ] as ScoredPatient["level"][]
                  ).map((lvl) => {
                    const count = patients.filter(
                      (p) => p.level === lvl
                    ).length;
                    const pct = (count / patients.length) * 100;
                    return (
                      <div
                        key={lvl}
                        title={`${lvl}: ${count}`}
                        className={`${LEVEL_BAR[lvl]} flex items-center justify-center`}
                        style={{ width: `${pct}%` }}
                      >
                        {pct > 8 && (
                          <span className="text-white text-xs font-bold">
                            {count}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 flex-wrap">
                  {(
                    [
                      "critical",
                      "high",
                      "medium",
                      "low"
                    ] as ScoredPatient["level"][]
                  ).map((lvl) => {
                    const count = patients.filter(
                      (p) => p.level === lvl
                    ).length;
                    const pct = Math.round((count / patients.length) * 100);
                    return (
                      <div key={lvl} className="flex items-center gap-1.5">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${LEVEL_BAR[lvl]}`}
                        />
                        <Text size="xs" variant="secondary">
                          {lvl.charAt(0).toUpperCase() + lvl.slice(1)}: {count}{" "}
                          ({pct}%)
                        </Text>
                      </div>
                    );
                  })}
                </div>
              </Surface>

              {/* Health equity */}
              <Surface className="p-4 rounded-xl ring ring-kumo-line space-y-3">
                <div className="flex items-center gap-2">
                  <ChartBarIcon size={16} className="text-kumo-inactive" />
                  <Text size="sm" bold>
                    Health Equity — High-Risk Rate by Race
                  </Text>
                </div>
                <div className="space-y-2">
                  {raceEquity.map(({ race, total, highRisk, pct }) => (
                    <div key={race} className="flex items-center gap-3">
                      <span className="text-xs text-kumo-default w-16 shrink-0 capitalize">
                        {race}
                      </span>
                      <div className="flex-1 bg-kumo-control rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full ${pct >= 30 ? "bg-kumo-danger" : pct >= 15 ? "bg-orange-500" : "bg-kumo-success"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-kumo-default shrink-0 w-28 text-right">
                        {highRisk}/{total} ({pct}% high-risk)
                      </span>
                    </div>
                  ))}
                </div>
                <Text size="xs" variant="secondary">
                  ≥30% high-risk rate may indicate systemic care gap for that
                  group
                </Text>
              </Surface>

              {/* Cost opportunity */}
              <Surface className="p-4 rounded-xl ring ring-kumo-line">
                <div className="flex items-center gap-2 mb-3">
                  <CurrencyDollarIcon
                    size={16}
                    className="text-kumo-inactive"
                  />
                  <Text size="sm" bold>
                    Cost Reduction Opportunity
                  </Text>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Text size="xs" variant="secondary">
                      Total ED/inpatient (all patients)
                    </Text>
                    <span className="text-lg font-bold text-kumo-default">
                      ${Math.round(totalEdCost).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <Text size="xs" variant="secondary">
                      From critical + high patients
                    </Text>
                    <span className="text-lg font-bold text-kumo-danger">
                      ${Math.round(actionableEdCost).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <Text size="xs" variant="secondary">
                      Est. savings at 30% prevention
                    </Text>
                    <span className="text-lg font-bold text-kumo-success">
                      ${Math.round(actionableEdCost * 0.3).toLocaleString()}
                    </span>
                  </div>
                </div>
              </Surface>

              {/* Filters + sort */}
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                  {(
                    ["all", "critical", "high", "medium", "low"] as (
                      | ScoredPatient["level"]
                      | "all"
                    )[]
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
                  <div className="text-center py-8">
                    <Text variant="secondary">
                      No patients at this risk level
                    </Text>
                  </div>
                )}
                {visible.map((p, i) => (
                  <PatientRow
                    key={p.id}
                    p={p}
                    rank={i + 1}
                    expanded={expandedId === p.id}
                    expandedDetail={expandCache.get(p.id) ?? null}
                    expandLoading={expandedId === p.id && expandLoading}
                    onToggle={() => toggleExpand(p)}
                    onSendToAgent={onSendToAgent}
                    onApproveOutreach={handleApproveOutreach}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
