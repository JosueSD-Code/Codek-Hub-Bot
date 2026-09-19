import test from 'node:test';
import assert from 'node:assert/strict';
import { userCanManageGuild } from './permissions.js';

test('userCanManageGuild allows guild owners', () => {
  const result = userCanManageGuild({ id: 'user-1', roles: [] }, { ownerId: 'user-1', adminRoleIds: ['r-2'], modRoleIds: [] });
  assert.equal(result, true);
});

test('userCanManageGuild checks configured roles', () => {
  const result = userCanManageGuild({ id: 'user-2', roles: [{ id: 'r-2' }] }, { ownerId: 'user-1', adminRoleIds: ['r-2'], modRoleIds: [] });
  assert.equal(result, true);
});
