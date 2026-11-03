-- Rows written through Bun's Postgres client held their JSON as a string scalar (encoded twice);
-- turn those back into the objects they encode.
UPDATE "games" SET "data" = ("data" #>> '{}')::jsonb WHERE jsonb_typeof("data") = 'string';
--> statement-breakpoint
UPDATE "reviews" SET "data" = ("data" #>> '{}')::jsonb WHERE jsonb_typeof("data") = 'string';
--> statement-breakpoint
UPDATE "profiles" SET "data" = ("data" #>> '{}')::jsonb WHERE jsonb_typeof("data") = 'string';
