import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';

/** 公司 Logo —— 一个语义化的"图片+链接"封装，便于运营快速放置品牌资产。 */
interface LogoProps {
  src: string;
  href: string;
  width: number;
  align: 'left' | 'center' | 'right';
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const logoBlock = defineBlock<LogoProps>({
  type: 'custom:logo',
  name: '公司 Logo',
  category: 'custom',
  icon: icons.logo,
  defaultProps: {
    src: 'https://placehold.co/240x60/1f2328/ffffff/png?text=YOUR+LOGO',
    href: 'https://example.com',
    width: 160,
    align: 'center',
  },
  schema: [
    { key: 'src', label: 'Logo 图片', type: 'image' },
    { key: 'href', label: '官网链接', type: 'url' },
    { key: 'width', label: '宽度 (px)', type: 'number', min: 60, max: 400 },
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
  ],
  toMjml: (p) =>
    `<mj-image src="${esc(p.src)}" href="${esc(p.href)}" width="${p.width}px" align="${p.align}" alt="logo" padding="8px 0px 8px 0px" />`,
  renderPreview: (p) => {
    const m =
      p.align === 'center' ? 'margin:0 auto;' : p.align === 'right' ? 'margin-left:auto;' : '';
    return `<div style="padding:8px 0;text-align:${p.align};"><img src="${esc(
      p.src,
    )}" alt="logo" style="display:block;${m}width:${p.width}px;max-width:100%;height:auto;" /></div>`;
  },
});
