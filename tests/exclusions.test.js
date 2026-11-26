import test from 'node:test';
import assert from 'node:assert/strict';
import { isExcluded, MAX_EXCLUDED_SITES, sanitizeExclusions } from '../lib/core.js';

test('sanitizeExclusions keeps valid unique domains only', () => {
  assert.deepEqual(sanitizeExclusions(['Mail.Google.com', 'https://github.com/x', 'mail.google.com', 'not a domain', '', null]), ['mail.google.com', 'github.com']);
  assert.deepEqual(sanitizeExclusions('github.com'), []);
  assert.equal(sanitizeExclusions(Array.from({ length: 150 }, (_, i) => `site${i}.com`)).length, MAX_EXCLUDED_SITES);
});

test('isExcluded matches the domain and its subdomains, nothing else', () => {
  assert.equal(isExcluded('https://mail.google.com/u/0', ['google.com']), true);
  assert.equal(isExcluded('https://google.com/', ['google.com']), true);
  assert.equal(isExcluded('https://docs.google.com/', ['mail.google.com']), false);
  assert.equal(isExcluded('https://notgoogle.com/', ['google.com']), false);
  assert.equal(isExcluded('chrome://settings', ['settings']), false);
  assert.equal(isExcluded('https://github.com/', []), false);
});
