import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAssignOrganizationRole,
  canRemoveOrganizationMember,
  orgRoleHasPermission,
  platformRoleHasPermission,
} from "./permissions";

test("organization members cannot manage members", () => {
  assert.equal(orgRoleHasPermission("ORGANIZATION_MEMBER", "members:invite"), false);
  assert.equal(orgRoleHasPermission("ORGANIZATION_MEMBER", "contacts:read"), true);
});

test("only owners can delete the organization or manage billing", () => {
  assert.equal(orgRoleHasPermission("ORGANIZATION_ADMIN", "org:delete"), false);
  assert.equal(orgRoleHasPermission("ORGANIZATION_ADMIN", "billing:write"), false);
  assert.equal(orgRoleHasPermission("ORGANIZATION_OWNER", "org:delete"), true);
});

test("admins cannot grant or revoke ownership", () => {
  assert.equal(canAssignOrganizationRole("ORGANIZATION_ADMIN", "ORGANIZATION_MEMBER", "ORGANIZATION_OWNER"), false);
  assert.equal(canAssignOrganizationRole("ORGANIZATION_ADMIN", "ORGANIZATION_OWNER", "ORGANIZATION_MEMBER"), false);
  assert.equal(canAssignOrganizationRole("ORGANIZATION_ADMIN", "ORGANIZATION_MEMBER", "ORGANIZATION_ADMIN"), true);
  assert.equal(canAssignOrganizationRole("ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "ORGANIZATION_OWNER"), true);
  assert.equal(canAssignOrganizationRole("ORGANIZATION_MEMBER", "ORGANIZATION_MEMBER", "ORGANIZATION_MEMBER"), false);
});

test("members cannot be removed by lower-ranked actors", () => {
  assert.equal(canRemoveOrganizationMember("ORGANIZATION_ADMIN", "ORGANIZATION_OWNER"), false);
  assert.equal(canRemoveOrganizationMember("ORGANIZATION_ADMIN", "ORGANIZATION_MEMBER"), true);
  assert.equal(canRemoveOrganizationMember("ORGANIZATION_MEMBER", "ORGANIZATION_MEMBER"), false);
});

test("support staff cannot read messaging secrets or sensitive payments", () => {
  assert.equal(platformRoleHasPermission("SUPPORT", "admin:messaging-secrets:read"), false);
  assert.equal(platformRoleHasPermission("SUPPORT", "admin:payments:sensitive"), false);
  assert.equal(platformRoleHasPermission("SUPPORT", "admin:tickets:write"), true);
  assert.equal(platformRoleHasPermission("ADMIN", "admin:messaging-secrets:read"), false);
  assert.equal(platformRoleHasPermission("SUPER_ADMIN", "admin:messaging-secrets:read"), true);
});

test("users without a platform role have no admin permission", () => {
  assert.equal(platformRoleHasPermission(null, "admin:dashboard"), false);
  assert.equal(platformRoleHasPermission(undefined, "admin:dashboard"), false);
});
