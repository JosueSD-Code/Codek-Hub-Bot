import test from 'node:test';
import assert from 'node:assert/strict';
import { renderVariables, buildPlaceholderCatalog } from './variables.js';

test('renderVariables replaces known placeholders', () => {
  const output = renderVariables('Welcome {user} to {guild_name}', {
    user: 'Josue',
    guildName: 'Codek Hub',
  });

  assert.equal(output, 'Welcome Josue to Codek Hub');
});

test('buildPlaceholderCatalog exposes the variable registry', () => {
  const items = buildPlaceholderCatalog();
  assert.ok(Array.isArray(items));
  assert.ok(items.some((item) => item.key === 'user'));
});
