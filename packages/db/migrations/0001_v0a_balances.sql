CREATE TABLE "asset_status_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"asset_id" uuid NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_status_history_status" CHECK ("asset_status_history"."status" in ('verified', 'unverified', 'spam')),
	CONSTRAINT "asset_status_history_source" CHECK ("asset_status_history"."source" in ('auto', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ref" text NOT NULL,
	"chain_id" text NOT NULL,
	"kind" text NOT NULL,
	"address" text,
	"symbol" text,
	"name" text,
	"decimals" integer NOT NULL,
	"decimals_source" text NOT NULL,
	"metadata_source" text,
	"status" text DEFAULT 'unverified' NOT NULL,
	"status_source" text DEFAULT 'auto' NOT NULL,
	"price_miss_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_ref_unique" UNIQUE("ref"),
	CONSTRAINT "assets_kind" CHECK ("assets"."kind" in ('native', 'token')),
	CONSTRAINT "assets_status" CHECK ("assets"."status" in ('verified', 'unverified', 'spam')),
	CONSTRAINT "assets_status_source" CHECK ("assets"."status_source" in ('auto', 'manual')),
	CONSTRAINT "assets_shape" CHECK (("assets"."kind" = 'native' and "assets"."address" is null) or ("assets"."kind" = 'token' and "assets"."address" is not null)),
	CONSTRAINT "assets_decimals" CHECK ("assets"."decimals" between 0 and 255)
);
--> statement-breakpoint
CREATE TABLE "balance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"raw_amount" numeric(78, 0) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"raw_record_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"asset_id" uuid NOT NULL,
	"price_usd" numeric NOT NULL,
	"source" text NOT NULL,
	"confidence" text NOT NULL,
	"priced_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"raw_record_id" uuid NOT NULL,
	CONSTRAINT "price_observations_confidence" CHECK ("price_observations"."confidence" in ('high', 'low'))
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sync_runs_kind" CHECK ("sync_runs"."kind" in ('balances')),
	CONSTRAINT "sync_runs_status" CHECK ("sync_runs"."status" in ('running', 'succeeded', 'partial', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "raw_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider" text NOT NULL,
	"request_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"first_fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_status_history" ADD CONSTRAINT "asset_status_history_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_raw_record_id_raw_records_id_fk" FOREIGN KEY ("raw_record_id") REFERENCES "public"."raw_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_raw_record_id_raw_records_id_fk" FOREIGN KEY ("raw_record_id") REFERENCES "public"."raw_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_status_history_asset_idx" ON "asset_status_history" USING btree ("asset_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_chain_idx" ON "assets" USING btree ("chain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "balance_snapshots_run_asset" ON "balance_snapshots" USING btree ("sync_run_id","asset_id");--> statement-breakpoint
CREATE INDEX "balance_snapshots_account_idx" ON "balance_snapshots" USING btree ("account_id","observed_at");--> statement-breakpoint
CREATE INDEX "price_observations_asset_idx" ON "price_observations" USING btree ("asset_id","priced_at");--> statement-breakpoint
CREATE INDEX "sync_runs_account_idx" ON "sync_runs" USING btree ("account_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_records_dedupe" ON "raw_records" USING btree ("provider","request_key","content_hash");