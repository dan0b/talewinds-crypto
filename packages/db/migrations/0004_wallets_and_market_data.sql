CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"family" text NOT NULL,
	"address" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_family" CHECK ("wallets"."family" in ('evm', 'solana'))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "market_cap_usd" numeric;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "fdv_usd" numeric;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "liquidity_usd" numeric;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "cross_check_source" text;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "cross_check_price_usd" numeric;--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_family_address" ON "wallets" USING btree ("family","address");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_wallet_idx" ON "accounts" USING btree ("wallet_id");--> statement-breakpoint
-- Group existing wallet accounts into wallets: one per (family, address), named from the oldest
-- account's label. The CASE has no ELSE on purpose: an unknown chain namespace makes the family
-- NULL and fails the migration loudly instead of guessing.
INSERT INTO "wallets" ("family", "address", "name")
SELECT DISTINCT ON (family, address) family, address, label
FROM (
  SELECT
    CASE WHEN chain_id LIKE 'eip155:%' THEN 'evm' WHEN chain_id LIKE 'solana:%' THEN 'solana' END AS family,
    address,
    label,
    created_at
  FROM "accounts"
  WHERE kind = 'wallet'
) grouped
ORDER BY family, address, created_at;--> statement-breakpoint
UPDATE "accounts" a
SET "wallet_id" = w.id
FROM "wallets" w
WHERE a.kind = 'wallet'
  AND w.address = a.address
  AND w.family = CASE WHEN a.chain_id LIKE 'eip155:%' THEN 'evm' WHEN a.chain_id LIKE 'solana:%' THEN 'solana' END;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_wallet_link" CHECK ("accounts"."kind" <> 'wallet' or "accounts"."wallet_id" is not null);