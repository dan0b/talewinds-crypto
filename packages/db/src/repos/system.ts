import { desc, lt } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { workerHeartbeats } from '../schema/index.ts';

export type HeartbeatRow = typeof workerHeartbeats.$inferSelect;

export async function recordHeartbeat(
  db: Db,
  beat: { workerId: string; hostname: string; pid: number; startedAt: Date },
): Promise<void> {
  const now = new Date();
  await db
    .insert(workerHeartbeats)
    .values({ ...beat, lastSeenAt: now })
    .onConflictDoUpdate({ target: workerHeartbeats.workerId, set: { lastSeenAt: now } });
}

export async function latestHeartbeat(db: Db): Promise<HeartbeatRow | null> {
  const [row] = await db
    .select()
    .from(workerHeartbeats)
    .orderBy(desc(workerHeartbeats.lastSeenAt))
    .limit(1);
  return row ?? null;
}

/** Delete rows for workers not seen since `before` (each restart gets a new worker ID). */
export async function pruneHeartbeats(db: Db, before: Date): Promise<number> {
  const deleted = await db
    .delete(workerHeartbeats)
    .where(lt(workerHeartbeats.lastSeenAt, before))
    .returning({ workerId: workerHeartbeats.workerId });
  return deleted.length;
}
