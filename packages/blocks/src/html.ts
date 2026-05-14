import { defineBlock, mjRawCellTypographyFromStyles, mjRawEmailTableWrap } from '@simple-mail/core';
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
    paddingRight: 16,
    paddingBottom: 8,
    paddingLeft: 16,
  },
  schema: [
    {
      key: 'html',
      label: 'HTML',
      type: 'textarea',
      help: '插入 MJML 的 mj-raw。邮件客户端常会过滤脚本与不支持的标签。',
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
    return `<div class="sm-html-content" style="padding:${pad};min-height:1em;">${p.html}</div>`;
  },
});
