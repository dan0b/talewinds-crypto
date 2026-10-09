ALTER TABLE "assets" DROP CONSTRAINT "assets_kind";--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_shape";--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_kind" CHECK ("assets"."kind" in ('native', 'token', 'venue'));--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_shape" CHECK (("assets"."kind" in ('native', 'venue') and "assets"."address" is null) or ("assets"."kind" = 'token' and "assets"."address" is not null));