/**
 * 邮件编辑器品牌/主题色：写入 .sm-root 的 --sm-primary / --sm-primary-soft。
 */

/** 合法则规范为 #RRGGBB（大写），否则 null */
export function normalizeAccentHex(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const h = t.replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return `#${(h[0] + h[0] + h[1] + h[1] + h[2] + h[2]).toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return `#${h.toUpperCase()}`;
  }
  return null;
}

/** 由 getComputedStyle 得到的 rgb(...) / rgba(...) 转 #rrggbb */
export function rgbCssToHex(rgb: string): string | null {
  const m = rgb.trim().match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  const h = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}

/**
 * 与浅色/深色界面配套的浅底强调色（选区、滑块 accent 等）。
 */
export function accentPrimarySoftRgba(primaryHex: string, isDarkChrome: boolean): string {
  const hex = normalizeAccentHex(primaryHex);
  if (!hex) return isDarkChrome ? 'rgba(129, 140, 248, 0.18)' : 'rgba(79, 70, 229, 0.12)';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = isDarkChrome ? 0.22 : 0.14;
  return `rgba(${r},${g},${b},${a})`;
}
