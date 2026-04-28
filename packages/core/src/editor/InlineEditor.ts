/**
 * 把任意 DOM 元素临时变成 contenteditable，并暴露提交/取消/选区事件。
 *
 * 设计要点：
 *  - 不直接同步到 store。编辑过程中只在本地累积，提交（blur / Esc / 单行 Enter）时一次性回调，
 *    避免每次按键都触发画布全量重渲染导致光标丢失。
 *  - mode=plain 时仅取 textContent，并在 paste/keydown 上拦截换行；
 *    mode=rich 时保留 inline HTML，但会在提交时做一次清理（白名单标签 + inline style）。
 *  - 选区变化通过 `onSelectionChange` 实时回调，便于浮动工具条同步按钮状态/位置。
 */
export interface InlineEditorOptions {
  el: HTMLElement;
  initialValue: string;
  mode: 'rich' | 'plain';
  multiline: boolean;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onSelectionChange?: (state: SelectionState | null) => void;
}

export interface SelectionState {
  hasSelection: boolean;
  rect: DOMRect | null;
  /** queryCommandState 的若干常用值，用于工具条按钮高亮 */
  formats: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    unorderedList: boolean;
    orderedList: boolean;
    align: 'left' | 'center' | 'right' | 'justify' | null;
    link: string | null;
    foreColor: string | null;
    fontSize: string | null;
    fontName: string | null;
  };
}

export class InlineEditor {
  private opts: InlineEditorOptions;
  private el: HTMLElement;
  private listeners: Array<() => void> = [];
  private committed = false;
  private originalContent: string;
  /** 防止 selectionchange 在我们 destroy 之后还回调 */
  private alive = true;

  constructor(opts: InlineEditorOptions) {
    this.opts = opts;
    this.el = opts.el;
    this.originalContent = this.el.innerHTML;
    this._mount();
  }

  /** 立即提交并销毁。 */
  commit() {
    if (this.committed) return;
    this.committed = true;
    const value =
      this.opts.mode === 'plain'
        ? (this.el.textContent ?? '').replace(/\s+\n/g, '\n').trim()
        : sanitizeRichHtml(this.el.innerHTML);
    this.opts.onCommit(value);
    this.destroy(false);
  }

  /** 放弃编辑、还原 DOM 并销毁。 */
  cancel() {
    if (this.committed) return;
    this.committed = true;
    this.el.innerHTML = this.originalContent;
    this.opts.onCancel();
    this.destroy(false);
  }

  destroy(restore = true) {
    if (!this.alive) return;
    this.alive = false;
    this.listeners.forEach((off) => off());
    this.listeners = [];
    this.el.removeAttribute('contenteditable');
    this.el.classList.remove('sm-inline-editing');
    if (restore && !this.committed) this.el.innerHTML = this.originalContent;
  }

  /** 直接对当前选区执行命令（供 Toolbar 调用）。 */
  exec(command: string, value?: string) {
    this._ensureFocus();
    document.execCommand('styleWithCSS', false, 'true' as any);
    document.execCommand(command, false, value);
    this._emitSelection();
  }

  /** 在当前光标处插入纯文本（供"插入变量"使用）。 */
  insertText(text: string) {
    this._ensureFocus();
    document.execCommand('insertText', false, text);
  }

  /* -------------------------------- 内部 ---------------------------------- */

  private _mount() {
    const { el, mode, multiline, placeholder } = this.opts;
    el.setAttribute('contenteditable', 'true');
    el.classList.add('sm-inline-editing');
    if (placeholder) el.setAttribute('data-placeholder', placeholder);

    if (this.opts.initialValue) {
      el.innerHTML = mode === 'plain' ? escapeHtml(this.opts.initialValue) : this.opts.initialValue;
    }

    // 初始聚焦并把光标移到末尾，便于"双击 → 直接输入"
    requestAnimationFrame(() => {
      el.focus();
      placeCaretAtEnd(el);
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancel();
        return;
      }
      if (e.key === 'Enter') {
        if (!multiline) {
          e.preventDefault();
          this.commit();
          return;
        }
        // 多行下，回车默认会插入 <div> / <br>。强制 <br>，避免出现各种奇怪嵌套。
        e.preventDefault();
        document.execCommand('insertLineBreak');
      }
    };
    const onBlur = () => {
      // 给点钟摆余地，避免点击工具条按钮时立刻提交
      setTimeout(() => {
        if (!this.alive) return;
        const active = document.activeElement;
        if (active && (active === el || el.contains(active))) return;
        if (active && (active as HTMLElement).closest?.('.sm-floating-toolbar')) return;
        this.commit();
      }, 0);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (mode !== 'plain') return;
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const safe = multiline ? text : text.replace(/\r?\n/g, ' ');
      document.execCommand('insertText', false, safe);
    };
    const onSelChange = () => {
      if (!this.alive) return;
      this._emitSelection();
    };

    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('blur', onBlur);
    el.addEventListener('paste', onPaste);
    document.addEventListener('selectionchange', onSelChange);
    el.addEventListener('input', onSelChange);
    el.addEventListener('mouseup', onSelChange);

    this.listeners.push(
      () => el.removeEventListener('keydown', onKeyDown),
      () => el.removeEventListener('blur', onBlur),
      () => el.removeEventListener('paste', onPaste),
      () => document.removeEventListener('selectionchange', onSelChange),
      () => el.removeEventListener('input', onSelChange),
      () => el.removeEventListener('mouseup', onSelChange),
    );
  }

