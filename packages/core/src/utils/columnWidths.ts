/**
 * 列宽内联化（编译后处理）。
 *
 * MJML 的多列布局是「行内移动端宽度 + 媒体查询桌面宽度」两段式：
 * 列 div 的行内样式写死 `width:100%`，桌面宽度由
 * `@media only screen and (min-width:480px) { .mj-column-per-50 { width:50% !important; } }` 提供。
 *
 * 但部分邮件客户端与网页邮箱（临时邮箱预览、部分 sanitize 过度的转发页面等）会剥离
 * `<style>` 与 `class`，媒体查询随之失效，行内的 `width:100%` 就会让多列退化成纵向堆叠。
 *
 * 这里把媒体查询里的列宽写成行内样式：
 *  - 支持 `<style>` 的客户端：媒体查询带 `!important`，优先级高于行内样式，行为与之前完全一致；
 *  - 剥离 `<style>` 的客户端：行内宽度兜底，至少保住多列布局。
 *
 * 同时补一条小屏重置规则（仅作用于本次内联过、且不在 mj-group 内的列），
 * 让支持 `<style>` 的客户端在 480px 以下仍然按 MJML 原语义堆叠。
 */
import { serializeParsedHtmlDocument } from './html';

/** 与 MJML 默认堆叠断点（min-width:480px）互补的小屏断点 */
const MOBILE_STACK_BREAKPOINT = 479;

/** 打在「已内联宽度、且需要小屏堆叠」的列上 */
const STACKABLE_COLUMN_CLASS = 'sm-stack-col';

/**
 * 打在 mj-group（移动端保留列）内的 mj-column 上。
 * 这类列任何宽度下都不堆叠，因此不参与小屏重置。
 */
export const COLUMN_NO_STACK_CLASS = 'sm-nostack';

interface ColumnWidthRule {
  width: string;
  maxWidth?: string;
}

function firstDeclaration(block: string, prop: string): string | undefined {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(block);
  if (!m) return undefined;
  return m[1].replace(/!\s*important/gi, '').trim();
}

/** 从编译产物 head 的 CSS 里抽取 `.mj-column-per-XX { width/ max-width }` 规则 */
function parseColumnWidthRules(css: string): Map<string, ColumnWidthRule> {
  const rules = new Map<string, ColumnWidthRule>();
  if (!css) return rules;

  const re = /\.mj-column-per-([^\s,{]+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const width = firstDeclaration(m[2], 'width');
    if (!width) continue;
    const className = `mj-column-per-${m[1]}`;
    if (rules.has(className)) continue;
    rules.set(className, { width, maxWidth: firstDeclaration(m[2], 'max-width') });
  }
  return rules;
}

function collectStyleText(parsed: Document): string {
  return Array.from(parsed.querySelectorAll('style'))
    .map((s) => s.textContent || '')
    .join('\n');
}

/** 行内样式里已写明宽度且不是 100% 时（如 mj-group 内的列）保持原样 */
function applyColumnWidth(el: Element, rule: ColumnWidthRule): boolean {
  const style = el.getAttribute('style') || '';
  const currentWidth = firstDeclaration(style, 'width')?.toLowerCase();
  if (currentWidth && currentWidth !== '100%') return false;

  let next = style;
  if (new RegExp('(?:^|;)\\s*width\\s*:', 'i').test(next)) {
    // 保留前导的 `;`，否则会吞掉上一条声明的分隔符
    next = next.replace(/((?:^|;)\s*)width\s*:\s*[^;]*/i, `$1width:${rule.width}`);
  } else {
    const base = next.trim().replace(/;+$/, '');
    next = base ? `${base};width:${rule.width}` : `width:${rule.width}`;
  }

  if (rule.maxWidth) {
    if (new RegExp('(?:^|;)\\s*max-width\\s*:', 'i').test(next)) {
      next = next.replace(
        /((?:^|;)\s*)max-width\s*:\s*[^;]*/i,
        `$1max-width:${rule.maxWidth}`,
      );
    } else {
      next = `${next};max-width:${rule.maxWidth}`;
    }
  }

  next = next.replace(/;{2,}/g, ';').replace(/^\s*;/, '');

  if (next === style) return false;
  el.setAttribute('style', next);
  return true;
}

function appendStackResetRule(parsed: Document): void {
  const style = parsed.createElement('style');
  style.setAttribute('type', 'text/css');
  style.textContent = `\n      @media only screen and (max-width:${MOBILE_STACK_BREAKPOINT}px) {\n        .${STACKABLE_COLUMN_CLASS} { width:100% !important; max-width:100% !important; }\n      }\n    `;
  parsed.head.appendChild(style);
}

/**
 * 把 MJML 媒体查询中的列宽内联到列元素上，避免 `<style>` / `class` 被剥离后多列纵向堆叠。
 * 无法解析 HTML 或未找到列宽规则时原样返回。
 */
export function inlineColumnWidthsInHtml(html: string): string {
  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return html;
  }

  const rules = parseColumnWidthRules(collectStyleText(parsed));
  if (!rules.size) return html;

  let changed = false;
  let stackable = false;

  for (const el of Array.from(parsed.querySelectorAll('[class]'))) {
    const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    if (!classes.length) continue;

    let matched: ColumnWidthRule | undefined;
    for (const c of classes) {
      const rule = rules.get(c);
      if (rule) {
        matched = rule;
        break;
      }
    }
    if (!matched) continue;

    if (!applyColumnWidth(el, matched)) continue;
    changed = true;

    if (!classes.includes(COLUMN_NO_STACK_CLASS)) {
      el.classList.add(STACKABLE_COLUMN_CLASS);
      stackable = true;
    }
  }

  if (!changed) return html;
  if (stackable) appendStackResetRule(parsed);

  return serializeParsedHtmlDocument(parsed, html);
}
