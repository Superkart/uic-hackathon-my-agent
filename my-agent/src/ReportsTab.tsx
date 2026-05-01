import { useState, useCallback, useEffect, useRef } from "react";
import { Badge, Button, Surface, Text } from "@cloudflare/kumo";
import {
  ArrowClockwiseIcon,
  DownloadSimpleIcon,
  UserIcon,
  WarningIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  HeartIcon,
  CalendarIcon,
  FileCsvIcon,
  FileJsIcon as FileJsonIcon,
  FileTextIcon,
  ClipboardTextIcon,
  BellRingingIcon,
  BellIcon,
  XIcon,
  CheckCircleIcon
} from "@phosphor-icons/react";

// ── DB ────────────────────────────────────────────────────────────────

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

// ── Scoring (mirrors RiskDashboard) ──────────────────────────────────

function computeScore(
  edVisits: number,
  hasCarePlan: boolean,
  conditionCount: number,
  medCount: number,
  debt: number,
  sdohCount: number
): { score: number; level: string; factors: string[] } {
  const factors: string[] = [];
  let score = 0;
  if (edVisits > 5) {
    score += 3;
    factors.push(`${edVisits} ED visits`);
  }
  if (!hasCarePlan) {
    score += 2;
    factors.push("No care plan");
  }
  if (conditionCount > 10) {
    score += 2;
    factors.push(`${conditionCount} conditions`);
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
    factors.push(`${sdohCount} SDOH flags`);
  }
  const pct = score / 14;
  const level =
    pct >= 0.6
      ? "CRITICAL"
      : pct >= 0.43
        ? "HIGH"
        : pct >= 0.25
          ? "MEDIUM"
          : "LOW";
  return { score, level, factors };
}

// ── Download helper ───────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = String(r[h] ?? "").replace(/"/g, '""');
          return v.includes(",") || v.includes("\n") ? `"${v}"` : v;
        })
        .join(",")
    )
  ];
  return lines.join("\n");
}

