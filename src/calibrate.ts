import { ANALOG_WIDTH, analogRows, renderAnalog } from './analog.ts';
import { ASPECT_STEP, clampAspect, queryCellSize, takeCellSize } from './aspect.ts';
import { type Config, loadConfig, saveConfig } from './config.ts';
import { panel } from './panel.ts';
import { buildRows } from './table.ts';
import { paint } from './theme.ts';
import { localZone } from './time.ts';

// timan --demo analog: o analógico sozinho, para calibrar o k da célula no olho
// (o mostrador tem que ficar redondo). + e − ajustam, enter grava ui.cellAspect, esc sai sem gravar.
//   ╭─ analog ──────────────────────╮
//   │            …                  │
//   ╰────────────────── k 1,05 ───╯
//     +/− ajusta · enter salva · esc sai

const HELP = '+/− adjust · enter save · esc quit';

export const formatAspect = (k: number) => k.toFixed(2);

// Quadro inteiro, centralizado num terminal de cols × rows. Pura.
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
	let touched = false; // depois do primeiro +/−, a resposta do terminal não sobrescreve mais
	let timer: NodeJS.Timeout | undefined;
	let done = false;

	const draw = () => {
		const wall = buildRows(config, localZone(), new Date())[0]!.time?.wall;
		const lines = calibrationFrame(wall, k, stdout.columns, stdout.rows);
		// A altura do painel muda com k: limpa tudo a cada quadro.
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

	// Sem k gravado, começa pelo que o terminal disser.
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
				// Relê o arquivo para não desfazer o que a TUI gravou enquanto isto estava aberto.
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
