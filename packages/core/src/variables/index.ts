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

/** 无后端 sample 时按 kind / label 生成预览用示例值（仅预览弹窗等场景） */
export function defaultVariableSample(v: Pick<Variable, 'key' | 'label' | 'kind' | 'sample'>): string {
  if (v.sample != null && String(v.sample).trim() !== '') return String(v.sample);
  if (v.kind === 'image') return 'https://via.placeholder.com/120x80/e8e8e8/666666?text=Image';
  if (v.kind === 'link') return '#';
  return v.label?.trim() || v.key;
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

export function buildLinkVariableHtml(token: string, linkColor: string): string {
  const safeHref = token.replace(/"/g, '&quot;');
  const safeText = token
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<a href="${safeHref}" style="color:${linkColor} !important;text-decoration:underline;">${safeText}</a>`;
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
