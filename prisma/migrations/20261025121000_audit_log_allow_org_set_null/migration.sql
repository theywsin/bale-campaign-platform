-- Hand-written: audit log rows are append-only. The only permitted update is the
-- ON DELETE SET NULL of organization_id when an organization is hard-deleted.
-- Retention cleanup uses DELETE, which this trigger does not block.
CREATE OR REPLACE FUNCTION audit_logs_block_update() RETURNS trigger AS $$
BEGIN
  IF NEW.organization_id IS NULL
     AND (to_jsonb(NEW) - 'organization_id') = (to_jsonb(OLD) - 'organization_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;
