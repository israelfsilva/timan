import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BrailleCanvas } from '../src/braille.ts';

describe('BrailleCanvas', () => {
	it('cada ponto acende o bit certo da célula', () => {
		const c = new BrailleCanvas(2, 1);
		c.set(0, 0);
		c.set(1, 3);
		c.set(2.9, 1.2); // fracionário cai no ponto (2, 1)
		assert.equal(c.char(0, 0), '⢁');
		assert.equal(c.char(1, 0), '⠂');
	});

	it('ignora pontos fora do canvas', () => {
		const c = new BrailleCanvas(1, 1);
		c.set(-1, 0);
		c.set(2, 0);
		c.set(0, 4);
		assert.equal(c.char(0, 0), '⠀');
	});

	it('linha sem buracos e a célula fica com a maior camada', () => {
		const c = new BrailleCanvas(4, 1);
		c.line(0, 0, 7, 3, 1);
		c.set(0, 3, 2);
		assert.equal([0, 1, 2, 3].map((col) => c.char(col, 0)).join(''), '⡉⠓⠢⢄');
		assert.deepEqual([0, 1, 2, 3].map((col) => c.layer(col, 0)), [2, 1, 1, 1]);
	});
});
