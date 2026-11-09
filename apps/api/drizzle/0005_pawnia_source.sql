-- Games played here were stored under the app's old name.
UPDATE "games" SET "source" = 'pawnia' WHERE "source" = 'chessy';
