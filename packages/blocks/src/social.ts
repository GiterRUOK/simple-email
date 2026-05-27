import { defineBlock, FONT_WEIGHT_STEP_OPTIONS, normalizeFontWeightStep } from '@simple-mail/core';
import { icons } from './icons';
import {
  BIZ_SOCIAL_NETWORK_OPTIONS,
  escAttr,
  flexJustifyFromAlign,
  mjSocialElementsLines,
  paddingQuad,
  socialIconBorderRadiusMjml,
  renderSocialIconPreviewHtml,
  socialIconSpacingPx,
  type SocialLinkItem,
} from './socialShared';

/** 与社交组一致，仅平台选项收窄为业务五件套 */
interface SocialBizProps {
  elements: SocialLinkItem[];
  align: 'left' | 'center' | 'right';
  iconSize: number;
  iconBorderRadius: number;
  iconSpacing: number;
  labelFontSize: number;
  labelFontWeight: string;
  labelColor: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  /** 旧版自定义块：`links` + textarea，仅用于兼容读入 */
  links?: { network: string; href: string }[];
}

const DEFAULT_BIZ_ELEMENTS: SocialLinkItem[] = [
  { network: 'x', href: 'https://x.com/' },
  { network: 'rabbit', href: 'https://example.com' },
  { network: 'facebook', href: 'https://facebook.com/' },
  { network: 'tiktok', href: 'https://www.tiktok.com/' },
  { network: 'ig', href: 'https://instagram.com/' },
];

function normalizeElements(p: SocialBizProps): SocialLinkItem[] {
  if (p.elements?.length) return p.elements;
  const legacy = p.links;
  if (Array.isArray(legacy) && legacy.length)
    return legacy.map((l) => ({
      network: String(l.network ?? 'web'),
      href: String(l.href ?? ''),
    }));
  return DEFAULT_BIZ_ELEMENTS;
}

export const socialBlock = defineBlock<SocialBizProps>({
  type: 'custom:social',
  name: '社交链接',
  category: 'custom',
  icon: icons.social,
  defaultProps: {
    elements: DEFAULT_BIZ_ELEMENTS,
    align: 'center',
    iconSize: 28,
    iconBorderRadius: 999,
    iconSpacing: 10,
    labelFontSize: 13,
    labelFontWeight: '400',
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
      options: BIZ_SOCIAL_NETWORK_OPTIONS,
      help: '平台：X、Rabbit、Facebook、TikTok、Instagram (ig)。可填标签、自定义图标 URL。MJML 侧 Rabbit/TikTok 使用 web 占位图标，需要品牌图时请填「图标 URL」。',
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
      selectVariant: 'segmented',
      options: [...FONT_WEIGHT_STEP_OPTIONS],
    },
    { key: 'labelColor', label: '标签颜色', type: 'color' },
    {
      key: 'align',
      label: '对齐',
      type: 'select',
      selectVariant: 'segmented',
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
      help: '0 为方形直角；较大值（如 999）为圆形（默认）。',
    },
    {
      key: 'iconSpacing',
      label: '图标间距 (px)',
      type: 'number',
      min: 0,
      max: 64,
      step: 1,
      help: '图标之间的间隔（MJML inner-padding）。',
    },
    { key: 'paddingTop', label: '外边距', type: 'spacing' },
  ],
  toMjml: (p) => {
    const pad = paddingQuad(p);
    const br = socialIconBorderRadiusMjml(p.iconSize, p.iconBorderRadius ?? 999);
    const gap = socialIconSpacingPx(p.iconSpacing, 10);
    const socAttrs = `align="${p.align}" icon-size="${p.iconSize}px" mode="horizontal" border-radius="${br}" inner-padding="${gap}px" padding="${pad}"`;
    const els = normalizeElements(p).filter((e) => e.href?.trim());
    const labelStyle = {
      labelFontSize: Number(p.labelFontSize ?? 13),
      labelFontWeight: normalizeFontWeightStep(String(p.labelFontWeight ?? '400')),
      labelColor: String(p.labelColor ?? '#333333'),
    };
    const inner = mjSocialElementsLines(els, labelStyle);
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
    const fw = normalizeFontWeightStep(p.labelFontWeight);
    const textColor = p.labelColor?.trim() || '#333333';
    const gap = socialIconSpacingPx(p.iconSpacing, 10);
    const jc = flexJustifyFromAlign(p.align);
    const items = normalizeElements(p)
      .filter((l) => l.href?.trim())
      .map((l) => {
        const label = l.label?.trim() ?? '';
        const iconHtml = renderSocialIconPreviewHtml({
          network: l.network,
          iconSize: p.iconSize,
          iconBorderRadius: p.iconBorderRadius ?? 999,
          iconSrc: l.iconSrc,
          backgroundColor: l.backgroundColor,
        });
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
    return `<div style="display:flex;flex-wrap:wrap;justify-content:${jc};align-items:center;gap:${gap}px;padding:${pad};">${items || '<span style="color:#9ca3af;font-size:12px;">请填写链接 URL</span>'}</div>`;
  },
});
