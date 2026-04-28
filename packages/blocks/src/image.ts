import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';

interface ImageProps {
  src: string;
  alt: string;
  href: string;
  width: number;
  align: 'left' | 'center' | 'right';
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const imageBlock = defineBlock<ImageProps>({
  type: 'image',
  name: '图片',
  category: 'content',
  icon: icons.image,
  defaultProps: {
    src: 'https://placehold.co/600x240/EEF2FF/4F46E5/png?text=600x240',
    alt: '',
    href: '',
    width: 480,
    align: 'center',
    paddingTop: 8,
    paddingRight: 16,
    paddingBottom: 8,
    paddingLeft: 16,
  },
  schema: [
    { key: 'src', label: '图片地址', type: 'image' },
    { key: 'alt', label: '替代文本', type: 'text', placeholder: '图片描述' },
    { key: 'href', label: '点击跳转', type: 'url', placeholder: 'https://...' },
    { key: 'width', label: '宽度 (px)', type: 'number', min: 40, max: 600 },
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
    { key: 'paddingTop', label: '内边距（上/右/下/左）', type: 'spacing' },
  ],
  toMjml: (p) => {
    const padding = `${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px`;
    const href = p.href ? ` href="${escapeAttr(p.href)}"` : '';
    const alt = ` alt="${escapeAttr(p.alt || '')}"`;
    return `<mj-image src="${escapeAttr(p.src)}"${alt}${href} width="${p.width}px" align="${p.align}" padding="${padding}" />`;
  },
  renderPreview: (p) => {
    const align = p.align === 'center' ? 'margin:0 auto;' : p.align === 'right' ? 'margin-left:auto;' : '';
    return `<div style="padding:${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px;text-align:${p.align};"><img src="${escapeAttr(
      p.src,
    )}" alt="${escapeAttr(p.alt)}" style="display:block;${align}max-width:100%;width:${p.width}px;height:auto;border:0;outline:none;" /></div>`;
  },
});