  private _ensureFocus() {
    if (document.activeElement !== this.el) {
      this.el.focus();
    }
  }

  private _emitSelection() {
    if (!this.opts.onSelectionChange) return;
    if (this.opts.mode === 'plain') {
      this.opts.onSelectionChange(null); // 单行 plain 不需要工具条
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      this.opts.onSelectionChange(null);
      return;
    }
    if (!this.el.contains(sel.anchorNode)) {
      this.opts.onSelectionChange(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = sel.isCollapsed
      ? this._caretRect(range)
      : range.getBoundingClientRect();

    const align: SelectionState['formats']['align'] =
      document.queryCommandState('justifyCenter')
        ? 'center'
        : document.queryCommandState('justifyRight')
          ? 'right'
          : document.queryCommandState('justifyFull')
            ? 'justify'
            : 'left';

    const link = (() => {
      let node: Node | null = sel.anchorNode;
      while (node && node !== this.el) {
        if (node.nodeType === 1 && (node as HTMLElement).tagName === 'A') {
          return (node as HTMLAnchorElement).getAttribute('href');
        }
        node = node.parentNode;
      }
      return null;
    })();

    this.opts.onSelectionChange({
      hasSelection: true,
      rect,
      formats: {
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikethrough: document.queryCommandState('strikeThrough'),
        unorderedList: document.queryCommandState('insertUnorderedList'),
        orderedList: document.queryCommandState('insertOrderedList'),
        align,
        link,
        foreColor: safeQueryValue('foreColor'),
        fontSize: safeQueryValue('fontSize'),
        fontName: safeQueryValue('fontName'),
      },
    });
  }

  private _caretRect(range: Range): DOMRect | null {
    const rects = range.getClientRects();
    if (rects.length) return rects[0];
    // 折叠选区在空段落上时 rects 为空，造一个零宽 range 拿到位置
    const tmp = range.cloneRange();
    tmp.collapse(true);
    const span = document.createElement('span');
    span.appendChild(document.createTextNode('\u200b'));
    tmp.insertNode(span);
    const r = span.getBoundingClientRect();
    span.remove();
    return r;
  }
}

/* ----------------------------- helpers ----------------------------- */

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function safeQueryValue(cmd: string): string | null {
  try {
    const v = document.queryCommandValue(cmd);
    return v ? v : null;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 邮件 HTML 必须只用一组保守的标签 + inline style。
 * 这里做一次轻量清理：
 *  - 白名单标签：保留 a/b/strong/i/em/u/s/strike/span/br/p/div/ul/ol/li/h1-h6/font
 *  - 标准化：<b> -> <strong>，<i> -> <em>，<font color> -> <span style="color:..">
 *  - 属性白名单：href / target / rel / style / class（保留邮件常见属性）
 */
export function sanitizeRichHtml(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  walk(tpl.content);
  return tpl.innerHTML;

  function walk(root: Node) {
    const toRemove: Element[] = [];
    const all = (root as ParentNode).querySelectorAll('*');
    all.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      // <font color="..." size="..." face="..."> → 转成 span style
      if (tag === 'font') {
        const span = document.createElement('span');
        const color = el.getAttribute('color');
        const size = el.getAttribute('size');
        const face = el.getAttribute('face');
        const styles: string[] = [el.getAttribute('style') ?? ''];
        if (color) styles.push(`color:${color}`);
        if (size) styles.push(`font-size:${fontSizeFromLegacy(size)}`);
        if (face) styles.push(`font-family:${face}`);
        const cleaned = styles.filter(Boolean).join(';');
        if (cleaned) span.setAttribute('style', cleaned);
        while (el.firstChild) span.appendChild(el.firstChild);
        el.parentNode?.replaceChild(span, el);
        return;
      }
      // 标签级白名单
      const allowed = [
        'a',
        'b',
        'strong',
        'i',
        'em',
        'u',
        's',
        'strike',
        'span',
        'br',
        'p',
        'div',
        'ul',
        'ol',
        'li',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
      ];
      if (!allowed.includes(tag)) {
        toRemove.push(el);
        return;
      }
      // 属性白名单
      const allowedAttrs = ['href', 'target', 'rel', 'style', 'class'];
      [...el.attributes].forEach((attr) => {
        if (!allowedAttrs.includes(attr.name.toLowerCase())) {
          el.removeAttribute(attr.name);
        }
      });
      // 链接安全
      if (tag === 'a') {
        const href = el.getAttribute('href') ?? '';
        if (/^javascript:/i.test(href)) el.setAttribute('href', '#');
        if (!el.getAttribute('rel')) el.setAttribute('rel', 'noopener');
      }
    });
    toRemove.forEach((el) => {
      while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
      el.remove();
    });
  }
}

function fontSizeFromLegacy(size: string): string {
  // 旧 <font size="1..7"> → px 近似
  const map: Record<string, string> = {
    '1': '10px',
    '2': '12px',
    '3': '14px',
    '4': '16px',
    '5': '20px',
    '6': '24px',
    '7': '32px',
  };
  return map[size] ?? size;
}
