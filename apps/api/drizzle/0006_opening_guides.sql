CREATE TABLE "opening_guides" (
	"opening_id" text PRIMARY KEY NOT NULL,
	"written_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL
);
