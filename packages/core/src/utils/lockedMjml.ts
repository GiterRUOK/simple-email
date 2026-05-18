import type { GlobalStyles } from '../types';
import { normalizeFontWeightStep } from './fontWeightSteps';

/**
 * mj-column 编译结果外层会有 `font-size:0`（多列 inline-block 间距技巧），
 * mj-raw 内若未在祖先上重置字号，li/p 等会继承 0 导致「看不见」。
 * 在包裹 td 上对齐邮件全局正文样式即可规避。
 */
export interface MjRawCellTypography {
  fontSize: string;
  lineHeight: string;
  color: string;
  fontFamily: string;
  fontWeight: string;
}

export function mjRawCellTypographyFromStyles(s: GlobalStyles): MjRawCellTypography {
  return {
    fontSize: (s.fontSize || '16px').trim(),
    lineHeight: (s.lineHeight || '1.25').trim(),
    color: (s.color || '#433f3f').trim(),
    fontFamily: (s.fontFamily || 'sans-serif').trim(),
    fontWeight: normalizeFontWeightStep(s.fontWeight),
  };
}

/** style="..." 为双引号属性，避免值内双引号破坏解析 */
function cssForDoubleQuotedAttr(value: string): string {
  return value.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
}

function buildMjRawTdStyle(paddingCss: string, typo: MjRawCellTypography): string {
  const fontSize = cssForDoubleQuotedAttr(typo.fontSize);
  const lineHeight = cssForDoubleQuotedAttr(typo.lineHeight);
  const color = cssForDoubleQuotedAttr(typo.color);
  const fontFamily = cssForDoubleQuotedAttr(typo.fontFamily);
  const fontWeight = cssForDoubleQuotedAttr(typo.fontWeight);
  return `padding:${paddingCss};font-size:${fontSize};line-height:${lineHeight};color:${color};font-family:${fontFamily};font-weight:${fontWeight}`;
}

/**
 * mj-column 编译结果是表格布局，列内若用 mj-raw 直接输出 div/ul 等块级 HTML，
 * 会变成非法 table 子节点，浏览器/邮件里常表现为整块空白。
 * 用 presentation table + 单格 td 包住用户 HTML，与 mj-text 等组件结构一致。
 */
export function mjRawEmailTableWrap(
  paddingCss: string,
  cellInnerHtml: string,
  typo: MjRawCellTypography,
): string {
  const tdStyle = buildMjRawTdStyle(paddingCss, typo);
  return `<mj-raw>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
  <tbody>
    <tr>
      <td style="${tdStyle}">
        ${cellInnerHtml}
      </td>
    </tr>
  </tbody>
</table>
</mj-raw>`;
}

/**
 * 锁定片段插入 mj-column 时的规范化。
 *
 * mj-column 内只允许 mj-* 节点（或 mj-raw 包一层 HTML）。
 * 用户若在「编辑组件代码」里只保存了 `<ul>...</ul>` 等裸 HTML，直接下发会导致 MJML 编译失败、预览空白。
 */
export function wrapLockedMjmlForMjColumn(fragment: string, typo: MjRawCellTypography): string {
  const lead = fragment.trimStart();
  if (!lead) return '<mj-raw><!-- empty --></mj-raw>';
  if (/^<mj-/i.test(lead)) return fragment;
  const t = fragment.trim();
  // 无 props 上下文，内边距交给 0；用户可在片段内自行写 padding
  return mjRawEmailTableWrap('0', t, typo);
}

/** 旧版 HTML 块/锁定片段只有 mj-raw 包 div 或裸标签，编译进列后表格结构非法；统一包一层 presentation table。 */
export function normalizeHtmlBlockLockedMjmlForCompile(
  fragment: string,
  paddingCss: string,
  typo: MjRawCellTypography,
): string {
  const raw = fragment.trim();
  const mj = raw.match(/^<mj-raw\b[^>]*>([\s\S]*)<\/mj-raw\s*>$/i);
  if (!mj) return fragment;
  let inner = mj[1].trim();
  const divStrip = inner.match(/^\s*<div\b[^>]*style="[^"]*"[^>]*>([\s\S]*)<\/div>\s*$/i);
  if (divStrip) inner = divStrip[1].trim();
  if (/^\s*<table\b/i.test(inner)) return raw;
  return mjRawEmailTableWrap(paddingCss, inner, typo);
}

/** HTML 块锁定：画布上优先渲染可读效果，而非转义后的 MJML 源码字符串。 */
export function htmlFragmentForLockedHtmlBlockCanvas(
  lockedMjml: string,
  padding: { top: number; right: number; bottom: number; left: number },
): string {
  const raw = lockedMjml.trim();
  const mjMatch = raw.match(/^<mj-raw\b[^>]*>([\s\S]*)<\/mj-raw\s*>$/i);
  const pad = `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`;
  if (mjMatch) {
    const body = mjMatch[1].trim();
    return body || `<div style="padding:${pad};color:#9ca3af;font-size:13px;">（无内容）</div>`;
  }
  const bare = raw;
  if (!bare) return `<div style="padding:${pad};color:#9ca3af;font-size:13px;">（无内容）</div>`;
  return `<div style="padding:${pad}">${bare}</div>`;
}
