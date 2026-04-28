import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';

interface SpacerProps {
  height: number;
}

export const spacerBlock = defineBlock<SpacerProps>({
  type: 'spacer',
  name: '间距',
  category: 'content',
  icon: icons.spacer,
  defaultProps: { height: 24 },
  schema: [{ key: 'height', label: '高度 (px)', type: 'number', min: 1, max: 200 }],
  toMjml: (p) => `<mj-spacer height="${p.height}px" />`,
  renderPreview: (p) => `<div style="height:${p.height}px;line-height:${p.height}px;"></div>`,
});
