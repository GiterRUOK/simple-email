import type { Registry } from '../registry/registry';
import { renderDoc } from '../renderer';
import type { EmailDoc } from '../types';
import { DYNAMIC_VARIANT_HTML_ATTR } from './dynamicVariantKey';
import {
  dynamicVariantPlaceholder,
  getSectionDynamicVariantKey,
  isDynamicVariantSection,
} from './dynamicVariantKey';

export {
  DYNAMIC_VARIANT_HTML_ATTR,
  dynamicVariantPlaceholder,
  getSectionDynamicVariantKey,
  isDynamicVariantSection,
  sectionMjClassName,
} from './dynamicVariantKey';

/** 仅编译某一 Section，返回邮件 body 内 HTML 片段 */
export function renderSectionBodyHtml(
  doc: EmailDoc,
  sectionId: string,
  registry: Registry,
): string {
  const section = doc.sections.find((s) => s.id === sectionId);
  if (!section) return '';
  const mini: EmailDoc = { ...doc, sections: [section] };
  const { html } = renderDoc(mini, registry, { withSampleVariables: false });
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    return (parsed.body?.innerHTML || '').trim();
  } catch {
    return '';
  }
}

export interface ExtractDynamicVariantSlotsResult {
  html: string;
  variants: Record<string, string>;
}

function replaceVariantMarkerInHtml(
  html: string,
  key: string,
): { html: string; variantHtml: string } | null {
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const el = parsed.querySelector(`[${DYNAMIC_VARIANT_HTML_ATTR}="${key}"]`);
    if (!el) return null;
    const variantHtml = el.outerHTML || '';
    const token = dynamicVariantPlaceholder(key);
    el.replaceWith(parsed.createTextNode(token));
    const head = parsed.head?.innerHTML || '';
    const body = parsed.body?.innerHTML || '';
    return { html: `${head}${body}`, variantHtml };
  } catch {
    return null;
  }
}

/**
 * 将带 `dynamicVariantKey` 的 Section 从全文 HTML 中替换为占位符，并返回各 key 的编译 HTML。
 * 优先使用导出 HTML 上的 `data-dv="{key}"` 标记。
 */
export function extractDynamicVariantSlots(
  html: string,
  doc: EmailDoc,
  registry: Registry,
): ExtractDynamicVariantSlotsResult {
  const slots = doc.sections.filter(isDynamicVariantSection);
  if (!slots.length) return { html, variants: {} };

  let resultHtml = html;
  const variants: Record<string, string> = {};

  for (const section of slots) {
    const key = getSectionDynamicVariantKey(section);
    if (!key) continue;

    const fromMarker = replaceVariantMarkerInHtml(resultHtml, key);
    if (fromMarker) {
      variants[key] = fromMarker.variantHtml;
      resultHtml = fromMarker.html;
      continue;
    }

    const snippet = renderSectionBodyHtml(doc, section.id, registry);
    if (!snippet) continue;
    variants[key] = snippet;
    const token = dynamicVariantPlaceholder(key);
    const idx = resultHtml.indexOf(snippet);
    if (idx >= 0) {
      resultHtml = resultHtml.slice(0, idx) + token + resultHtml.slice(idx + snippet.length);
    }
  }

  return { html: resultHtml, variants };
}
