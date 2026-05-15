import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';
import {
  escAttr,
  mjSocialElementsLines,
  paddingQuad,
  socialMeta,
  SOCIAL_NETWORK_OPTIONS,
  type SocialLinkItem,
} from './socialShared';

interface SocialGroupProps {
  elements: SocialLinkItem[];
  align: 'left' | 'center' | 'right';
  iconSize: number;
  /** 标签文字字号（整组统一） */
  labelFontSize: number;
  labelFontWeight: string;
  labelColor: string;
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
    labelFontSize: 13,
    labelFontWeight: 'normal',
    labelColor: '#333333',
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
      help: '每行：平台、链接、可选标签文字、自定义图标 URL、图标背景色。标签的字号/字重/颜色在下方统一设置。',
    },
    {
      key: 'labelFontSize',
      label: '标签字号 (px)',
      type: 'number',
      min: 8,
      max: 48,
      step: 1,
    },
    {
      key: 'labelFontWeight',
      label: '标签字重',
      type: 'select',
      options: [
        { label: '较细 (300)', value: '300' },
        { label: '常规', value: 'normal' },
        { label: '400', value: '400' },
        { label: '500', value: '500' },
        { label: '600', value: '600' },
        { label: '700', value: '700' },
        { label: '粗体', value: 'bold' },
        { label: '更粗 (800)', value: '800' },
      ],
    },
    { key: 'labelColor', label: '标签颜色', type: 'color' },
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
    const filtered = p.elements.filter((e) => e.href?.trim());
    const labelStyle = {
      labelFontSize: Number(p.labelFontSize ?? 13),
      labelFontWeight: String(p.labelFontWeight ?? 'normal'),
      labelColor: String(p.labelColor ?? '#333333'),
    };
    const inner = mjSocialElementsLines(filtered, labelStyle);
    if (!inner.trim()) {
      return `<mj-social align="${p.align}" icon-size="${p.iconSize}px" mode="horizontal" padding="${pad}"></mj-social>`;
    }
    return `<mj-social align="${p.align}" icon-size="${p.iconSize}px" mode="horizontal" padding="${pad}">
${inner}
</mj-social>`;
  },
  renderPreview: (p) => {
    const fsRaw = p.labelFontSize != null && p.labelFontSize > 0 ? p.labelFontSize : 13;
    const fs = Math.max(8, Math.min(48, fsRaw));
    const fw = p.labelFontWeight?.trim() || 'normal';
    const textColor = p.labelColor?.trim() || '#333333';
    const items = p.elements
      .filter((l) => l.href?.trim())
      .map((l) => {
        const meta = socialMeta(l.network);
        const bg = l.backgroundColor?.trim() || meta.color;
        const label = l.label?.trim() ?? '';
        const iconSrc = l.iconSrc?.trim();
        const iconHtml = iconSrc
          ? `<img src="${escAttr(iconSrc)}" alt="" style="width:${p.iconSize}px;height:${p.iconSize}px;object-fit:contain;border-radius:3px;flex-shrink:0;" />`
          : `<span style="display:inline-flex;width:${p.iconSize}px;height:${p.iconSize}px;border-radius:50%;background:${bg};color:#fff;align-items:center;justify-content:center;font-size:${Math.round(
              p.iconSize / 2,
            )}px;font-weight:600;flex-shrink:0;">${meta.preview}</span>`;
        const textHtml = label
          ? `<span style="margin-left:6px;font-size:${fs}px !important;font-weight:${fw};color:${escAttr(
              textColor,
            )} !important;line-height:1.2;">${escAttr(label)}</span>`
          : '';
        return `<span style="display:inline-flex;align-items:center;margin:0 6px;vertical-align:middle;"><a href="${escAttr(
          l.href,
        )}" style="display:inline-flex;align-items:center;text-decoration:none;line-height:0;">${iconHtml}</a>${textHtml}</span>`;
      })
      .join('');
    const pad = paddingQuad(p);
    return `<div style="padding:${pad};text-align:${p.align};">${items || '<span style="color:#9ca3af;font-size:12px;">请添加社交链接</span>'}</div>`;
  },
});
