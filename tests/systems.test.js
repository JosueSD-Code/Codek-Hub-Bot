import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from '../apps/bot/src/services/moderationService.js';
import { handleDiscordError } from '../apps/bot/src/middleware/validation.js';
import { commands } from '../apps/bot/src/commands/index.js';
import { isAdmin, roleIdsByName } from '../apps/bot/src/utils/permissions.js';
import { isHexColor, safeUrl, isUnicodeEmoji, requiredText } from '../apps/bot/src/utils/validation.js';
import { renderVariables } from '../packages/shared/src/variables.js';

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


test('isAdmin acepta GuildMember e Interaction',()=>{
  const permissions={has:value=>Boolean(value)};
  assert.equal(isAdmin({permissions}),true);
  assert.equal(isAdmin({memberPermissions:permissions}),true);
  assert.equal(isAdmin({member:{permissions}}),true);
});

test('isHexColor valida HEX de seis dígitos',()=>{
  assert.equal(isHexColor('5865F2'),true);
  assert.equal(isHexColor('#5865F2'),true);
  assert.equal(isHexColor('5865F'),false);
  assert.equal(isHexColor('GGGGGG'),false);
});

test('safeUrl solo acepta http/https',()=>{
  assert.equal(safeUrl('https://example.com/path')?.startsWith('https://'),true);
  assert.equal(safeUrl('http://example.com/path')?.startsWith('http://'),true);
  assert.equal(safeUrl('javascript:alert(1)'),null);
  assert.equal(safeUrl('ftp://example.com'),null);
});

test('isUnicodeEmoji distingue emoji de texto arbitrario',()=>{
  assert.equal(isUnicodeEmoji('😀'),true);
  assert.equal(isUnicodeEmoji('🇪🇨'),true);
  assert.equal(isUnicodeEmoji('hola'),false);
  assert.equal(isUnicodeEmoji('😀😀'),false);
});

test('requiredText rechaza valores vacíos',()=>{
  assert.equal(requiredText(' hola '),'hola');
  assert.throws(()=>requiredText('   '),/obligatorio/);
});

test('roleIdsByName elimina duplicados y compara sin distinguir mayúsculas',()=>{
  const guild={roles:{cache:new Map([
    ['1',{id:'1',name:'Soporte'}],
    ['2',{id:'2',name:'Admin'}]
  ])}};
  assert.deepEqual(roleIdsByName(guild,'soporte, SOPORTE, admin'),['1','2']);
});

test('renderVariables reemplaza variables legibles',()=>{
  assert.equal(renderVariables('Hola {user} en {server}',{user:'@Josue',server:'MineFlag'}),'Hola @Josue en MineFlag');
});

test('renderVariables conserva variables desconocidas',()=>{
  assert.equal(renderVariables('Hola {unknown}',{user:'@Josue'}),'Hola {unknown}');
});

test('las variables internas por ID no forman parte del contrato público',()=>{
  const output=renderVariables('{userid} {guildid} {channelid}',{userid:'123',guildid:'456',channelid:'789'});
  assert.equal(output,'{userid} {guildid} {channelid}');
});
