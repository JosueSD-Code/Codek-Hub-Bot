import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField, Collection } from 'discord.js';
import { isAdmin, roleIdsByName } from '../apps/bot/src/utils/permissions.js';
import { isHexColor,requiredText,safeUrl,isUnicodeEmoji } from '../apps/bot/src/utils/validation.js';

test('isAdmin acepta GuildMember e Interaction',()=>{
  const permissions=new PermissionsBitField([PermissionFlagsBits.Administrator]);
  assert.equal(isAdmin({permissions}),true);
  assert.equal(isAdmin({memberPermissions:permissions}),true);
  assert.equal(isAdmin({member:{permissions}}),true);
  assert.equal(isAdmin({memberPermissions:new PermissionsBitField()}),false);
});

test('roleIdsByName resuelve nombres sin importar mayúsculas y elimina duplicados',()=>{
  const roles=new Collection([
    ['1',{id:'1',name:'Soporte'}],
    ['2',{id:'2',name:'Moderador'}]
  ]);
  const guild={roles:{cache:roles}};
  assert.deepEqual(roleIdsByName(guild,'soporte, MODERADOR, soporte'),['1','2']);
  assert.deepEqual(roleIdsByName(guild,'No Existe'),[]);
});

test('isHexColor valida HEX de seis dígitos',()=>{
  assert.equal(isHexColor('#5865F2'),true);
  assert.equal(isHexColor('fff'),false);
});

test('safeUrl solo acepta http/https y rechaza credenciales',()=>{
  assert.equal(safeUrl('https://example.com'),'https://example.com/');
  assert.equal(safeUrl('javascript:alert(1)'),null);
  assert.equal(safeUrl('data:text/html,test'),null);
  assert.equal(safeUrl('https://user:pass@example.com'),null);
  assert.equal(safeUrl('   '),null);
});

test('isUnicodeEmoji distingue emoji de texto arbitrario',()=>{
  assert.equal(isUnicodeEmoji('🔥'),true);
  assert.equal(isUnicodeEmoji('🇪🇨'),true);
  assert.equal(isUnicodeEmoji('soporte'),false);
});

test('requiredText rechaza valores vacíos',()=>{
  assert.throws(()=>requiredText('   ','Nombre'));
  assert.equal(requiredText(' Codek ','Nombre'),'Codek');
});
