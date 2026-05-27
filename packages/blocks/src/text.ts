import { defineBlock, FONT_WEIGHT_STEP_OPTIONS, normalizeFontWeightStep } from '@simple-mail/core';
import { icons } from './icons';

interface TextProps {
  content: string;
  align: 'left' | 'center' | 'right';
  color: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
  /** 空字符串：与邮件全局行距（mj-head）一致 */
  lineHeight: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const textBlock = defineBlock<TextProps>({
  type: 'text',
  name: '文本',
  category: 'content',
  icon: icons.text,
  defaultProps: {
    content:
      '<p style="margin:0;">在此处输入文本。<strong>双击</strong>进入编辑模式，<em>选中文字</em>会出现工具条；支持变量 {{user.name}}</p>',
    align: 'left',
    color: '',
    fontSize: '16px',
    fontFamily: '',
    fontWeight: '400',
    lineHeight: '',
    paddingTop: 8,
    paddingRight: 0,
    paddingBottom: 8,
    paddingLeft: 0,
  },
  schema: [
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
    { key: 'color', label: '颜色', type: 'color', placeholder: '继承全局' },
    { key: 'fontSize', label: '字号', type: 'text', placeholder: '14px' },
    { key: 'fontFamily', label: '字体', type: 'text', placeholder: '继承全局' },
    {
      key: 'fontWeight',
      label: '字重',
      type: 'select',
      selectVariant: 'segmented',
      options: [...FONT_WEIGHT_STEP_OPTIONS],
    },
    {
      key: 'lineHeight',
      label: '行高',
      type: 'select',
      help: '留空则使用邮件设置里的全局行距',
      options: [
        { label: '继承全局', value: '' },
        { label: '1.0', value: '1' },
        { label: '1.15', value: '1.15' },
        { label: '1.25', value: '1.25' },
        { label: '1.4', value: '1.4' },
        { label: '1.5', value: '1.5' },
        { label: '1.75', value: '1.75' },
        { label: '2.0', value: '2' },
        { label: '22px', value: '22px' },
        { label: '24px', value: '24px' },
        { label: '28px', value: '28px' },
        { label: '32px', value: '32px' },
      ],
    },
    { key: 'paddingTop', label: '内边距', type: 'spacing' },
    {
      key: 'content',
      label: '内容（HTML，备用）',
      type: 'textarea',
      help: '建议直接在画布双击编辑；这里保留为高级编辑入口。',
    },
  ],
  inlineEditable: {
    selector: '.sm-text-content',
    mode: 'rich',
    multiline: true,
    propKey: 'content',
    placeholder: '输入文本…',
  },
  toMjml: (p) => {
    const padding = `${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px`;
    const ff = p.fontFamily ? ` font-family="${escapeAttr(p.fontFamily)}"` : '';
    const fwN = normalizeFontWeightStep(p.fontWeight);
    const fw = fwN !== '400' ? ` font-weight="${escapeAttr(fwN)}"` : '';
    const lh = String(p.lineHeight ?? '').trim();
    const lhAttr = lh ? ` line-height="${escapeAttr(lh)}"` : '';
    const colorRaw = String(p.color ?? '').trim();
    const colorAttr = colorRaw ? ` color="${escapeAttr(colorRaw)}"` : '';
    return `<mj-text align="${p.align}"${colorAttr} font-size="${escapeAttr(
      p.fontSize,
    )}"${lhAttr}${ff}${fw} padding="${padding}">${p.content}</mj-text>`;
  },
  renderPreview: (p) => {
    const ff = p.fontFamily ? `font-family:${p.fontFamily};` : '';
    const fwN = normalizeFontWeightStep(p.fontWeight);
    const lhRaw = String(p.lineHeight ?? '').trim();
    const lh = lhRaw ? `line-height:${lhRaw};` : 'line-height:normal;';
    const colorRaw = String(p.color ?? '').trim();
    const colorCss = colorRaw ? `color:${colorRaw};` : '';
    return `<div class="sm-text-content" style="text-align:${p.align};${colorCss}font-size:${p.fontSize};font-weight:${fwN};${lh}${ff}padding:${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px;">${p.content}</div>`;
  },
});
