CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"white_name" text NOT NULL,
	"white_rating" integer,
	"black_name" text NOT NULL,
	"black_rating" integer,
	"result" text NOT NULL,
	"speed" text NOT NULL,
	"rated" boolean NOT NULL,
	"opening_eco" text,
	"opening_name" text,
	"line_hash" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_moves" (
	"line_hash" text NOT NULL,
	"ply" integer NOT NULL,
	"color" text NOT NULL,
	"san" text NOT NULL,
	"uci" text NOT NULL,
	"classification" text NOT NULL,
	"win_before" real NOT NULL,
	"win_after" real NOT NULL,
	"accuracy" real NOT NULL,
	"best_uci" text,
	CONSTRAINT "review_moves_line_hash_ply_pk" PRIMARY KEY("line_hash","ply")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"line_hash" text PRIMARY KEY NOT NULL,
	"start_fen" text NOT NULL,
	"moves" text[] NOT NULL,
	"engine" text NOT NULL,
	"nodes" integer NOT NULL,
	"accuracy_white" real,
	"accuracy_black" real,
	"reviewed_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_moves" ADD CONSTRAINT "review_moves_line_hash_reviews_line_hash_fk" FOREIGN KEY ("line_hash") REFERENCES "public"."reviews"("line_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "games_source_external_id" ON "games" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "games_played_at" ON "games" USING btree ("played_at");--> statement-breakpoint
CREATE INDEX "games_line_hash" ON "games" USING btree ("line_hash");--> statement-breakpoint
CREATE INDEX "review_moves_classification" ON "review_moves" USING btree ("classification");