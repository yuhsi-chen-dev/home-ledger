CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"picture" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
