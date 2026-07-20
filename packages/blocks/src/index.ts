import {
  createI18nContext,
  type BlockDefinition,
  type SimpleMailI18nOptions,
  type SimpleMailT,
} from '@simple-mail/core';
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
import { localizeBlockDefinitions } from './i18n';

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

export { localizeBlockDefinition, localizeBlockDefinitions } from './i18n';

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

const baseBuiltinBlocks: BlockDefinition<any>[] = [
  textBlock,
  htmlBlock,
  imageBlock,
  socialGroupBlock,
  heroBlock,
  buttonBlock,
  dividerBlock,
  spacerBlock,
];

const baseExampleCustomBlocks: BlockDefinition<any>[] = [logoBlock, socialBlock, footerBlock];

export interface CreateBlocksOptions extends SimpleMailI18nOptions {
  t?: SimpleMailT;
}

function resolveBlocksT(options: CreateBlocksOptions = {}): SimpleMailT {
  return options.t ?? createI18nContext(options).t;
}

/** 内置组件（content 类）。可直接传给 MailEditor.blocks。 */
export function createBuiltinBlocks(options: CreateBlocksOptions = {}): BlockDefinition<any>[] {
  return localizeBlockDefinitions(baseBuiltinBlocks, resolveBlocksT(options));
}

/** 业务示例的“自定义”组件。可作为参考或直接使用；正式业务块应由宿主应用注册。 */
export function createExampleCustomBlocks(options: CreateBlocksOptions = {}): BlockDefinition<any>[] {
  return localizeBlockDefinitions(baseExampleCustomBlocks, resolveBlocksT(options));
}

/** 全部组件（内置 + 示例自定义）。业务相关块请在使用侧与 `allBlocks` 合并后传入 MailEditor。 */
export function createAllBlocks(options: CreateBlocksOptions = {}): BlockDefinition<any>[] {
  const t = resolveBlocksT(options);
  return [
    ...localizeBlockDefinitions(baseBuiltinBlocks, t),
    ...localizeBlockDefinitions(baseExampleCustomBlocks, t),
  ];
}

/** 内置组件（content 类）。保留兼容：默认中文。 */
export const builtinBlocks: BlockDefinition<any>[] = createBuiltinBlocks();

/** 业务示例的“自定义”组件。保留兼容：默认中文。 */
export const exampleCustomBlocks: BlockDefinition<any>[] = createExampleCustomBlocks();

/** 全部组件（内置 + 示例自定义）。保留兼容：默认中文。 */
export const allBlocks: BlockDefinition<any>[] = createAllBlocks();
