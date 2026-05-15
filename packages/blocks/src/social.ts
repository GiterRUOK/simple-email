import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';
import {
  BIZ_SOCIAL_NETWORK_OPTIONS,
  escAttr,
  mjSocialElementsLines,
  paddingQuad,
  socialMeta,
  type SocialLinkItem,
} from './socialShared';

/** 与社交组一致，仅平台选项收窄为业务五件套 */
interface SocialBizProps {
  elements: SocialLinkItem[];
  align: 'left' | 'center' | 'right';
  iconSize: number;
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
    const els = normalizeElements(p).filter((e) => e.href?.trim());
    const labelStyle = {
      labelFontSize: Number(p.labelFontSize ?? 13),
      labelFontWeight: String(p.labelFontWeight ?? 'normal'),
      labelColor: String(p.labelColor ?? '#333333'),
    };
    const inner = mjSocialElementsLines(els, labelStyle);
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
    const items = normalizeElements(p)
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
    return `<div style="padding:${pad};text-align:${p.align};">${items || '<span style="color:#9ca3af;font-size:12px;">请填写链接 URL</span>'}</div>`;
  },
});
