import test from 'node:test';
import assert from 'node:assert/strict';
import { renderVariables, VARIABLES } from '../packages/shared/src/variables.js';

test('renderVariables reemplaza variables legibles',()=>{
  const result=renderVariables('{username} • {server} • {category}',{
    username:'Josue',
    server:'Codek Hub',
    category:'Soporte'
  });
  assert.equal(result,'Josue • Codek Hub • Soporte');
});

test('renderVariables conserva variables desconocidas',()=>{
  assert.equal(renderVariables('Hola {unknown}',{}),'Hola {unknown}');
});

test('las variables internas por ID no forman parte del contrato público',()=>{
  for(const variable of ['userid','guildid','channelid','ticketid','clientid','targetid']){
    assert.equal(VARIABLES.includes(variable),false);
  }
});
