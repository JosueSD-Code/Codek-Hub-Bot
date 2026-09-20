import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { isAdmin,roleIdsByName } from '../apps/bot/src/utils/permissions.js';
import { isHexColor,requiredText,safeUrl,isUnicodeEmoji } from '../apps/bot/src/utils/validation.js';

test('isAdmin acepta GuildMember e Interaction',()=>{
  const permissions=new PermissionsBitField([PermissionFlagsBits.Administrator]);
  assert.equal(isAdmin({permissions}),true);
  assert.equal(isAdmin({memberPermissions:permissions}),true);
  assert.equal(isAdmin({member:{permissions}}),true);
  assert.equal(isAdmin({memberPermissions:new PermissionsBitField()}),false);
});

test('isHexColor valida HEX de seis dígitos',()=>{
  assert.equal(isHexColor('#5865F2'),true);
  assert.equal(isHexColor('fff'),false);
});

test('safeUrl solo acepta http/https',()=>{
  assert.equal(safeUrl('https://example.com'),'https://example.com/');
  assert.equal(safeUrl('javascript:alert(1)'),null);
  assert.equal(safeUrl('data:text/html,test'),null);
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

test('roleIdsByName elimina duplicados y compara sin distinguir mayúsculas',()=>{
  const roles={cache:new Map([
    ['1',{id:'1',name:'Soporte'}],
    ['2',{id:'2',name:'Moderación'}]
  ])};
  assert.deepEqual(roleIdsByName({roles},' soporte, SOPORTE, moderación '),['1','2']);
});
