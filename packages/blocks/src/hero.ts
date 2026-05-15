import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';

interface HeroProps {
  backgroundUrl: string;
  backgroundColor: string;
  height: number;
  content: string;
  textAlign: 'left' | 'center' | 'right';
  textColor: string;
  verticalAlign: 'top' | 'middle' | 'bottom';
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const heroBlock = defineBlock<HeroProps>({
  type: 'hero',
  name: 'Hero 大图',
  category: 'content',
  icon: icons.hero,
  defaultProps: {
    backgroundUrl:
      'https://placehold.co/600x320/312e81/c4b5fd/png?text=Hero+Background',
    backgroundColor: '#1e1b4b',
    height: 320,
    content:
      '<p style="margin:0;font-size:28px;font-weight:700;line-height:1.25;">主标题落在大图上</p><p style="margin:12px 0 0;font-size:16px;font-weight:400;opacity:0.95;line-height:1.5;">支援变量与 <strong>双击编辑</strong>，与正文组件一致。</p>',
    textAlign: 'center',
    textColor: '#ffffff',
    verticalAlign: 'middle',
    paddingTop: 8,
    paddingRight: 0,
    paddingBottom: 8,
    paddingLeft: 0,
  },
  schema: [
    { key: 'backgroundUrl', label: '背景图', type: 'image' },
    { key: 'backgroundColor', label: '背景占位色', type: 'color', help: '图片加载失败时的底色' },
    { key: 'height', label: '区域高度 (px)', type: 'number', min: 120, max: 1200, step: 1 },
    {
      key: 'verticalAlign',
      label: '文字垂直位置',
      type: 'select',
      options: [
        { label: '靠上', value: 'top' },
        { label: '居中', value: 'middle' },
        { label: '靠下', value: 'bottom' },
      ],
    },
    {
      key: 'textAlign',
      label: '文字水平对齐',
      type: 'select',
      options: [
        { label: '左', value: 'left' },
        { label: '居中', value: 'center' },
        { label: '右', value: 'right' },
      ],
    },
    { key: 'textColor', label: '文字颜色', type: 'color' },
    { key: 'paddingTop', label: '内边距', type: 'spacing' },
    {
      key: 'content',
      label: '正文（HTML）',
      type: 'textarea',
      help: '建议在画布内双击编辑；此处供高级修改。',
    },
  ],
  inlineEditable: {
    selector: '.sm-hero-content',
    mode: 'rich',
    multiline: true,
    propKey: 'content',
    placeholder: '编写覆盖在图片上的文案…',
  },
  toMjml: (p, ctx) => {
    const w = ctx.doc.meta.width;
    const padding = `${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px`;
    const h = `${p.height}px`;
    return `<mj-hero
      mode="fixed-height"
      height="${h}"
      background-width="${w}px"
      background-height="${h}"
      background-url="${escapeAttr(p.backgroundUrl)}"
      background-color="${escapeAttr(p.backgroundColor)}"
      padding="${padding}"
      vertical-align="${p.verticalAlign}"
    >
      <mj-text
        align="${p.textAlign}"
        color="${escapeAttr(p.textColor)}"
        padding="0"
      >${p.content}</mj-text>
    </mj-hero>`;
  },
  renderPreview: (p, ctx) => {
    const w = ctx.doc.meta.width;
    const flexAlign =
      p.verticalAlign === 'top' ? 'flex-start' : p.verticalAlign === 'bottom' ? 'flex-end' : 'center';
    const padding = `${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px`;
    const url = escapeAttr(p.backgroundUrl);
    return `<div
      style="
        box-sizing:border-box;
        width:100%;
        max-width:${w}px;
        min-height:${p.height}px;
        margin:0 auto;
        background-image:linear-gradient(to bottom,rgba(0,0,0,0.25),rgba(0,0,0,0.35)),url(${url});
        background-size:cover;
        background-position:center;
        background-color:${p.backgroundColor};
        display:flex;
        align-items:${flexAlign};
        justify-content:${p.textAlign === 'right' ? 'flex-end' : p.textAlign === 'center' ? 'center' : 'flex-start'};
        padding:${padding};
        color:${escapeAttr(p.textColor)};
        overflow:hidden;
        border-radius:2px;
      "
    >
      <div
        class="sm-hero-content"
        style="
          width:100%;
          text-align:${p.textAlign};
          color:${escapeAttr(p.textColor)};
          text-shadow:0 1px 2px rgba(0,0,0,0.45);
        "
      >${p.content}</div>
    </div>`;
  },
});
