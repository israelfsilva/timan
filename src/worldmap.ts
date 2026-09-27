import { BrailleCanvas } from './braille.ts';
import { paint } from './theme.ts';
import { WORLD, WORLD_HEIGHT, WORLD_WIDTH } from './world.ts';

// Mapa-múndi equirretangular em Braille: cada célula tem 2×4 pontos.
// Com 48 células de largura, 1 ponto = 3,75° e 1 hora = 15° = 2 colunas.
// O tamanho segue a proporção do bitset (96×40 pontos = 360°×150°): com largura PW
// em pontos, a altura é PW · 150/360 / k, onde k é a proporção da célula (aspect.ts).
// Com k = 1, 48×10 células (4,8:1). Maior que o bitset, ele é ampliado por vizinho mais próximo.

const land = Buffer.from(WORLD, 'base64');

function isLand(x: number, y: number): boolean {
	const i = y * WORLD_WIDTH + x;
	return (land[i >> 3]! & (1 << (i & 7))) !== 0;
}

// Células por linha de mapa na proporção equirretangular: (96/2) / (40/4) = 4,8.
const ASPECT = WORLD_WIDTH / 2 / (WORLD_HEIGHT / 4);

// Maior mapa na proporção que cabe em width × height células (sem régua e índices).
// Células por linha: ASPECT · k (célula mais alta = menos linhas para a mesma largura).
export function mapSize(width: number, height: number, k: number): { width: number; height: number } {
	const ratio = ASPECT * k;
	const w = Math.max(1, Math.min(width, Math.floor(height * ratio)));
	return { width: w, height: Math.max(1, Math.round(w / ratio)) };
}

// Coluna esquerda da faixa de um offset (minutos) num mapa de `width` células.
// Com 48 células é (offset_h·15 + 180)/7,5 − 1. Dá a volta no antimeridiano (UTC+14 cai no Pacífico).
export function bandColumn(offset: number, width: number): number {
	const col = Math.floor(((offset / 60) * 15 + 180) * (width / 360)) - 1;
	return ((col % width) + width) % width;
}

// As duas colunas da faixa (1 hora = 2 colunas com 48 células). Quando a faixa cruza
// o antimeridiano, sai em dois pedaços: a última coluna e a primeira.
export function bandColumns(offset: number, width: number): [number, number] {
	const col = bandColumn(offset, width);
	return [col, (col + 1) % width];
}

export interface MapMarker {
	label: string; // um caractere: o índice do Tn
	offset: number;
	selected: boolean;
}

// `height` linhas de mapa, régua com ┴ a cada 3h e linha de índices.
// O bitset é reamostrado por vizinho mais próximo nos dois eixos.
export function renderMap(width: number, height: number, markers: MapMarker[]): string[] {
	const sel = markers.find((m) => m.selected);
	const band: number[] = sel ? bandColumns(sel.offset, width) : [];
	const inBand = (c: number) => band.includes(c);
	const srcX = (dot: number) => Math.floor((dot * WORLD_WIDTH) / (width * 2));
	const srcY = (dot: number) => Math.floor((dot * WORLD_HEIGHT) / (height * 4));

	const canvas = new BrailleCanvas(width, height);
	for (let y = 0; y < canvas.dotsHigh; y++) {
		for (let x = 0; x < canvas.dotsWide; x++) {
			if (isLand(srcX(x), srcY(y))) canvas.set(x, y);
		}
	}

	const lines: string[] = [];
	for (let row = 0; row < height; row++) {
		let line = '';
		for (let c = 0; c < width; c++) {
			const ch = canvas.char(c, row);
			line += inBand(c) ? paint(ch, { fg: 'landBand', bg: 'highlight' }) : paint(ch, { fg: 'land' });
		}
		lines.push(line);
	}

	// ┴ a cada 3h = 45°.
	const ticks = new Set(Array.from({ length: 8 }, (_, k) => Math.floor((k * width) / 8)));
	let ruler = '';
	for (let c = 0; c < width; c++) ruler += ticks.has(c) ? '┴' : '─';
	lines.push(paint(ruler, { fg: 'border' }));

	// Índice de cada Tn na coluna direita da sua faixa; o selecionado ganha a posição em caso de empate.
	const labels: string[] = Array(width).fill(' ');
	for (const m of [...markers].sort((a, b) => Number(a.selected) - Number(b.selected))) {
		const col = bandColumns(m.offset, width)[1];
		labels[col] = m.selected ? paint(m.label, { fg: 'lit', bold: true }) : paint(m.label, { fg: 'secondary' });
	}
	lines.push(labels.join(''));
	return lines;
}
