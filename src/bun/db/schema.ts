import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import type { UIMessage } from "ai";

// ============================================
// PROJECTS
// ============================================

type CodebaseMemory = {
  conventions: string[];
  architecture: string[];
  knownGotchas: string[];
};

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  description: text("description"),
  codebaseMemory: text("codebase_memory", { mode: "json" }).$type<CodebaseMemory>(),
  lastOpened: integer("last_opened", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ============================================
// INTENT
// ============================================

export const intents = sqliteTable("intents", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),

  title: text("title").notNull(),
  description: text("description"),

  type: text("type", {
    enum: ["feature", "experiment"],
  }).notNull(),

  status: text("status", {
    enum: ["active", "completed", "killed", "blocked"],
  })
    .notNull()
    .default("active"),

  experimentVerdict: text("experiment_verdict", {
    enum: ["kept", "killed"],
  }),

  parentIntentId: text("parent_intent_id").references(() => intents.id, {
    onDelete: "set null",
  }),

  phases: text("phases", { mode: "json" }).$type<
    Array<{
      id: string;
      title: string;
      order: number;
      status: "completed" | "active" | "blocked";
    }>
  >(),

  notes: text("notes"),

  order: integer("order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ============================================
// TASK
// ============================================

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  intentId: text("intent_id")
    .notNull()
    .references(() => intents.id, { onDelete: "cascade" }),

  phaseId: text("phase_id"),

  title: text("title").notNull(),
  description: text("description"),

  status: text("status", {
    enum: ["pending", "in_progress", "completed", "blocked"],
  })
    .notNull()
    .default("pending"),

  blockedByTaskId: text("blocked_by_task_id").references(() => tasks.id, {
    onDelete: "set null",
  }),

  fromExperimentId: text("from_experiment_id").references(() => intents.id, {
    onDelete: "set null",
  }),

  order: integer("order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ============================================
// SESSION
// ============================================

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  intentId: text("intent_id").references(() => intents.id, {
    onDelete: "set null",
  }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),

  title: text("title"),

  mode: text("mode", {
    enum: ["build", "plan", "debug", "experiment"],
  })
    .notNull()
    .default("build"),

  gitBranch: text("git_branch"),

  status: text("status", {
    enum: ["active", "completed"],
  })
    .notNull()
    .default("active"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ============================================
// MESSAGE
// ============================================

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),

  role: text("role", {
    enum: ["user", "assistant", "system"],
  }).notNull(),

  parts: text("parts", { mode: "json" })
    .$type<UIMessage["parts"]>()
    .notNull(),

  model: text("model"),
  tokenCount: integer("token_count"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ============================================
// DECISION
// ============================================

export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  intentId: text("intent_id")
    .notNull()
    .references(() => intents.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),

  title: text("title").notNull(),
  description: text("description"),

  verdict: text("verdict", {
    enum: ["kept", "killed", "chose", "set"],
  }).notNull(),

  impact: text("impact", {
    enum: ["high", "normal"],
  })
    .notNull()
    .default("normal"),

  source: text("source", {
    enum: ["experiment", "research", "session"],
  })
    .notNull()
    .default("session"),

  sourceExperimentId: text("source_experiment_id").references(
    () => intents.id,
    { onDelete: "set null" },
  ),

  sessionCount: integer("session_count").default(0),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ============================================
// HISTORY EVENT
// ============================================

export const historyEvents = sqliteTable("history_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  intentId: text("intent_id").references(() => intents.id, {
    onDelete: "set null",
  }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  sessionId: text("session_id").references(() => sessions.id, {
    onDelete: "set null",
  }),

  type: text("type", {
    enum: [
      "commit",
      "experiment_start",
      "experiment_verdict",
      "plan_revision",
      "plan_created",
      "task_completed",
      "intent_completed",
    ],
  }).notNull(),

  title: text("title").notNull(),
  commitHash: text("commit_hash"),
  filesCount: integer("files_count"),

  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ============================================
// RELATIONS
// ============================================

export const projectsRelations = relations(projects, ({ many }) => ({
  intents: many(intents),
  sessions: many(sessions),
  decisions: many(decisions),
  historyEvents: many(historyEvents),
}));

export const intentsRelations = relations(intents, ({ one, many }) => ({
  project: one(projects, {
    fields: [intents.projectId],
    references: [projects.id],
  }),
  parentIntent: one(intents, {
    fields: [intents.parentIntentId],
    references: [intents.id],
    relationName: "parentChild",
  }),
  childIntents: many(intents, { relationName: "parentChild" }),
  tasks: many(tasks),
  sessions: many(sessions),
  decisions: many(decisions),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  intent: one(intents, {
    fields: [tasks.intentId],
    references: [intents.id],
  }),
  blockedByTask: one(tasks, {
    fields: [tasks.blockedByTaskId],
    references: [tasks.id],
    relationName: "taskBlocking",
  }),
  blockingTasks: many(tasks, { relationName: "taskBlocking" }),
  fromExperiment: one(intents, {
    fields: [tasks.fromExperimentId],
    references: [intents.id],
  }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  task: one(tasks, {
    fields: [sessions.taskId],
    references: [tasks.id],
  }),
  intent: one(intents, {
    fields: [sessions.intentId],
    references: [intents.id],
  }),
  project: one(projects, {
    fields: [sessions.projectId],
    references: [projects.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
}));

export const decisionsRelations = relations(decisions, ({ one }) => ({
  intent: one(intents, {
    fields: [decisions.intentId],
    references: [intents.id],
  }),
  project: one(projects, {
    fields: [decisions.projectId],
    references: [projects.id],
  }),
  sourceExperiment: one(intents, {
    fields: [decisions.sourceExperimentId],
    references: [intents.id],
  }),
}));

export const historyEventsRelations = relations(historyEvents, ({ one }) => ({
  project: one(projects, {
    fields: [historyEvents.projectId],
    references: [projects.id],
  }),
  intent: one(intents, {
    fields: [historyEvents.intentId],
    references: [intents.id],
  }),
  task: one(tasks, {
    fields: [historyEvents.taskId],
    references: [tasks.id],
  }),
  session: one(sessions, {
    fields: [historyEvents.sessionId],
    references: [sessions.id],
  }),
}));
