import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setColorMode } from '../src/theme.ts';
import { bandColumn, bandColumns, mapSize, renderMap } from '../src/worldmap.ts';

const MAP_ROWS = 10;

setColorMode('none');

describe('bandColumn', () => {
	it('segue (offset_h·15 + 180)/7,5 − 1 com 48 colunas', () => {
		assert.equal(bandColumn(0, 48), 23);
		assert.equal(bandColumn(-240, 48), 15);
		assert.equal(bandColumn(540, 48), 41);
		assert.equal(bandColumn(330, 48), 34); // Índia: +5:30
	});

	it('dá a volta no antimeridiano', () => {
		assert.equal(bandColumn(14 * 60, 48), 3); // Kiritimati cai sobre o Pacífico
		assert.equal(bandColumn(-12 * 60, 48), 47);
	});

	it('escala para mapas menores', () => {
		assert.equal(bandColumn(0, 36), 17);
	});
});

describe('renderMap', () => {
	const markers = [
		{ label: '1', offset: -240, selected: true },
		{ label: '0', offset: -180, selected: false },
		{ label: '2', offset: 60, selected: false },
	];

	it('linhas de mapa + régua + índices, todas com a largura pedida', () => {
		for (const width of [48, 36, 28]) {
			const lines = renderMap(width, MAP_ROWS, markers);
			assert.equal(lines.length, MAP_ROWS + 2);
			for (const l of lines) assert.equal([...l].length, width);
		}
	});

	it('régua com ┴ a cada 3h e índice na coluna direita da faixa', () => {
		const lines = renderMap(48, MAP_ROWS, markers);
		assert.equal(lines[MAP_ROWS], '┴─────'.repeat(8));
		assert.equal(lines[MAP_ROWS + 1]!.trimEnd(), '                1 0       2');
	});

	it('o selecionado ganha a coluna em caso de empate', () => {
		const tie = [
			{ label: '3', offset: 540, selected: false },
			{ label: '5', offset: 540, selected: true },
			{ label: '4', offset: 540, selected: false },
		];
		assert.equal(renderMap(48, MAP_ROWS, tie)[MAP_ROWS + 1]![42], '5');
	});

	it('a terra aparece onde deveria', () => {
		const [top] = renderMap(48, MAP_ROWS, markers);
		// Groenlândia/Ártico no topo, Pacífico vazio na latitude do Havaí.
		assert.notEqual(top!.replaceAll('⠀', ''), '');
		const pacific = renderMap(48, MAP_ROWS, markers)[5]!.slice(0, 10);
		assert.equal(pacific, '⠀'.repeat(10));
	});
});

describe('antimeridiano', () => {
	it('a faixa normaliza a longitude e se parte em dois na borda', () => {
		assert.deepEqual(bandColumns(-12 * 60, 48), [47, 0]); // 180° W: última + primeira coluna
		assert.deepEqual(bandColumns(12 * 60, 48), [47, 0]); // 180° E é o mesmo meridiano
		assert.deepEqual(bandColumns(12 * 60 + 45, 48), [0, 1]); // 191,25° → −168,75°
		assert.deepEqual(bandColumns(13 * 60, 48), [1, 2]);
		assert.deepEqual(bandColumns(14 * 60, 48), [3, 4]);
		assert.deepEqual(bandColumns(-12 * 60, 28), [27, 0]);
	});

	it('o mapa pinta os dois pedaços', () => {
		setColorMode('truecolor');
		try {
			const [line] = renderMap(48, MAP_ROWS, [{ label: '1', offset: -12 * 60, selected: true }]);
			const cells = line!.split('\x1b[0m').filter(Boolean);
			const banded = cells.flatMap((c, i) => (c.includes(';48;2;') ? [i] : []));
			assert.deepEqual(banded, [0, 47]);
		} finally {
			setColorMode('none');
		}
	});
});

describe('mapSize', () => {
	it('maior área na proporção 4,8:1 que cabe', () => {
		assert.deepEqual(mapSize(48, 10, 1), { width: 48, height: 10 });
		assert.deepEqual(mapSize(200, 12, 1), { width: 57, height: 12 }); // limitado pela altura
		assert.deepEqual(mapSize(43, 30, 1), { width: 43, height: 9 }); // limitado pela largura
		assert.deepEqual(mapSize(103, 25, 1), { width: 103, height: 21 });
	});

	it('k > 1: menos linhas para a mesma largura (PW · 150/360 / k pontos)', () => {
		// 96 pontos · 150/360 / 1,2 = 33,3 pontos ≈ 8 linhas.
		assert.deepEqual(mapSize(48, 30, 1.2), { width: 48, height: 8 });
		assert.deepEqual(mapSize(200, 10, 1.2), { width: 57, height: 10 }); // limitado pela altura
	});

	it('altura qualquer: o mapa estica sem sair do tamanho pedido', () => {
		const lines = renderMap(96, 20, []);
		assert.equal(lines.length, 22);
		for (const l of lines) assert.equal([...l].length, 96);
	});
});
