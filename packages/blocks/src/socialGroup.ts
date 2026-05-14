import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';
import {
  escAttr,
  mjSocialElementsLines,
  paddingQuad,
  socialMeta,
  SOCIAL_NETWORK_OPTIONS,
} from './socialShared';

interface SocialLinkItem {
  network: string;
  href: string;
}

interface SocialGroupProps {
  elements: SocialLinkItem[];
  align: 'left' | 'center' | 'right';
  iconSize: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

export const socialGroupBlock = defineBlock<SocialGroupProps>({
  type: 'social-group',
  name: '社交组',
  category: 'content',
  icon: icons.socialGroup,
  defaultProps: {
    elements: [
      { network: 'weibo', href: 'https://weibo.com' },
      { network: 'wechat', href: 'https://example.com' },
    ],
    align: 'center',
    iconSize: 28,
    paddingTop: 8,
    paddingRight: 16,
    paddingBottom: 8,
    paddingLeft: 16,
  },
  schema: [
    {
      key: 'elements',
      label: '社交链接',
      type: 'socialLinkList',
      options: SOCIAL_NETWORK_OPTIONS,
      help: '可添加或删除多个图标链接。',
    },
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
    { key: 'paddingTop', label: '外边距', type: 'spacing' },
  ],
  toMjml: (p) => {
    const pad = paddingQuad(p);
    const inner = mjSocialElementsLines(p.elements.filter((e) => e.href?.trim()));
    if (!inner.trim()) {
      return `<mj-social align="${p.align}" icon-size="${p.iconSize}px" mode="horizontal" padding="${pad}"></mj-social>`;
    }
    return `<mj-social align="${p.align}" icon-size="${p.iconSize}px" mode="horizontal" padding="${pad}">
${inner}
</mj-social>`;
  },
  renderPreview: (p) => {
    const items = p.elements
      .filter((l) => l.href?.trim())
      .map((l) => {
        const meta = socialMeta(l.network);
        return `<a href="${escAttr(l.href)}" style="display:inline-flex;width:${p.iconSize}px;height:${
          p.iconSize
        }px;border-radius:50%;background:${meta.color};color:#fff;align-items:center;justify-content:center;margin:0 4px;font-size:${Math.round(
          p.iconSize / 2,
        )}px;text-decoration:none;font-weight:600;">${meta.preview}</a>`;
      })
      .join('');
    const pad = paddingQuad(p);
    return `<div style="padding:${pad};text-align:${p.align};">${items || '<span style="color:#9ca3af;font-size:12px;">请添加社交链接</span>'}</div>`;
  },
});
