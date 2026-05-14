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

export function mjSocialElementsLines(links: { network: string; href: string }[]): string {
  return links
    .map((l) => {
      const { color } = socialMeta(l.network);
      return `  <mj-social-element name="${escAttr(l.network)}" href="${escAttr(
        l.href,
      )}" background-color="${escAttr(color)}" />`;
    })
    .join('\n');
}
