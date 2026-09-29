import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	dayDiff,
	diffMinutes,
	dstLabel,
	dstOffsets,
	effectiveOffset,
	formatClock,
	formatDay,
	formatDiff,
	formatOffset,
	normalizeZone,
	offsetMinutes,
	wallClock,
	zoneName,
} from '../src/time.ts';

const JAN = new Date('2026-01-15T12:00:00Z');
const JUL = new Date('2026-07-15T12:00:00Z');

describe('offsetMinutes', () => {
	it('follows New York DST', () => {
		assert.equal(offsetMinutes('America/New_York', JAN), -300);
		assert.equal(offsetMinutes('America/New_York', JUL), -240);
	});

	it('changes at the switch instant in London (2026-03-29, 01:00 UTC)', () => {
		assert.equal(offsetMinutes('Europe/London', new Date('2026-03-29T00:59:59Z')), 0);
		assert.equal(offsetMinutes('Europe/London', new Date('2026-03-29T01:00:00Z')), 60);
	});

	it('supports fractional hours', () => {
		assert.equal(offsetMinutes('Asia/Kolkata', JAN), 330);
		assert.equal(offsetMinutes('Asia/Kathmandu', JAN), 345);
	});

	it('UTC is zero', () => {
		assert.equal(offsetMinutes('UTC', JAN), 0);
	});
});

describe('diffMinutes', () => {
	it('India vs São Paulo = +8h30', () => {
		assert.equal(diffMinutes('Asia/Kolkata', 'America/Sao_Paulo', JAN), 510);
		assert.equal(formatDiff(510), '+8h30');
	});

	it('New York vs São Paulo changes with US DST', () => {
		assert.equal(diffMinutes('America/New_York', 'America/Sao_Paulo', JAN), -120);
		assert.equal(diffMinutes('America/New_York', 'America/Sao_Paulo', JUL), -60);
	});
});

describe('dayDiff', () => {
	// 22:08 on Friday in São Paulo.
	const at = new Date('2026-09-26T01:08:36Z');

	it('Tokyo is already on the next day', () => {
		assert.equal(dayDiff('Asia/Tokyo', 'America/Sao_Paulo', at), 1);
	});

	it('New York stays on the same day', () => {
		assert.equal(dayDiff('America/New_York', 'America/Sao_Paulo', at), 0);
	});

	it('Honolulu is on the previous day when T0 is Tokyo', () => {
		assert.equal(dayDiff('Pacific/Honolulu', 'Asia/Tokyo', at), -1);
	});

	it('comes from the civil date, not from hours', () => {
		// 23:30 Friday in São Paulo: Cape Verde (+2h) is already at 01:30 Saturday.
		const late = new Date('2026-09-26T02:30:00Z');
		assert.equal(diffMinutes('Atlantic/Cape_Verde', 'America/Sao_Paulo', late), 120);
		assert.equal(dayDiff('Atlantic/Cape_Verde', 'America/Sao_Paulo', late), 1);
		// 20:30 Friday in São Paulo: the same +2h difference stays on the same day.
		const early = new Date('2026-09-25T23:30:00Z');
		assert.equal(dayDiff('Atlantic/Cape_Verde', 'America/Sao_Paulo', early), 0);
	});

	it('same offset, same day', () => {
		assert.equal(dayDiff('America/Argentina/Buenos_Aires', 'America/Sao_Paulo', at), 0);
	});
});

