import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalPageKey, cleanAnnotation, domainMatches, getCategory, hostnameFromUrl,
  isGroupable, matchesTab, normalizeDomain, parseTags, rootDomain, sanitizeRules,
} from '../lib/core.js';

test('groups different Amazon marketplaces under AMZ', () => {
  const a = getCategory('https://www.amazon.com/dp/B0EXAMPLE');
  const b = getCategory('https://smile.amazon.co.uk/s?k=laptop');
  assert.equal(a.key, 'rule:amazon');
  assert.equal(a.key, b.key);
  assert.equal(a.title, 'AMZ');
  assert.equal(a.color, 'orange');
});

test('subdomains match their parent site and familiar compound suffix', () => {
  assert.equal(rootDomain('news.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(rootDomain('mail.google.com'), 'google.com');
  assert.equal(getCategory('https://www.github.com/u').key, getCategory('https://gist.github.com/').key);
  assert.equal(domainMatches('evilamazon.com', 'amazon.com'), false);
  assert.equal(domainMatches('seller.amazon.com', 'amazon.com'), true);
});

test('unsupported schemes are not read or grouped', () => {
  assert.equal(hostnameFromUrl('chrome://extensions/'), null);
  assert.equal(hostnameFromUrl('file:///notes.html'), null);
  assert.equal(isGroupable({id:1,url:'file:///notes.html'}), false);
  assert.equal(isGroupable({id:1,url:'https://amazon.com',pinned:true}), false);
  assert.equal(isGroupable({id:1,url:'https://amazon.com',incognito:true}), false);
});

test('Amazon product annotations survive changes to tracking query and path', () => {
  const a = canonicalPageKey('https://www.amazon.com/dp/B08N5WRWNW?th=1&ref=shopping');
  const b = canonicalPageKey('https://www.amazon.com/gp/product/B08N5WRWNW?tag=affiliate-20');
  assert.equal(a, b);
  assert.equal(a, 'https://amazon.com/dp/B08N5WRWNW');
});

test('persistent labels do not store URL tokens or fragments', () => {
  const key = canonicalPageKey('https://user:pass@example.com/path?access_token=secret&code=oauth&q=valid#id_token=secret');
  assert.equal(key,'https://example.com/path?q=valid');
});

test('non-Amazon pages retain meaningful search params', () => {
  assert.equal(canonicalPageKey('https://www.google.com/search?utm_source=ad&q=earbuds'),
    'https://www.google.com/search?q=earbuds');
  assert.notEqual(canonicalPageKey('https://www.google.com/search?q=one'),
    canonicalPageKey('https://www.google.com/search?q=two'));
});

test('tab search includes page title, saved label, note and hashtags', () => {
  const tab = {title:'Amazon.com: Headphones',url:'https://amazon.com/dp/B08N5WRWNW'};
  const annotation = cleanAnnotation({label:'Gift for dad',tags:'shopping, BlackFriday, shopping',note:'Compare warranty'});
  assert.equal(matchesTab(tab,annotation,'gift #shopping'),true);
  assert.equal(matchesTab(tab,annotation,'warranty'),true);
  assert.equal(matchesTab(tab,annotation,'#missing'),false);
  assert.deepEqual(annotation.tags,['shopping','BlackFriday']);
});

test('domain rules are sanitized and invalid rule entries rejected', () => {
  assert.equal(normalizeDomain('https://Example.COM/foo'), 'example.com');
  assert.equal(normalizeDomain('<script>'), null);
  const rules = sanitizeRules([{id:'research',label:' My work ',color:'invalid',domains:['example.com','example.com','']}, {label:'',domains:[]}]);
  assert.deepEqual(rules,[{id:'research',label:'My work',color:'blue',domains:['example.com']}]);
  assert.deepEqual(parseTags('a,b, a, c'),['a','b','c']);
});
