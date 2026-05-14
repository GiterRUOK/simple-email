import { h } from '../utils/dom';
import type { InlineEditor, SelectionState } from './InlineEditor';

/**
 * 富文本浮动工具条。
 *
 * 关键设计：
 *  - 工具条挂在 editor root 上，跨 block 实例复用；切换编辑对象时调用 attach()。
 *  - **mousedown 在工具条任意位置时（capture 阶段）先调用 editor.saveSelection()**：
 *    在浏览器把焦点切到 select/input 之前抢先把选区存到 InlineEditor，
 *    后续 exec 时会自动 focus 回 contenteditable + 恢复选区——这是
 *    "切字体/字号/颜色失灵"问题的根本修复。
 *  - 按钮全部 mousedown.preventDefault：不抢焦点；select/color/url 这些
 *    必须 takeFocus 的控件不能 preventDefault，但因为 mousedown 已经存档了选区，
 *    onChange/onClick 时调 exec 即可。
 *  - 定位：贴在当前内联编辑根节点（正文容器）**上沿外**，不跟随选区以免压住文字；顶栏贴顶时落到下沿外。
 */
export interface RichTextToolbarOptions {
  /** 工具条的定位上下文：rect 是相对该容器计算的 */
  positionRoot: HTMLElement;
}

const FONT_FAMILIES = [
  { label: '默认', value: '' },
  { label: 'Inter', value: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' },
  { label: '苹方/PingFang', value: '"PingFang SC", "Helvetica Neue", Arial, sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", "Segoe UI", sans-serif' },
  { label: '宋体', value: 'SimSun, "Songti SC", serif' },
  { label: 'Helvetica', value: '"Helvetica Neue", Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier', value: '"Courier New", monospace' },
];

const FONT_SIZES = ['12px', '13px', '14px', '15px', '16px', '18px', '20px', '24px', '28px', '32px'];

const FONT_WEIGHTS = [
  { label: '常规', value: '400' },
  { label: '中等', value: '500' },
  { label: '半粗', value: '600' },
  { label: '加粗', value: '700' },
];

export class RichTextToolbar {
  el: HTMLElement;
  private opts: RichTextToolbarOptions;
  private editor: InlineEditor | null = null;
  private btns: Record<string, HTMLButtonElement> = {};
  private selectFontFamily!: HTMLSelectElement;
  private selectFontSize!: HTMLSelectElement;
  private selectFontWeight!: HTMLSelectElement;
  private inputColor!: HTMLInputElement;
  private inputBgColor!: HTMLInputElement;
  private inputLink!: HTMLInputElement;
  private linkPanel!: HTMLElement;
  /** 最近一次选区推断出的链接，供打开面板时预填 */
  private lastLinkHref: string | null = null;

  constructor(opts: RichTextToolbarOptions) {
    this.opts = opts;
    this.el = h('div', { class: 'sm-floating-toolbar', role: 'toolbar' });
    this._build();
    this.hide();
    opts.positionRoot.append(this.el);

    // 关键：用 capture 阶段在所有控件之前抢先 save selection
    this.el.addEventListener(
      'mousedown',
      () => {
        this.editor?.saveSelection();
      },
      true,
    );
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

  /** 由 InlineEditor 推选区状态进来 */
  update(state: SelectionState | null) {
    if (!state || !this.editor) {
      this.hide();
      return;
    }
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

    const hasLink = !!f.link;
    this.lastLinkHref = f.link;
    this.btns.unlink.style.display = hasLink ? '' : 'none';

    if (f.foreColor) {
      const hex = rgbToHex(f.foreColor);
      if (hex) this.inputColor.value = hex;
    }
    if (f.fontName) this.selectFontFamily.value = matchFamily(f.fontName);
    if (f.fontSize) {
      const px = f.fontSize.match(/\d+px/)?.[0];
      if (px && FONT_SIZES.includes(px)) this.selectFontSize.value = px;
    }

    const ed = this.editor;
    requestAnimationFrame(() => {
      if (!this.editor || ed !== this.editor || !this.el.classList.contains('is-visible')) return;
      this._positionForAnchor(ed.getAnchorRect());
    });
  }

  destroy() {
    this.el.remove();
  }

  /* -------------------------------- 内部 ---------------------------------- */

  private _build() {
    const sep = () => h('div', { class: 'sm-floating-toolbar__sep' });

    // 这些按钮 mousedown.preventDefault 阻止抢焦点；点击时直接 exec
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

    // 字体：select 不能 preventDefault（否则下拉打不开）；mousedown(capture) 已存档选区
    this.selectFontFamily = h('select', {
      class: 'sm-floating-toolbar__select',
      title: '字体',
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v) this.editor?.exec('fontName', v);
        else this.editor?.exec('removeFormat');
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
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v) this._wrapStyle('font-size', v);
      },
    });
    {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '字号';
      this.selectFontSize.append(placeholder);
    }
    for (const px of FONT_SIZES) {
      const opt = document.createElement('option');
      opt.value = px;
      opt.textContent = px;
      this.selectFontSize.append(opt);
    }

    // 字重
    this.selectFontWeight = h('select', {
      class: 'sm-floating-toolbar__select',
      title: '字重',
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v) this._wrapStyle('font-weight', v);
      },
    });
    {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '字重';
      this.selectFontWeight.append(placeholder);
    }
    for (const w of FONT_WEIGHTS) {
      const opt = document.createElement('option');
      opt.value = w.value;
      opt.textContent = w.label;
      this.selectFontWeight.append(opt);
    }

    // 文字颜色
    this.inputColor = h('input', {
      class: 'sm-floating-toolbar__color',
      type: 'color',
      title: '文字颜色',
      value: '#433f3f',
      oninput: (e: Event) => this.editor?.exec('foreColor', (e.target as HTMLInputElement).value),
    }) as HTMLInputElement;

    // 文字背景色
    this.inputBgColor = h('input', {
      class: 'sm-floating-toolbar__color',
      type: 'color',
      title: '文字背景色',
      value: '#fff7e6',
      oninput: (e: Event) => this.editor?.exec('hiliteColor', (e.target as HTMLInputElement).value),
    }) as HTMLInputElement;

    // 链接：插入链接（无链接时显示）
    this.btns.link = this._iconBtn(
      svgIcon(
        '<path d="M9 11.5l1.5 1.5a3.5 3.5 0 005-5l-2-2a3.5 3.5 0 00-5 0M11 8.5L9.5 7a3.5 3.5 0 00-5 5l2 2a3.5 3.5 0 005 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      ),
      '插入或编辑链接',
      () => this._toggleLinkPanel(),
    );

    // 取消链接（有链接时显示）
    this.btns.unlink = this._iconBtn(
      svgIcon(
        '<path d="M9 11.5l1.5 1.5a3.5 3.5 0 005-5l-2-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M3 3l14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      ),
      '取消链接',
      exec('unlink'),
    );

    // 清除格式：图标改为 Tx，避免被误认为"关闭工具条"
    this.btns.clear = this._iconBtn(
      svgIcon(
        '<text x="2" y="14" font-size="11" font-weight="700" fill="currentColor">T</text><text x="11" y="9" font-size="7" font-weight="700" fill="currentColor">x</text><path d="M11 11l5 5M16 11l-5 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
      ),
      '清除格式',
      exec('removeFormat'),
    );

    this.linkPanel = h('div', { class: 'sm-floating-toolbar__link-panel' });
    this.inputLink = h('input', {
      class: 'sm-input',
      type: 'url',
      placeholder: 'https://...',
      onkeydown: ((e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter') {
          ke.preventDefault();
          this._applyLink();
        } else if (ke.key === 'Escape') {
          ke.preventDefault();
          this.linkPanel.classList.remove('is-visible');
          this.editor?.refocus();
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
      this._group([this.selectFontFamily, this.selectFontSize, this.selectFontWeight]),
      sep(),
      this._group([this.inputColor, this.inputBgColor]),
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
    const opening = !this.linkPanel.classList.contains('is-visible');
    this.linkPanel.classList.toggle('is-visible');
    if (this.linkPanel.classList.contains('is-visible')) {
      if (opening) {
        this.inputLink.value = this.lastLinkHref ?? '';
      }
      requestAnimationFrame(() => this.inputLink.focus());
    } else {
      this.editor?.refocus();
    }
  }

  private _applyLink() {
    if (!this.editor) return;
    const url = this.inputLink.value.trim();
    this.editor.setLink(url);
    this.linkPanel.classList.remove('is-visible');
    this.inputLink.value = '';
  }

  private _wrapStyle(prop: string, value: string) {
    if (!this.editor) return;
    // execCommand 没有"任意 inline style"命令；自己处理：把存档选区的内容包到一个 span。
    this.editor.refocus(); // focus + restoreSelection
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return; // 没选中文字，无意义
    const span = document.createElement('span');
    span.setAttribute('style', `${prop}:${value};`);
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      // 选中 span 内容方便连续操作
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      this.editor.saveSelection();
    } catch {
      // 跨节点结构复杂时 extractContents 偶尔抛错，忽略并保持原样
    }
  }

  /**
   * 相对 `positionRoot` 定位：默认贴在**正文容器**上沿上方，避免压在选区文字上；
   * 若顶端空间不足则贴在容器下沿下方。
   */
  private _positionForAnchor(anchor: DOMRect) {
    const rootRect = this.opts.positionRoot.getBoundingClientRect();
    const gap = 6;
    const bar = this.el.getBoundingClientRect();
    const tw = bar.width || this.el.offsetWidth;
    const th = bar.height || this.el.offsetHeight || 40;

    let top = anchor.top - rootRect.top - th - gap;
    if (top < 8) {
      top = anchor.bottom - rootRect.top + gap;
    }

    const left = Math.max(
      8,
      Math.min(
        anchor.left - rootRect.left + anchor.width / 2 - tw / 2,
        rootRect.width - tw - 8,
      ),
    );

    this.el.style.top = `${top}px`;
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
        onmousedown: (e: Event) => e.preventDefault(),
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
  const lower = name.toLowerCase().replace(/['"]/g, '').split(',')[0].trim();
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