describe('formatting', () => {
	it('formatOffset', () => {
		assert.equal(formatOffset(-180), '-03:00');
		assert.equal(formatOffset(345), '+05:45');
		assert.equal(formatOffset(0), '+00:00');
		assert.equal(formatOffset(-570), '-09:30');
	});

	it('formatDiff', () => {
		assert.equal(formatDiff(0), '0h');
		assert.equal(formatDiff(-60), '-1h');
		assert.equal(formatDiff(720), '+12h');
		assert.equal(formatDiff(525), '+8h45');
		assert.equal(formatDiff(-210), '-3h30');
	});

	it('formatClock 12h and 24h', () => {
		const wall = wallClock('America/New_York', new Date('2026-09-26T01:08:36Z'));
		assert.equal(formatClock(wall, '12h'), '9:08 PM');
		assert.equal(formatClock(wall, '24h'), '21:08');
		assert.equal(formatClock(wall, '12h', true), '9:08:36 PM');
		const midnight = wallClock('UTC', new Date('2026-09-26T00:05:00Z'));
		assert.equal(formatClock(midnight, '12h'), '12:05 AM');
		assert.equal(formatClock(midnight, '24h'), '00:05');
	});

	it("formatDay uses the zone's civil date", () => {
		const at = new Date('2026-09-26T01:08:36Z');
		assert.equal(formatDay(wallClock('America/Sao_Paulo', at)), 'FRI 25');
		assert.equal(formatDay(wallClock('Asia/Tokyo', at)), 'SAT 26');
	});
});

describe('names and IDs', () => {
	it('zoneName derives from the last segment, with the modern name', () => {
		assert.equal(zoneName('America/New_York'), 'NEW YORK');
		assert.equal(zoneName('America/Argentina/Buenos_Aires'), 'BUENOS AIRES');
		assert.equal(zoneName('Asia/Calcutta'), 'KOLKATA');
	});

	it('normalizeZone keeps the ID as typed, fixing only case', () => {
		assert.equal(normalizeZone('Asia/Kolkata'), 'Asia/Kolkata');
		assert.equal(normalizeZone('asia/kolkata'), 'Asia/Kolkata');
		assert.equal(normalizeZone('asia/tokyo'), 'Asia/Tokyo');
		assert.equal(normalizeZone('Europe/Kyiv'), 'Europe/Kyiv');
		assert.equal(normalizeZone('US/Eastern'), 'US/Eastern');
	});

	it('normalizeZone rejects nonexistent zones and fixed offsets', () => {
		assert.equal(normalizeZone('Asia/Tokio'), undefined);
		assert.equal(normalizeZone('+03:00'), undefined);
		assert.equal(normalizeZone('-0530'), undefined);
		assert.equal(normalizeZone(''), undefined);
	});

});

describe('dstOffsets', () => {
	it('derives standard and summer from January and July', () => {
		assert.deepEqual(dstOffsets('America/New_York', 2026), { std: -300, dst: -240 });
		assert.deepEqual(dstOffsets('Australia/Sydney', 2026), { std: 600, dst: 660 }); // southern hemisphere
		assert.deepEqual(dstOffsets('Asia/Tokyo', 2026), { std: 540, dst: 540 }); // no DST
		assert.deepEqual(dstOffsets('Australia/Lord_Howe', 2026), { std: 630, dst: 660 }); // 30-minute DST
	});
});

describe('effectiveOffset and dstLabel', () => {
	it('auto follows IANA; on/off force summer/standard', () => {
		assert.equal(effectiveOffset('America/New_York', JUL, 'auto'), -240);
		assert.equal(effectiveOffset('America/New_York', JUL, 'off'), -300);
		assert.equal(effectiveOffset('America/New_York', JAN, 'on'), -240);
		assert.equal(effectiveOffset('Australia/Sydney', JUL, 'on'), 660);
		assert.equal(effectiveOffset('Australia/Lord_Howe', JAN, 'off'), 630);
	});

	it('indicators', () => {
		assert.equal(dstLabel('America/New_York', JUL, 'auto'), 'DST');
		assert.equal(dstLabel('America/New_York', JAN, 'auto'), '');
		assert.equal(dstLabel('America/New_York', JAN, 'on'), 'DST*');
		assert.equal(dstLabel('America/New_York', JUL, 'off'), 'STD*');
		assert.equal(dstLabel('Australia/Sydney', JAN, 'auto'), 'DST');
	});

	it('zone without DST: override has no effect and no indicator', () => {
		for (const mode of ['auto', 'on', 'off'] as const) {
			assert.equal(effectiveOffset('Asia/Tokyo', JUL, mode), 540);
			assert.equal(dstLabel('Asia/Tokyo', JUL, mode), '');
		}
	});
});
