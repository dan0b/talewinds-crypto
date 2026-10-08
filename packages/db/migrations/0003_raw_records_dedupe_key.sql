-- Deduplicate raw records by a sha256 of (provider, request key, content hash) instead of the raw
-- columns: a btree index entry can't exceed ~2.7 KB, and batched request keys (50 coin IDs in one
-- DefiLlama call) are longer than that.
DROP INDEX "raw_records_dedupe";
--> statement-breakpoint
ALTER TABLE "raw_records" ADD COLUMN "dedupe_key" text;
--> statement-breakpoint
-- Backfilling existing rows is a schema change, not an edit of the evidence: payloads are untouched.
-- The insert-only trigger is suspended only for this statement, within this migration's transaction.
-- Must match dedupeKeyOf() in packages/db/src/repos/raw.ts.
ALTER TABLE "raw_records" DISABLE TRIGGER raw_records_insert_only;
--> statement-breakpoint
UPDATE "raw_records"
SET "dedupe_key" = encode(
  sha256(convert_to("provider" || E'\n' || "request_key" || E'\n' || "content_hash", 'UTF8')),
  'hex'
);
--> statement-breakpoint
ALTER TABLE "raw_records" ENABLE TRIGGER raw_records_insert_only;
--> statement-breakpoint
ALTER TABLE "raw_records" ALTER COLUMN "dedupe_key" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "raw_records" ADD CONSTRAINT "raw_records_dedupe_key_unique" UNIQUE("dedupe_key");
