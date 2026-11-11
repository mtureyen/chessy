CREATE TABLE "repertoire_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"side" text NOT NULL,
	"title" text NOT NULL,
	"moves" text NOT NULL,
	"opening_id" text,
	"source" text NOT NULL,
	"level" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"added_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "repertoire_lines_side_moves" ON "repertoire_lines" USING btree ("side","moves");