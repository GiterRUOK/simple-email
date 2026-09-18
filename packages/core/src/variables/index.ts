import type { Variable } from '../types';

export type VariableKind = 'text' | 'link' | 'image';

/** 从 Mustache token 提取 key，如 `{{username}}` → `username` */
export function tokenToVariableKey(token: string): string {
  const t = String(token || '').trim();
  const m = t.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  return (m?.[1] || t.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '')).trim();
}

export function variablePlaceholder(key: string): string {
  return `{{${key}}}`;
}

/** 无显式 sample 时保留 Mustache 占位符；仅当宿主传入 sample 才用于可选的示例替换。 */
export function defaultVariableSample(
  v: Pick<Variable, 'key' | 'label' | 'kind' | 'sample'>,
): string {
  if (v.sample != null && String(v.sample).trim() !== '') return String(v.sample);
  const key = v.key?.trim() || tokenToVariableKey(String(v.key));
  return variablePlaceholder(key);
}

/** 规范化 Variable（补 kind、sample） */
export function normalizeVariable(v: Variable): Variable {
  const key = v.key?.trim() || tokenToVariableKey(String(v.key));
  const kind = v.kind ?? 'text';
  return {
    ...v,
    key,
    kind,
    sample: defaultVariableSample({ ...v, key, kind }),
  };
}

/**
 * 变量原子 chip 的标记属性。
 *
 * chip 是变量 token 在 InlineEditor 编辑会话中的 DOM 形态：
 * `<span data-sm-var="key" contenteditable="false">{{key}}</span>`。
 * contenteditable=false 让浏览器把它当不可分割单元——选区无法进入内部，
 * 加粗 / 变色 / 打字 / 退格都不会把 `{{key}}` 切成 `{<b>{key</b>}}` 这类断裂形态。
 * 仅存在于编辑态 DOM；commit 时由 sanitizeRichHtml 还原为纯 token（见 unwrapVariableChip），
 * 数据模型与导出产物中不会出现 chip。
 */
export const VARIABLE_CHIP_ATTR = 'data-sm-var';

/**
 * 结构完整但 key 不在宿主变量列表（发送端不会替换）的 chip 标记。
 * 高亮判据与 renderer 的 replaceVariables 对齐：key 在列表内 ⇔ 会被替换 ⇔ 正常高亮；
 * 未知 key 保留原子保护但换警示样式，让拼写错误在编辑期自我暴露而不是自我隐藏。
 */
export const VARIABLE_CHIP_UNKNOWN_ATTR = 'data-sm-var-unknown';

const escapeHtmlText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeHtmlAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 生成变量原子 chip 的 HTML（编辑会话内使用，见 {@link VARIABLE_CHIP_ATTR}）。
 * known=false 时额外标记 {@link VARIABLE_CHIP_UNKNOWN_ATTR}（警示样式）。
 */
export function variableChipHtml(token: string, options?: { known?: boolean }): string {
  const key = tokenToVariableKey(token);
  const safeAttr = escapeHtmlAttr(key);
  const safeText = escapeHtmlText(token);
  const unknownMark = options?.known === false ? ` ${VARIABLE_CHIP_UNKNOWN_ATTR}=""` : '';
  return `<span ${VARIABLE_CHIP_ATTR}="${safeAttr}" contenteditable="false"${unknownMark}>${safeText}</span>`;
}

export function buildLinkVariableHtml(
  token: string,
  linkColor: string,
  options?: { atomicText?: boolean },
): string {
  const safeHref = token.replace(/"/g, '&quot;');
  const safeText = escapeHtmlText(token);
  /** atomicText：编辑会话内插入时用原子 chip 做显示文本，防止样式命令切断 token */
  const textHtml = options?.atomicText ? variableChipHtml(token) : safeText;
  return `<a href="${safeHref}" style="color:${linkColor} !important;text-decoration:underline;">${textHtml}</a>`;
}

export interface BodyVariableInsert {
  content: string;
  asHtml: boolean;
}

/** 插入变量 key（`{{key}}`） */
export function buildBodyVariableKeyInsert(v: Variable): BodyVariableInsert {
  const normalized = normalizeVariable(v);
  return { content: variablePlaceholder(normalized.key), asHtml: false };
}

/** 插入链接 / 图片等元素片段 */
export function buildBodyVariableElementInsert(
  v: Variable,
  options?: { linkColor?: string; token?: string },
): BodyVariableInsert {
  const normalized = normalizeVariable(v);
  const token = options?.token?.trim() || variablePlaceholder(normalized.key);
  const linkColor = options?.linkColor?.trim() || '#ff5a00';

  if (normalized.kind === 'link') {
    return {
      content: buildLinkVariableHtml(token, linkColor),
      asHtml: true,
    };
  }
  if (normalized.kind === 'image') {
    const alt = tokenToVariableKey(token);
    return {
      content: `<img src="${token.replace(/"/g, '&quot;')}" alt="${alt.replace(/"/g, '&quot;')}" width="100" style="max-width:100%;height:auto;display:block;border:0;" />`,
      asHtml: true,
    };
  }
  return buildBodyVariableKeyInsert(normalized);
}

/** @deprecated 使用 buildBodyVariableKeyInsert / buildBodyVariableElementInsert */
export function buildBodyVariableInsert(
  v: Variable,
  options?: { linkColor?: string; token?: string },
): BodyVariableInsert {
  const normalized = normalizeVariable(v);
  if (normalized.kind === 'link' || normalized.kind === 'image') {
    return buildBodyVariableElementInsert(normalized, options);
  }
  return buildBodyVariableKeyInsert(normalized);
}
