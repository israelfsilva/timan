import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setColorMode } from '../src/theme.ts';
import { bandColumn, bandColumns, mapSize, renderMap } from '../src/worldmap.ts';

const MAP_ROWS = 10;

setColorMode('none');

describe('bandColumn', () => {
	it('follows (offset_h·15 + 180)/7.5 − 1 with 48 columns', () => {
		assert.equal(bandColumn(0, 48), 23);
		assert.equal(bandColumn(-240, 48), 15);
		assert.equal(bandColumn(540, 48), 41);
		assert.equal(bandColumn(330, 48), 34); // India: +5:30
	});

	it('wraps at the antimeridian', () => {
		assert.equal(bandColumn(14 * 60, 48), 3); // Kiritimati lands over the Pacific
		assert.equal(bandColumn(-12 * 60, 48), 47);
	});

	it('scales for smaller maps', () => {
		assert.equal(bandColumn(0, 36), 17);
	});
});

describe('renderMap', () => {
	const markers = [
		{ label: '1', offset: -240, selected: true },
		{ label: '0', offset: -180, selected: false },
		{ label: '2', offset: 60, selected: false },
	];

	it('map rows + ruler + indices, all at the requested width', () => {
		for (const width of [48, 36, 28]) {
			const lines = renderMap(width, MAP_ROWS, markers);
			assert.equal(lines.length, MAP_ROWS + 2);
			for (const l of lines) assert.equal([...l].length, width);
		}
	});

	it("ruler with ┴ every 3h and index in the band's right column", () => {
		const lines = renderMap(48, MAP_ROWS, markers);
		assert.equal(lines[MAP_ROWS], '┴─────'.repeat(8));
		assert.equal(lines[MAP_ROWS + 1]!.trimEnd(), '                1 0       2');
	});

	it('the selected one wins the column on a tie', () => {
		const tie = [
			{ label: '3', offset: 540, selected: false },
			{ label: '5', offset: 540, selected: true },
			{ label: '4', offset: 540, selected: false },
		];
		assert.equal(renderMap(48, MAP_ROWS, tie)[MAP_ROWS + 1]![42], '5');
	});

	it('land shows up where it should', () => {
		const [top] = renderMap(48, MAP_ROWS, markers);
		// Greenland/Arctic at the top, empty Pacific at Hawaii's latitude.
		assert.notEqual(top!.replaceAll('⠀', ''), '');
		const pacific = renderMap(48, MAP_ROWS, markers)[5]!.slice(0, 10);
		assert.equal(pacific, '⠀'.repeat(10));
	});
});

describe('antimeridian', () => {
	it('the band normalizes the longitude and splits in two at the edge', () => {
		assert.deepEqual(bandColumns(-12 * 60, 48), [47, 0]); // 180° W: last + first column
		assert.deepEqual(bandColumns(12 * 60, 48), [47, 0]); // 180° E is the same meridian
		assert.deepEqual(bandColumns(12 * 60 + 45, 48), [0, 1]); // 191.25° → −168.75°
		assert.deepEqual(bandColumns(13 * 60, 48), [1, 2]);
		assert.deepEqual(bandColumns(14 * 60, 48), [3, 4]);
		assert.deepEqual(bandColumns(-12 * 60, 28), [27, 0]);
	});

	it('the map paints both pieces', () => {
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
	it('largest area at 4.8:1 that fits', () => {
		assert.deepEqual(mapSize(48, 10, 1), { width: 48, height: 10 });
		assert.deepEqual(mapSize(200, 12, 1), { width: 57, height: 12 }); // limited by height
		assert.deepEqual(mapSize(43, 30, 1), { width: 43, height: 9 }); // limited by width
		assert.deepEqual(mapSize(103, 25, 1), { width: 103, height: 21 });
	});

	it('k > 1: fewer rows for the same width (PW · 150/360 / k dots)', () => {
		// 96 dots · 150/360 / 1.2 = 33.3 dots ≈ 8 rows.
		assert.deepEqual(mapSize(48, 30, 1.2), { width: 48, height: 8 });
		assert.deepEqual(mapSize(200, 10, 1.2), { width: 57, height: 10 }); // limited by height
	});

	it('any height: the map stretches without leaving the requested size', () => {
		const lines = renderMap(96, 20, []);
		assert.equal(lines.length, 22);
		for (const l of lines) assert.equal([...l].length, 96);
	});
});
