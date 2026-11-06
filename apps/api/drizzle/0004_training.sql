CREATE TABLE "training_progress" (
	"line_hash" text NOT NULL,
	"ply" integer NOT NULL,
	"misses" integer NOT NULL,
	"due_at" timestamp with time zone,
	CONSTRAINT "training_progress_line_hash_ply_pk" PRIMARY KEY("line_hash","ply")
);
--> statement-breakpoint
ALTER TABLE "training_progress" ADD CONSTRAINT "training_progress_line_hash_reviews_line_hash_fk" FOREIGN KEY ("line_hash") REFERENCES "public"."reviews"("line_hash") ON DELETE cascade ON UPDATE no action;