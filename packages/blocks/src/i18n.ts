import type { BlockDefinition, BlockSchemaField, SimpleMailT } from '@simple-mail/core';

type AnyBlock = BlockDefinition<any>;

const FIELD_LABEL_KEYS: Record<string, string> = {
  align: 'blocks.field.align',
  textAlign: 'blocks.field.textAlign',
  verticalAlign: 'blocks.field.verticalAlign',
  color: 'blocks.field.color',
  textColor: 'blocks.field.textColor',
  backgroundColor: 'blocks.field.backgroundColor',
  backgroundUrl: 'blocks.field.backgroundUrl',
  height: 'blocks.field.heightPx',
  width: 'blocks.field.width',
  thickness: 'blocks.field.thicknessPx',
  paddingTop: 'blocks.field.padding',
  text: 'blocks.field.text',
  href: 'blocks.field.link',
  src: 'blocks.field.imageUrl',
  alt: 'blocks.field.alt',
  fontSize: 'blocks.field.fontSize',
  fontFamily: 'blocks.field.fontFamily',
  fontWeight: 'blocks.field.fontWeight',
  lineHeight: 'blocks.field.lineHeight',
  html: 'blocks.field.html',
  borderRadius: 'blocks.field.borderRadius',
  innerPaddingV: 'blocks.field.buttonInnerPaddingV',
  innerPaddingH: 'blocks.field.buttonInnerPaddingH',
  elements: 'blocks.field.socialLinks',
  labelFontSize: 'blocks.field.labelFontSize',
  labelFontWeight: 'blocks.field.labelFontWeight',
  labelColor: 'blocks.field.labelColor',
  iconSize: 'blocks.field.iconSize',
  iconBorderRadius: 'blocks.field.iconRadius',
  iconSpacing: 'blocks.field.iconSpacing',
  companyName: 'blocks.field.companyName',
  address: 'blocks.field.address',
  unsubscribeText: 'blocks.field.unsubscribeText',
  unsubscribeHref: 'blocks.field.unsubscribeLink',
};

const BLOCK_FIELD_LABEL_KEYS: Record<string, Record<string, string>> = {
  button: {
    backgroundColor: 'blocks.field.backgroundColor',
    color: 'blocks.field.textColor',
    width: 'blocks.field.width',
  },
  divider: {
    width: 'blocks.field.widthPercentOrPx',
    paddingTop: 'blocks.field.topMargin',
    paddingBottom: 'blocks.field.bottomMargin',
  },
  hero: {
    backgroundColor: 'blocks.field.backgroundPlaceholderColor',
    height: 'blocks.field.areaHeightPx',
    content: 'blocks.field.bodyHtml',
  },
  html: {
    paddingTop: 'blocks.field.padding',
  },
  image: {
    href: 'blocks.field.href',
    width: 'blocks.field.widthPx',
  },
  logo: {
    src: 'blocks.field.logoImage',
    href: 'blocks.field.websiteLink',
    width: 'blocks.field.widthPx',
  },
  text: {
    content: 'blocks.field.contentHtml',
  },
};

const HELP_KEYS: Record<string, Record<string, string>> = {
  button: { width: 'blocks.help.buttonWidth' },
  hero: {
    backgroundColor: 'blocks.help.imageFallbackColor',
    content: 'blocks.help.canvasEditRecommendedShort',
  },
  html: { html: 'blocks.help.htmlOnly' },
  image: { height: 'blocks.help.imageAutoHeight' },
  'social-group': {
    elements: 'blocks.help.socialLinks',
    iconBorderRadius: 'blocks.help.iconRadius',
    iconSpacing: 'blocks.help.iconSpacing',
  },
  social: {
    elements: 'blocks.help.bizSocialLinks',
    iconBorderRadius: 'blocks.help.iconRadius',
    iconSpacing: 'blocks.help.bizIconSpacing',
  },
  text: {
    content: 'blocks.help.canvasEditRecommended',
    lineHeight: 'blocks.help.globalLineHeight',
  },
};

