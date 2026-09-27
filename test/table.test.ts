import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Config, defaultConfig } from '../src/config.ts';
import { CATALOG_REF, buildRows, renderTable, tableLines, zoneList } from '../src/table.ts';

// 22:08:36 de sexta em São Paulo (o instante do mockup).
const AT = new Date('2026-09-26T01:08:36Z');
const LOCAL = 'America/Sao_Paulo';

const table = (config: Config, ascii = true) => renderTable(buildRows(config, LOCAL, AT), config.clock, ascii);

describe('renderTable', () => {
	it('defaults, 12h, ASCII', () => {
		assert.equal(
			table(defaultConfig()),
			[
				'T0  SAO PAULO  -03:00  local  10:08 PM  FRI 25',
				'T1  NEW YORK   -04:00    -1h   9:08 PM  FRI 25',
				'T2  LONDON     +01:00    +4h   2:08 AM  SAT 26  +1',
				'T3  TOKYO      +09:00   +12h  10:08 AM  SAT 26  +1',
				'T4  HONG KONG  +08:00   +11h   9:08 AM  SAT 26  +1',
			].join('\n'),
		);
	});

	it('24h, nomes sobrescritos, meia hora, dia anterior e sinal Unicode', () => {
		const config: Config = {
			version: 1,
			clock: '24h',
			local_name: 'SÃO PAULO',
			slots: [
				{ code: 'BOM', zone: 'Asia/Kolkata', name: 'MUMBAI', dst: 'auto' },
				{ code: 'HNL', zone: 'Pacific/Honolulu', dst: 'auto' },
				{ code: 'MAR', zone: 'Pacific/Marquesas', dst: 'auto' },
			],
			ui: { showZones: true },
		};
		assert.equal(
			table(config, false),
			[
				'T0  SÃO PAULO  −03:00  local  22:08  FRI 25',
				'T1  MUMBAI     +05:30  +8h30  06:38  SAT 26  +1',
				'T2  HONOLULU   −10:00    −7h  15:08  FRI 25',
				'T3  MARQUESAS  −09:30  −6h30  15:38  FRI 25',
			].join('\n'),
		);
	});

	it('zona desconhecida vira "?" só na própria linha', () => {
		const config: Config = { ...defaultConfig(), slots: [{ code: 'TYO', zone: 'Asia/Tokio', dst: 'auto' }, { code: 'NYC', zone: 'America/New_York', dst: 'auto' }] };
		const rows = buildRows(config, LOCAL, AT);
		assert.equal(rows[1]!.time, undefined);
		assert.equal(
			renderTable(rows, config.clock, true),
			[
				'T0  SAO PAULO  -03:00  local  10:08 PM  FRI 25',
				'T1  TOKIO           ?      ?         ?  ?',
				'T2  NEW YORK   -04:00    -1h   9:08 PM  FRI 25',
			].join('\n'),
		);
	});
});

describe('buildRows com override de DST', () => {
	// 01:30 de sábado em São Paulo; 00:30 de sábado em New York (EDT).
	const at = new Date('2026-09-26T04:30:00Z');
	const withNy = (dst: 'auto' | 'on' | 'off'): Config => ({
		...defaultConfig(),
		slots: [{ code: 'NYC', zone: 'America/New_York', dst }],
	});
	const ny = (config: Config) => buildRows(config, LOCAL, at)[1]!.time!;

	it('auto: hora IANA', () => {
		const t = ny(withNy('auto'));
		assert.deepEqual([t.offset, t.diff, t.day, t.wall.getUTCHours(), t.dstLabel], [-240, -60, 0, 0, 'DST']);
	});

	it('off força o padrão: muda diferença e dia civil', () => {
		const t = ny(withNy('off'));
		assert.deepEqual([t.offset, t.diff, t.day, t.wall.getUTCHours(), t.wall.getUTCDate(), t.dstLabel], [-300, -120, -1, 23, 25, 'STD*']);
	});

	it('on fora do verão força o horário de verão', () => {
		const t = buildRows(withNy('on'), LOCAL, new Date('2026-01-15T12:00:00Z'))[1]!.time!;
		assert.deepEqual([t.offset, t.diff, t.dstLabel], [-240, -60, 'DST*']);
	});

	it('local_dst mexe no T0 e na diferença de todas as linhas', () => {
		const rows = buildRows({ ...defaultConfig(), local_dst: 'on' }, 'America/New_York', new Date('2026-01-15T12:00:00Z'));
		assert.equal(rows[0]!.time!.offset, -240);
		assert.equal(rows[0]!.time!.dstLabel, 'DST*');
		assert.equal(rows[1]!.time!.diff, -60); // New York em auto (−5) contra o T0 forçado (−4)
		assert.equal(rows[2]!.time!.diff, 240); // London (0)
	});
});

describe('zoneList', () => {
	it('favoritos e depois o catálogo sem as favoritas, pelo offset atual', () => {
		const { rows, favorites } = zoneList(defaultConfig(), LOCAL, AT);
		assert.equal(favorites, 5);
		const catalog = rows.slice(favorites);
		assert.ok(catalog.every((r) => r.ref === CATALOG_REF && r.dst === 'auto'));
		for (const zone of ['America/Sao_Paulo', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Asia/Hong_Kong']) {
			assert.equal(rows.filter((r) => r.zone === zone).length, 1);
		}
		const offsets = catalog.map((r) => r.time!.offset);
		assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
	});

	it('catálogo com diferença contra o T0 efetivo', () => {
		const { rows } = zoneList({ ...defaultConfig(), local_dst: 'on' }, 'America/New_York', new Date('2026-01-15T12:00:00Z'));
		const chicago = rows.find((r) => r.zone === 'America/Chicago')!;
		assert.equal(chicago.time!.diff, -120); // Chicago −6 contra o T0 forçado em −4
	});
});

describe('tableLines com DST', () => {
	it('coluna do indicador só quando pedida', () => {
		const rows = buildRows(defaultConfig(), LOCAL, AT);
		assert.ok(tableLines(rows, '12h', { dst: true })[1]!.endsWith('FRI 25      DST'));
		assert.ok(tableLines(rows, '12h')[1]!.endsWith('FRI 25'));
	});
});
