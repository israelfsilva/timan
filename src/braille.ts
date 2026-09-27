// Canvas em Braille: cada célula tem 2×4 pontos (U+2800 + máscara).
// Cada ponto aceso guarda uma camada (1..255); a célula assume a maior delas,
// para quem pinta decidir a cor quando traços diferentes dividem a célula.

// Bit de cada ponto (dx, dy) dentro da célula.
const DOT_BITS = [
	[0x01, 0x02, 0x04, 0x40],
	[0x08, 0x10, 0x20, 0x80],
];

export class BrailleCanvas {
	readonly width: number; // em células
	readonly height: number;
	readonly dotsWide: number;
	readonly dotsHigh: number;
	private readonly masks: Uint8Array;
	private readonly layers: Uint8Array;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.dotsWide = width * 2;
		this.dotsHigh = height * 4;
		this.masks = new Uint8Array(width * height);
		this.layers = new Uint8Array(width * height);
	}

	// Coordenadas em pontos; fracionárias caem no ponto que as contém, fora do canvas são ignoradas.
	set(x: number, y: number, layer = 1): void {
		const px = Math.floor(x);
		const py = Math.floor(y);
		if (px < 0 || py < 0 || px >= this.dotsWide || py >= this.dotsHigh) return;
		const i = (py >> 2) * this.width + (px >> 1);
		this.masks[i]! |= DOT_BITS[px & 1]![py & 3]!;
		this.layers[i] = Math.max(this.layers[i]!, layer);
	}

	// Segmento amostrado a cada meio ponto: sem buracos em nenhuma inclinação.
	line(x0: number, y0: number, x1: number, y1: number, layer = 1): void {
		const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2);
		for (let k = 0; k <= steps; k++) {
			const t = steps ? k / steps : 0;
			this.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, layer);
		}
	}

	char(col: number, row: number): string {
		return String.fromCodePoint(0x2800 + this.masks[row * this.width + col]!);
	}

	// 0 = célula vazia.
	layer(col: number, row: number): number {
		return this.layers[row * this.width + col]!;
	}
}
