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


test('el wiring modular de Fase 2 carga correctamente',async()=>{
  const [bootstrap,interaction,components,commandHandler,events]=await Promise.all([
    import('../apps/bot/src/bootstrap.js'),
    import('../apps/bot/src/handlers/interactionHandler.js'),
    import('../apps/bot/src/interactions/componentHandler.js'),
    import('../apps/bot/src/interactions/commandHandler.js'),
    import('../apps/bot/src/events/index.js')
  ]);
  assert.equal(typeof bootstrap.startBot,'function');
  assert.equal(typeof interaction.registerInteractionHandler,'function');
  assert.equal(typeof components.handleComponentInteraction,'function');
  assert.equal(typeof commandHandler.handleCommandInteraction,'function');
  assert.equal(typeof events.registerEvents,'function');
});
