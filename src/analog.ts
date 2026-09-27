import { BrailleCanvas } from './braille.ts';
import { type Color, paint } from './theme.ts';

// Relógio analógico em Braille, 31 células de largura = 62 pontos. A altura depende
// da proporção k da célula (veja aspect.ts): as distâncias verticais são divididas
// por k, para o ponto não sair esticado. Com k = 1 são 14 linhas = 56 pontos.
// Mostrador: um ponto por minuto, traço a cada 5 e os minutos (60, 05…55) por fora.

export const ANALOG_WIDTH = 31;

// Centro no meio da célula 15, na divisa das duas linhas do meio. Raios em pontos.
const CX = 31;
const DIAL = 21;
const TICK = 18;
const LABELS = 26;
const HOUR_HAND = 11;
const MINUTE_HAND = 17;
const SECOND_HAND = 19;

// Camadas em ordem de prioridade: na célula dividida, vale a maior.
const DIAL_LAYER = 1;
const SECOND_LAYER = 2;
const HAND_LAYER = 3;
const LAYER_COLOR: Record<number, Color> = { [DIAL_LAYER]: 'land', [SECOND_LAYER]: 'landBand', [HAND_LAYER]: 'lit' };

// Linhas para a proporção k: os rótulos (raio LABELS / k na vertical) mais uma folga
// de 2 pontos em cima e embaixo, em número par para o centro cair na divisa de linhas.
export function analogRows(k: number): number {
	return 2 * Math.ceil((LABELS / k + 2) / 4);
}

// Ponto a `r` do centro na fração `turn` de volta (0 = 12h, sentido horário), com
// centro em (CX, cy) e a vertical dividida por k.
function polar(cy: number, k: number, turn: number, r: number): [number, number] {
	const a = turn * 2 * Math.PI;
	return [CX + r * Math.sin(a), cy - (r / k) * Math.cos(a)];
}

// `wall` é um wallClock (campos UTC = hora de parede); sem ele, só o mostrador
// (zona desconhecida). analogRows(k) linhas de 31 colunas.
export function renderAnalog(wall: Date | undefined, k: number): string[] {
	const rows = analogRows(k);
	const cy = rows * 2;
	const at = (turn: number, r: number) => polar(cy, k, turn, r);
	const canvas = new BrailleCanvas(ANALOG_WIDTH, rows);

	// Ponteiro grosso: três traços paralelos, afastados meio ponto na perpendicular.
	const thickHand = (turn: number, length: number) => {
		const a = turn * 2 * Math.PI;
		const [nx, ny] = [Math.cos(a) * 0.6, (Math.sin(a) * 0.6) / k];
		const [x, y] = at(turn, length);
		for (const j of [-1, 0, 1]) canvas.line(CX + j * nx, cy + j * ny, x + j * nx, y + j * ny, HAND_LAYER);
	};

	for (let i = 0; i < 60; i++) {
		if (i % 5 === 0) canvas.line(...at(i / 60, TICK), ...at(i / 60, DIAL), DIAL_LAYER);
		else canvas.set(...at(i / 60, DIAL), DIAL_LAYER);
	}
	if (wall) {
		const h = wall.getUTCHours() % 12;
		const m = wall.getUTCMinutes();
		const s = wall.getUTCSeconds();
		canvas.line(CX, cy, ...at(s / 60, SECOND_HAND), SECOND_LAYER);
		thickHand((m + s / 60) / 60, MINUTE_HAND);
		thickHand((h + m / 60 + s / 3600) / 12, HOUR_HAND);
	}

	// Minutos por fora do mostrador, centrados no ponto do anel. O meio-termo
	// arredonda para longe do centro, para os lados espelharem (60 e 30 ficam em 14–15).
	const labels = new Map<string, string>();
	for (let i = 0; i < 60; i += 5) {
		const [x, y] = at(i / 60, LABELS);
		const v = Math.round((x / 2 - 1) * 1e6) / 1e6; // sin(π) não é 0 exato
		const col = v > CX / 2 - 1 ? Math.round(v) : -Math.round(-v);
		const row = Math.min(rows - 1, Math.floor(y / 4));
		const text = String(i || 60).padStart(2, '0');
		labels.set(`${col},${row}`, text[0]!);
		labels.set(`${col + 1},${row}`, text[1]!);
	}

	const lines: string[] = [];
	for (let row = 0; row < rows; row++) {
		let line = '';
		for (let col = 0; col < ANALOG_WIDTH; col++) {
			const label = labels.get(`${col},${row}`);
			const layer = canvas.layer(col, row);
			if (label) line += paint(label, { fg: 'secondary' });
			else line += layer ? paint(canvas.char(col, row), { fg: LAYER_COLOR[layer]! }) : canvas.char(col, row);
		}
		lines.push(line);
	}
	return lines;
}
