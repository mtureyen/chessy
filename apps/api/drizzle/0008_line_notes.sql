CREATE TABLE "opening_line_notes" (
	"opening_id" text NOT NULL,
	"moves" text NOT NULL,
	"written_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "opening_line_notes_opening_id_moves_pk" PRIMARY KEY("opening_id","moves")
);
