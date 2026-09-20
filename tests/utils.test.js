import test from 'node:test';
import assert from 'node:assert/strict';
import { isHexColor,requiredText,safeUrl } from '../apps/bot/src/utils/validation.js';

test('isHexColor valida HEX de seis dígitos',()=>{
  assert.equal(isHexColor('#5865F2'),true);
  assert.equal(isHexColor('fff'),false);
});

test('safeUrl solo acepta http/https',()=>{
  assert.equal(safeUrl('https://example.com'),'https://example.com/');
  assert.equal(safeUrl('javascript:alert(1)'),null);
});

test('requiredText rechaza valores vacíos',()=>{
  assert.throws(()=>requiredText('   ','Nombre'));
  assert.equal(requiredText(' Codek ','Nombre'),'Codek');
});
