import type {
  Column,
  EmailDoc,
  RenderContext,
  Section,
  SectionLayout,
} from '../types';
import type { Registry } from '../registry/registry';
import { escapeAttr } from '../utils/dom';

/**
 * Schema → MJML 字符串。
 *
 * 不直接编译成 HTML——HTML 编译交给 `mjml-browser`，
 * 这一层只负责把数据模型翻译成 MJML 语义化标签。
 */
export function docToMjml(doc: EmailDoc, registry: Registry): string {
  const ctx: RenderContext = { doc, engine: 'mjml' };
  const attrs = doc.styles;

  const sections = doc.sections.map((s) => sectionToMjml(s, registry, ctx)).join('\n');

  return `<mjml>
  <mj-head>
    <mj-title>${escapeAttr(doc.meta.subject || '')}</mj-title>
    ${doc.meta.preheader ? `<mj-preview>${escapeAttr(doc.meta.preheader)}</mj-preview>` : ''}
    <mj-attributes>
      <mj-all font-family="${escapeAttr(attrs.fontFamily)}" />
      <mj-text font-size="${escapeAttr(attrs.fontSize)}" color="${escapeAttr(attrs.color)}" line-height="${escapeAttr(attrs.lineHeight)}" />
      <mj-class name="link" color="${escapeAttr(attrs.linkColor)}" />
    </mj-attributes>
    <mj-style>
      a { color: ${escapeAttr(attrs.linkColor)}; }
    </mj-style>
  </mj-head>
  <mj-body background-color="${escapeAttr(attrs.backgroundColor)}" width="${doc.meta.width}px">
${sections}
  </mj-body>
</mjml>`;
}

function sectionToMjml(section: Section, registry: Registry, ctx: RenderContext): string {
  const a = section.attrs;
  const padding = [a.paddingTop, a.paddingRight, a.paddingBottom, a.paddingLeft]
    .map((v) => `${v ?? 0}px`)
    .join(' ');
  const bg = a.backgroundColor ? ` background-color="${escapeAttr(a.backgroundColor)}"` : '';
  const widths = layoutWidths(section.layout);

  const columns = section.columns
    .map((col, i) => columnToMjml(col, widths[i], registry, ctx))
    .join('\n');

  /** 多列 + 显式开启时包 mj-group，阻止小屏列堆叠（MJML 官方语义） */
  const multiCol = section.columns.length > 1;
  const grouped =
    multiCol && section.attrs.preserveColumnsOnMobile === true
      ? `      <mj-group>\n${indent(columns, 2)}\n      </mj-group>`
      : columns;

  return `    <mj-section padding="${padding}"${bg}>
${grouped}
    </mj-section>`;
}

function columnToMjml(
  column: Column,
  width: string,
  registry: Registry,
  ctx: RenderContext,
): string {
  const a = column.attrs;
  const va = a.verticalAlign ? ` vertical-align="${a.verticalAlign}"` : '';
  const bg = a.backgroundColor ? ` background-color="${escapeAttr(a.backgroundColor)}"` : '';

  const blocks = column.blocks
    .map((b) => {
      if (b.lockedMjml) return indent(b.lockedMjml, 8);
      const def = registry.require(b.type);
      return indent(def.toMjml(b.props, ctx), 8);
    })
    .join('\n');

  return `      <mj-column width="${width}"${va}${bg}>
${blocks || '        <!-- empty column -->'}
      </mj-column>`;
}

function layoutWidths(layout: SectionLayout): string[] {
  // 内容宽度 600，给到百分比即可，让 MJML 自己处理像素分配
  const parts = layout.split('-').map(Number);
  const total = parts.reduce((s, x) => s + x, 0);
  return parts.map((p) => `${((p / total) * 100).toFixed(2)}%`);
}

function indent(text: string, n: number): string {
  const pad = ' '.repeat(n);
  return text
    .split('\n')
    .map((l) => (l ? pad + l : l))
    .join('\n');
}
