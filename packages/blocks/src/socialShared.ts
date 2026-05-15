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
  youtube: { color: '#FF0000', preview: '▶' },
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

export function mjSocialElementsLines(
  links: SocialLinkItem[],
  labelStyle: SocialGroupLabelStyle,
): string {
  const fontSizeRaw = labelStyle.labelFontSize > 0 ? labelStyle.labelFontSize : 13;
  const fontSize = Math.max(8, Math.min(48, fontSizeRaw));
  const fontWeight = labelStyle.labelFontWeight?.trim() || 'normal';
  const textColor = labelStyle.labelColor?.trim() || '#333333';
  const fwEsc = escAttr(fontWeight);
  return links
    .map((l) => {
      const meta = socialMeta(l.network);
      const bgColor = l.backgroundColor?.trim() || meta.color;
      const attrs = [
        `name="${escAttr(l.network)}"`,
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
