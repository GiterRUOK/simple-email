import {
  defineBlock,
  htmlContainsMjmlTags,
  mjRawCellTypographyFromStyles,
  mjRawEmailTableWrap,
} from '@simple-mail/core';
import { icons } from './icons';

interface HtmlBlockProps {
  html: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

export const htmlBlock = defineBlock<HtmlBlockProps>({
  type: 'html',
  name: 'HTML',
  category: 'content',
  icon: icons.html,
  defaultProps: {
    html: '<p style="margin:0;">在此写入任意 HTML，将经 <strong>mj-raw</strong> 原样输出到邮件。支持变量 {{user.name}}</p>',
    paddingTop: 8,
    paddingRight: 0,
    paddingBottom: 8,
    paddingLeft: 0,
  },
  schema: [
    {
      key: 'html',
      label: 'HTML',
      type: 'textarea',
      help: '只写 HTML（如 <a>、<table>），不要写 <mj-text> 等 MJML 标签；MJML 标签在 mj-raw 内不会被编译。简单链接建议用「文本」块。',
    },
    { key: 'paddingTop', label: '内边距', type: 'spacing' },
  ],
  inlineEditable: {
    selector: '.sm-html-content',
    mode: 'html',
    multiline: true,
    propKey: 'html',
    placeholder: '输入 HTML…',
  },
  toMjml: (p, ctx) => {
    const padding = `${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px`;
    return mjRawEmailTableWrap(padding, p.html, mjRawCellTypographyFromStyles(ctx.doc.styles));
  },
  renderPreview: (p) => {
    const pad = `${p.paddingTop}px ${p.paddingRight}px ${p.paddingBottom}px ${p.paddingLeft}px`;
    const warn = htmlContainsMjmlTags(p.html)
      ? '<div class="sm-html-mjml-warn">检测到 MJML 标签，此处应只写 HTML，预览可能显示异常。</div>'
      : '';
    return `<div class="sm-html-content" style="padding:${pad};min-height:1em;">${warn}${p.html}</div>`;
  },
});
