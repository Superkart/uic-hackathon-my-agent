import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage
} from "ai";
import { z } from "zod";

/**
 * The AI SDK's downloadAssets step runs `new URL(data)` on every file
 * part's string data. Data URIs parse as valid URLs, so it tries to
 * HTTP-fetch them and fails. Decode to Uint8Array so the SDK treats
 * them as inline data instead.
 */
function inlineDataUrls(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "user" || typeof msg.content === "string") return msg;
    return {
      ...msg,
      content: msg.content.map((part) => {
        if (part.type !== "file" || typeof part.data !== "string") return part;
        const match = part.data.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return part;
        const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
        return { ...part, data: bytes, mediaType: match[1] };
      })
    };
  });
}

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;

  onStart() {
    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/moonshotai/kimi-k2.6", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are a healthcare data analyst assistant helping care coordinators at a value-based primary care practice.

Your goal is to help coordinators find patients who need intervention, understand what's driving high costs, and surface barriers keeping patients from accessing care.

You have access to a database of 117 synthetic patients via the queryDatabase tool. Key facts:
- Total costs: $27.9M across 8,316 encounters
- Inpatient visits = 35% of cost from only 2.8% of encounters
- 83% of patients have at least 1 ED visit
- Social factors (housing, food, transport, employment) are in conditions and observations

Database tables:
- patient_summary — START HERE. One row per patient with ed_inpatient_total_cost, ed_visits, chronic_condition_count, has_active_careplan
- encounters — filter by ENCOUNTERCLASS: emergency, inpatient, ambulatory, urgentcare, wellness
- conditions — chronic conditions + SDOH flags. STOP IS NULL = active
- medications — prescriptions. STOP IS NULL = active
- observations — PRAPARE social screenings (housing, food, transport, stress)
- procedures — care gap detection
- claims_transactions — financial data. JOIN KEY IS PATIENTID (not PATIENT)
- careplans — active care plans. STOP IS NULL = active
- patients — has INCOME, LAT, LON, RACE, ETHNICITY

IMPORTANT: Synthea patient names have numeric suffixes (e.g. "Lindsay928 Brekke496"). Always use LIKE with LOWER() when searching by name, never use =.
IMPORTANT: claims_transactions uses PATIENTID as the join key. Every other table uses PATIENT.

Risk scoring formula (same as the UI dashboard — max 14 points):
- ED visits > 5: +3 pts
- No active care plan: +2 pts
- Chronic conditions > 10: +2 pts
- Polypharmacy (≥5 active meds): +1 pt
- Outstanding debt > $10k: +1 pt
- SDOH flags (housing insecurity, transport barrier, food insecurity, safety concern): +1 pt each, capped at +2
Risk levels: critical ≥60%, high ≥43%, medium ≥25%, low <25% of max score.
Use getPatientRiskScore for a single patient and getTopRiskPatients for the ranked population list.

Human-in-the-loop rule: Before recommending any action (outreach, care plan change, escalation), summarize your findings and ask the coordinator to confirm.

${getSchedulePrompt({ date: new Date() })}`,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: inlineDataUrls(await convertToModelMessages(this.messages)),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        // Query the patient database
        queryDatabase: tool({
          description:
            "Execute a SQL SELECT query against the patient dataset. " +
            "Returns JSON with a 'results' array. " +
            "Start with patient_summary for an overview. " +
            "Available tables: patient_summary, patients, encounters, conditions, " +
            "medications, observations, procedures, claims_transactions, careplans. " +
            "Always include a LIMIT clause. Only SELECT is allowed.",
          inputSchema: z.object({
            sql: z.string().describe("A valid SQL SELECT statement with a LIMIT clause")
          }),
          execute: async ({ sql }) => {
            const response = await fetch(
              "https://uic-hackathon-data.christian-7f4.workers.dev/query",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sql })
              }
            );
            return await response.json();
          }
        }),

        // Compute the UI risk score for a single patient
        getPatientRiskScore: tool({
          description:
            "Compute the same risk score shown in the Patient Metrics UI tab for a given patient. " +
            "Returns score (0-14), risk level (low/medium/high/critical), and the factors that drove the score. " +
            "Use this when the user asks about a specific patient's risk.",
          inputSchema: z.object({
            patientId: z.string().describe("The patient UUID from patient_summary.id")
          }),
          execute: async ({ patientId }) => {
            const DB = "https://uic-hackathon-data.christian-7f4.workers.dev/query";
            const q = async (sql: string) => {
              const r = await fetch(DB, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }) });
              return ((await r.json()) as { results: Record<string, unknown>[] }).results ?? [];
            };

            const [summary, debtRows, sdohRows, medRows] = await Promise.all([
              q(`SELECT * FROM patient_summary WHERE id = '${patientId}' LIMIT 1`),
              q(`SELECT ROUND(SUM(OUTSTANDING), 2) AS total_debt FROM claims_transactions WHERE PATIENTID = '${patientId}' LIMIT 1`),
              q(`SELECT DESCRIPTION, VALUE FROM observations WHERE PATIENT = '${patientId}' AND DESCRIPTION LIKE '%PRAPARE%' LIMIT 30`),
              q(`SELECT COUNT(*) AS med_count FROM medications WHERE PATIENT = '${patientId}' AND STOP IS NULL LIMIT 1`)
            ]);

            const s = summary[0];
            if (!s) return { error: "Patient not found" };

            const debt = (debtRows[0]?.total_debt as number) ?? 0;
            const medCount = (medRows[0]?.med_count as number) ?? 0;
            const sdoh = sdohRows as { DESCRIPTION: string; VALUE: string }[];

            const housingInsecurity = sdoh.some(r => r.DESCRIPTION.toLowerCase().includes("worried about losing your housing") && r.VALUE === "Yes");
            const transportBarrier = sdoh.some(r => r.DESCRIPTION.toLowerCase().includes("transportation") && r.VALUE === "Yes");
            const foodInsecurity = sdoh.some(r => (r.DESCRIPTION.toLowerCase().includes("food") || r.DESCRIPTION.toLowerCase().includes("hungry")) && r.VALUE === "Yes");
            const safetyConcern = sdoh.some(r => r.DESCRIPTION.toLowerCase().includes("physically and emotionally safe") && r.VALUE === "No");
            const sdohCount = [housingInsecurity, transportBarrier, foodInsecurity, safetyConcern].filter(Boolean).length;

            const factors: { label: string; points: number }[] = [];
            if ((s.ed_visits as number) > 5) factors.push({ label: `${s.ed_visits} ED visits`, points: 3 });
            if (!s.has_active_careplan) factors.push({ label: "No active care plan", points: 2 });
            if ((s.chronic_condition_count as number) > 10) factors.push({ label: `${s.chronic_condition_count} chronic conditions`, points: 2 });
            if (medCount >= 5) factors.push({ label: `Polypharmacy (${medCount} meds)`, points: 1 });
            if (debt > 10000) factors.push({ label: `$${Math.round(debt).toLocaleString()} outstanding debt`, points: 1 });
            if (sdohCount > 0) factors.push({ label: `${sdohCount} SDOH flag(s): ${[housingInsecurity && "housing", transportBarrier && "transport", foodInsecurity && "food", safetyConcern && "safety"].filter(Boolean).join(", ")}`, points: Math.min(sdohCount, 2) });

            const score = factors.reduce((acc, f) => acc + f.points, 0);
            const pct = score / 14;
            const level = pct >= 0.6 ? "critical" : pct >= 0.43 ? "high" : pct >= 0.25 ? "medium" : "low";

            return {
              patient: `${s.first} ${s.last}`,
              score,
              maxScore: 14,
              level,
              factors,
              summary: {
                ed_visits: s.ed_visits,
                inpatient_visits: s.inpatient_visits,
                chronic_conditions: s.chronic_condition_count,
                has_care_plan: !!s.has_active_careplan,
                total_cost: s.total_cost,
                ed_inpatient_cost: s.ed_inpatient_total_cost,
                active_meds: medCount,
                outstanding_debt: debt
              }
            };
          }
        }),

        // Return the full population ranked by risk score (same as Risk Dashboard tab)
        getTopRiskPatients: tool({
          description:
            "Return patients ranked by their UI risk score — the same list shown in the Population Risk Dashboard tab. " +
            "Use this when the user asks who the highest-risk patients are, or wants a population-level view. " +
            "Optionally filter by risk level.",
          inputSchema: z.object({
            limit: z.number().default(20).describe("Number of patients to return (default 20)"),
            level: z.enum(["all", "critical", "high", "medium", "low"]).default("all").describe("Filter by risk level")
          }),
          execute: async ({ limit, level }) => {
            const DB = "https://uic-hackathon-data.christian-7f4.workers.dev/query";
            const q = async (sql: string) => {
              const r = await fetch(DB, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }) });
              return ((await r.json()) as { results: Record<string, unknown>[] }).results ?? [];
            };

            const [summaries, meds, debts, sdoh] = await Promise.all([
              q(`SELECT id, first, last, age, city, ed_visits, inpatient_visits, total_cost, ed_inpatient_total_cost, chronic_condition_count, has_active_careplan FROM patient_summary LIMIT 200`),
              q(`SELECT PATIENT, COUNT(*) AS med_count FROM medications WHERE STOP IS NULL GROUP BY PATIENT LIMIT 200`),
              q(`SELECT PATIENTID, ROUND(SUM(OUTSTANDING), 2) AS debt FROM claims_transactions GROUP BY PATIENTID LIMIT 200`),
              q(`SELECT PATIENT, COUNT(*) AS sdoh_count FROM observations WHERE DESCRIPTION LIKE '%PRAPARE%' AND ((LOWER(DESCRIPTION) LIKE '%housing%' AND VALUE = 'Yes') OR (LOWER(DESCRIPTION) LIKE '%transportation%' AND VALUE = 'Yes') OR (LOWER(DESCRIPTION) LIKE '%food%' AND VALUE = 'Yes') OR (LOWER(DESCRIPTION) LIKE '%physically and emotionally safe%' AND VALUE = 'No')) GROUP BY PATIENT LIMIT 200`)
            ]);

            const medMap = new Map(meds.map(r => [r.PATIENT as string, r.med_count as number]));
            const debtMap = new Map(debts.map(r => [r.PATIENTID as string, r.debt as number]));
            const sdohMap = new Map(sdoh.map(r => [r.PATIENT as string, r.sdoh_count as number]));

            const scored = summaries.map(s => {
              const medCount = medMap.get(s.id as string) ?? 0;
              const debt = debtMap.get(s.id as string) ?? 0;
              const sdohCount = sdohMap.get(s.id as string) ?? 0;

              const factors: string[] = [];
              let score = 0;
              if ((s.ed_visits as number) > 5) { score += 3; factors.push(`${s.ed_visits} ED visits`); }
              if (!s.has_active_careplan) { score += 2; factors.push("No care plan"); }
              if ((s.chronic_condition_count as number) > 10) { score += 2; factors.push(`${s.chronic_condition_count} conditions`); }
              if (medCount >= 5) { score += 1; factors.push(`Polypharmacy (${medCount})`); }
              if (debt > 10000) { score += 1; factors.push(`$${Math.round(debt / 1000)}k debt`); }
              if (sdohCount > 0) { score += Math.min(sdohCount, 2); factors.push(`${sdohCount} SDOH flag(s)`); }

              const pct = score / 14;
              const lvl = pct >= 0.6 ? "critical" : pct >= 0.43 ? "high" : pct >= 0.25 ? "medium" : "low";
              return { id: s.id, name: `${s.first} ${s.last}`, age: s.age, city: s.city, score, level: lvl, factors, ed_visits: s.ed_visits, chronic_conditions: s.chronic_condition_count, has_care_plan: !!s.has_active_careplan, total_cost: s.total_cost, ed_cost: s.ed_inpatient_total_cost };
            });

            const filtered = (level === "all" ? scored : scored.filter(p => p.level === level))
              .sort((a, b) => b.score - a.score)
              .slice(0, limit);

            const stats = {
              total: summaries.length,
              critical: scored.filter(p => p.level === "critical").length,
              high: scored.filter(p => p.level === "high").length,
              medium: scored.filter(p => p.level === "medium").length,
              low: scored.filter(p => p.level === "low").length,
              no_care_plan: scored.filter(p => !p.has_care_plan).length
            };

            return { stats, patients: filtered };
          }
        }),

        // Server-side tool: runs automatically on the server
        getWeather: tool({
          description: "Get the current weather for a city",
          inputSchema: z.object({
            city: z.string().describe("City name")
          }),
          execute: async ({ city }) => {
            // Replace with a real weather API in production
            const conditions = ["sunny", "cloudy", "rainy", "snowy"];
            const temp = Math.floor(Math.random() * 30) + 5;
            return {
              city,
              temperature: temp,
              condition:
                conditions[Math.floor(Math.random() * conditions.length)],
              unit: "celsius"
            };
          }
        }),

        // Client-side tool: no execute function — the browser handles it
        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        }),

        // Approval tool: requires user confirmation before executing
        calculate: tool({
          description:
            "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z
              .enum(["+", "-", "*", "/", "%"])
              .describe("Arithmetic operator")
          }),
          needsApproval: async ({ a, b }) =>
            Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y,
              "-": (x, y) => x - y,
              "*": (x, y) => x * y,
              "/": (x, y) => x / y,
              "%": (x, y) => x % y
            };
            if (operator === "/" && b === 0) {
              return { error: "Division by zero" };
            }
            return {
              expression: `${a} ${operator} ${b}`,
              result: ops[operator](a, b)
            };
          }
        }),

        scheduleTask: tool({
          description:
            "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description, {
                idempotent: true
              });
              return `Task scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all tasks that have been scheduled",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = this.getSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Task ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          }
        })
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
