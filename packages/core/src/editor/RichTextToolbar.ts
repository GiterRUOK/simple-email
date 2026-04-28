import type { InlineEditor, SelectionState } from './InlineEditor';
import { h } from '../utils/dom';

/**
 * 富文本浮动工具条。
 *
 * 关键点：
 *  - 工具条挂在 editor root 上，跨 block 实例复用；切换编辑对象时重新 attach 一个 InlineEditor。
 *  - 点击按钮时不能让被编辑元素失焦——所有 button 都 `mousedown` 拦截，避免触发 InlineEditor.commit。
 *  - 选区变化由 InlineEditor 推过来，包括 rect（用于浮动定位）与 formats（用于按钮高亮）。
 */
export interface RichTextToolbarOptions {
  /** 工具条的定位上下文：rect 是相对该容器计算的 */
  positionRoot: HTMLElement;
}

const FONT_FAMILIES = [
  { label: '默认', value: '' },
  { label: '苹方/PingFang SC', value: '"PingFang SC", "Helvetica Neue", Arial, sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", "Segoe UI", sans-serif' },
  { label: '宋体', value: 'SimSun, "Songti SC", serif' },
  { label: 'Helvetica', value: '"Helvetica Neue", Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier', value: '"Courier New", monospace' },
];

const FONT_SIZES = ['12px', '13px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];

export class RichTextToolbar {
  el: HTMLElement;
  private opts: RichTextToolbarOptions;
  private editor: InlineEditor | null = null;
  private btns: Record<string, HTMLButtonElement> = {};
  private selectFontFamily!: HTMLSelectElement;
  private selectFontSize!: HTMLSelectElement;
  private inputColor!: HTMLInputElement;
  private inputLink!: HTMLInputElement;
  private linkPanel!: HTMLElement;

  constructor(opts: RichTextToolbarOptions) {
    this.opts = opts;
    this.el = h('div', { class: 'sm-floating-toolbar', role: 'toolbar' });
    this._build();
    this.hide();
    opts.positionRoot.append(this.el);
  }

  attach(editor: InlineEditor) {
    this.editor = editor;
  }

  detach() {
    this.editor = null;
    this.hide();
  }

  show() {
    this.el.classList.add('is-visible');
  }

  hide() {
    this.el.classList.remove('is-visible');
    this.linkPanel.classList.remove('is-visible');
  }

  /** 由 Canvas / InlineEditor 推选区状态进来 */
  update(state: SelectionState | null) {
    if (!state || !this.editor) {
      this.hide();
      return;
    }
    this._position(state.rect);
    this.show();
    const f = state.formats;
    this._setActive('bold', f.bold);
    this._setActive('italic', f.italic);
    this._setActive('underline', f.underline);
    this._setActive('strikethrough', f.strikethrough);
    this._setActive('ul', f.unorderedList);
    this._setActive('ol', f.orderedList);
    this._setActive('alignLeft', f.align === 'left');
    this._setActive('alignCenter', f.align === 'center');
    this._setActive('alignRight', f.align === 'right');
    this._setActive('link', !!f.link);
    if (f.foreColor) {
      const hex = rgbToHex(f.foreColor);
      if (hex) this.inputColor.value = hex;
    }
    if (f.fontName) this.selectFontFamily.value = matchFamily(f.fontName);
    if (f.fontSize) this.selectFontSize.value = f.fontSize.match(/\d+px/)?.[0] ?? this.selectFontSize.value;
  }

  destroy() {
    this.el.remove();
  }

  /* -------------------------------- 内部 ---------------------------------- */

  private _build() {
    const sep = () => h('div', { class: 'sm-floating-toolbar__sep' });

    const exec = (cmd: string, val?: string) => () => this.editor?.exec(cmd, val);

    this.btns.bold = this._btn('B', '加粗 ⌘B', exec('bold'), { fontWeight: '700' });
    this.btns.italic = this._btn('I', '斜体 ⌘I', exec('italic'), { fontStyle: 'italic' });
    this.btns.underline = this._btn('U', '下划线 ⌘U', exec('underline'), {
      textDecoration: 'underline',
    });
    this.btns.strikethrough = this._btn('S', '删除线', exec('strikeThrough'), {
      textDecoration: 'line-through',
    });

    this.btns.alignLeft = this._iconBtn(
      svgIcon(
        '<path d="M3 5h14M3 9h10M3 13h14M3 17h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      ),
      '左对齐',
      exec('justifyLeft'),
    );
    this.btns.alignCenter = this._iconBtn(
      svgIcon(
        '<path d="M3 5h14M5 9h10M3 13h14M5 17h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      ),
      '居中',
      exec('justifyCenter'),
    );
    this.btns.alignRight = this._iconBtn(
      svgIcon(
        '<path d="M3 5h14M7 9h10M3 13h14M7 17h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      ),
      '右对齐',
      exec('justifyRight'),
    );

    this.btns.ul = this._iconBtn(
      svgIcon(
        '<circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="10" r="1.2" fill="currentColor"/><circle cx="4" cy="14" r="1.2" fill="currentColor"/><path d="M8 6h9M8 10h9M8 14h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      ),
      '无序列表',
      exec('insertUnorderedList'),
    );
    this.btns.ol = this._iconBtn(
      svgIcon(
        '<text x="2" y="8" font-size="6" font-weight="600" fill="currentColor">1</text><text x="2" y="14" font-size="6" font-weight="600" fill="currentColor">2</text><path d="M8 6h9M8 12h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      ),
      '有序列表',
      exec('insertOrderedList'),
    );

    // 字体
    this.selectFontFamily = h('select', {
      class: 'sm-floating-toolbar__select',
      title: '字体',
      onmousedown: (e: Event) => e.preventDefault(), // 不抢焦点
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v) this.editor?.exec('fontName', v);
      },
    });
    for (const f of FONT_FAMILIES) {
      const opt = document.createElement('option');
      opt.value = f.value;
      opt.textContent = f.label;
      this.selectFontFamily.append(opt);
    }

    // 字号
    this.selectFontSize = h('select', {
      class: 'sm-floating-toolbar__select',
      title: '字号',
      onmousedown: (e: Event) => e.preventDefault(),
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        // execCommand 'fontSize' 只接受 1..7。改用包 span 设置 inline style
        if (v) this._wrapStyle('font-size', v);
      },
    });
    const px0 = document.createElement('option');
    px0.value = '';
    px0.textContent = '字号';
    this.selectFontSize.append(px0);
    for (const px of FONT_SIZES) {
      const opt = document.createElement('option');
      opt.value = px;
      opt.textContent = px;
      this.selectFontSize.append(opt);
    }

    // 颜色
    this.inputColor = h('input', {
      class: 'sm-floating-toolbar__color',
      type: 'color',
      title: '文字颜色',
      value: '#1f2328',
      onmousedown: (e: Event) => e.stopPropagation(),
      oninput: (e: Event) => this.editor?.exec('foreColor', (e.target as HTMLInputElement).value),
    }) as HTMLInputElement;

    // 链接
    this.btns.link = this._iconBtn(
      svgIcon(
        '<path d="M9 11.5l1.5 1.5a3.5 3.5 0 005-5l-2-2a3.5 3.5 0 00-5 0M11 8.5L9.5 7a3.5 3.5 0 00-5 5l2 2a3.5 3.5 0 005 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      ),
      '插入/编辑链接',
      () => this._toggleLinkPanel(),
    );

    this.btns.unlink = this._iconBtn(
      svgIcon(
        '<path d="M9 11.5l1.5 1.5a3.5 3.5 0 005-5l-2-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M3 3l14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      ),
      '取消链接',
      exec('unlink'),
    );

    this.btns.clear = this._iconBtn(
      svgIcon(
        '<path d="M5 5l10 10M5 15L15 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      ),
      '清除格式',
      exec('removeFormat'),
    );

    this.linkPanel = h('div', { class: 'sm-floating-toolbar__link-panel' });
    this.inputLink = h('input', {
      class: 'sm-input',
      type: 'url',
      placeholder: 'https://...',
      onmousedown: (e: Event) => e.stopPropagation(),
      onkeydown: ((e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter') {
          ke.preventDefault();
          this._applyLink();
        }
      }) as EventListener,
    }) as HTMLInputElement;
    const applyLinkBtn = h(
      'button',
      {
        class: 'sm-btn sm-btn--primary',
        type: 'button',
        onmousedown: (e: Event) => e.preventDefault(),
        onclick: () => this._applyLink(),
      },
      ['确定'],
    );
    this.linkPanel.append(this.inputLink, applyLinkBtn);

    this.el.append(
      this._group([this.btns.bold, this.btns.italic, this.btns.underline, this.btns.strikethrough]),
      sep(),
      this._group([this.selectFontFamily, this.selectFontSize, this.inputColor]),
      sep(),
      this._group([this.btns.alignLeft, this.btns.alignCenter, this.btns.alignRight]),
      sep(),
      this._group([this.btns.ul, this.btns.ol]),
      sep(),
      this._group([this.btns.link, this.btns.unlink, this.btns.clear]),
      this.linkPanel,
    );
  }

  private _toggleLinkPanel() {
    this.linkPanel.classList.toggle('is-visible');
    if (this.linkPanel.classList.contains('is-visible')) {
      requestAnimationFrame(() => this.inputLink.focus());
    }
  }

  private _applyLink() {
    if (!this.editor) return;
    const url = this.inputLink.value.trim();
    if (!url) {
      this.editor.exec('unlink');
    } else {
      const safe = /^https?:|^mailto:|^tel:|^\{\{/i.test(url) ? url : `https://${url}`;
      this.editor.exec('createLink', safe);
    }
    this.linkPanel.classList.remove('is-visible');
    this.inputLink.value = '';
  }

  private _wrapStyle(prop: string, value: string) {
    if (!this.editor) return;
    // 用 hiliteColor 这种方式不灵活，干脆插入一段带 style 的 span
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.setAttribute('style', `${prop}:${value};`);
    span.appendChild(range.extractContents());
    range.insertNode(span);
    // 选中 span 内容方便连续操作
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  private _position(rect: DOMRect | null) {
    if (!rect) return;
    const rootRect = this.opts.positionRoot.getBoundingClientRect();
    const top = rect.top - rootRect.top - this.el.offsetHeight - 8;
    const left = Math.max(
      8,
      Math.min(
        rect.left - rootRect.left + rect.width / 2 - this.el.offsetWidth / 2,
        rootRect.width - this.el.offsetWidth - 8,
      ),
    );
    this.el.style.top = `${Math.max(8, top)}px`;
    this.el.style.left = `${left}px`;
  }

  private _setActive(key: string, on: boolean) {
    this.btns[key]?.classList.toggle('is-active', on);
  }

  private _btn(
    text: string,
    title: string,
    onClick: () => void,
    style: Partial<CSSStyleDeclaration> = {},
  ): HTMLButtonElement {
    const b = h(
      'button',
      {
        class: 'sm-floating-toolbar__btn',
        type: 'button',
        title,
        onmousedown: (e: Event) => e.preventDefault(), // 关键：阻止失焦
        onclick: onClick,
      },
      [text],
    ) as HTMLButtonElement;
    Object.assign(b.style, style);
    return b;
  }

  private _iconBtn(icon: SVGElement, title: string, onClick: () => void): HTMLButtonElement {
    return h(
      'button',
      {
        class: 'sm-floating-toolbar__btn',
        type: 'button',
        title,
        onmousedown: (e: Event) => e.preventDefault(),
        onclick: onClick,
      },
      [icon],
    ) as HTMLButtonElement;
  }

  private _group(children: HTMLElement[]): HTMLElement {
    return h('div', { class: 'sm-floating-toolbar__group' }, children);
  }
}

function svgIcon(inner: string): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '14');
  el.setAttribute('height', '14');
  el.setAttribute('viewBox', '0 0 20 20');
  el.innerHTML = inner;
  return el;
}

function matchFamily(name: string): string {
  const lower = name.toLowerCase().replace(/['"]/g, '');
  for (const f of FONT_FAMILIES) {
    if (!f.value) continue;
    if (f.value.toLowerCase().includes(lower)) return f.value;
  }
  return '';
}

function rgbToHex(rgb: string): string | null {
  if (rgb.startsWith('#')) return rgb;
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  const toHex = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}