const PLACEHOLDER_KEYS: Record<string, Record<string, string>> = {
  button: { width: 'blocks.placeholder.buttonWidth' },
  image: { alt: 'blocks.field.imageDescription' },
  text: {
    color: 'blocks.field.inheritGlobalPlaceholder',
    fontFamily: 'blocks.field.inheritGlobalPlaceholder',
  },
};

const INLINE_PLACEHOLDER_KEYS: Record<string, string> = {
  button: 'blocks.field.buttonTextPlaceholder',
  hero: 'blocks.field.heroPlaceholder',
  html: 'blocks.field.htmlPlaceholder',
  text: 'blocks.field.textPlaceholder',
};

const DEFAULT_PROP_KEYS: Record<string, Record<string, string>> = {
  button: { text: 'blocks.button.defaultText' },
  hero: { content: 'blocks.hero.defaultContent' },
  html: { html: 'blocks.html.defaultHtml' },
  text: { content: 'blocks.text.defaultContent' },
  footer: {
    companyName: 'blocks.footer.defaultCompanyName',
    address: 'blocks.footer.defaultAddress',
    unsubscribeText: 'blocks.footer.defaultUnsubscribeText',
  },
};

export function localizeBlockDefinitions(blocks: AnyBlock[], t: SimpleMailT): AnyBlock[] {
  return blocks.map((block) => localizeBlockDefinition(block, t));
}

export function localizeBlockDefinition(block: AnyBlock, t: SimpleMailT): AnyBlock {
  const blockKey = blockMessageId(block.type);
  const nameKey = `blocks.${blockKey}.name`;
  const translatedName = t(nameKey);
  return {
    ...block,
    name: translatedName === nameKey ? block.name : translatedName,
    defaultProps: localizeDefaultProps(block, t),
    schema: block.schema.map((field) => localizeField(blockKey, field, t)),
    inlineEditable: block.inlineEditable
      ? {
          ...block.inlineEditable,
          placeholder: inlinePlaceholder(blockKey, block, t),
        }
      : undefined,
  };
}

function localizeDefaultProps(block: AnyBlock, t: SimpleMailT): Record<string, unknown> {
  const props = { ...(block.defaultProps as Record<string, unknown>) };
  const propKeys = DEFAULT_PROP_KEYS[blockMessageId(block.type)] ?? {};
  for (const [prop, key] of Object.entries(propKeys)) {
    props[prop] = t(key);
  }
  return props;
}

function localizeField(blockType: string, field: BlockSchemaField, t: SimpleMailT): BlockSchemaField {
  const labelKey = BLOCK_FIELD_LABEL_KEYS[blockType]?.[field.key] ?? FIELD_LABEL_KEYS[field.key];
  return {
    ...field,
    label: labelKey ? t(labelKey) : field.label,
    placeholder: PLACEHOLDER_KEYS[blockType]?.[field.key]
      ? t(PLACEHOLDER_KEYS[blockType][field.key])
      : field.placeholder,
    help: HELP_KEYS[blockType]?.[field.key] ? t(HELP_KEYS[blockType][field.key]) : field.help,
    options: field.options?.map((option) => ({
      ...option,
      label: localizeOptionLabel(option, t),
    })),
  };
}

function localizeOptionLabel(
  option: { label: string; value: string },
  t: SimpleMailT,
): string {
  if (option.value === 'left') return t('common.left');
  if (option.value === 'center') return t('common.center');
  if (option.value === 'right') return t('common.right');
  if (option.value === 'top') return t('blocks.option.top');
  if (option.value === 'middle') return t('blocks.option.middle');
  if (option.value === 'bottom') return t('blocks.option.bottom');
  if (option.value === '') return t('common.inheritGlobal');
  return option.label;
}

function inlinePlaceholder(blockType: string, block: AnyBlock, t: SimpleMailT): string | undefined {
  const key = INLINE_PLACEHOLDER_KEYS[blockType];
  return key ? t(key) : block.inlineEditable?.placeholder;
}

function blockMessageId(type: string): string {
  return type.startsWith('custom:') ? type.slice('custom:'.length) : type;
}
