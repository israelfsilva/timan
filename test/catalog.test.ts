import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CATALOG, catalogFor } from '../src/catalog.ts';
import { normalizeZone } from '../src/time.ts';

const JAN = new Date('2026-01-15T12:00:00Z');
const JUL = new Date('2026-07-15T12:00:00Z');
const names = (at: Date, exclude: string[] = []) => catalogFor(at, exclude).map((e) => e.name);

describe('CATALOG', () => {
	it('todo ID é IANA válido e já na grafia gravada', () => {
		for (const e of CATALOG) assert.equal(normalizeZone(e.zone), e.zone);
	});

	it('sem zona repetida', () => {
		assert.equal(new Set(CATALOG.map((e) => e.zone)).size, CATALOG.length);
	});
});

describe('catalogFor', () => {
	it('ordena pelo offset atual, oeste → leste, desempate pelo nome', () => {
		// Julho: Azores em DST (0) empata com UTC; London (+1) vem depois.
		assert.deepEqual(names(JUL).slice(12, 16), ['AZORES', 'UTC', 'LONDON', 'PARIS']);
		// Janeiro: London volta a 0 e empata com UTC; Azores volta a −1.
		assert.deepEqual(names(JAN).slice(12, 15), ['AZORES', 'LONDON', 'UTC']);
		// Janeiro no hemisfério sul: Lord Howe, Nouméa e Sydney em +11.
		assert.deepEqual(names(JAN).slice(-7, -4), ['LORD HOWE', 'NOUMÉA', 'SYDNEY']);
		// Julho: Adelaide volta para +9:30 junto com Darwin.
		assert.deepEqual(names(JUL).slice(30, 32), ['ADELAIDE', 'DARWIN']);
		assert.equal(names(JAN)[0], 'PAGO PAGO');
		assert.equal(names(JAN).at(-1), 'KIRITIMATI');
	});

	it('exclui os favoritos pelo ID, inclusive por alias antigo', () => {
		const list = names(JAN, ['America/Sao_Paulo', 'Asia/Calcutta', 'Europe/Nowhere']);
		assert.equal(list.length, CATALOG.length - 2);
		assert.ok(!list.includes('SÃO PAULO'));
		assert.ok(!list.includes('DELHI'));
	});
});
