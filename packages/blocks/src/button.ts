import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';

interface ButtonProps {
  text: string;
  href: string;
  backgroundColor: string;
  color: string;
  borderRadius: number;
  align: 'left' | 'center' | 'right';
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  innerPaddingV: number;
  innerPaddingH: number;
  fontSize: string;
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const buttonBlock = defineBlock<ButtonProps>({
  type: 'button',
  name: '按钮',
  category: 'content',
  icon: icons.button,
  defaultProps: {
    text: '立即查看',
    href: 'https://example.com',
    backgroundColor: '#4f46e5',
    color: '#ffffff',
    borderRadius: 6,
    align: 'center',
    paddingTop: 8,
    paddingRight: 16,
    paddingBottom: 8,
    paddingLeft: 16,
    innerPaddingV: 12,
    innerPaddingH: 24,
    fontSize: '14px',
  },
  schema: [
    { key: 'text', label: '文字', type: 'text' },
    { key: 'href', label: '链接', type: 'url' },
    { key: 'backgroundColor', label: '背景色', type: 'color' },
    { key: 'color', label: '文字颜色', type: 'color' },
    { key: 'borderRadius', label: '圆角 (px)', type: 'number', min: 0, max: 40 },
    { key: 'fontSize', label: '字号', type: 'text' },
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
    { key: 'innerPaddingV', label: '按钮内上下边距', type: 'number', min: 0, max: 40 },
    { key: 'innerPaddingH', label: '按钮内左右边距', type: 'number', min: 0, max: 60 },
    { key: 'paddingTop', label: '外边距（上/右/下/左）', type: 'spacing' },
  ],
  inlineEditable: {
    selector: '.sm-button-text',
    mode: 'plain',
    multiline: false,
    propKey: 'text',
    placeholder: '按钮文字',
  },
  toMjml: (p) => {
    const padding = `${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px`;
    const innerPadding = `${p.innerPaddingV}px ${p.innerPaddingH}px`;
    return `<mj-button href="${escapeAttr(p.href)}" background-color="${escapeAttr(
      p.backgroundColor,
    )}" color="${escapeAttr(p.color)}" border-radius="${p.borderRadius}px" font-size="${escapeAttr(
      p.fontSize,
    )}" align="${p.align}" padding="${padding}" inner-padding="${innerPadding}">${escapeAttr(
      p.text,
    )}</mj-button>`;
  },
  renderPreview: (p) => {
    return `<div style="padding:${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px;text-align:${p.align};">
      <a href="${escapeAttr(p.href)}" style="display:inline-block;background:${
        p.backgroundColor
      };color:${p.color};border-radius:${p.borderRadius}px;padding:${p.innerPaddingV}px ${
        p.innerPaddingH
      }px;text-decoration:none;font-size:${p.fontSize};line-height:1.2;"><span class="sm-button-text">${escapeAttr(p.text)}</span></a>
    </div>`;
  },
});
