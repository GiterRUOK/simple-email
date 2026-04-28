import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';

interface SocialProps {
  /** 顺序：weibo / wechat / x / linkedin / github */
  links: { network: string; href: string }[];
  align: 'left' | 'center' | 'right';
  iconSize: number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NETWORK_ICONS: Record<string, { color: string; preview: string }> = {
  weibo: { color: '#E6162D', preview: '微' },
  wechat: { color: '#1AAD19', preview: '信' },
  x: { color: '#000000', preview: 'X' },
  linkedin: { color: '#0A66C2', preview: 'in' },
  github: { color: '#181717', preview: 'GH' },
};

export const socialBlock = defineBlock<SocialProps>({
  type: 'custom:social',
  name: '社交链接',
  category: 'custom',
  icon: icons.social,
  defaultProps: {
    links: [
      { network: 'weibo', href: 'https://weibo.com' },
      { network: 'wechat', href: 'https://example.com' },
      { network: 'x', href: 'https://x.com' },
    ],
    align: 'center',
    iconSize: 28,
  },
  schema: [
    {
      key: 'align',
      label: '对齐',
      type: 'select',
      options: [
        { label: '左', value: 'left' },
        { label: '居中', value: 'center' },
        { label: '右', value: 'right' },
      ],
    },
    { key: 'iconSize', label: '图标尺寸 (px)', type: 'number', min: 16, max: 64 },
    {
      key: 'links',
      label: '链接（JSON 数组）',
      type: 'textarea',
      help: '示例：[{"network":"weibo","href":"https://..."}]',
    },
  ],
  toMjml: (p) => {
    const elements = p.links
      .map((l) => {
        const meta = NETWORK_ICONS[l.network] ?? { color: '#666' };
        return `  <mj-social-element name="${esc(l.network)}" href="${esc(
          l.href,
        )}" background-color="${meta.color}" />`;
      })
      .join('\n');
    return `<mj-social align="${p.align}" icon-size="${p.iconSize}px" mode="horizontal" padding="8px 16px">
${elements}
</mj-social>`;
  },
  renderPreview: (p) => {
    const items = p.links
      .map((l) => {
        const meta = NETWORK_ICONS[l.network] ?? { color: '#666', preview: '·' };
        return `<a href="${esc(l.href)}" style="display:inline-flex;width:${p.iconSize}px;height:${p.iconSize}px;border-radius:50%;background:${meta.color};color:#fff;align-items:center;justify-content:center;margin:0 4px;font-size:${Math.round(p.iconSize / 2)}px;text-decoration:none;font-weight:600;">${meta.preview}</a>`;
      })
      .join('');
    return `<div style="padding:8px 16px;text-align:${p.align};">${items}</div>`;
  },
});
