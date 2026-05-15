import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';

interface DividerProps {
  color: string;
  width: string;
  thickness: number;
  paddingTop: number;
  paddingBottom: number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const dividerBlock = defineBlock<DividerProps>({
  type: 'divider',
  name: '分隔线',
  category: 'content',
  icon: icons.divider,
  defaultProps: {
    color: '#e6e8ec',
    width: '100%',
    thickness: 1,
    paddingTop: 8,
    paddingBottom: 8,
  },
  schema: [
    { key: 'color', label: '颜色', type: 'color' },
    { key: 'width', label: '宽度 (% 或 px)', type: 'text' },
    { key: 'thickness', label: '粗细 (px)', type: 'number', min: 1, max: 10 },
    { key: 'paddingTop', label: '上边距', type: 'number', min: 0, max: 80 },
    { key: 'paddingBottom', label: '下边距', type: 'number', min: 0, max: 80 },
  ],
  toMjml: (p) =>
    `<mj-divider border-color="${esc(p.color)}" border-width="${p.thickness}px" width="${esc(
      p.width,
    )}" padding="${p.paddingTop}px 0px ${p.paddingBottom}px 0px" />`,
  renderPreview: (p) =>
    `<div style="padding:${p.paddingTop}px 0 ${p.paddingBottom}px 0;"><div style="border-top:${p.thickness}px solid ${p.color};width:${p.width};margin:0 auto;"></div></div>`,
});
