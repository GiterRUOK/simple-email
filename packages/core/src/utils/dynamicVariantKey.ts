import type { Section } from '../types';

/**
 * 导出 HTML 上标记动态变量组合的宿主约定属性名（值为 `Section.attrs.dynamicVariantKey`）。
 */
export const DYNAMIC_VARIANT_HTML_ATTR = 'data-dv';

/** 本节导出后替换为 `{{dynamicVariantKey}}`，内容由宿主写入 dynamicVariant */
export function getSectionDynamicVariantKey(section: Section): string | undefined {
  const key = String(section.attrs.dynamicVariantKey ?? '').trim();
  return key || undefined;
}

export function isDynamicVariantSection(section: Section): boolean {
  return !!getSectionDynamicVariantKey(section);
}

export function dynamicVariantPlaceholder(key: string): string {
  return `{{${String(key).trim()}}}`;
}

export function sectionMjClassName(sectionId: string): string {
  return `sm-sec-${sectionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}
