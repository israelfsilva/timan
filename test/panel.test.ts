import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { besides, panel } from '../src/panel.ts';
import { setColorMode } from '../src/theme.ts';

setColorMode('none');

describe('panel', () => {
	it('rounded border, title in the top border and padded body', () => {
		assert.deepEqual(panel('map', ['ab'], 12, 4), [
			'╭─ map ────╮',
			'│ab        │',
			'│          │',
			'╰──────────╯',
		]);
	});

	it('footer on the right of the bottom border, only if it fits', () => {
		assert.equal(panel('z', [], 20, 2, 'q sair').at(-1), '╰─────── q sair ───╯');
		assert.equal(panel('z', [], 10, 2, 'q sair').at(-1), '╰────────╯');
	});

	it('long title is cut', () => {
		assert.equal(panel('abcdefghij', [], 10, 2)[0], '╭─ abc… ─╮');
	});

	it('besides joins line by line', () => {
		assert.deepEqual(besides(['a', 'b'], ['1', '2']), ['a1', 'b2']);
	});
});
