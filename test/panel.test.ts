import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { besides, panel } from '../src/panel.ts';
import { setColorMode } from '../src/theme.ts';

setColorMode('none');

describe('panel', () => {
	it('borda arredondada, título na borda de cima e corpo completado', () => {
		assert.deepEqual(panel('map', ['ab'], 12, 4), [
			'╭─ map ────╮',
			'│ab        │',
			'│          │',
			'╰──────────╯',
		]);
	});

	it('rodapé à direita na borda de baixo, só se couber', () => {
		assert.equal(panel('z', [], 20, 2, 'q sair').at(-1), '╰─────── q sair ───╯');
		assert.equal(panel('z', [], 10, 2, 'q sair').at(-1), '╰────────╯');
	});

	it('título longo é cortado', () => {
		assert.equal(panel('abcdefghij', [], 10, 2)[0], '╭─ abc… ─╮');
	});

	it('besides junta linha a linha', () => {
		assert.deepEqual(besides(['a', 'b'], ['1', '2']), ['a1', 'b2']);
	});
});
