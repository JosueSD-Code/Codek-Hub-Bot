import test from 'node:test';
import assert from 'node:assert/strict';

import { findMatchingAutoResponder } from './db.js';

test('findMatchingAutoResponder matches trigger text in a message regardless of case', () => {
  const responder = findMatchingAutoResponder('hello codek hub', [
    { trigger: 'codek hub', response: 'welcome' },
  ]);

  assert.ok(responder);
  assert.equal(responder.response, 'welcome');
});

test('findMatchingAutoResponder returns null when no trigger matches', () => {
  const responder = findMatchingAutoResponder('random message', [
    { trigger: 'support', response: 'need help?' },
  ]);

  assert.equal(responder, null);
});
