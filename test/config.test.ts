import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
	type Config,
	ConfigError,
	UsageError,
	addFavorite,
	addSlot,
	configPath,
	defaultConfig,
	favoriteCode,
	loadConfig,
	nextDst,
	removeSlot,
	saveConfig,
	setDst,
} from '../src/config.ts';

function tempPath(): string {
	return join(mkdtempSync(join(tmpdir(), 'timan-')), 'timan', 'config.json');
}

const codes = (c: { slots: { code: string }[] }) => c.slots.map((s) => s.code);

describe('configPath', () => {
	it('honors XDG_CONFIG_HOME', () => {
		assert.equal(configPath({ XDG_CONFIG_HOME: '/x' }), '/x/timan/config.json');
	});

	it('uses ~/.config without XDG_CONFIG_HOME', () => {
		assert.match(configPath({}), /\/\.config\/timan\/config\.json$/);
	});
});

describe('loadConfig', () => {
	it('creates the defaults on first run', () => {
		const path = tempPath();
		assert.deepEqual(loadConfig(path), defaultConfig());
		assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), defaultConfig());
	});

	it('reads what was saved', () => {
		const path = tempPath();
		const config = { ...defaultConfig(), clock: '24h' as const, local_name: 'SÃO PAULO' };
		saveConfig(path, config);
		assert.deepEqual(loadConfig(path), config);
	});

	it('corrupt JSON is an error with line and column, and the file is left alone', () => {
		const path = tempPath();
		saveConfig(path, defaultConfig());
		const broken = '{\n\t"version": 1,\n}\n';
		writeFileSync(path, broken);
		assert.throws(() => loadConfig(path), (err: Error) => {
			assert.ok(err instanceof ConfigError);
			assert.ok(err.message.startsWith(`${path}:3:1: `), err.message);
			return true;
		});
		assert.equal(readFileSync(path, 'utf8'), broken);
	});

	it('invalid structure is an error', () => {
		const path = tempPath();
		saveConfig(path, defaultConfig());
		writeFileSync(path, JSON.stringify({ version: 2, clock: '12h', slots: [] }));
		assert.throws(() => loadConfig(path), ConfigError);
		writeFileSync(path, JSON.stringify({ version: 1, clock: '12h', slots: [{ code: 'X' }] }));
		assert.throws(() => loadConfig(path), /T1/);
	});

	it('unknown zone is not a config error', () => {
		const path = tempPath();
		const config: Config = { ...defaultConfig(), slots: [{ code: 'TYO', zone: 'Asia/Tokio', dst: 'auto' }] };
		saveConfig(path, config);
		assert.deepEqual(loadConfig(path), config);
	});

	it('old config, without dst and ui, loads with the defaults and is not rewritten', () => {
		const path = tempPath();
		saveConfig(path, defaultConfig());
		const old = JSON.stringify({ version: 1, clock: '12h', slots: [{ code: 'NYC', zone: 'America/New_York' }] });
		writeFileSync(path, old);
		const config = loadConfig(path);
		assert.deepEqual(config.slots, [{ code: 'NYC', zone: 'America/New_York', dst: 'auto' }]);
		assert.deepEqual(config.ui, { showZones: true });
		assert.equal(config.local_dst, undefined);
		assert.equal(readFileSync(path, 'utf8'), old);
	});

	it('round trip with dst, local_dst and ui', () => {
		const path = tempPath();
		const config: Config = {
			...defaultConfig(),
			local_dst: 'off',
			slots: [{ code: 'SYD', zone: 'Australia/Sydney', dst: 'on' }],
			ui: { showZones: false, cellAspect: 1.15 },
		};
		saveConfig(path, config);
		assert.deepEqual(loadConfig(path), config);
	});

	it('invalid dst, local_dst and ui are errors', () => {
		const path = tempPath();
		saveConfig(path, defaultConfig());
		const base = { version: 1, clock: '12h', slots: [{ code: 'NYC', zone: 'America/New_York' }] };
		for (const [bad, msg] of [
			[{ ...base, slots: [{ ...base.slots[0], dst: 'yes' }] }, /T1: dst must be/],
			[{ ...base, local_dst: true }, /local_dst must be/],
			[{ ...base, ui: { showZones: 'no' } }, /ui must be/],
			[{ ...base, ui: [] }, /ui must be/],
			[{ ...base, ui: { cellAspect: '1.2' } }, /cellAspect must be/],
			[{ ...base, ui: { cellAspect: 3 } }, /cellAspect must be/],
		] as const) {
			writeFileSync(path, JSON.stringify(bad));
			assert.throws(() => loadConfig(path), msg);
		}
	});
});

