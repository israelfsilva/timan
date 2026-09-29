import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePmset, parseSysfs, powerLine } from '../src/battery.ts';

const pmset = (status: string) => `Now drawing from 'Battery Power'\n -InternalBattery-0 (id=36438115)\t${status} present: true\n`;

describe('parsePmset', () => {
	it('discharging, with and without an estimate', () => {
		assert.deepEqual(parsePmset(pmset('87%; discharging; 4:32 remaining')), { kind: 'battery', percent: 87, state: 'discharging', minutes: 272 });
		assert.deepEqual(parsePmset(pmset('87%; discharging; (no estimate)')), { kind: 'battery', percent: 87, state: 'discharging' });
	});

	it('charging and on AC', () => {
		assert.equal(parsePmset(pmset('40%; charging; 1:10 remaining'))?.state, 'charging');
		assert.equal(parsePmset(pmset('99%; finishing charge; 0:05 remaining'))?.state, 'charging');
		assert.equal(parsePmset(pmset('90%; AC attached; not charging'))?.state, 'ac');
		assert.equal(parsePmset(pmset('100%; charged; 0:00 remaining'))?.state, 'ac');
	});

	it('desktop without a battery', () => {
		assert.equal(parsePmset("Now drawing from 'AC Power'\n"), undefined);
	});
});

describe('parseSysfs', () => {
	it('estimate from energy/power', () => {
		assert.deepEqual(parseSysfs({ capacity: '50', status: 'Discharging', energy_now: '20000000', power_now: '10000000' }), {
			kind: 'battery',
			percent: 50,
			state: 'discharging',
			minutes: 120,
		});
	});

	it('no capacity: not a reading', () => {
		assert.equal(parseSysfs({ status: 'Full' }), undefined);
		assert.equal(parseSysfs({ capacity: '100', status: 'Full' })?.state, 'ac');
	});
});

describe('powerLine', () => {
	it('in the style of 10 YEAR BATTERY', () => {
		assert.equal(powerLine({ kind: 'battery', percent: 87, state: 'discharging', minutes: 272 }), '87% · 4 HOUR BATTERY');
		assert.equal(powerLine({ kind: 'battery', percent: 12, state: 'discharging', minutes: 35 }), '12% · 35 MINUTE BATTERY');
		assert.equal(powerLine({ kind: 'battery', percent: 87, state: 'discharging' }), '87% BATTERY');
		assert.equal(powerLine({ kind: 'battery', percent: 40, state: 'charging' }), '40% BATTERY · CHARGING');
		assert.equal(powerLine({ kind: 'battery', percent: 90, state: 'ac' }), '90% BATTERY · AC POWER');
	});

	it('no battery: uptime; no reading yet: empty', () => {
		assert.equal(powerLine({ kind: 'uptime', seconds: 12 * 86400 + 5000 }), '12 DAY UPTIME');
		assert.equal(powerLine({ kind: 'uptime', seconds: 30 }), '0 MINUTE UPTIME');
		assert.equal(powerLine(undefined), '');
	});
});
