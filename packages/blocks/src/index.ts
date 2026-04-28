import type { BlockDefinition } from '@simple-mail/core';
import { buttonBlock } from './button';
import { dividerBlock } from './divider';
import { footerBlock } from './footer';
import { imageBlock } from './image';
import { logoBlock } from './logo';
import { socialBlock } from './social';
import { spacerBlock } from './spacer';
import { textBlock } from './text';

export {
  buttonBlock,
  dividerBlock,
  footerBlock,
  imageBlock,
  logoBlock,
  socialBlock,
  spacerBlock,
  textBlock,
};

/** 内置组件（content 类）。可直接传给 MailEditor.blocks。 */
export const builtinBlocks: BlockDefinition<any>[] = [
  textBlock,
  imageBlock,
  buttonBlock,
  dividerBlock,
  spacerBlock,
];

/** 业务示例的"自定义"组件。可作为参考或直接使用。 */
export const exampleCustomBlocks: BlockDefinition<any>[] = [logoBlock, socialBlock, footerBlock];

/** 全部组件（内置 + 示例自定义） */
export const allBlocks: BlockDefinition<any>[] = [...builtinBlocks, ...exampleCustomBlocks];
