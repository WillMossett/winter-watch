import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyInbound, extractCode } from '../src/lib/keywords.ts';
import { pickAlerts, draftMessage } from '../src/lib/nws.ts';
import { toE164, normalizeCode, isCode, addrKey, smsSegments, randomCode } from '../src/lib/text.ts';
import { parseCSV, toCSV } from '../src/lib/csv.ts';

test('inbound keywords', () => {
  assert.equal(classifyInbound('STOP'), 'stop');
  assert.equal(classifyInbound(' stop '), 'stop');
  assert.equal(classifyInbound('Unsubscribe'), 'stop');
  assert.equal(classifyInbound('Stop please'), 'stop');
  assert.equal(classifyInbound('storm'), 'start');
  assert.equal(classifyInbound('Check'), 'check');
  assert.equal(classifyInbound('CHECK please, back door sticks'), 'check');
  assert.equal(classifyInbound('help'), 'help');
  assert.equal(classifyInbound('Do not stop by until Friday, the furnace guy is coming'), 'other');
  assert.equal(classifyInbound('Thanks!'), 'other');
});

test('phones', () => {
  assert.equal(toE164('(586) 555-0123'), '+15865550123');
  assert.equal(toE164('1-586-555-0123'), '+15865550123');
  assert.equal(toE164('+1 586 555 0123'), '+15865550123');
  assert.equal(toE164('555-0123'), null);
  assert.equal(toE164('0865550123'), null);
});

test('codes', () => {
  assert.equal(normalizeCode('ww-a7k2'), 'WW-A7K2');
  assert.equal(normalizeCode('wwa7k2'), 'WW-A7K2');
  assert.ok(isCode('WW-A7K2'));
  assert.ok(!isCode('WW-A7K0')); // 0 is not in the code alphabet
  for (let i = 0; i < 200; i++) assert.ok(isCode(randomCode('WW')));
});

test('address keys match common spellings', () => {
  assert.equal(addrKey('7185 Lakeshore Road', '48450-1234'), addrKey('7185 LAKESHORE RD.', '48450'));
  assert.equal(addrKey('12 North Ridge Street'), addrKey('12 N Ridge St'));
});

test('csv round trip', () => {
  const rows = parseCSV('a,b\r\n"x, y","he said ""hi"""\n\n1,2\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"'], ['1', '2']]);
  assert.equal(toCSV([{ a: 'x, y', b: 2 }], ['a', 'b']), 'a,b\r\n"x, y",2');
});

test('weather: keeps only watched warnings in our counties', () => {
  const f = (event: string, same: string[], extra: Record<string, unknown> = {}) => ({ properties: { id: 'urn:' + event + same.join(), event, status: 'Actual', messageType: 'Alert', geocode: { SAME: same }, ends: '2026-12-02T23:00:00-05:00', ...extra } });
  const got = pickAlerts([
    f('Winter Storm Warning', ['026151', '026063']),
    f('Winter Weather Advisory', ['026151']),          // advisory: ignored
    f('High Wind Warning', ['026163']),                // Wayne County: ignored
    f('Ice Storm Warning', ['026147'], { status: 'Test' }), // test message: ignored
    f('Extreme Cold Warning', ['026147']),
  ]);
  assert.deepEqual(got.map((a) => a.event), ['Winter Storm Warning', 'Extreme Cold Warning']);
  assert.deepEqual(got[0].counties, ['Sanilac', 'Huron']);
  const msg = draftMessage(got[1], 65);
  assert.match(msg, /^MiCasa Storm Alert: Extreme Cold Warning for St\. Clair County until/);
  assert.match(msg, /pipes can freeze/);
  assert.match(msg, /Reply CHECK \(\$65, no contract\)\. Reply STOP to opt out\.$/);
  const seg = smsSegments(msg);
  assert.ok(seg.gsm, 'draft should stay in plain SMS characters');
});

test('letter codes in texts', () => {
  assert.deepEqual(extractCode('STORM WW-7K2M', 'WW'), { code: 'WW-7K2M', rest: 'STORM' });
  assert.deepEqual(extractCode('storm ww 7k2m', 'WW'), { code: 'WW-7K2M', rest: 'storm' });
  assert.deepEqual(extractCode('WW7K2M', 'WW'), { code: 'WW-7K2M', rest: '' });
  assert.equal(extractCode('Storm ww-7k2m please', 'WW').code, 'WW-7K2M');
  assert.equal(extractCode('CHECK', 'WW').code, null);          // ordinary words are never codes
  assert.equal(extractCode('STORM', 'WW').code, null);
  assert.equal(extractCode('WW-7K2O', 'WW').code, null);        // O is not in the code alphabet
  assert.equal(extractCode('NEWW-7K2M', 'WW').code, null);      // prefix must stand alone
  assert.equal(classifyInbound(extractCode('STORM WW-7K2M', 'WW').rest), 'start');
  assert.equal(classifyInbound(extractCode('STOP WW-7K2M', 'WW').rest), 'stop');
});
