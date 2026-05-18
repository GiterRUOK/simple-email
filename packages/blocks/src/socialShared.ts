import { normalizeFontWeightStep } from '@simple-mail/core';

/** 生成 mj-social-element 的 name 属性（与 MJML 内置图标对齐；未知平台退化为 web）。 */
export function mjSocialElementName(network: string): string {
  const n = network.trim();
  if (n === 'ig') return 'instagram';
  if (n === 'rabbit' || n === 'tiktok' || n === 'reddit') return 'web';
  return n;
}

/** 业务示例：固定海外/垂类五平台（与 custom:social 块配套）。 */
export const BIZ_SOCIAL_NETWORK_OPTIONS: { label: string; value: string }[] = [
  { label: 'X', value: 'x' },
  { label: 'Rabbit', value: 'rabbit' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Instagram', value: 'ig' },
];

/** 社交平台与 MJML mj-social-element 的 name 对齐（含常用内置名）。 */
export const SOCIAL_NETWORK_OPTIONS: { label: string; value: string }[] = [
  { label: '微信', value: 'wechat' },
  { label: '微博', value: 'weibo' },
  { label: 'X', value: 'x' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'GitHub', value: 'github' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Reddit', value: 'reddit' },
  { label: '网页', value: 'web' },
];

const NETWORK_META: Record<string, { color: string; preview: string }> = {
  wechat: { color: '#1AAD19', preview: '信' },
  weibo: { color: '#E6162D', preview: '微' },
  x: { color: '#000000', preview: 'X' },
  linkedin: { color: '#0A66C2', preview: 'in' },
  github: { color: '#181717', preview: 'GH' },
  facebook: { color: '#1877F2', preview: 'f' },
  instagram: { color: '#E4405F', preview: '◎' },
  ig: { color: '#E4405F', preview: '◎' },
  youtube: { color: '#FF0000', preview: '▶' },
  reddit: { color: '#FF4500', preview: 'r' },
  tiktok: { color: '#000000', preview: '♪' },
  rabbit: { color: '#FF2442', preview: 'R' },
  website: { color: '#6b7280', preview: '◇' },
  web: { color: '#6b7280', preview: '◇' },
};

export const escAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** mj-social-element 体内文本转义（非属性） */
export const escMjmlText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface SocialLinkItem {
  network: string;
  href: string;
  /** 图标旁文字，对应 mj-social-element 子内容 */
  label?: string;
  /** 自定义图标 URL，对应 mj-social-element src */
  iconSrc?: string;
  /** 图标区域背景色；未设则用平台预设 */
  backgroundColor?: string;
}

/** 社交组块级：所有带标签的链接共用同一套标签文字样式 */
export interface SocialGroupLabelStyle {
  labelFontSize: number;
  labelFontWeight: string;
  labelColor: string;
}

export function socialMeta(network: string): { color: string; preview: string } {
  return NETWORK_META[network] ?? { color: '#6b7280', preview: '·' };
}

export function paddingQuad(p: {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}): string {
  return `${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px`;
}

/** mj-social `border-radius`：0 直角；≥999 或 ≥图标半边 → 圆形裁切（999px） */
export function socialIconBorderRadiusMjml(iconSize: number, radiusPx: unknown): string {
  const size = Math.max(1, Number(iconSize) || 28);
  const r = Number(radiusPx);
  if (!Number.isFinite(r) || r <= 0) return '0px';
  const half = size / 2;
  if (r >= 999 || r >= half) return '999px';
  return `${Math.min(r, size)}px`;
}

/** 画布预览用图标圆角 CSS（与 {@link socialIconBorderRadiusMjml} 语义一致） */
export function socialIconBorderRadiusCss(iconSize: number, radiusPx: unknown): string {
  const size = Math.max(1, Number(iconSize) || 28);
  const r = Number(radiusPx);
  if (!Number.isFinite(r) || r <= 0) return '0';
  const half = size / 2;
  if (r >= 999 || r >= half) return '50%';
  return `${Math.min(r, size)}px`;
}

/** mj-social `inner-padding`，控制图标之间的可视间距 */
export function socialIconSpacingPx(spacing: unknown, fallback = 10): number {
  const n = Number(spacing);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(64, Math.round(n));
}

export function flexJustifyFromAlign(align: 'left' | 'center' | 'right'): string {
  if (align === 'right') return 'flex-end';
  if (align === 'left') return 'flex-start';
  return 'center';
}

export function mjSocialElementsLines(
  links: SocialLinkItem[],
  labelStyle: SocialGroupLabelStyle,
): string {
  const fontSizeRaw = labelStyle.labelFontSize > 0 ? labelStyle.labelFontSize : 13;
  const fontSize = Math.max(8, Math.min(48, fontSizeRaw));
  const fontWeight = normalizeFontWeightStep(labelStyle.labelFontWeight);
  const textColor = labelStyle.labelColor?.trim() || '#333333';
  const fwEsc = escAttr(fontWeight);
  return links
    .map((l) => {
      const meta = socialMeta(l.network);
      const bgColor = l.backgroundColor?.trim() || meta.color;
      const attrs = [
        `name="${escAttr(mjSocialElementName(l.network))}"`,
        `href="${escAttr(l.href)}"`,
        `background-color="${escAttr(bgColor)}"`,
        `color="${escAttr(textColor)}"`,
        `font-size="${fontSize}px"`,
        `font-weight="${fwEsc}"`,
      ];
      const attrStr = attrs.join(' ');
      const src = l.iconSrc?.trim();
      const withSrc = src ? `${attrStr} src="${escAttr(src)}"` : attrStr;
      const label = l.label?.trim() ?? '';
      if (!label) {
        return `  <mj-social-element ${withSrc} />`;
      }
      return `  <mj-social-element ${withSrc}>\n    ${escMjmlText(label)}\n  </mj-social-element>`;
    })
    .join('\n');
}
