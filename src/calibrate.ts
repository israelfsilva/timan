import { ANALOG_WIDTH, analogRows, renderAnalog } from './analog.ts';
import { ASPECT_STEP, clampAspect, queryCellSize, takeCellSize } from './aspect.ts';
import { type Config, loadConfig, saveConfig } from './config.ts';
import { panel } from './panel.ts';
import { buildRows } from './table.ts';
import { paint } from './theme.ts';
import { localZone } from './time.ts';

// timan calibrate: the analog face on its own, to calibrate the cell k by eye
// (the dial must look round). + and − adjust, enter saves ui.cellAspect, esc quits without saving.
//   ╭─ analog ──────────────────────╮
//   │            …                  │
//   ╰────────────────── k 1.05 ───╯
//     +/− adjust · enter save · esc quit

const HELP = '+/− adjust · enter save · esc quit';

export const formatAspect = (k: number) => k.toFixed(2);

// Whole frame, centered in a cols × rows terminal. Pure.
export function calibrationFrame(wall: Date | undefined, k: number, cols: number, rows: number): string[] {
	const width = ANALOG_WIDTH + 2;
	const box = [...panel('analog', renderAnalog(wall, k), width, analogRows(k) + 2, `k ${formatAspect(k)}`), ''];
	const pad = ' '.repeat(Math.max(0, Math.floor((cols - width) / 2)));
	const help = ' '.repeat(Math.max(0, Math.floor((cols - HELP.length) / 2))) + paint(HELP, { fg: 'secondary' });
	const top: string[] = Array(Math.max(0, Math.floor((rows - box.length - 1) / 2))).fill('');
	return [...top, ...box.map((l) => pad + l), help];
}

export function runCalibration(config: Config, path: string): void {
	const { stdin, stdout } = process;
	let k = config.ui.cellAspect ?? 1;
	let touched = false; // after the first +/−, the terminal's reply no longer overrides
	let timer: NodeJS.Timeout | undefined;
	let done = false;

	const draw = () => {
		const wall = buildRows(config, localZone(), new Date())[0]!.time?.wall;
		const lines = calibrationFrame(wall, k, stdout.columns, stdout.rows);
		// The panel height changes with k: clear everything on each frame.
		stdout.write('\x1b[H\x1b[2J' + lines.join('\r\n'));
	};
	const tick = () => {
		draw();
		timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 2);
	};

	const cleanup = () => {
		if (done) return;
		done = true;
		clearTimeout(timer);
		query?.cancel();
		stdin.setRawMode(false);
		stdin.pause();
		stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l');
	};

	process.on('exit', cleanup);
	process.on('SIGTERM', () => process.exit(0));
	stdout.write('\x1b[?1049h\x1b[?25l');
	stdin.setRawMode(true);
	stdin.setEncoding('utf8');
	stdin.resume();
	stdout.on('resize', draw);
	tick();

	// With no saved k, start from whatever the terminal reports.
	const query =
		config.ui.cellAspect === undefined
			? queryCellSize(
					(s) => stdout.write(s),
					(q) => {
						if (touched) return;
						k = clampAspect(q);
						draw();
					},
				)
			: undefined;

	stdin.on('data', (chunk: string) => {
		const key = query ? query.feed(chunk) : takeCellSize(chunk).rest;
		switch (key) {
			case '+':
			case '=':
				touched = true;
				k = clampAspect(k + ASPECT_STEP);
				return draw();
			case '-':
			case '_':
				touched = true;
				k = clampAspect(k - ASPECT_STEP);
				return draw();
			case '\r':
			case '\n': {
				// Re-read the file so we don't undo what the TUI saved while this was open.
				const fresh = loadConfig(path);
				saveConfig(path, { ...fresh, ui: { ...fresh.ui, cellAspect: k } });
				cleanup();
				console.log(`timan: ui.cellAspect = ${formatAspect(k)} saved to ${path}`);
				return process.exit(0);
			}
			case '\x1b':
			case 'q':
			case 'Q':
			case '\x03':
				return process.exit(0);
		}
	});
}
