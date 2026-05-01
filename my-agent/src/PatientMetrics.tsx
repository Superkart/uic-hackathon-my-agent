import { useState, useEffect, useCallback } from "react";
import { Badge, Button, Surface, Text } from "@cloudflare/kumo";
import {
  ArrowClockwiseIcon,
  UserIcon,
  HeartIcon,
  CurrencyDollarIcon,
  WarningIcon,
  CheckCircleIcon,
  XCircleIcon,
  HouseIcon,
  CarIcon,
  ForkKnifeIcon
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

interface PatientRow {
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
  ed_inpatient_cost: number;
  ed_inpatient_total_cost: number;
  chronic_condition_count: number;
  has_active_careplan: number;
}

interface SDOHFlags {
  housingInsecurity: boolean;
  transportBarrier: boolean;
  foodInsecurity: boolean;
  safetyConcern: boolean;
}

interface PatientMetricsData {
  summary: PatientRow;
  debt: number;
  sdoh: SDOHFlags;
  medCount: number;
}

// ── Risk scoring — change formula here freely ─────────────────────────

export interface RiskResult {
  score: number;
  maxScore: number;
  level: "low" | "medium" | "high" | "critical";
  factors: { label: string; points: number }[];
}

function computeRisk(data: PatientMetricsData): RiskResult {
  const factors: { label: string; points: number }[] = [];

  if (data.summary.ed_visits > 5)
    factors.push({ label: `${data.summary.ed_visits} ED visits`, points: 3 });
  if (!data.summary.has_active_careplan)
    factors.push({ label: "No active care plan", points: 2 });
  if (data.summary.chronic_condition_count > 10)
    factors.push({
      label: `${data.summary.chronic_condition_count} chronic conditions`,
      points: 2
    });
  if (data.medCount >= 5)
    factors.push({ label: `Polypharmacy (${data.medCount} meds)`, points: 1 });
  if (data.debt > 10000)
    factors.push({
      label: `$${data.debt.toLocaleString(undefined, { maximumFractionDigits: 0 })} outstanding debt`,
      points: 1
    });
  if (data.sdoh.housingInsecurity)
    factors.push({ label: "Housing insecurity", points: 2 });
  if (data.sdoh.transportBarrier)
    factors.push({ label: "Transport barrier", points: 2 });
  if (data.sdoh.foodInsecurity)
    factors.push({ label: "Food insecurity", points: 1 });

  const score = factors.reduce((s, f) => s + f.points, 0);
  const maxScore = 14;
  const pct = score / maxScore;
  const level =
    pct >= 0.7 ? "critical" : pct >= 0.5 ? "high" : pct >= 0.3 ? "medium" : "low";

  return { score, maxScore, level, factors };
}

// ── Risk colour helpers ───────────────────────────────────────────────

function riskColor(level: RiskResult["level"]) {
  return {
    low: "text-kumo-success",
    medium: "text-yellow-500",
    high: "text-orange-500",
    critical: "text-kumo-danger"
  }[level];
}

function riskBadgeVariant(
  level: RiskResult["level"]
): "primary" | "secondary" | "destructive" {
  if (level === "critical" || level === "high") return "destructive";
  if (level === "medium") return "primary";
  return "secondary";
}

// ── Sub-components ────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  icon,
  highlight
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Surface
      className={`p-4 rounded-xl flex flex-col gap-2 ring ${
        highlight ? "ring-kumo-danger" : "ring-kumo-line"
      }`}
    >
      <div className="flex items-center gap-2 text-kumo-inactive">
        {icon}
        <Text size="xs" variant="secondary">
          {label}
        </Text>
      </div>
      <span className={`text-lg font-bold ${highlight ? "text-kumo-danger" : "text-kumo-default"}`}>
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

function SDOHChip({
  label,
  active,
  icon
}: {
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border ${
        active
          ? "border-kumo-danger bg-kumo-danger/10 text-kumo-danger"
          : "border-kumo-line text-kumo-inactive"
      }`}
    >
      {icon}
      <span>{label}</span>
      {active ? (
        <WarningIcon size={12} weight="fill" />
      ) : (
        <CheckCircleIcon size={12} />
      )}
    </div>
  );
}

// ── Risk gauge bar ────────────────────────────────────────────────────

function RiskGauge({ risk }: { risk: RiskResult }) {
  const pct = Math.min((risk.score / risk.maxScore) * 100, 100);
  const barColor =
    risk.level === "critical"
      ? "bg-kumo-danger"
      : risk.level === "high"
        ? "bg-orange-500"
        : risk.level === "medium"
          ? "bg-yellow-500"
          : "bg-kumo-success";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Text size="sm" bold>
          Risk Score
        </Text>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold ${riskColor(risk.level)}`}>
            {risk.score}
          </span>
          <Text size="xs" variant="secondary">
            / {risk.maxScore}
          </Text>
          <Badge variant={riskBadgeVariant(risk.level)}>
            {risk.level.toUpperCase()}
          </Badge>
        </div>
      </div>
      <div className="w-full bg-kumo-control rounded-full h-3 overflow-hidden">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {risk.factors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {risk.factors.map((f) => (
            <span
              key={f.label}
              className="text-xs px-2 py-0.5 rounded-full bg-kumo-control text-kumo-default border border-kumo-line"
            >
              +{f.points} {f.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function PatientMetrics() {
  const [patients, setPatients] = useState<
    { id: string; name: string; edVisits: number }[]
  >([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [metricsData, setMetricsData] = useState<PatientMetricsData | null>(
    null
  );
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load patient list once on mount
  useEffect(() => {
    dbQuery<{ id: string; first: string; last: string; ed_visits: number }>(
      `SELECT id, first, last, ed_visits
       FROM patient_summary
       ORDER BY ed_visits DESC, chronic_condition_count DESC
       LIMIT 117`
    )
      .then((rows) => {
        setPatients(
          rows.map((r) => ({
            id: r.id,
            name: `${r.first} ${r.last}`,
            edVisits: r.ed_visits
          }))
        );
      })
      .catch(() => setError("Failed to load patient list"))
      .finally(() => setLoadingPatients(false));
  }, []);

  // Fetch all metrics when a patient is selected
  const fetchMetrics = useCallback(async (patientId: string) => {
    setLoadingMetrics(true);
    setError(null);
    try {
      const [summaryRows, debtRows, sdohRows, medRows] = await Promise.all([
        dbQuery<PatientRow>(
          `SELECT * FROM patient_summary WHERE id = '${patientId}' LIMIT 1`
        ),
        dbQuery<{ total_debt: number }>(
          `SELECT ROUND(SUM(AMOUNT_OWED), 2) AS total_debt
           FROM claims_transactions WHERE PATIENTID = '${patientId}' LIMIT 1`
        ),
        dbQuery<{ DESCRIPTION: string; VALUE: string }>(
          `SELECT DESCRIPTION, VALUE FROM observations
           WHERE PATIENT = '${patientId}' AND DESCRIPTION LIKE '%PRAPARE%' LIMIT 30`
        ),
        dbQuery<{ med_count: number }>(
          `SELECT COUNT(*) AS med_count FROM medications
           WHERE PATIENT = '${patientId}' AND STOP IS NULL LIMIT 1`
        )
      ]);

      const summary = summaryRows[0];
      if (!summary) throw new Error("Patient not found");

      const debt = debtRows[0]?.total_debt ?? 0;
      const medCount = medRows[0]?.med_count ?? 0;

      // Parse SDOH flags from PRAPARE responses
      const sdoh: SDOHFlags = {
        housingInsecurity: sdohRows.some(
          (r) =>
            r.DESCRIPTION.toLowerCase().includes("worried about losing your housing") &&
            r.VALUE === "Yes"
        ),
        transportBarrier: sdohRows.some(
          (r) =>
            r.DESCRIPTION.toLowerCase().includes("transportation") &&
            r.VALUE === "Yes"
        ),
        foodInsecurity: sdohRows.some(
          (r) =>
            (r.DESCRIPTION.toLowerCase().includes("food") ||
              r.DESCRIPTION.toLowerCase().includes("hungry")) &&
            r.VALUE === "Yes"
        ),
        safetyConcern: sdohRows.some(
          (r) =>
            r.DESCRIPTION.toLowerCase().includes("physically and emotionally safe") &&
            r.VALUE === "No"
        )
      };

      setMetricsData({ summary, debt, sdoh, medCount });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (id) fetchMetrics(id);
    else setMetricsData(null);
  };

  const risk = metricsData ? computeRisk(metricsData) : null;

  return (
    <div className="flex flex-col h-screen bg-kumo-elevated">
      {/* Tab header */}
      <div className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HeartIcon size={20} className="text-kumo-danger" weight="fill" />
            <h2 className="text-lg font-semibold text-kumo-default">
              Patient Risk Metrics
            </h2>
            <Badge variant="secondary">{patients.length} patients</Badge>
          </div>
          {selectedId && (
            <Button
              variant="secondary"
              size="sm"
              icon={<ArrowClockwiseIcon size={14} />}
              onClick={() => fetchMetrics(selectedId)}
              disabled={loadingMetrics}
            >
              Refresh
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-5 py-6 space-y-6">
          {/* Patient dropdown */}
          <Surface className="p-4 rounded-xl ring ring-kumo-line">
            <div className="flex items-center gap-3">
              <UserIcon size={16} className="text-kumo-inactive shrink-0" />
              <label
                htmlFor="patient-select"
                className="text-sm text-kumo-default font-medium shrink-0"
              >
                Select Patient
              </label>
              <select
                id="patient-select"
                value={selectedId}
                onChange={(e) => handleSelect(e.target.value)}
                disabled={loadingPatients}
                className="flex-1 px-3 py-2 rounded-lg border border-kumo-line bg-kumo-base text-kumo-default text-sm focus:outline-none focus:ring-1 focus:ring-kumo-accent"
              >
                <option value="">
                  {loadingPatients
                    ? "Loading patients..."
                    : "— Choose a patient —"}
                </option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.edVisits > 0 ? ` · ${p.edVisits} ED visits` : ""}
                  </option>
                ))}
              </select>
            </div>
          </Surface>

          {/* Error */}
          {error && (
            <Surface className="p-4 rounded-xl ring ring-kumo-danger">
              <div className="flex items-center gap-2 text-kumo-danger">
                <XCircleIcon size={16} />
                <Text size="sm">{error}</Text>
              </div>
            </Surface>
          )}

          {/* Loading */}
          {loadingMetrics && (
            <div className="flex items-center justify-center py-12 text-kumo-inactive">
              <ArrowClockwiseIcon size={20} className="animate-spin mr-2" />
              <Text variant="secondary">Loading metrics...</Text>
            </div>
          )}

          {/* Metrics */}
          {metricsData && risk && !loadingMetrics && (
            <>
              {/* Patient identity */}
              <Surface className="p-4 rounded-xl ring ring-kumo-line">
                <div className="flex flex-wrap gap-4 items-center">
                  <div>
                    <Text size="lg" bold>
                      {metricsData.summary.first} {metricsData.summary.last}
                    </Text>
                    <Text size="xs" variant="secondary">
                      {metricsData.summary.age}y ·{" "}
                      {metricsData.summary.gender === "M" ? "Male" : "Female"} ·{" "}
                      {metricsData.summary.race} · {metricsData.summary.city},{" "}
                      {metricsData.summary.state}
                    </Text>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary">
                      Income: ${metricsData.summary.income.toLocaleString()}
                    </Badge>
                    <Badge variant="secondary">
                      {metricsData.summary.ethnicity}
                    </Badge>
                  </div>
                </div>
              </Surface>

              {/* Risk gauge */}
              <Surface className="p-5 rounded-xl ring ring-kumo-line">
                <RiskGauge risk={risk} />
              </Surface>

              {/* Metric cards grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard
                  label="ED Visits"
                  value={metricsData.summary.ed_visits}
                  sub="Lifetime emergency visits"
                  icon={<WarningIcon size={14} />}
                  highlight={metricsData.summary.ed_visits > 5}
                />
                <MetricCard
                  label="Chronic Conditions"
                  value={metricsData.summary.chronic_condition_count}
                  sub="Active diagnoses"
                  icon={<HeartIcon size={14} />}
                  highlight={metricsData.summary.chronic_condition_count > 10}
                />
                <MetricCard
                  label="Active Medications"
                  value={metricsData.medCount}
                  sub={
                    metricsData.medCount >= 5
                      ? "⚠ Polypharmacy risk"
                      : "Current prescriptions"
                  }
                  icon={<HeartIcon size={14} />}
                  highlight={metricsData.medCount >= 5}
                />
                <MetricCard
                  label="Care Plan"
                  value={metricsData.summary.has_active_careplan ? "Active" : "None"}
                  sub={
                    metricsData.summary.has_active_careplan
                      ? "Enrolled"
                      : "⚠ No care plan"
                  }
                  icon={<CheckCircleIcon size={14} />}
                  highlight={!metricsData.summary.has_active_careplan}
                />
                <MetricCard
                  label="Total Cost"
                  value={`$${metricsData.summary.total_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  sub="Lifetime healthcare cost"
                  icon={<CurrencyDollarIcon size={14} />}
                />
                <MetricCard
                  label="ED + Inpatient Cost"
                  value={`$${metricsData.summary.ed_inpatient_total_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  sub="High-acuity spend"
                  icon={<CurrencyDollarIcon size={14} />}
                  highlight={metricsData.summary.ed_inpatient_total_cost > 50000}
                />
                <MetricCard
                  label="Outstanding Debt"
                  value={`$${metricsData.debt.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  sub="Unpaid claims"
                  icon={<CurrencyDollarIcon size={14} />}
                  highlight={metricsData.debt > 10000}
                />
                <MetricCard
                  label="Total Visits"
                  value={metricsData.summary.total_visits}
                  sub={`${metricsData.summary.inpatient_visits} inpatient`}
                  icon={<UserIcon size={14} />}
                />
              </div>

              {/* SDOH flags */}
              <Surface className="p-5 rounded-xl ring ring-kumo-line space-y-3">
                <Text size="sm" bold>
                  Social Determinants of Health (SDOH)
                </Text>
                <div className="flex flex-wrap gap-2">
                  <SDOHChip
                    label="Housing Insecurity"
                    active={metricsData.sdoh.housingInsecurity}
                    icon={<HouseIcon size={14} />}
                  />
                  <SDOHChip
                    label="Transport Barrier"
                    active={metricsData.sdoh.transportBarrier}
                    icon={<CarIcon size={14} />}
                  />
                  <SDOHChip
                    label="Food Insecurity"
                    active={metricsData.sdoh.foodInsecurity}
                    icon={<ForkKnifeIcon size={14} />}
                  />
                  <SDOHChip
                    label="Safety Concern"
                    active={metricsData.sdoh.safetyConcern}
                    icon={<WarningIcon size={14} />}
                  />
                </div>
                <Text size="xs" variant="secondary">
                  Based on PRAPARE social screening responses
                </Text>
              </Surface>
            </>
          )}

          {/* Empty state */}
          {!selectedId && !loadingPatients && (
            <div className="flex flex-col items-center justify-center py-16 text-kumo-inactive gap-3">
              <UserIcon size={40} />
              <Text variant="secondary">Select a patient to view risk metrics</Text>
              <Text size="xs" variant="secondary">
                Patients are sorted by ED visit count (highest risk first)
              </Text>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
