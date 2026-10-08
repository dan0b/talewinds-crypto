-- raw_records holds provider responses exactly as received; everything derived from them can be
-- recomputed. Enforce "insert-only" in the database itself, so no code path (or bug) can edit or
-- delete the evidence. Row-level triggers don't fire on TRUNCATE, which tests use to reset.
CREATE FUNCTION raw_records_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'raw_records is insert-only (attempted %)', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER raw_records_insert_only
BEFORE UPDATE OR DELETE ON raw_records
FOR EACH ROW EXECUTE FUNCTION raw_records_forbid_mutation();
