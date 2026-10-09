ALTER TABLE "wallets" DROP CONSTRAINT "wallets_family";--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_family" CHECK ("wallets"."family" in ('evm', 'solana', 'bitcoin'));