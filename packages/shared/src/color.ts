export type Color = 'white' | 'black';

export const COLORS: readonly Color[] = ['white', 'black'];

export function oppositeColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

export function colorFromTurn(turn: 'w' | 'b'): Color {
  return turn === 'w' ? 'white' : 'black';
}

export function isColor(value: unknown): value is Color {
  return value === 'white' || value === 'black';
}
