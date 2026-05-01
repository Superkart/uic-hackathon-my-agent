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

// ─────────────────────────────────────────────────────────────────
// Writeback ledger — closed-loop record of coordinator-approved
// decisions. Persisted in the Durable Object's SQLite storage so
// every approval becomes a permanent row + a follow-up task with
// an owner. Read by the right-rail audit trail in AppShell.
// ─────────────────────────────────────────────────────────────────

export interface Decision {
  id: string;
  patient_id: string;
  patient_name: string;
  action: string;
  draft_message: string | null;
  coordinator_note: string | null;
  approved_at: string;
}

export interface Task {
  id: string;
  decision_id: string;
  patient_id: string;
  due_date: string | null;
  action: string;
  status: string;
  created_at: string;
}

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;

  onStart() {
    // OAuth popup handler for MCP servers
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

    // Writeback schema — idempotent. Runs on every DO wake.
    this.sql`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        action TEXT NOT NULL,
        draft_message TEXT,
        coordinator_note TEXT,
        approved_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        due_date TEXT,
        action TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `;
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  @callable()
  async getRecentDecisions(limit = 10): Promise<Decision[]> {
    const rows = this.sql<Decision>`
      SELECT id, patient_id, patient_name, action, draft_message,
             coordinator_note, approved_at
      FROM decisions
      ORDER BY approved_at DESC
      LIMIT ${limit}
    `;
    return Array.from(rows);
  }

  @callable()
  async getTasksForDecision(decision_id: string): Promise<Task[]> {
    const rows = this.sql<Task>`
      SELECT id, decision_id, patient_id, due_date, action, status, created_at
      FROM tasks WHERE decision_id = ${decision_id}
      ORDER BY created_at DESC
    `;
    return Array.from(rows);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/moonshotai/kimi-k2.6", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are a healthcare data analyst helping a care coordinator at a value-based primary care practice. The coordinator is reading your output. Be concise, clinical, and decision-oriented.

# DATA — read-only, via queryDatabase

Patient dataset: 117 synthetic patients. Always start with patient_summary.

patient_summary columns:
  id, first, last, age, income, ed_visits, inpatient_visits, total_cost,
  ed_inpatient_total_cost, chronic_condition_count, has_active_careplan

Other tables:
  encounters     — filter by ENCOUNTERCLASS (emergency, inpatient, ambulatory, urgentcare, wellness)
  conditions     — active when STOP IS NULL; includes clinical AND SDOH (housing, transport, employment) flags
  observations   — PRAPARE social screenings
  medications    — active when STOP IS NULL
  careplans      — active when STOP IS NULL
  claims_transactions — join on PATIENTID (NOT PATIENT)

Synthea names carry numeric suffixes (e.g. "Lindsay928 Brekke496"). Use LIKE with LOWER() when searching by name, not =.

# WORKFLOW — Preventable Visit Detector

When the coordinator asks for at-risk patients, follow this chain:

1. RANK — call queryDatabase to pull top candidates by combined risk:
     ed_visits DESC, has_active_careplan ASC, chronic_condition_count DESC
   Top 5 is usually right. Always LIMIT.

2. SCORE — for each top patient, briefly explain WHY: clinical drivers
   (ED frequency, condition count, no care plan) AND social drivers
   (run a second queryDatabase against conditions WHERE PATIENT = ? for
   SDOH flags like Homeless, Unemployed, Lack of access).

3. DRAFT — produce a 2–3 sentence outreach draft for ONE patient at a
   time. Tone: respectful, action-oriented, naming the specific barrier.

4. RECORD — call recordDecision with the draft. The coordinator sees an
   approval dialog — they can edit the message or add a coordinator_note
   (their local knowledge, e.g. "daughter drives Tuesdays") before approving.
   Do not skip this step. Do not pretend to record without calling the tool.

5. TASK — immediately after recordDecision returns success, call createTask
   with a sensible due_date (within 7 days) and a one-line imperative
   action ("Call patient to schedule migraine follow-up"). The coordinator
   approves this in a second dialog.

6. CONFIRM — when both tools have written, summarize for the coordinator:
   "Decision logged. Task due {date}. Audit ledger updated."

# RULES

- Never show raw JSON. Format as tables or short prose.
- Always LIMIT queries.
- Synthea names use LIKE+LOWER, never =.
- recordDecision and createTask both pause for human approval — that is
  the human-in-the-loop. Treat the approval as the coordinator's decision,
  not yours.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a reminder unrelated to a patient, use the schedule tool.`,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: inlineDataUrls(await convertToModelMessages(this.messages)),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        // ── Writeback (HITL-gated) ────────────────────────────────────
        // Closed-loop: agent drafts → coordinator approves in a dialog →
        // tool persists to the DO's SQLite → audit sidebar refreshes.

        recordDecision: tool({
          description:
            "Record a coordinator-approved decision for a specific patient. " +
            "Call AFTER drafting an outreach message. The coordinator will see " +
            "an approval dialog where they can edit the draft and add a " +
            "coordinator_note (their local knowledge, e.g. 'daughter drives Tuesdays') " +
            "before this writes to the audit ledger.",
          inputSchema: z.object({
            patient_id: z
              .string()
              .describe("The Synthea patient UUID returned from queryDatabase"),
            patient_name: z
              .string()
              .describe(
                "Full patient name including the Synthea numeric suffixes, e.g. 'Lindsay928 Brekke496'"
              ),
            action: z
              .string()
              .describe(
                "Short imperative phrase, e.g. 'Outreach: schedule migraine follow-up'"
              ),
            draft_message: z
              .string()
              .describe(
                "The full outreach message draft, 2–3 sentences, addressed to the patient"
              ),
            coordinator_note: z
              .string()
              .optional()
              .describe(
                "Optional coordinator local-knowledge note that contextualizes the decision"
              )
          }),
          needsApproval: async () => true,
          execute: async ({
            patient_id,
            patient_name,
            action,
            draft_message,
            coordinator_note
          }) => {
            const id = `d_${Date.now().toString(36)}`;
            this.sql`
              INSERT INTO decisions
                (id, patient_id, patient_name, action, draft_message, coordinator_note)
              VALUES
                (${id}, ${patient_id}, ${patient_name}, ${action},
                 ${draft_message}, ${coordinator_note ?? null})
            `;
            this.broadcast(
              JSON.stringify({
                type: "decision-recorded",
                id,
                patient_name,
                action
              })
            );
            return { id, patient_name, action, status: "approved" };
          }
        }),

        createTask: tool({
          description:
            "Create a follow-up task tied to a recorded decision. Call this " +
            "IMMEDIATELY after recordDecision returns success. The coordinator " +
            "approves the due date and action in a dialog before the task is created.",
          inputSchema: z.object({
            decision_id: z
              .string()
              .describe("The id returned by recordDecision (format: d_xxx)"),
            patient_id: z.string(),
            due_date: z
              .string()
              .describe(
                "Calendar date in YYYY-MM-DD when the task should be done. Choose within 7 days."
              ),
            action: z
              .string()
              .describe(
                "One-line imperative task, e.g. 'Call patient to schedule migraine follow-up'"
              )
          }),
          needsApproval: async () => true,
          execute: async ({ decision_id, patient_id, due_date, action }) => {
            const id = `t_${Date.now().toString(36)}`;
            this.sql`
              INSERT INTO tasks (id, decision_id, patient_id, due_date, action)
              VALUES (${id}, ${decision_id}, ${patient_id}, ${due_date}, ${action})
            `;
            this.broadcast(
              JSON.stringify({ type: "task-created", id, decision_id, action })
            );
            return {
              id,
              decision_id,
              patient_id,
              due_date,
              action,
              status: "pending"
            };
          }
        }),

        // Healthcare data: query the shared D1 patient dataset (read-only)
        queryDatabase: tool({
          description:
            "Execute a SQL SELECT query against the patient dataset. " +
            "Use patient_summary as your starting point — it has one row per patient " +
            "with pre-computed visit counts, costs, and care plan flags. " +
            "Tables: patients, encounters, conditions, medications, " +
            "observations, procedures, claims_transactions, careplans. " +
            "IMPORTANT: claims_transactions joins on PATIENTID, not PATIENT.",
          inputSchema: z.object({
            sql: z
              .string()
              .describe("A valid SQL SELECT statement. Always include a LIMIT clause.")
          }),
          execute: async ({ sql }) => {
            const res = await fetch(
              "https://uic-hackathon-data.christian-7f4.workers.dev/query",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sql })
              }
            );
            return (await res.json()) as object;
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
      stopWhen: stepCountIs(20),
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
