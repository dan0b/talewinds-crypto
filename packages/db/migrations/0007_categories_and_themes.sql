CREATE TABLE "coin_tags" (
	"coin_key" text NOT NULL,
	"tag_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coin_tags_coin_key_tag_id_pk" PRIMARY KEY("coin_key","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_id_kind" UNIQUE("id","kind"),
	CONSTRAINT "tags_kind" CHECK ("tags"."kind" in ('category', 'theme'))
);
--> statement-breakpoint
ALTER TABLE "coin_tags" ADD CONSTRAINT "coin_tags_tag_id_kind_tags_id_kind_fk" FOREIGN KEY ("tag_id","kind") REFERENCES "public"."tags"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coin_tags_one_category" ON "coin_tags" USING btree ("coin_key") WHERE "coin_tags"."kind" = 'category';--> statement-breakpoint
CREATE INDEX "coin_tags_tag_idx" ON "coin_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_kind_name" ON "tags" USING btree ("kind",lower("name"));