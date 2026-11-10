CREATE TABLE "coach_tries" (
	"line_hash" text NOT NULL,
	"ply" integer NOT NULL,
	"tried" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "coach_tries_line_hash_ply_tried_pk" PRIMARY KEY("line_hash","ply","tried")
);
--> statement-breakpoint
ALTER TABLE "coach_tries" ADD CONSTRAINT "coach_tries_line_hash_reviews_line_hash_fk" FOREIGN KEY ("line_hash") REFERENCES "public"."reviews"("line_hash") ON DELETE cascade ON UPDATE no action;