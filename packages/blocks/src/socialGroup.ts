import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';
import {
  escAttr,
  flexJustifyFromAlign,
  mjSocialElementsLines,
  paddingQuad,
  socialIconBorderRadiusCss,
  socialIconBorderRadiusMjml,
  socialIconSpacingPx,
  socialMeta,
  SOCIAL_NETWORK_OPTIONS,
  type SocialLinkItem,
} from './socialShared';

interface SocialGroupProps {
  elements: SocialLinkItem[];
  align: 'left' | 'center' | 'right';
  iconSize: number;
  /** 图标圆角 (px)。0 为方形；≥999 或不少于图标半边时为圆形（默认 999） */
  iconBorderRadius: number;
  /** 图标之间的间距 (px)，对应 mj-social inner-padding */
  iconSpacing: number;
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
    iconBorderRadius: 999,
    iconSpacing: 10,
    labelFontSize: 13,
    labelFontWeight: 'normal',
    labelColor: '#333333',
    paddingTop: 8,
    paddingRight: 0,
    paddingBottom: 8,
    paddingLeft: 0,
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
    {
      key: 'iconBorderRadius',
      label: '图标圆角 (px)',
      type: 'number',
      min: 0,
      max: 999,
      step: 1,
      help: '0 为方形直角；填较大值（如 999）或与尺寸一半相当时为圆形（默认圆形）。',
    },
    {
      key: 'iconSpacing',
      label: '图标间距 (px)',
      type: 'number',
      min: 0,
      max: 64,
      step: 1,
      help: '每个图标周围的留白，横向即图标之间的间隔（MJML inner-padding）。',
    },
    { key: 'paddingTop', label: '外边距', type: 'spacing' },
  ],
  toMjml: (p) => {
    const pad = paddingQuad(p);
    const br = socialIconBorderRadiusMjml(p.iconSize, p.iconBorderRadius ?? 999);
    const gap = socialIconSpacingPx(p.iconSpacing, 10);
    const socAttrs = `align="${p.align}" icon-size="${p.iconSize}px" mode="horizontal" border-radius="${br}" inner-padding="${gap}px" padding="${pad}"`;
    const filtered = p.elements.filter((e) => e.href?.trim());
    const labelStyle = {
      labelFontSize: Number(p.labelFontSize ?? 13),
      labelFontWeight: String(p.labelFontWeight ?? 'normal'),
      labelColor: String(p.labelColor ?? '#333333'),
    };
    const inner = mjSocialElementsLines(filtered, labelStyle);
    if (!inner.trim()) {
      return `<mj-social ${socAttrs}></mj-social>`;
    }
    return `<mj-social ${socAttrs}>
${inner}
</mj-social>`;
  },
  renderPreview: (p) => {
    const fsRaw = p.labelFontSize != null && p.labelFontSize > 0 ? p.labelFontSize : 13;
    const fs = Math.max(8, Math.min(48, fsRaw));
    const fw = p.labelFontWeight?.trim() || 'normal';
    const textColor = p.labelColor?.trim() || '#333333';
    const radiusCss = socialIconBorderRadiusCss(p.iconSize, p.iconBorderRadius ?? 999);
    const gap = socialIconSpacingPx(p.iconSpacing, 10);
    const jc = flexJustifyFromAlign(p.align);
    const items = p.elements
      .filter((l) => l.href?.trim())
      .map((l) => {
        const meta = socialMeta(l.network);
        const bg = l.backgroundColor?.trim() || meta.color;
        const label = l.label?.trim() ?? '';
        const iconSrc = l.iconSrc?.trim();
        const iconHtml = iconSrc
          ? `<img src="${escAttr(iconSrc)}" alt="" style="width:${p.iconSize}px;height:${p.iconSize}px;object-fit:cover;border-radius:${radiusCss};flex-shrink:0;" />`
          : `<span style="display:inline-flex;width:${p.iconSize}px;height:${p.iconSize}px;border-radius:${radiusCss};background:${bg};color:#fff;align-items:center;justify-content:center;font-size:${Math.round(
              p.iconSize / 2,
            )}px;font-weight:600;flex-shrink:0;overflow:hidden;">${meta.preview}</span>`;
        const textHtml = label
          ? `<span style="font-size:${fs}px !important;font-weight:${fw};color:${escAttr(
              textColor,
            )} !important;line-height:1.2;">${escAttr(label)}</span>`
          : '';
        return `<span style="display:inline-flex;align-items:center;gap:6px;"><a href="${escAttr(
          l.href,
        )}" style="display:inline-flex;align-items:center;text-decoration:none;line-height:0;">${iconHtml}</a>${textHtml}</span>`;
      })
      .join('');
    const pad = paddingQuad(p);
    return `<div style="display:flex;flex-wrap:wrap;justify-content:${jc};align-items:center;gap:${gap}px;padding:${pad};">${items || '<span style="color:#9ca3af;font-size:12px;">请添加社交链接</span>'}</div>`;
  },
});
