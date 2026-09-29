import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CATALOG, catalogFor } from '../src/catalog.ts';
import { normalizeZone } from '../src/time.ts';

const JAN = new Date('2026-01-15T12:00:00Z');
const JUL = new Date('2026-07-15T12:00:00Z');
const names = (at: Date, exclude: string[] = []) => catalogFor(at, exclude).map((e) => e.name);

describe('CATALOG', () => {
	it('every ID is valid IANA and already in the saved spelling', () => {
		for (const e of CATALOG) assert.equal(normalizeZone(e.zone), e.zone);
	});

	it('no repeated zone', () => {
		assert.equal(new Set(CATALOG.map((e) => e.zone)).size, CATALOG.length);
	});
});

describe('catalogFor', () => {
	it('sorts by current offset, west → east, ties broken by name', () => {
		// July: Azores on DST (0) ties with UTC; London (+1) comes after.
		assert.deepEqual(names(JUL).slice(12, 16), ['AZORES', 'UTC', 'LONDON', 'PARIS']);
		// January: London goes back to 0 and ties with UTC; Azores goes back to −1.
		assert.deepEqual(names(JAN).slice(12, 15), ['AZORES', 'LONDON', 'UTC']);
		// January in the southern hemisphere: Lord Howe, Nouméa and Sydney at +11.
		assert.deepEqual(names(JAN).slice(-7, -4), ['LORD HOWE', 'NOUMÉA', 'SYDNEY']);
		// July: Adelaide goes back to +9:30 together with Darwin.
		assert.deepEqual(names(JUL).slice(30, 32), ['ADELAIDE', 'DARWIN']);
		assert.equal(names(JAN)[0], 'PAGO PAGO');
		assert.equal(names(JAN).at(-1), 'KIRITIMATI');
	});

	it('excludes favorites by ID, including by an old alias', () => {
		const list = names(JAN, ['America/Sao_Paulo', 'Asia/Calcutta', 'Europe/Nowhere']);
		assert.equal(list.length, CATALOG.length - 2);
		assert.ok(!list.includes('SÃO PAULO'));
		assert.ok(!list.includes('DELHI'));
	});
});
