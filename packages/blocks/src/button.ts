import { defineBlock, blockButtonWidthCss } from '@simple-mail/core';
import { icons } from './icons';

interface ButtonProps {
  text: string;
  href: string;
  backgroundColor: string;
  color: string;
  borderRadius: number;
  align: 'left' | 'center' | 'right';
  /** 留空或 auto 为自适应；可填 200px、80% 等 */
  width: string;
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
    width: '',
    paddingTop: 8,
    paddingRight: 0,
    paddingBottom: 8,
    paddingLeft: 0,
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
      selectVariant: 'segmented',
      options: [
        { label: '左', value: 'left' },
        { label: '居中', value: 'center' },
        { label: '右', value: 'right' },
      ],
    },
    {
      key: 'width',
      label: '宽度',
      type: 'text',
      placeholder: '留空=自适应，如 280px、100%',
      help: '支持纯数字（按 px）、带 px 或百分比',
    },
    { key: 'innerPaddingV', label: '按钮内上下边距', type: 'number', min: 0, max: 40 },
    { key: 'innerPaddingH', label: '按钮内左右边距', type: 'number', min: 0, max: 60 },
    { key: 'paddingTop', label: '外边距', type: 'spacing' },
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
    const bw = blockButtonWidthCss(p.width);
    const widthAttr = bw ? ` width="${escapeAttr(bw)}"` : '';
    return `<mj-button href="${escapeAttr(p.href)}" background-color="${escapeAttr(
      p.backgroundColor,
    )}" color="${escapeAttr(p.color)}" border-radius="${p.borderRadius}px" font-size="${escapeAttr(
      p.fontSize,
    )}" align="${p.align}" padding="${padding}" inner-padding="${innerPadding}"${widthAttr}>${escapeAttr(
      p.text,
    )}</mj-button>`;
  },
  renderPreview: (p) => {
    const bw = blockButtonWidthCss(p.width);
    const wst = bw ? `width:${bw};max-width:100%;box-sizing:border-box;` : '';
    /* 画布对 .sm-canvas a 设置了带 !important 的链接色，文字颜色必须写在子节点上才能生效 */
    return `<div style="padding:${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px;text-align:${p.align};">
      <a href="${escapeAttr(p.href)}" style="display:inline-block;background:${
        p.backgroundColor
      };border-radius:${p.borderRadius}px;padding:${p.innerPaddingV}px ${
        p.innerPaddingH
      }px;text-decoration:none;font-size:${p.fontSize};line-height:1.2;${wst}"><span class="sm-button-text" style="color:${
        p.color
      }">${escapeAttr(p.text)}</span></a>
    </div>`;
  },
});
