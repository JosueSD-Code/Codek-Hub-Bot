import test from 'node:test';
import assert from 'node:assert/strict';

import { getDiscordPresence, snapshotPresence } from './discordProfileService.js';

test('snapshotPresence stores official gateway presence payloads in memory', () => {
  const result = snapshotPresence({
    userId: '123456789',
    guildId: 'guild-42',
    status: 'online',
    activities: [{
      name: 'Visual Studio Code',
      type: 0,
      state: 'Editing',
      details: 'Codek Hub',
      created_at: 1710000000000,
    }],
    updatedAt: '2026-09-06T00:00:00.000Z',
  });

  assert.equal(result.status, 'online');
  assert.equal(result.guildId, 'guild-42');
  assert.equal(result.activities.length, 1);
  assert.equal(result.activities[0].name, 'Visual Studio Code');
});

test('getDiscordPresence falls back to null values when no gateway event is available yet', async () => {
  const result = await getDiscordPresence('987654321');

  assert.equal(result.status, null);
  assert.deepEqual(result.activities, []);
  assert.equal(result.source, 'unavailable');
  assert.match(result.note, /unavailable|Gateway|presence/i);
});
