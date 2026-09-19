import test from 'node:test';
import assert from 'node:assert/strict';
import { filterGuildsForBotAndAdmin } from './discordOauthService.js';

test('filterGuildsForBotAndAdmin keeps only bot-connected admin guilds', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [
      { id: 'guild-1', name: 'Admin Guild' },
      { id: 'guild-2', name: 'Not Admin Guild' },
      { id: 'guild-3', name: 'Bot not present' },
    ],
  });

  try {
    const result = await filterGuildsForBotAndAdmin([
      { id: 'guild-1', name: 'Admin Guild', owner: true, permissions: 0 },
      { id: 'guild-2', name: 'Not Admin Guild', owner: false, permissions: 0 },
      { id: 'guild-3', name: 'Bot not present', owner: false, permissions: 0x8 },
      { id: 'guild-4', name: 'Admin via permission', owner: false, permissions: 0x8 },
    ]);

    assert.deepEqual(result.map((guild) => guild.id), ['guild-1', 'guild-3']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