describe('slots', () => {
	it('add appends at the end, with the code uppercased and the ID as typed', () => {
		const c = addSlot(defaultConfig(), 'bom', 'Asia/Kolkata');
		assert.deepEqual(c.slots.at(-1), { code: 'BOM', zone: 'Asia/Kolkata', dst: 'auto' });
	});

	it('add validates code, duplicate, zone and limit', () => {
		const c = defaultConfig();
		assert.throws(() => addSlot(c, 'X', 'Asia/Tokyo'), /invalid code/);
		assert.throws(() => addSlot(c, 'lon', 'Europe/Paris'), /already used by T2/);
		assert.throws(() => addSlot(c, 'PAR', 'Europe/Pariss'), /unknown zone/);
		assert.throws(() => addSlot(c, 'OFF', '+03:00'), /unknown zone/);
		let full = c;
		for (const code of ['AA', 'BB', 'CC', 'DD', 'EE']) full = addSlot(full, code, 'UTC');
		assert.equal(full.slots.length, 9);
		assert.throws(() => addSlot(full, 'FF', 'UTC'), /slot limit/);
	});

	it('rm compacts', () => {
		assert.deepEqual(codes(removeSlot(defaultConfig(), 3)), ['NYC', 'LON', 'HKG']);
		assert.throws(() => removeSlot(defaultConfig(), 5), /T5 does not exist/);
	});

	it('does not mutate the original config', () => {
		const c = defaultConfig();
		addSlot(c, 'PAR', 'Europe/Paris');
		removeSlot(c, 1);
		assert.deepEqual(c, defaultConfig());
	});
});

describe('favorites', () => {
	it('code derived from the name, without accents, unique', () => {
		assert.equal(favoriteCode('SÃO PAULO', []), 'SAO');
		assert.equal(favoriteCode("ST. JOHN'S", []), 'STJ');
		assert.equal(favoriteCode('LOS ANGELES', ['LOS']), 'LOA');
		assert.equal(favoriteCode('UTC', ['UTC']), 'UTA');
		assert.equal(favoriteCode('NOUMÉA', ['nou']), 'NOM');
	});

	it('addFavorite takes the next slot with the catalog name', () => {
		const c = addFavorite(defaultConfig(), 'America/Sao_Paulo', 'SÃO PAULO');
		assert.deepEqual(c.slots.at(-1), { code: 'SAO', zone: 'America/Sao_Paulo', dst: 'auto', name: 'SÃO PAULO' });
		assert.equal(c.slots.length, 5);
	});
});

describe('setDst and nextDst', () => {
	it('slot and T0; T0 on auto does not save local_dst', () => {
		assert.equal(setDst(defaultConfig(), 2, 'on').slots[1]!.dst, 'on');
		assert.equal(setDst(defaultConfig(), 0, 'off').local_dst, 'off');
		assert.ok(!('local_dst' in setDst({ ...defaultConfig(), local_dst: 'on' }, 0, 'auto')));
		assert.throws(() => setDst(defaultConfig(), 9, 'on'), UsageError);
	});

	it('auto → on → off → auto', () => {
		assert.deepEqual([nextDst('auto'), nextDst('on'), nextDst('off')], ['on', 'off', 'auto']);
	});
});
