import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from '../apps/bot/src/services/moderationService.js';
import { handleDiscordError } from '../apps/bot/src/middleware/validation.js';
import { commands } from '../apps/bot/src/commands/index.js';

test('parseDuration convierte unidades comunes',()=>{
  assert.equal(parseDuration('30m').seconds,1800);
  assert.equal(parseDuration('2h').seconds,7200);
  assert.equal(parseDuration('1d').seconds,86400);
  assert.equal(parseDuration('bad'),null);
});

test('handleDiscordError traduce códigos conocidos',()=>{
  assert.equal(handleDiscordError({code:50013}),'No tengo permisos suficientes.');
  assert.match(handleDiscordError({code:12345,message:'x'}),/Error de Discord: x/);
});


test('el registro de comandos se serializa sin duplicados',()=>{
  const json=commands.map(command=>command.toJSON());
  assert.equal(new Set(json.map(command=>command.name)).size,json.length);
  assert.ok(json.some(command=>command.name==='tickets'));
  assert.ok(json.some(command=>command.name==='automod'));
  assert.ok(json.some(command=>command.name==='giveaway'));
});

test('parseDuration rechaza overflow numérico',()=>{
  assert.equal(parseDuration('999999999999999999999999w'),null);
});
