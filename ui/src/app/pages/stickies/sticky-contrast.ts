// Shared WCAG-contrast helpers for sticky surfaces (the card and the Keep modal both
// paint the sticky's color as the whole background, then pick a readable text color).

/** Default sticky-note color (classic Post-it yellow). */
export const DEFAULT_STICKY_COLOR = '#e5ca1f';

/** WCAG relative luminance (0–1) of a #rrggbb / #rgb color. */
export function relativeLuminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const toLin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLin(parseInt(h.slice(0, 2), 16) || 0);
  const g = toLin(parseInt(h.slice(2, 4), 16) || 0);
  const b = toLin(parseInt(h.slice(4, 6), 16) || 0);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Near-black or near-white text — whichever has the higher WCAG contrast against `bg`. */
export function contrastFg(bg: string): string {
  const L = relativeLuminance(bg);
  const contrastWhite = 1.05 / (L + 0.05);
  const contrastBlack = (L + 0.05) / 0.05;
  return contrastBlack >= contrastWhite ? '#1b1b1b' : '#fafafa';
}

/** Dimmed variant of the foreground for placeholders / secondary text. */
export function contrastDim(bg: string): string {
  return contrastFg(bg) === '#fafafa' ? 'rgba(250, 250, 250, 0.68)' : 'rgba(27, 27, 27, 0.6)';
}

export interface StickySwatch {
  name: string;
  value: string;
}

/** Google Keep palette — all light, auto-contrast picks dark text. Clark tweaks from here. */
export const STICKY_SWATCHES: StickySwatch[] = [
  { name: 'Coral', value: '#f28b82' },
  { name: 'Orange', value: '#fbbc04' },
  { name: 'Yellow', value: '#fff475' },
  { name: 'Sand', value: '#e5ca1f' },
  { name: 'Green', value: '#ccff90' },
  { name: 'Teal', value: '#a7ffeb' },
  { name: 'Light Blue', value: '#cbf0f8' },
  { name: 'Blue', value: '#aecbfa' },
  { name: 'Purple', value: '#d7aefb' },
  { name: 'Pink', value: '#fdcfe8' },
  { name: 'Brown', value: '#e6c9a8' },
  { name: 'Gray', value: '#e8eaed' },
];
