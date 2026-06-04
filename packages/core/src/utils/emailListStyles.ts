import type { GlobalStyles } from '../types';
import { findListItem, findListRoot } from './inlineListEditing';

/** 标记显式列表缩进；无此属性表示「默认」（画布 CSS + 导出时注入标准内联样式） */
export const LIST_INDENT_ATTR = 'data-sm-list-indent';

/** 导出/邮件客户端默认缩进（与画布 1.5em @16px 对齐） */
export const LIST_INDENT_DEFAULT_PX = 24;

export const LIST_INDENT_SLIDER_MAX = 48;

export const LIST_INDENT_PRESETS_PX = [0, 16, 24, 32, 40] as const;

/** 全局配置存库：内置默认 24 时不写入 listIndentDefaultPx */
export function normalizeGlobalListIndentStorage(px: number): number | undefined {
  const n = clampListIndent(px);
  return n === LIST_INDENT_DEFAULT_PX ? undefined : n;
}

/** null = 不设值（默认）；number = 显式左缩进 px，0 为与正文左缘对齐 */
export type ListIndentValue = number | null;

const LIST_STYLE_KEYS = [
  'padding-left',
  'margin',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'list-style-position',
  'list-style-type',
] as const;

const LI_STYLE_KEYS = ['margin', 'padding'] as const;

function parsePaddingLeftPx(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)(px)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

function readStyleProp(styleAttr: string | null, prop: string): string {
  if (!styleAttr) return '';
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = styleAttr.match(re);
  return m?.[1]?.trim() ?? '';
}

function mergeInlineStyle(
  el: HTMLElement,
  patch: Record<string, string | null>,
  managedKeys: readonly string[],
): void {
  const map = new Map<string, string>();
  const prev = el.getAttribute('style') ?? '';
  for (const part of prev.split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (key && val) map.set(key, val);
  }
  for (const key of managedKeys) map.delete(key);
  for (const [key, val] of Object.entries(patch)) {
    if (val == null || val === '') map.delete(key);
    else map.set(key, val);
  }
  const next = [...map.entries()].map(([k, v]) => `${k}:${v}`).join(';');
  if (next) el.setAttribute('style', next);
  else el.removeAttribute('style');
}

function stripManagedListStyles(list: HTMLUListElement | HTMLOListElement): void {
  mergeInlineStyle(list, {}, LIST_STYLE_KEYS);
}

function listMarkerType(list: HTMLUListElement | HTMLOListElement): string {
  return list.tagName === 'OL' ? 'decimal' : 'disc';
}

function applyExplicitListInline(
  list: HTMLUListElement | HTMLOListElement,
  paddingLeftPx: number,
): void {
  mergeInlineStyle(
    list,
    {
      'padding-left': `${paddingLeftPx}px`,
      margin: '0.5em 0',
      'list-style-position': 'outside',
      'list-style-type': listMarkerType(list),
    },
    LIST_STYLE_KEYS,
  );
  for (const li of Array.from(list.children)) {
    if (li.tagName !== 'LI') continue;
    mergeInlineStyle(li as HTMLLIElement, { margin: '0', padding: '0' }, LI_STYLE_KEYS);
  }
}

/** 读取当前列表缩进：无属性且无 padding-left 视为默认 null */
export function getListIndent(list: HTMLUListElement | HTMLOListElement): ListIndentValue {
  if (list.hasAttribute(LIST_INDENT_ATTR)) {
    const raw = list.getAttribute(LIST_INDENT_ATTR);
    if (raw == null || raw === 'default') return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? clampListIndent(n) : null;
  }
  const fromStyle =
    parsePaddingLeftPx(list.style.paddingLeft) ??
    parsePaddingLeftPx(readStyleProp(list.getAttribute('style'), 'padding-left'));
  return fromStyle;
}

export function clampListIndent(px: number): number {
  return Math.max(0, Math.min(LIST_INDENT_SLIDER_MAX, Math.round(px)));
}

/** 设置列表缩进；null 恢复为默认（移除显式标记与内联缩进） */
export function setListIndent(
  list: HTMLUListElement | HTMLOListElement,
  value: ListIndentValue,
): void {
  if (value === null) {
    list.removeAttribute(LIST_INDENT_ATTR);
    stripManagedListStyles(list);
    return;
  }
  const px = clampListIndent(value);
  list.setAttribute(LIST_INDENT_ATTR, String(px));
  applyExplicitListInline(list, px);
}

export function findListAtSelection(
  node: Node | null,
  root: HTMLElement,
): HTMLUListElement | HTMLOListElement | null {
  const li = findListItem(node, root);
  return li ? findListRoot(li) : null;
}

function resolveExportPaddingPx(
  list: HTMLUListElement | HTMLOListElement,
  globalDefaultPx: number,
): number {
  const explicit = getListIndent(list);
  if (explicit != null) return explicit;
  return globalDefaultPx;
}

/** 邮件设置中的列表默认缩进；未配置时返回内置 24px */
export function resolveGlobalListIndentPx(styles: GlobalStyles): number {
  const v = styles.listIndentDefaultPx;
  if (v === undefined) return LIST_INDENT_DEFAULT_PX;
  return clampListIndent(v);
}

/** 画布 CSS 变量值（px） */
export function globalListIndentCssVarValue(styles: GlobalStyles): string {
  return `${resolveGlobalListIndentPx(styles)}px`;
}

/** 编译后 HTML：统一 ul/ol 内联样式，剥离编辑态 data 属性 */
export function normalizeEmailListsInHtml(
  html: string,
  globalDefaultPx: number = LIST_INDENT_DEFAULT_PX,
): string {
  const src = (html ?? '').trim();
  if (!src || typeof DOMParser === 'undefined') return html;

  const doc = new DOMParser().parseFromString(src, 'text/html');
  const lists = doc.querySelectorAll('ul, ol');
  if (!lists.length) return html;

  lists.forEach((node) => {
    const list = node as HTMLUListElement | HTMLOListElement;
    const px = resolveExportPaddingPx(list, globalDefaultPx);
    applyExplicitListInline(list, px);
    list.removeAttribute(LIST_INDENT_ATTR);
  });

  const serialized = doc.documentElement.outerHTML;
  const doctype = src.match(/<!DOCTYPE[^>]*>/i)?.[0];
  return doctype ? `${doctype}\n${serialized}` : serialized;
}
