import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Liveness of background workers; the dashboard reads this for health. */
export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerId: text('worker_id').primaryKey(),
  hostname: text('hostname').notNull(),
  pid: integer('pid').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
});
