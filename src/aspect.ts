// Terminal cell aspect: k = cellHeight / (2 · cellWidth).
// k = 1 is the spec's 1:2 cell, with square Braille dots; k > 1 = taller cell,
// and Braille drawings shrink vertically to compensate.

export const ASPECT_MIN = 0.5;
export const ASPECT_MAX = 2;
export const ASPECT_STEP = 0.05;

// Asks for the cell size in pixels (xterm, iTerm2, kitty, WezTerm…). Reply: ESC [ 6 ; h ; w t.
export const CELL_SIZE_QUERY = '\x1b[16t';

// How long the 16t reply may take; after that, the fallback stays.
export const CELL_SIZE_TIMEOUT = 100;

export function clampAspect(k: number): number {
	return Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, Math.round(k * 100) / 100));
}

// k from a 16t reply; undefined if malformed, zero, or outside the plausible range.
export function parseCellSize(reply: string): number | undefined {
	const m = /^\x1b\[6;(\d{1,5});(\d{1,5})t$/.exec(reply);
	if (!m) return undefined;
	const [h, w] = [Number(m[1]), Number(m[2])];
	if (h === 0 || w === 0) return undefined;
	const k = h / (2 * w);
	return k >= ASPECT_MIN && k <= ASPECT_MAX ? k : undefined;
}

// Strips the 16t reply from a chunk read from stdin (valid or not, so it doesn't become a key)
// and returns its k along with the rest, which goes on as keys.
export function takeCellSize(chunk: string): { aspect?: number; rest: string } {
	const m = /\x1b\[6;[\d;]*t/.exec(chunk);
	if (!m) return { rest: chunk };
	const aspect = parseCellSize(m[0]);
	return { ...(aspect !== undefined && { aspect }), rest: chunk.slice(0, m.index) + chunk.slice(m.index + m[0].length) };
}

// Queries the terminal without blocking: `onAspect` is called at most once, if the reply
// arrives within the timeout. Whoever reads stdin passes each chunk through `feed`, which
// returns what is left as keys.
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
