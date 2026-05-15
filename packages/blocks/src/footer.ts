import { defineBlock } from '@simple-mail/core';
import { icons } from './icons';

interface FooterProps {
  companyName: string;
  address: string;
  unsubscribeText: string;
  unsubscribeHref: string;
  textColor: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const footerBlock = defineBlock<FooterProps>({
  type: 'custom:footer',
  name: '页脚',
  category: 'custom',
  icon: icons.footer,
  defaultProps: {
    companyName: '你的公司',
    address: '上海市某区某路某号',
    unsubscribeText: '退订邮件',
    unsubscribeHref: '{{unsubscribeUrl}}',
    textColor: '#9aa0a6',
  },
  schema: [
    { key: 'companyName', label: '公司名称', type: 'text' },
    { key: 'address', label: '地址', type: 'text' },
    { key: 'unsubscribeText', label: '退订文案', type: 'text' },
    { key: 'unsubscribeHref', label: '退订链接', type: 'url' },
    { key: 'textColor', label: '文字颜色', type: 'color' },
  ],
  toMjml: (p) => {
    return `<mj-text align="center" color="${esc(p.textColor)}" font-size="12px" line-height="1.6" padding="8px 0px 8px 0px">
  ${esc(p.companyName)}<br />
  ${esc(p.address)}<br />
  <a href="${esc(p.unsubscribeHref)}" style="color:${esc(p.textColor)};">${esc(p.unsubscribeText)}</a>
</mj-text>`;
  },
  renderPreview: (p) => {
    return `<div style="padding:8px 0;text-align:center;font-size:12px;line-height:1.6;color:${p.textColor};">
      ${esc(p.companyName)}<br/>
      ${esc(p.address)}<br/>
      <a href="${esc(p.unsubscribeHref)}" style="color:${p.textColor};">${esc(p.unsubscribeText)}</a>
    </div>`;
  },
});
