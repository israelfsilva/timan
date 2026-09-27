// Proporção da célula do terminal: k = alturaCélula / (2 · larguraCélula).
// k = 1 é a célula 1:2 da especificação, com o ponto Braille quadrado; k > 1 = célula
// mais alta, e os desenhos em Braille encolhem na vertical para compensar.

export const ASPECT_MIN = 0.5;
export const ASPECT_MAX = 2;
export const ASPECT_STEP = 0.05;

// Pede o tamanho da célula em pixels (xterm, iTerm2, kitty, WezTerm…). Resposta: ESC [ 6 ; h ; w t.
export const CELL_SIZE_QUERY = '\x1b[16t';

// Tempo que a resposta do 16t pode demorar; depois dele, fica o fallback.
export const CELL_SIZE_TIMEOUT = 100;

export function clampAspect(k: number): number {
	return Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, Math.round(k * 100) / 100));
}

// k da resposta do 16t; undefined se malformada, com zero ou fora da faixa plausível.
export function parseCellSize(reply: string): number | undefined {
	const m = /^\x1b\[6;(\d{1,5});(\d{1,5})t$/.exec(reply);
	if (!m) return undefined;
	const [h, w] = [Number(m[1]), Number(m[2])];
	if (h === 0 || w === 0) return undefined;
	const k = h / (2 * w);
	return k >= ASPECT_MIN && k <= ASPECT_MAX ? k : undefined;
}

// Tira do trecho lido do stdin a resposta do 16t (válida ou não, para não virar tecla)
// e devolve o k dela junto com o resto, que segue como tecla.
export function takeCellSize(chunk: string): { aspect?: number; rest: string } {
	const m = /\x1b\[6;[\d;]*t/.exec(chunk);
	if (!m) return { rest: chunk };
	const aspect = parseCellSize(m[0]);
	return { ...(aspect !== undefined && { aspect }), rest: chunk.slice(0, m.index) + chunk.slice(m.index + m[0].length) };
}

// Consulta o terminal sem bloquear: `onAspect` é chamado no máximo uma vez, se a resposta
// chegar dentro do timeout. Quem lê o stdin passa cada trecho por `feed`, que devolve o
// que sobra como tecla.
export function queryCellSize(write: (s: string) => void, onAspect: (k: number) => void) {
	let waiting = true;
	const timer = setTimeout(() => (waiting = false), CELL_SIZE_TIMEOUT);
	write(CELL_SIZE_QUERY);
	return {
		feed(chunk: string): string {
			const { aspect, rest } = takeCellSize(chunk);
			if (aspect !== undefined && waiting) {
				waiting = false;
				clearTimeout(timer);
				onAspect(aspect);
			}
			return rest;
		},
		cancel: () => clearTimeout(timer),
	};
}
