/**
 * 内容区 / 按钮等「布局宽度」解析：数字与无单位数字按 px；支持显式 `px` 与 `%`。
 */

function coerceCssWidth(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.round(raw);
    return n > 0 ? `${n}px` : undefined;
  }
  const s = String(raw).trim();
  if (!s) return undefined;
  if (/^\d+(\.\d+)?%$/.test(s)) return s;
  if (/^\d+(\.\d+)?px$/i.test(s)) return s.replace(/px$/i, 'px');
  if (/^\d+(\.\d+)?$/.test(s)) return `${s}px`;
  return undefined;
}

/** 邮件 `meta.width` → CSS / mj-body 可用的宽度（非法则 600px） */
export function docContentWidthCss(raw: unknown): string {
  return coerceCssWidth(raw) ?? '600px';
}

/** 右栏输入解析存库：纯整数可存 number，其它存 string */
export function parseMetaWidthFromUserInput(input: string): number | string {
  const t = input.trim();
  if (!t) return 600;
  if (/^\d+(\.\d+)?%$/.test(t)) return t;
  if (/^\d+(\.\d+)?px$/i.test(t)) return t.replace(/PX$/i, 'px');
  if (/^\d+$/.test(t)) return Number(t);
  if (/^\d+\.\d+$/.test(t)) return `${t}px`;
  return t;
}

export function metaWidthInputString(raw: unknown): string {
  if (raw == null) return '600';
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return String(raw);
}

/** 按钮 / Section 等：可选宽度，空或 auto 表示不限制 */
export function blockButtonWidthCss(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'auto') return undefined;
  return coerceCssWidth(s);
}

/** Section 右栏输入；空字符串表示清除宽度 */
export function parseSectionWidthFromUserInput(input: string): string | number | undefined {
  const t = input.trim();
  if (!t) return undefined;
  if (/^\d+(\.\d+)?%$/.test(t)) return t;
  if (/^\d+(\.\d+)?px$/i.test(t)) return t.replace(/PX$/i, 'px');
  if (/^\d+$/.test(t)) return Number(t);
  if (/^\d+\.\d+$/.test(t)) return `${t}px`;
  return t;
}

export function sectionWidthInputString(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return String(raw);
}
