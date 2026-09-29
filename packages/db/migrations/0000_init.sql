CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ref" text NOT NULL,
	"kind" text NOT NULL,
	"ownership" text NOT NULL,
	"chain_id" text,
	"address" text,
	"venue" text,
	"entity_id" uuid,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_ref_unique" UNIQUE("ref"),
	CONSTRAINT "accounts_kind" CHECK ("accounts"."kind" in ('wallet', 'venue')),
	CONSTRAINT "accounts_ownership" CHECK ("accounts"."ownership" in ('owned', 'tracked', 'observed')),
	CONSTRAINT "accounts_shape" CHECK (("accounts"."kind" = 'wallet' and "accounts"."chain_id" is not null and "accounts"."address" is not null and "accounts"."venue" is null)
       or ("accounts"."kind" = 'venue' and "accounts"."venue" is not null and "accounts"."chain_id" is null))
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"pid" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_ownership_idx" ON "accounts" USING btree ("ownership");--> statement-breakpoint
CREATE INDEX "accounts_address_idx" ON "accounts" USING btree ("address");--> statement-breakpoint
CREATE INDEX "accounts_entity_idx" ON "accounts" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_single_self" ON "entities" USING btree ("kind") WHERE "entities"."kind" = 'self';