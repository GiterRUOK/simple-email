import type { EmailDoc } from '../types';
import {
  DYNAMIC_VARIANT_HTML_ATTR,
  getSectionDynamicVariantKey,
  isDynamicVariantSection,
  sectionMjClassName,
} from './dynamicVariantKey';

function serializeParsedHtml(doc: Document): string {
  const head = doc.head?.innerHTML || '';
  const body = doc.body?.innerHTML || '';
  return `${head}${body}`;
}

/**
 * 编译后为带 `dynamicVariantKey` 的 Section 根节点写入 `data-dv="{key}"`，供宿主 DOM 抽取。
 */
export function annotateDynamicVariantHtmlAttributes(html: string, doc: EmailDoc): string {
  const slots = doc.sections.filter(isDynamicVariantSection);
  if (!slots.length) return html;
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    for (const section of slots) {
      const key = getSectionDynamicVariantKey(section);
      if (!key) continue;
      const cls = sectionMjClassName(section.id);
      const marked = parsed.querySelector(`[${DYNAMIC_VARIANT_HTML_ATTR}="${key}"]`);
      if (marked) continue;
      const candidates = parsed.querySelectorAll(`[class~="${cls}"], [class*="${cls}"]`);
      let target: Element | null = null;
      for (const el of candidates) {
        const cn = el.getAttribute('class') || '';
        if (cn.split(/\s+/).includes(cls)) {
          target = el;
          break;
        }
      }
      if (!target && candidates.length) target = candidates[0];
      if (target) target.setAttribute(DYNAMIC_VARIANT_HTML_ATTR, key);
    }
    return serializeParsedHtml(parsed);
  } catch {
    return html;
  }
}
