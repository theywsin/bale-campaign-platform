-- Row-level security: a second tenant-isolation layer under the application's own checks.
--
-- The API runs each query of an organization-scoped request as the restricted role
-- bcp_app with app.org_id set to that organization (SET LOCAL inside a transaction).
-- Rows of other organizations are then invisible and cannot be written.
-- Background services (worker, scheduler) and platform-admin requests do not set
-- app.org_id and keep using the connecting role; the policy lets them through.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bcp_app') THEN
    CREATE ROLE bcp_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

-- The connecting role must be able to SET ROLE bcp_app.
DO $$
BEGIN
  EXECUTE format('GRANT bcp_app TO %I', current_user);
EXCEPTION WHEN duplicate_object OR invalid_grant_operation THEN NULL;
END
$$;

GRANT USAGE ON SCHEMA public TO bcp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bcp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bcp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bcp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO bcp_app;


ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organization_members"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invitations"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contacts"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE "contact_lists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_lists" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contact_lists"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE "suppression_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppression_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "suppression_entries"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE "contact_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_imports" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contact_imports"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE "messaging_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messaging_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "messaging_accounts"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaigns"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE "campaign_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_recipients" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaign_recipients"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscriptions"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "orders"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_tickets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "support_tickets"
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL OR organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
