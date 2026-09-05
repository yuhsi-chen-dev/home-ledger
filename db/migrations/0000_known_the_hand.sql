CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"amount" integer NOT NULL,
	"category" text NOT NULL,
	"vendor" text NOT NULL,
	"project_group" text,
	"due_date" date,
	"paid" boolean DEFAULT false NOT NULL,
	"paid_date" date,
	"method" text,
	"payer" text NOT NULL,
	"split" text DEFAULT 'half' NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"settled_date" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "expenses_due_idx" ON "expenses" USING btree ("paid","due_date");