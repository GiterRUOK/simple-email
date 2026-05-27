import type { BlockDefinition } from '@simple-mail/core';
import { buttonBlock } from './button';
import { dividerBlock } from './divider';
import { footerBlock } from './footer';
import { heroBlock } from './hero';
import { htmlBlock } from './html';
import { imageBlock } from './image';
import { logoBlock } from './logo';
import { socialBlock } from './social';
import { socialGroupBlock } from './socialGroup';
import { spacerBlock } from './spacer';
import { textBlock } from './text';

export {
  buttonBlock,
  dividerBlock,
  footerBlock,
  heroBlock,
  htmlBlock,
  imageBlock,
  logoBlock,
  socialBlock,
  socialGroupBlock,
  spacerBlock,
  textBlock,
};

/** 宿主拼装「社交组」类 block 时可复用（mj-social 序列化、侧栏 socialLinkList）。 */
export {
  escAttr,
  escMjmlText,
  flexJustifyFromAlign,
  mjSocialElementName,
  mjSocialDefaultIconSrc,
  mjSocialElementsLines,
  paddingQuad,
  renderSocialIconPreviewHtml,
  socialIconBorderRadiusCss,
  socialIconBorderRadiusMjml,
  socialIconSpacingPx,
  socialMeta,
  SOCIAL_NETWORK_OPTIONS,
  type SocialGroupLabelStyle,
  type SocialLinkItem,
} from './socialShared';

/** 内置组件（content 类）。可直接传给 MailEditor.blocks。 */
export const builtinBlocks: BlockDefinition<any>[] = [
  textBlock,
  htmlBlock,
  imageBlock,
  socialGroupBlock,
  heroBlock,
  buttonBlock,
  dividerBlock,
  spacerBlock,
];

/** 业务示例的“自定义”组件。可作为参考或直接使用；正式业务块应由宿主应用注册。 */
export const exampleCustomBlocks: BlockDefinition<any>[] = [logoBlock, socialBlock, footerBlock];

/** 全部组件（内置 + 示例自定义）。业务相关块请在使用侧与 `allBlocks` 合并后传入 MailEditor。 */
export const allBlocks: BlockDefinition<any>[] = [...builtinBlocks, ...exampleCustomBlocks];
