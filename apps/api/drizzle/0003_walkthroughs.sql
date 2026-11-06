CREATE TABLE "walkthroughs" (
	"line_hash" text NOT NULL,
	"side" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "walkthroughs_line_hash_side_pk" PRIMARY KEY("line_hash","side")
);
--> statement-breakpoint
ALTER TABLE "walkthroughs" ADD CONSTRAINT "walkthroughs_line_hash_reviews_line_hash_fk" FOREIGN KEY ("line_hash") REFERENCES "public"."reviews"("line_hash") ON DELETE cascade ON UPDATE no action;