function now() {
  return new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

// ── Report types ──────────────────────────────────────────────────────

type ReportType =
  | "individual"
  | "emergency"
  | "high-risk-population"
  | "weekly-summary"
  | "cost-analysis"
  | "health-equity"
  | "no-care-plan";

interface ReportMeta {
  id: ReportType;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?: "destructive" | "primary" | "secondary";
}

const REPORTS: ReportMeta[] = [
  {
    id: "emergency",
    label: "Emergency Flags",
    description: "Critical-risk patients requiring immediate outreach",
    icon: <WarningIcon size={16} weight="fill" className="text-kumo-danger" />,
    badge: "Urgent",
    badgeVariant: "destructive"
  },
  {
    id: "individual",
    label: "Individual Patient",
    description: "Full profile: conditions, meds, SDOH, costs, risk score",
    icon: <UserIcon size={16} className="text-kumo-inactive" />
  },
  {
    id: "weekly-summary",
    label: "Weekly Summary",
    description:
      "Population snapshot — risk distribution, care gaps, top patients",
    icon: <CalendarIcon size={16} className="text-kumo-inactive" />
  },
  {
    id: "high-risk-population",
    label: "High-Risk Population",
    description: "All critical + high patients ranked by risk score",
    icon: <ChartBarIcon size={16} className="text-kumo-inactive" />
  },
  {
    id: "no-care-plan",
    label: "Care Plan Gaps",
    description: "Patients with no active care plan sorted by risk",
    icon: <HeartIcon size={16} className="text-kumo-inactive" />
  },
  {
    id: "cost-analysis",
    label: "Cost Analysis",
    description: "Top cost drivers, ED/inpatient spend, financial risk",
    icon: <CurrencyDollarIcon size={16} className="text-kumo-inactive" />
  },
  {
    id: "health-equity",
    label: "Health Equity",
    description: "High-risk rate and cost disparity by race/ethnicity",
    icon: <ClipboardTextIcon size={16} className="text-kumo-inactive" />
  }
];

// ── Report generators ─────────────────────────────────────────────────

interface ReportResult {
  title: string;
  generatedAt: string;
  sections: { heading: string; content: string }[];
  rawRows: Record<string, unknown>[];
  csvFilename: string;
  jsonFilename: string;
  textFilename: string;
}

async function generateEmergencyReport(): Promise<ReportResult> {
  const [summaries, meds, debts, sdoh] = await Promise.all([
    dbQuery<{
      id: string;
      first: string;
      last: string;
      age: number;
      gender: string;
      race: string;
      city: string;
      ed_visits: number;
      chronic_condition_count: number;
      has_active_careplan: number;
      ed_inpatient_total_cost: number;
    }>(
      `SELECT id,first,last,age,gender,race,city,ed_visits,chronic_condition_count,has_active_careplan,ed_inpatient_total_cost FROM patient_summary LIMIT 200`
    ),
    dbQuery<{ PATIENT: string; med_count: number }>(
      `SELECT PATIENT,COUNT(*) AS med_count FROM medications WHERE STOP IS NULL GROUP BY PATIENT LIMIT 200`
    ),
    dbQuery<{ PATIENTID: string; debt: number }>(
      `SELECT PATIENTID,ROUND(SUM(OUTSTANDING),2) AS debt FROM claims_transactions GROUP BY PATIENTID LIMIT 200`
    ),
    dbQuery<{ PATIENT: string; sdoh_count: number }>(
      `SELECT PATIENT,COUNT(*) AS sdoh_count FROM observations WHERE DESCRIPTION LIKE '%PRAPARE%' AND ((LOWER(DESCRIPTION) LIKE '%housing%' AND VALUE='Yes') OR (LOWER(DESCRIPTION) LIKE '%transportation%' AND VALUE='Yes') OR (LOWER(DESCRIPTION) LIKE '%food%' AND VALUE='Yes')) GROUP BY PATIENT LIMIT 200`
    )
  ]);
  const medMap = new Map(meds.map((r) => [r.PATIENT, r.med_count]));
  const debtMap = new Map(debts.map((r) => [r.PATIENTID, r.debt]));
  const sdohMap = new Map(sdoh.map((r) => [r.PATIENT, r.sdoh_count]));

  const critical = summaries
    .map((s) => {
      const { score, level, factors } = computeScore(
        s.ed_visits,
        !!s.has_active_careplan,
        s.chronic_condition_count,
        medMap.get(s.id) ?? 0,
        debtMap.get(s.id) ?? 0,
        sdohMap.get(s.id) ?? 0
      );
      return { ...s, score, level, factors };
    })
    .filter((p) => p.level === "CRITICAL")
    .sort((a, b) => b.score - a.score);

  const lines = critical
    .map(
      (p, i) =>
        `#${i + 1} ${p.first} ${p.last} | Risk: ${p.score}/14 | ED: ${p.ed_visits} | Conditions: ${p.chronic_condition_count} | Care Plan: ${p.has_active_careplan ? "Yes" : "NO"}\n     Factors: ${p.factors.join(", ")}`
    )
    .join("\n\n");

  const rawRows = critical.map((p) => ({
    Name: `${p.first} ${p.last}`,
    Age: p.age,
    Gender: p.gender,
    Race: p.race,
    City: p.city,
    RiskScore: p.score,
    RiskLevel: p.level,
    EDVisits: p.ed_visits,
    Conditions: p.chronic_condition_count,
    ActiveCarePlan: p.has_active_careplan ? "Yes" : "No",
    EDCost: p.ed_inpatient_total_cost,
    RiskFactors: p.factors.join("; ")
  }));

  return {
    title: "Emergency Risk Flags Report",
    generatedAt: now(),
    sections: [
      {
        heading: "Summary",
        content: `${critical.length} patients flagged as CRITICAL risk requiring immediate outreach.\nGenerated: ${now()}`
      },
      {
        heading: `Critical Patients (${critical.length})`,
        content: lines || "No critical patients found."
      }
    ],
    rawRows,
    csvFilename: "emergency-flags.csv",
    jsonFilename: "emergency-flags.json",
    textFilename: "emergency-flags.txt"
  };
}

async function generateIndividualReport(
  patientId: string,
  patientName: string
): Promise<ReportResult> {
  const [summaryRows, conditions, meds, careplans, sdoh, debtRows, encounters] =
    await Promise.all([
      dbQuery<Record<string, unknown>>(
        `SELECT * FROM patient_summary WHERE id='${patientId}' LIMIT 1`
      ),
      dbQuery<{ DESCRIPTION: string }>(
        `SELECT DESCRIPTION FROM conditions WHERE PATIENT='${patientId}' AND STOP IS NULL ORDER BY START LIMIT 30`
      ),
      dbQuery<{ DESCRIPTION: string }>(
        `SELECT DESCRIPTION FROM medications WHERE PATIENT='${patientId}' AND STOP IS NULL LIMIT 20`
      ),
      dbQuery<{ DESCRIPTION: string; REASONDESCRIPTION: string | null }>(
        `SELECT DESCRIPTION,REASONDESCRIPTION FROM careplans WHERE PATIENT='${patientId}' AND STOP IS NULL LIMIT 5`
      ),
      dbQuery<{ DESCRIPTION: string; VALUE: string }>(
        `SELECT DESCRIPTION,VALUE FROM observations WHERE PATIENT='${patientId}' AND DESCRIPTION LIKE '%PRAPARE%' LIMIT 20`
      ),
      dbQuery<{ debt: number }>(
        `SELECT ROUND(SUM(OUTSTANDING),2) AS debt FROM claims_transactions WHERE PATIENTID='${patientId}' LIMIT 1`
      ),
      dbQuery<{ ENCOUNTERCLASS: string; cnt: number; total_cost: number }>(
        `SELECT ENCOUNTERCLASS,COUNT(*) AS cnt,ROUND(SUM(TOTAL_CLAIM_COST),2) AS total_cost FROM encounters WHERE PATIENT='${patientId}' GROUP BY ENCOUNTERCLASS ORDER BY cnt DESC LIMIT 10`
      )
    ]);

  const s = summaryRows[0] as Record<string, unknown>;
  const debt = debtRows[0]?.debt ?? 0;
  const { score, level, factors } = computeScore(
    Number(s?.ed_visits ?? 0),
    !!s?.has_active_careplan,
    Number(s?.chronic_condition_count ?? 0),
    meds.length,
    debt,
    sdoh.length
  );

  const safe = (v: unknown) => String(v ?? "N/A");

  const encounterLines = encounters
    .map(
      (e) =>
        `  ${e.ENCOUNTERCLASS}: ${e.cnt} visits ($${e.total_cost?.toLocaleString() ?? 0})`
    )
    .join("\n");
  const rawRows = [
    {
      Name: patientName,
      RiskScore: score,
      RiskLevel: level,
      EDVisits: s?.ed_visits,
      Conditions: conditions.length,
      Medications: meds.length,
      OutstandingDebt: debt,
      TotalCost: s?.total_cost,
      CarePlan: s?.has_active_careplan ? "Active" : "None",
      RiskFactors: factors.join("; ")
    }
  ];

  return {
    title: `Individual Patient Report — ${patientName}`,
    generatedAt: now(),
    sections: [
      {
        heading: "Patient Demographics",
        content: `Name: ${patientName}\nAge: ${safe(s?.age)}  |  Gender: ${safe(s?.gender)}  |  Race: ${safe(s?.race)}  |  Ethnicity: ${safe(s?.ethnicity)}\nCity: ${safe(s?.city)}, ${safe(s?.state)}  |  Income: $${Number(s?.income ?? 0).toLocaleString()}/yr`
      },
      {
        heading: "Risk Assessment",
        content: `Risk Score: ${score}/14  |  Level: ${level}\nFactors: ${factors.join(", ") || "None"}`
      },
      {
        heading: "Clinical Summary",
        content: `ED Visits: ${safe(s?.ed_visits)}\nInpatient Visits: ${safe(s?.inpatient_visits)}\nTotal Visits: ${safe(s?.total_visits)}\nChronic Conditions: ${conditions.length}\nActive Medications: ${meds.length}${meds.length >= 5 ? " ⚠ Polypharmacy" : ""}\nActive Care Plan: ${s?.has_active_careplan ? "Yes" : "NO ⚠"}`
      },
      {
        heading: `Active Conditions (${conditions.length})`,
        content:
          conditions.map((c) => `  • ${c.DESCRIPTION}`).join("\n") ||
          "  None on record"
      },
      {
        heading: `Active Medications (${meds.length})`,
        content:
          meds.map((m) => `  • ${m.DESCRIPTION}`).join("\n") ||
          "  None on record"
      },
      {
        heading: `Care Plans (${careplans.length})`,
        content:
          careplans
            .map(
              (c) =>
                `  • ${c.DESCRIPTION}${c.REASONDESCRIPTION ? ` — ${c.REASONDESCRIPTION}` : ""}`
            )
            .join("\n") || "  No active care plan ⚠"
      },
      {
        heading: "SDOH Flags (PRAPARE)",
        content:
          sdoh.length === 0
            ? "  No flags recorded"
            : sdoh
                .map(
                  (f) =>
                    `  • ${f.DESCRIPTION.replace(" [PRAPARE]", "")}: ${f.VALUE}`
                )
                .join("\n")
      },
      {
        heading: "Financial",
        content: `Total Lifetime Cost: $${Number(s?.total_cost ?? 0).toLocaleString()}\nED + Inpatient Cost: $${Number(s?.ed_inpatient_total_cost ?? 0).toLocaleString()}\nOutstanding Debt: $${Number(debt).toLocaleString()}${debt > 10000 ? " ⚠ High debt" : ""}`
      },
      {
        heading: "Encounter Breakdown",
        content: encounterLines || "  No encounters on record"
      }
    ],
    rawRows,
    csvFilename: `patient-${patientName.replace(/\s+/g, "-")}.csv`,
    jsonFilename: `patient-${patientName.replace(/\s+/g, "-")}.json`,
    textFilename: `patient-${patientName.replace(/\s+/g, "-")}.txt`
  };
}

async function generateWeeklySummaryReport(): Promise<ReportResult> {
  const [summaries, meds, debts, sdoh, encounters] = await Promise.all([
    dbQuery<{
      id: string;
      first: string;
      last: string;
      ed_visits: number;
      chronic_condition_count: number;
      has_active_careplan: number;
      total_cost: number;
      ed_inpatient_total_cost: number;
      race: string;
    }>(
      `SELECT id,first,last,ed_visits,chronic_condition_count,has_active_careplan,total_cost,ed_inpatient_total_cost,race FROM patient_summary LIMIT 200`
    ),
    dbQuery<{ PATIENT: string; med_count: number }>(
      `SELECT PATIENT,COUNT(*) AS med_count FROM medications WHERE STOP IS NULL GROUP BY PATIENT LIMIT 200`
    ),
    dbQuery<{ PATIENTID: string; debt: number }>(
      `SELECT PATIENTID,ROUND(SUM(OUTSTANDING),2) AS debt FROM claims_transactions GROUP BY PATIENTID LIMIT 200`
    ),
    dbQuery<{ PATIENT: string; sdoh_count: number }>(
      `SELECT PATIENT,COUNT(*) AS sdoh_count FROM observations WHERE DESCRIPTION LIKE '%PRAPARE%' AND ((LOWER(DESCRIPTION) LIKE '%housing%' AND VALUE='Yes') OR (LOWER(DESCRIPTION) LIKE '%transportation%' AND VALUE='Yes') OR (LOWER(DESCRIPTION) LIKE '%food%' AND VALUE='Yes')) GROUP BY PATIENT LIMIT 200`
    ),
    dbQuery<{ ENCOUNTERCLASS: string; cnt: number; total: number }>(
      `SELECT ENCOUNTERCLASS,COUNT(*) AS cnt,ROUND(SUM(TOTAL_CLAIM_COST),2) AS total FROM encounters GROUP BY ENCOUNTERCLASS ORDER BY cnt DESC LIMIT 10`
    )
  ]);

  const medMap = new Map(meds.map((r) => [r.PATIENT, r.med_count]));
  const debtMap = new Map(debts.map((r) => [r.PATIENTID, r.debt]));
  const sdohMap = new Map(sdoh.map((r) => [r.PATIENT, r.sdoh_count]));

  const scored = summaries.map((s) => {
    const { score, level } = computeScore(
      s.ed_visits,
      !!s.has_active_careplan,
      s.chronic_condition_count,
      medMap.get(s.id) ?? 0,
      debtMap.get(s.id) ?? 0,
      sdohMap.get(s.id) ?? 0
    );
    return { ...s, score, level };
  });

  const byLevel = {
    CRITICAL: scored.filter((p) => p.level === "CRITICAL"),
    HIGH: scored.filter((p) => p.level === "HIGH"),
    MEDIUM: scored.filter((p) => p.level === "MEDIUM"),
    LOW: scored.filter((p) => p.level === "LOW")
  };
  const noCarePlan = scored.filter((p) => !p.has_active_careplan);
  const totalEdCost = scored.reduce((s, p) => s + p.ed_inpatient_total_cost, 0);
  const avgScore = (
    scored.reduce((s, p) => s + p.score, 0) / scored.length
  ).toFixed(1);
  const top5 = [...scored].sort((a, b) => b.score - a.score).slice(0, 5);

  const encounterLines = encounters
    .map(
      (e) =>
        `  ${e.ENCOUNTERCLASS}: ${e.cnt} visits  ($${e.total?.toLocaleString()})`
    )
    .join("\n");
  const rawRows = scored.map((p) => ({
    Name: `${p.first} ${p.last}`,
    RiskLevel: p.level,
    RiskScore: p.score,
    EDVisits: p.ed_visits,
    Conditions: p.chronic_condition_count,
    CarePlan: p.has_active_careplan ? "Yes" : "No",
    EDCost: p.ed_inpatient_total_cost
  }));

  return {
    title: "Weekly Population Summary Report",
    generatedAt: now(),
    sections: [
      {
        heading: "Population Overview",
        content: `Total Patients: ${scored.length}\nAverage Risk Score: ${avgScore}/14\nPatients Without Care Plan: ${noCarePlan.length} (${Math.round((noCarePlan.length / scored.length) * 100)}%)\nTotal ED/Inpatient Cost: $${Math.round(totalEdCost).toLocaleString()}`
      },
      {
        heading: "Risk Distribution",
        content: `  CRITICAL: ${byLevel.CRITICAL.length} (${Math.round((byLevel.CRITICAL.length / scored.length) * 100)}%)\n  HIGH:     ${byLevel.HIGH.length} (${Math.round((byLevel.HIGH.length / scored.length) * 100)}%)\n  MEDIUM:   ${byLevel.MEDIUM.length} (${Math.round((byLevel.MEDIUM.length / scored.length) * 100)}%)\n  LOW:      ${byLevel.LOW.length} (${Math.round((byLevel.LOW.length / scored.length) * 100)}%)`
      },
      {
        heading: "Top 5 Highest-Risk Patients",
        content: top5
          .map(
            (p, i) =>
              `  #${i + 1} ${p.first} ${p.last} — Score: ${p.score}/14 (${p.level})`
          )
          .join("\n")
      },
      {
        heading: "Care Plan Gap",
        content: `${noCarePlan.length} patients have no active care plan.\nTop 5 most at-risk without a plan:\n${[
          ...noCarePlan
        ]
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(
            (p, i) => `  #${i + 1} ${p.first} ${p.last} — Score: ${p.score}/14`
          )
          .join("\n")}`
      },
      { heading: "Encounter Volume", content: encounterLines }
    ],
    rawRows,
    csvFilename: "weekly-summary.csv",
    jsonFilename: "weekly-summary.json",
    textFilename: "weekly-summary.txt"
  };
}

async function generateHighRiskReport(): Promise<ReportResult> {
  const [summaries, meds, debts, sdoh] = await Promise.all([
    dbQuery<{
      id: string;
      first: string;
      last: string;
      age: number;
      gender: string;
      race: string;
      city: string;
      ed_visits: number;
      chronic_condition_count: number;
      has_active_careplan: number;
      ed_inpatient_total_cost: number;
      income: number;
    }>(
      `SELECT id,first,last,age,gender,race,city,ed_visits,chronic_condition_count,has_active_careplan,ed_inpatient_total_cost,income FROM patient_summary LIMIT 200`
    ),
    dbQuery<{ PATIENT: string; med_count: number }>(
      `SELECT PATIENT,COUNT(*) AS med_count FROM medications WHERE STOP IS NULL GROUP BY PATIENT LIMIT 200`
    ),
    dbQuery<{ PATIENTID: string; debt: number }>(
      `SELECT PATIENTID,ROUND(SUM(OUTSTANDING),2) AS debt FROM claims_transactions GROUP BY PATIENTID LIMIT 200`
    ),
    dbQuery<{ PATIENT: string; sdoh_count: number }>(
      `SELECT PATIENT,COUNT(*) AS sdoh_count FROM observations WHERE DESCRIPTION LIKE '%PRAPARE%' AND ((LOWER(DESCRIPTION) LIKE '%housing%' AND VALUE='Yes') OR (LOWER(DESCRIPTION) LIKE '%transportation%' AND VALUE='Yes') OR (LOWER(DESCRIPTION) LIKE '%food%' AND VALUE='Yes')) GROUP BY PATIENT LIMIT 200`
    )
  ]);
  const medMap = new Map(meds.map((r) => [r.PATIENT, r.med_count]));
  const debtMap = new Map(debts.map((r) => [r.PATIENTID, r.debt]));
  const sdohMap = new Map(sdoh.map((r) => [r.PATIENT, r.sdoh_count]));
  const highRisk = summaries
    .map((s) => {
      const { score, level, factors } = computeScore(
        s.ed_visits,
        !!s.has_active_careplan,
        s.chronic_condition_count,
        medMap.get(s.id) ?? 0,
        debtMap.get(s.id) ?? 0,
        sdohMap.get(s.id) ?? 0
      );
      return { ...s, score, level, factors, debt: debtMap.get(s.id) ?? 0 };
    })
    .filter((p) => p.level === "CRITICAL" || p.level === "HIGH")
    .sort((a, b) => b.score - a.score);

  const lines = highRisk
    .map(
      (p, i) =>
        `#${i + 1} ${p.first} ${p.last} [${p.level}] Score:${p.score}/14\n   Age:${p.age} | Race:${p.race} | City:${p.city} | Income:$${p.income.toLocaleString()}\n   ED Visits:${p.ed_visits} | Conditions:${p.chronic_condition_count} | Care Plan:${p.has_active_careplan ? "Yes" : "NO"}\n   Factors: ${p.factors.join(", ")}`
    )
    .join("\n\n");
  const rawRows = highRisk.map((p) => ({
    Name: `${p.first} ${p.last}`,
    Level: p.level,
    Score: p.score,
    Age: p.age,
    Race: p.race,
    City: p.city,
    EDVisits: p.ed_visits,
    Conditions: p.chronic_condition_count,
    CarePlan: p.has_active_careplan ? "Yes" : "No",
    EDCost: p.ed_inpatient_total_cost,
    Debt: p.debt,
    Factors: p.factors.join("; ")
  }));

  return {
    title: "High-Risk Population Report",
    generatedAt: now(),
    sections: [
      {
        heading: "Summary",
        content: `${highRisk.length} patients at HIGH or CRITICAL risk.\nTotal preventable ED cost: $${Math.round(highRisk.reduce((s, p) => s + p.ed_inpatient_total_cost, 0)).toLocaleString()}`
      },
      {
        heading: `Ranked Patient List (${highRisk.length})`,
        content: lines || "None found."
      }
    ],
    rawRows,
    csvFilename: "high-risk-population.csv",
    jsonFilename: "high-risk-population.json",
    textFilename: "high-risk-population.txt"
  };
}

async function generateNoCarePlanReport(): Promise<ReportResult> {
  const [summaries, meds, debts, sdoh] = await Promise.all([
    dbQuery<{
      id: string;
      first: string;
      last: string;
      age: number;
      race: string;
      city: string;
      ed_visits: number;
      chronic_condition_count: number;
      has_active_careplan: number;
      ed_inpatient_total_cost: number;
    }>(
      `SELECT id,first,last,age,race,city,ed_visits,chronic_condition_count,has_active_careplan,ed_inpatient_total_cost FROM patient_summary WHERE has_active_careplan=0 LIMIT 200`
    ),
    dbQuery<{ PATIENT: string; med_count: number }>(
      `SELECT PATIENT,COUNT(*) AS med_count FROM medications WHERE STOP IS NULL GROUP BY PATIENT LIMIT 200`
    ),
    dbQuery<{ PATIENTID: string; debt: number }>(
      `SELECT PATIENTID,ROUND(SUM(OUTSTANDING),2) AS debt FROM claims_transactions GROUP BY PATIENTID LIMIT 200`
    ),
    dbQuery<{ PATIENT: string; sdoh_count: number }>(
      `SELECT PATIENT,COUNT(*) AS sdoh_count FROM observations WHERE DESCRIPTION LIKE '%PRAPARE%' AND ((LOWER(DESCRIPTION) LIKE '%housing%' AND VALUE='Yes') OR (LOWER(DESCRIPTION) LIKE '%transportation%' AND VALUE='Yes') OR (LOWER(DESCRIPTION) LIKE '%food%' AND VALUE='Yes')) GROUP BY PATIENT LIMIT 200`
    )
  ]);
  const medMap = new Map(meds.map((r) => [r.PATIENT, r.med_count]));
  const debtMap = new Map(debts.map((r) => [r.PATIENTID, r.debt]));
  const sdohMap = new Map(sdoh.map((r) => [r.PATIENT, r.sdoh_count]));
  const patients = summaries
    .map((s) => {
      const { score, level, factors } = computeScore(
        s.ed_visits,
        false,
        s.chronic_condition_count,
        medMap.get(s.id) ?? 0,
        debtMap.get(s.id) ?? 0,
        sdohMap.get(s.id) ?? 0
      );
      return { ...s, score, level, factors };
    })
    .sort((a, b) => b.score - a.score);

  const rawRows = patients.map((p) => ({
    Name: `${p.first} ${p.last}`,
    RiskLevel: p.level,
    RiskScore: p.score,
    Age: p.age,
    Race: p.race,
    City: p.city,
    EDVisits: p.ed_visits,
    Conditions: p.chronic_condition_count,
    EDCost: p.ed_inpatient_total_cost,
    Factors: p.factors.join("; ")
  }));

  return {
    title: "Care Plan Gap Report",
    generatedAt: now(),
    sections: [
      {
        heading: "Summary",
        content: `${patients.length} patients have NO active care plan.\nCritical: ${patients.filter((p) => p.level === "CRITICAL").length} | High: ${patients.filter((p) => p.level === "HIGH").length} | Medium: ${patients.filter((p) => p.level === "MEDIUM").length}`
      },
      {
        heading: "Patients Without Care Plan (by risk)",
        content: patients
          .map(
            (p, i) =>
              `#${i + 1} ${p.first} ${p.last} [${p.level}] Score:${p.score}/14 | ED:${p.ed_visits} | Conditions:${p.chronic_condition_count}`
          )
          .join("\n")
      }
    ],
    rawRows,
    csvFilename: "care-plan-gaps.csv",
    jsonFilename: "care-plan-gaps.json",
    textFilename: "care-plan-gaps.txt"
  };
}

async function generateCostReport(): Promise<ReportResult> {
  const [topCost, encounterCost, raceCost] = await Promise.all([
    dbQuery<{
      first: string;
      last: string;
      ed_visits: number;
      ed_inpatient_total_cost: number;
      total_cost: number;
      chronic_condition_count: number;
      has_active_careplan: number;
    }>(
      `SELECT first,last,ed_visits,ed_inpatient_total_cost,total_cost,chronic_condition_count,has_active_careplan FROM patient_summary ORDER BY ed_inpatient_total_cost DESC LIMIT 20`
    ),
    dbQuery<{
      ENCOUNTERCLASS: string;
      visit_count: number;
      total_cost: number;
      avg_cost: number;
    }>(
      `SELECT ENCOUNTERCLASS,COUNT(*) AS visit_count,ROUND(SUM(TOTAL_CLAIM_COST),2) AS total_cost,ROUND(AVG(TOTAL_CLAIM_COST),2) AS avg_cost FROM encounters GROUP BY ENCOUNTERCLASS ORDER BY total_cost DESC LIMIT 10`
    ),
    dbQuery<{
      race: string;
      patient_count: number;
      avg_ed_cost: number;
      total_ed_cost: number;
    }>(
      `SELECT race,COUNT(*) AS patient_count,ROUND(AVG(ed_inpatient_total_cost),2) AS avg_ed_cost,ROUND(SUM(ed_inpatient_total_cost),2) AS total_ed_cost FROM patient_summary GROUP BY race ORDER BY avg_ed_cost DESC LIMIT 10`
    )
  ]);

  const totalAll = topCost.reduce((s, p) => s + p.total_cost, 0);
  const topLines = topCost
    .map(
      (p, i) =>
        `#${i + 1} ${p.first} ${p.last} | ED+IP: $${p.ed_inpatient_total_cost.toLocaleString()} | Total: $${p.total_cost.toLocaleString()} | ED visits: ${p.ed_visits}`
    )
    .join("\n");
  const encLines = encounterCost
    .map(
      (e) =>
        `  ${e.ENCOUNTERCLASS}: ${e.visit_count} visits | Total: $${e.total_cost.toLocaleString()} | Avg: $${e.avg_cost.toLocaleString()}`
    )
    .join("\n");
  const raceLines = raceCost
    .map(
      (r) =>
        `  ${r.race}: ${r.patient_count} patients | Avg ED cost: $${r.avg_ed_cost.toLocaleString()} | Total: $${r.total_ed_cost.toLocaleString()}`
    )
    .join("\n");
  const rawRows = topCost.map((p) => ({
    Name: `${p.first} ${p.last}`,
    EDVisits: p.ed_visits,
    EDInpatientCost: p.ed_inpatient_total_cost,
    TotalCost: p.total_cost,
    Conditions: p.chronic_condition_count,
    ActiveCarePlan: p.has_active_careplan ? "Yes" : "No"
  }));

  return {
    title: "Cost Analysis Report",
    generatedAt: now(),
    sections: [
      {
        heading: "Cost Overview",
        content: `Combined ED+Inpatient (top 20 patients): $${Math.round(totalAll).toLocaleString()}\nHighest individual: $${topCost[0]?.ed_inpatient_total_cost.toLocaleString()} (${topCost[0]?.first} ${topCost[0]?.last})`
      },
      { heading: "Top 20 Cost Drivers", content: topLines },
      { heading: "Cost by Encounter Type", content: encLines },
      { heading: "Average ED Cost by Race", content: raceLines }
    ],
    rawRows,
    csvFilename: "cost-analysis.csv",
    jsonFilename: "cost-analysis.json",
    textFilename: "cost-analysis.txt"
  };
}

async function generateHealthEquityReport(): Promise<ReportResult> {
  const [summaries, sdoh] = await Promise.all([
    dbQuery<{
      id: string;
      first: string;
      last: string;
      race: string;
      ethnicity: string;
      income: number;
      ed_visits: number;
      chronic_condition_count: number;
      has_active_careplan: number;
      ed_inpatient_total_cost: number;
    }>(
      `SELECT id,first,last,race,ethnicity,income,ed_visits,chronic_condition_count,has_active_careplan,ed_inpatient_total_cost FROM patient_summary LIMIT 200`
    ),
    dbQuery<{ PATIENT: string; sdoh_count: number }>(
      `SELECT PATIENT,COUNT(*) AS sdoh_count FROM observations WHERE DESCRIPTION LIKE '%PRAPARE%' AND ((LOWER(DESCRIPTION) LIKE '%housing%' AND VALUE='Yes') OR (LOWER(DESCRIPTION) LIKE '%transportation%' AND VALUE='Yes') OR (LOWER(DESCRIPTION) LIKE '%food%' AND VALUE='Yes')) GROUP BY PATIENT LIMIT 200`
    )
  ]);
  const sdohMap = new Map(sdoh.map((r) => [r.PATIENT, r.sdoh_count]));

  const raceMap = new Map<
    string,
    {
      total: number;
      highRisk: number;
      noCarePlan: number;
      sdohFlags: number;
      totalEdCost: number;
      incomes: number[];
    }
  >();
  for (const p of summaries) {
    const sdohCount = sdohMap.get(p.id) ?? 0;
    const { level } = computeScore(
      p.ed_visits,
      !!p.has_active_careplan,
      p.chronic_condition_count,
      0,
      0,
      sdohCount
    );
    const r = raceMap.get(p.race) ?? {
      total: 0,
      highRisk: 0,
      noCarePlan: 0,
      sdohFlags: 0,
      totalEdCost: 0,
      incomes: []
    };
    r.total++;
    if (level === "CRITICAL" || level === "HIGH") r.highRisk++;
    if (!p.has_active_careplan) r.noCarePlan++;
    if (sdohCount > 0) r.sdohFlags++;
    r.totalEdCost += p.ed_inpatient_total_cost;
    r.incomes.push(p.income);
    raceMap.set(p.race, r);
  }

  const raceRows = [...raceMap.entries()]
    .map(([race, d]) => ({
      race,
      total: d.total,
      highRiskPct: Math.round((d.highRisk / d.total) * 100),
      noCarePlanPct: Math.round((d.noCarePlan / d.total) * 100),
      sdohPct: Math.round((d.sdohFlags / d.total) * 100),
      avgEdCost: Math.round(d.totalEdCost / d.total),
      avgIncome: Math.round(
        d.incomes.reduce((s, v) => s + v, 0) / d.incomes.length
      )
    }))
    .sort((a, b) => b.highRiskPct - a.highRiskPct);

  const lines = raceRows
    .map(
      (r) =>
        `  ${r.race.padEnd(8)} | Patients: ${String(r.total).padEnd(4)} | High-Risk: ${r.highRiskPct}% | No Care Plan: ${r.noCarePlanPct}% | SDOH: ${r.sdohPct}% | Avg ED Cost: $${r.avgEdCost.toLocaleString()} | Avg Income: $${r.avgIncome.toLocaleString()}`
    )
    .join("\n");
  const disparities = raceRows
    .filter((r) => r.highRiskPct >= 30)
    .map(
      (r) =>
        `  ⚠ ${r.race}: ${r.highRiskPct}% high-risk rate (${r.total} patients)`
    )
    .join("\n");
  const rawRows = raceRows.map((r) => ({
    Race: r.race,
    Patients: r.total,
    HighRiskPct: r.highRiskPct,
    NoCarePlanPct: r.noCarePlanPct,
    SDOHFlagPct: r.sdohPct,
    AvgEDCost: r.avgEdCost,
    AvgIncome: r.avgIncome
  }));

  return {
    title: "Health Equity Report",
    generatedAt: now(),
    sections: [
      {
        heading: "Disparity Flags (≥30% high-risk rate)",
        content: disparities || "  No groups above 30% threshold"
      },
      { heading: "Breakdown by Race", content: lines }
    ],
    rawRows,
    csvFilename: "health-equity.csv",
    jsonFilename: "health-equity.json",
    textFilename: "health-equity.txt"
  };
}

// ── Report to text ────────────────────────────────────────────────────

function reportToText(r: ReportResult): string {
  const sep = "═".repeat(60);
  const lines = [
    sep,
    r.title.toUpperCase(),
    `Generated: ${r.generatedAt}`,
    sep,
    ...r.sections.flatMap((s) => [`\n── ${s.heading} ──`, s.content]),
    "\n" + sep
  ];
  return lines.join("\n");
}

// ── Notification types ────────────────────────────────────────────────

interface StaffAlert {
  id: string;
  patientName: string;
  riskScore: number;
  factors: string[];
  time: string;
  acknowledged: boolean;
}

// ── Main component ────────────────────────────────────────────────────

export function ReportsTab() {
  const [selectedReport, setSelectedReport] = useState<ReportType>("emergency");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [selectedPatientName, setSelectedPatientName] = useState("");
  const [patients, setPatients] = useState<{ id: string; name: string }[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Notifications
  const [alerts, setAlerts] = useState<StaffAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(() =>
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  const unreadCount = alerts.filter((a) => !a.acknowledged).length;

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") {
      // Already blocked — can't re-request. Open browser settings.
      alert(
        "Notifications are blocked in your browser.\n\n" +
          "To enable:\n" +
          "Chrome: Click the 🔒 lock icon in the address bar → Notifications → Allow\n" +
          "Firefox: Click the 🔒 shield icon → Permissions → Allow Notifications"
      );
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === "granted") {
      new Notification("✅ Staff notifications enabled", {
        body: "You will be alerted when critical patients are detected."
      });
    }
  };

  const fireBrowserNotif = useCallback(
    (name: string, score: number, factors: string[]) => {
      if (
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      )
        return;
      const n = new Notification(`🚨 Critical Patient: ${name}`, {
        body: `Risk Score: ${score}/14\n${factors.join(", ")}`,
        tag: `alert-${name}`
      });
      n.onclick = () => window.focus();
    },
    []
  );

  const pushAlerts = useCallback(
    (patients: { name: string; score: number; factors: string[] }[]) => {
      const newAlerts: StaffAlert[] = patients.map((p) => ({
        id: `${p.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        patientName: p.name,
        riskScore: p.score,
        factors: p.factors,
        time: new Date().toLocaleTimeString(),
        acknowledged: false
      }));
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, 50));
      setShowAlerts(true);
      newAlerts.forEach((a) =>
        fireBrowserNotif(a.patientName, a.riskScore, a.factors)
      );
    },
    [fireBrowserNotif]
  );

  const acknowledge = (id: string) =>
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
  const acknowledgeAll = () =>
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));

  // Use a ref so handleSelectReport always calls latest runGenerate
  const runGenerateRef = useRef<
    (type: ReportType, patId?: string, patName?: string) => void
  >(() => {});

  const runGenerate = useCallback(
    async (type: ReportType, patId?: string, patName?: string) => {
      if (type === "individual" && !patId) return;
      setLoading(true);
      setError(null);
      setReport(null);
      try {
        let result: ReportResult;
        switch (type) {
          case "emergency":
            result = await generateEmergencyReport();
            break;
          case "individual":
            result = await generateIndividualReport(patId!, patName!);
            break;
          case "weekly-summary":
            result = await generateWeeklySummaryReport();
            break;
          case "high-risk-population":
            result = await generateHighRiskReport();
            break;
          case "no-care-plan":
            result = await generateNoCarePlanReport();
            break;
          case "cost-analysis":
            result = await generateCostReport();
            break;
          case "health-equity":
            result = await generateHealthEquityReport();
            break;
          default:
            throw new Error("Unknown report type");
        }
        setReport(result);

        // Auto-alert staff for emergency reports
        if (type === "emergency" && result.rawRows.length > 0) {
          const criticalPatients = result.rawRows
            .filter(
              (r): r is Record<string, unknown> =>
                (r as Record<string, unknown>).RiskLevel === "CRITICAL"
            )
            .map((r) => ({
              name: String(r.Name ?? ""),
              score: Number(r.RiskScore ?? 0),
              factors: String(r.RiskFactors ?? "")
                .split("; ")
                .filter(Boolean)
            }));
          if (criticalPatients.length > 0) pushAlerts(criticalPatients);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate report");
      } finally {
        setLoading(false);
      }
    },
    [pushAlerts]
  );

  // Keep ref in sync with latest runGenerate
  runGenerateRef.current = runGenerate;

  // Auto-generate emergency report on mount
  useEffect(() => {
    runGenerateRef.current("emergency");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPatients = useCallback(async () => {
    if (patients.length > 0) return;
    setLoadingPatients(true);
    const rows = await dbQuery<{
      id: string;
      first: string;
      last: string;
      ed_visits: number;
    }>(
      `SELECT id,first,last,ed_visits FROM patient_summary ORDER BY ed_visits DESC LIMIT 117`
    );
    setPatients(rows.map((r) => ({ id: r.id, name: `${r.first} ${r.last}` })));
    setLoadingPatients(false);
  }, [patients.length]);

  const handleSelectReport = (id: ReportType) => {
    setSelectedReport(id);
    setReport(null);
    setError(null);
    if (id === "individual") {
      loadPatients();
    } else {
      runGenerateRef.current(id);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-kumo-elevated overflow-hidden">
      {/* Sidebar — full width on mobile, fixed left rail on tablet+ */}
      <div className="w-full md:w-64 shrink-0 bg-kumo-base border-b md:border-b-0 md:border-r border-kumo-line flex flex-col max-h-[45vh] md:max-h-none">
        <div className="p-4 border-b border-kumo-line">
          <div className="flex items-center gap-2">
            <ClipboardTextIcon size={18} className="text-kumo-inactive" />
            <h2 className="text-sm font-semibold text-kumo-default">Reports</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {REPORTS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelectReport(r.id)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                selectedReport === r.id
                  ? "bg-kumo-accent/10 border border-kumo-accent"
                  : "hover:bg-kumo-control border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {r.icon}
                <span className="text-xs font-medium text-kumo-default">
                  {r.label}
                </span>
                {r.badge && (
                  <Badge variant={r.badgeVariant ?? "secondary"}>
                    {r.badge}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-kumo-inactive leading-tight">
                {r.description}
              </p>
            </button>
          ))}
        </div>

        {/* Notification permission */}
        {notifPerm !== "granted" && (
          <div className="p-3 border-t border-kumo-line space-y-1">
            <button
              type="button"
              onClick={requestPermission}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                notifPerm === "denied"
                  ? "bg-red-50 border-red-200 text-red-800 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300"
                  : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300"
              }`}
            >
              <BellIcon size={14} />
              {notifPerm === "denied"
                ? "Notifications blocked — click for help"
                : "Enable staff notifications"}
            </button>
            {notifPerm === "denied" && (
              <p className="text-[10px] text-kumo-inactive px-1">
                Click the 🔒 lock in the address bar → Notifications → Allow
              </p>
            )}
          </div>
        )}
      </div>

      {/* Main panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 bg-kumo-base border-b border-kumo-line flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-kumo-default">
            {REPORTS.find((r) => r.id === selectedReport)?.label}
          </span>

          {selectedReport === "individual" && (
            <select
              value={selectedPatientId}
              onChange={(e) => {
                const pid = e.target.value;
                const pname = patients.find((p) => p.id === pid)?.name ?? "";
                setSelectedPatientId(pid);
                setSelectedPatientName(pname);
                if (pid) runGenerateRef.current("individual", pid, pname);
              }}
              className="px-3 py-1.5 rounded-lg border border-kumo-line bg-kumo-base text-kumo-default text-xs focus:outline-none focus:ring-1 focus:ring-kumo-accent"
            >
              <option value="">
                {loadingPatients ? "Loading..." : "— Select patient —"}
              </option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <Button
            variant="primary"
            size="sm"
            icon={
              loading ? (
                <ArrowClockwiseIcon size={14} className="animate-spin" />
              ) : (
                <ArrowClockwiseIcon size={14} />
              )
            }
            onClick={() =>
              runGenerateRef.current(
                selectedReport,
                selectedPatientId,
                selectedPatientName
              )
            }
            disabled={
              loading || (selectedReport === "individual" && !selectedPatientId)
            }
          >
            {loading ? "Generating..." : "Refresh"}
          </Button>

          {/* Notification bell */}
          <div className="ml-auto relative">
            <button
              type="button"
              onClick={() => setShowAlerts(!showAlerts)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-kumo-line bg-kumo-base hover:bg-kumo-control transition-colors text-xs text-kumo-default"
            >
              {unreadCount > 0 ? (
                <BellRingingIcon size={16} className="text-red-500" />
              ) : (
                <BellIcon size={16} className="text-kumo-inactive" />
              )}
              Staff Alerts
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Alert panel */}
        {showAlerts && (
          <div className="border-b border-kumo-line bg-kumo-base max-h-72 overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-2 sticky top-0 bg-kumo-base border-b border-kumo-line">
              <span className="text-xs font-semibold text-kumo-default flex items-center gap-2">
                <BellRingingIcon size={14} className="text-red-500" />
                Staff Alerts — Critical Patients ({alerts.length})
              </span>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={acknowledgeAll}
                    className="text-xs text-kumo-accent hover:underline"
                  >
                    Acknowledge all
                  </button>
                )}
                <button type="button" onClick={() => setShowAlerts(false)}>
                  <XIcon size={14} className="text-kumo-inactive" />
                </button>
              </div>
            </div>

            {alerts.length === 0 ? (
              <p className="px-5 py-3 text-xs text-kumo-inactive">
                No alerts yet. Run Emergency Flags report to scan for critical
                patients.
              </p>
            ) : (
              <div className="divide-y divide-kumo-line">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`px-5 py-3 flex items-start gap-3 ${alert.acknowledged ? "opacity-50" : "bg-red-50/50 dark:bg-red-900/10"}`}
                  >
                    <WarningIcon
                      size={16}
                      className="text-red-500 mt-0.5 shrink-0"
                      weight="fill"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-kumo-default">
                          {alert.patientName}
                        </span>
                        <span className="text-xs text-red-600 font-medium">
                          Risk {alert.riskScore}/14
                        </span>
                        <span className="text-xs text-kumo-inactive">
                          {alert.time}
                        </span>
                      </div>
                      <p className="text-xs text-kumo-inactive mt-0.5 truncate">
                        {alert.factors.join(" · ")}
                      </p>
                    </div>
                    {!alert.acknowledged && (
                      <button
                        type="button"
                        onClick={() => acknowledge(alert.id)}
                        className="shrink-0 flex items-center gap-1 text-xs text-kumo-accent hover:underline"
                      >
                        <CheckCircleIcon size={14} /> Acknowledge
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2 dark:bg-red-900/20 dark:border-red-800">
            <WarningIcon size={14} className="text-red-500 shrink-0" />
            <span className="text-xs text-red-700 dark:text-red-300">
              {error}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!report && !loading && !error && (
            <div className="flex flex-col items-center justify-center h-full text-kumo-inactive gap-3">
              <ClipboardTextIcon size={40} />
              <Text variant="secondary">Loading report...</Text>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-full text-kumo-inactive gap-2">
              <ArrowClockwiseIcon size={20} className="animate-spin" />
              <Text variant="secondary">Querying patient database...</Text>
            </div>
          )}

          {report && !loading && (
            <>
              <Surface className="p-4 rounded-xl ring ring-kumo-line">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-semibold text-kumo-default">
                      {report.title}
                    </p>
                    <p className="text-xs text-kumo-inactive">
                      Generated {report.generatedAt} · {report.rawRows.length}{" "}
                      records
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">
                      {report.rawRows.length} rows
                    </Badge>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<FileTextIcon size={14} />}
                      onClick={() =>
                        downloadFile(
                          reportToText(report),
                          report.textFilename,
                          "text/plain"
                        )
                      }
                    >
                      TXT
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<FileCsvIcon size={14} />}
                      onClick={() =>
                        downloadFile(
                          toCSV(report.rawRows),
                          report.csvFilename,
                          "text/csv"
                        )
                      }
                    >
                      CSV
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<FileJsonIcon size={14} />}
                      onClick={() =>
                        downloadFile(
                          JSON.stringify(report.rawRows, null, 2),
                          report.jsonFilename,
                          "application/json"
                        )
                      }
                    >
                      JSON
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<DownloadSimpleIcon size={14} />}
                      onClick={() =>
                        downloadFile(
                          reportToText(report),
                          report.textFilename,
                          "text/plain"
                        )
                      }
                    >
                      Download
                    </Button>
                  </div>
                </div>
              </Surface>

              {report.sections.map((section, i) => (
                <Surface
                  key={i}
                  className="p-4 rounded-xl ring ring-kumo-line space-y-2"
                >
                  <p className="text-sm font-semibold text-kumo-default">
                    {section.heading}
                  </p>
                  <pre className="text-xs text-kumo-default font-mono whitespace-pre-wrap leading-relaxed bg-kumo-control rounded-lg p-3 overflow-x-auto max-h-80 overflow-y-auto">
                    {section.content}
                  </pre>
                </Surface>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
