/**
 * 把任意 DOM 元素临时变成 contenteditable，并暴露提交/取消/选区事件。
 *
 * 设计要点：
 *  - 不直接同步到 store。编辑过程中只在本地累积，提交（blur / Esc / 单行 Enter）时一次性回调，
 *    避免每次按键都触发画布全量重渲染导致光标丢失。
 *  - mode=plain 时仅取 textContent，并在 paste/keydown 上拦截换行；
 *    mode=rich 时保留 inline HTML，但会在提交时做一次清理（白名单标签 + inline style）；
 *    mode=html 时提交原始 innerHTML（用于 mj-raw 等），不挂富文本浮动条。
 *  - 选区变化通过 `onSelectionChange` 实时回调，便于浮动工具条同步按钮状态/位置。
 */
export interface InlineEditorOptions {
  el: HTMLElement;
  initialValue: string;
  mode: 'rich' | 'plain' | 'html';
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
  /**
   * 上一次"用户在编辑区内"时的有效选区。
   * 当用户去工具条点 select / input 时焦点会离开 contenteditable，
   * execCommand 在那种状态下会哑火——必须先 focus 回来，再恢复选区，再执行命令。
   */
  private savedRange: Range | null = null;
  /** 富文本工具条控件会抢走焦点，此时 getSelection 已不在编辑区内；保留上一帧状态避免工具条整栏收起。 */
  private lastSelectionState: SelectionState | null = null;

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
        : this.opts.mode === 'html'
          ? this.el.innerHTML
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

  /**
   * 保存当前在编辑区内的选区。Toolbar 在 mousedown（capture）阶段调用：
   * 在浏览器把焦点切到 select/input 之前抢先存档。
   */
  saveSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!this.el.contains(range.startContainer) || !this.el.contains(range.endContainer)) return;
    this.savedRange = range.cloneRange();
  }

  /** 直接对当前选区执行命令（供 Toolbar 调用）。 */
  exec(command: string, value?: string) {
    this._ensureFocus();
    this._restoreSelection();
    // 列表：Chrome 等在 styleWithCSS=true 下 insertOrderedList / insertUnorderedList 常失灵，需退回 HTML 列表标签
    const isListCmd = command === 'insertOrderedList' || command === 'insertUnorderedList';
    document.execCommand('styleWithCSS', false, isListCmd ? ('false' as any) : ('true' as any));
    document.execCommand(command, false, value);
    // 命令执行后选区可能已经变化（例如插入链接会扩展），刷新存档
    this.saveSelection();
    this._emitSelection();
  }

  /**
   * 设置或移除超链接：已有 &lt;a&gt; 则改 href；否则 createLink。
   * （仅用 createLink 在链接内需改 URL 时浏览器行为不一致。）
   */
  setLink(url: string) {
    this._ensureFocus();
    this._restoreSelection();
    const trimmed = url.trim();
    if (!trimmed) {
      document.execCommand('unlink');
      this.saveSelection();
      this._emitSelection();
      return;
    }
    const safe = /^https?:|^mailto:|^tel:|^\{\{/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const anchor = findAncestorAnchor(sel.anchorNode, this.el);
    if (anchor) {
      anchor.setAttribute('href', safe);
      if (!anchor.getAttribute('rel')) anchor.setAttribute('rel', 'noopener');
    } else {
      document.execCommand('styleWithCSS', false, 'true' as any);
      document.execCommand('createLink', false, safe);
    }
    this.saveSelection();
    this._emitSelection();
  }

  /** 在当前光标处插入纯文本（供"插入变量"使用）。 */
  insertText(text: string) {
    this._ensureFocus();
    this._restoreSelection();
    document.execCommand('insertText', false, text);
    this.saveSelection();
  }

  /** Toolbar 关闭某个面板/控件后调用，把选区还给编辑区，方便用户继续输入。 */
  refocus() {
    this._ensureFocus();
    this._restoreSelection();
  }

  /** 内联编辑根节点（如 `.sm-text-content`）的盒模型矩形，供富文本条贴在正文区域外沿定位 */
  getAnchorRect(): DOMRect {
    return this.el.getBoundingClientRect();
  }

  private _restoreSelection() {
    if (!this.savedRange) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  }

  /* -------------------------------- 内部 ---------------------------------- */

  private _mount() {
    const { el, mode, multiline, placeholder } = this.opts;
    el.setAttribute('contenteditable', 'true');
    el.classList.add('sm-inline-editing');
    if (placeholder) el.setAttribute('data-placeholder', placeholder);

    if (this.opts.initialValue) {
      el.innerHTML =
        mode === 'plain' ? escapeHtml(this.opts.initialValue) : this.opts.initialValue;
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
    const onBlur = (e: FocusEvent) => {
      // 给点钟摆余地，避免点击工具条按钮时立刻提交
      setTimeout(() => {
        if (!this.alive) return;
        const active = document.activeElement as HTMLElement | null;
        if (active && (active === el || el.contains(active))) return;
        if (active?.closest?.('.sm-floating-toolbar')) return;
        // 从左栏拖入 / 画布内 Sortable 排序：mousedown 会先 blur，若在此时提交会触发画布重渲染并拆掉 drop 目标
        if (active?.closest?.('.sm-panel--left')) return;
        if (active?.closest?.('.sm-block__handle, .sm-section__handle')) return;
        const related = e.relatedTarget as HTMLElement | null;
        if (related?.closest?.('.sm-panel--left')) return;
        if (related?.closest?.('.sm-block-card')) return;
        if (related?.closest?.('.sm-block__handle, .sm-section__handle')) return;
        if (document.querySelector('.sm-root .sm-drag, .sm-root .sm-chosen')) return;
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
      this.saveSelection();
      this._emitSelection();
    };

    const linkInsideEditing = (t: EventTarget | null): HTMLAnchorElement | null => {
      if (!(t instanceof Element)) return null;
      const a = t.closest('a');
      if (!a || !el.contains(a)) return null;
      const href = a.getAttribute('href');
      if (href == null || href === '' || href === '#') return null;
      return a;
    };

    /** Chrome：contenteditable 里的 <a href> 仍会在 mousedown/click 时导航；阻止后用手动 caret 对齐点击处 */
    const onLinkMouseDown = (e: MouseEvent) => {
      if ((mode !== 'rich' && mode !== 'html') || e.button !== 0) return;
      if (!linkInsideEditing(e.target)) return;
      e.preventDefault();
      placeCaretAtClientPoint(el, e.clientX, e.clientY);
    };

    const stopLinkActivate = (e: MouseEvent) => {
      if (mode !== 'rich' && mode !== 'html') return;
      if (!linkInsideEditing(e.target)) return;
      e.preventDefault();
    };

    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('blur', onBlur);
    el.addEventListener('paste', onPaste);
    document.addEventListener('selectionchange', onSelChange);
    el.addEventListener('input', onSelChange);
    el.addEventListener('mouseup', onSelChange);
    if (mode === 'rich' || mode === 'html') {
      el.addEventListener('mousedown', onLinkMouseDown, true);
      el.addEventListener('click', stopLinkActivate, true);
      el.addEventListener('auxclick', stopLinkActivate, true);
    }

    this.listeners.push(
      () => el.removeEventListener('keydown', onKeyDown),
      () => el.removeEventListener('blur', onBlur),
      () => el.removeEventListener('paste', onPaste),
      () => document.removeEventListener('selectionchange', onSelChange),
      () => el.removeEventListener('input', onSelChange),
      () => el.removeEventListener('mouseup', onSelChange),
      ...(mode === 'rich' || mode === 'html'
        ? [
            () => el.removeEventListener('mousedown', onLinkMouseDown, true),
            () => el.removeEventListener('click', stopLinkActivate, true),
            () => el.removeEventListener('auxclick', stopLinkActivate, true),
          ]
        : []),
    );
  }

  private _ensureFocus() {
    if (document.activeElement !== this.el) {
      this.el.focus();
    }
  }

  private _emitSelection() {
    if (!this.opts.onSelectionChange) return;
    if (this.opts.mode === 'plain' || this.opts.mode === 'html') {
      this.opts.onSelectionChange(null); // plain / 原始 HTML 不挂富文本浮动条
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      this._emitSelectionOrKeepToolbar(null);
      return;
    }
    if (!this.el.contains(sel.anchorNode)) {
      this._emitSelectionOrKeepToolbar(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = sel.isCollapsed ? this._caretRect(range) : range.getBoundingClientRect();

    const align: SelectionState['formats']['align'] = document.queryCommandState('justifyCenter')
      ? 'center'
      : document.queryCommandState('justifyRight')
        ? 'right'
        : document.queryCommandState('justifyFull')
          ? 'justify'
          : 'left';

    const link = (() => {
      const a = findAncestorAnchor(sel.anchorNode, this.el);
      return a?.getAttribute('href') ?? null;
    })();

    const state: SelectionState = {
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
    };
    this.lastSelectionState = state;
    this.opts.onSelectionChange(state);
  }

  /** 焦点在浮动工具条上时沿用上一帧选区，避免点开链接框 / 颜色等控件后工具条消失。 */
  private _emitSelectionOrKeepToolbar(fallback: null) {
    if (
      fallback === null &&
      this.lastSelectionState &&
      document.activeElement?.closest?.('.sm-floating-toolbar')
    ) {
      this.opts.onSelectionChange?.(this.lastSelectionState);
      return;
    }
    if (fallback === null) this.lastSelectionState = null;
    this.opts.onSelectionChange?.(fallback);
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

function findAncestorAnchor(node: Node | null, root: HTMLElement): HTMLAnchorElement | null {
  while (node && node !== root) {
    if (node.nodeType === 1 && (node as HTMLElement).tagName === 'A') {
      return node as HTMLAnchorElement;
    }
    node = node.parentNode;
  }
  return null;
}

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 在视口坐标处设置折叠选区（用于拦截 <a> 默认行为后补回放光标） */
function placeCaretAtClientPoint(root: HTMLElement, clientX: number, clientY: number): boolean {
  const doc = root.ownerDocument;
  const d = doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let range: Range | null = null;
  if (d.caretRangeFromPoint) {
    range = d.caretRangeFromPoint(clientX, clientY);
  } else if (d.caretPositionFromPoint) {
    const pos = d.caretPositionFromPoint(clientX, clientY);
    if (pos?.offsetNode) {
      range = doc.createRange();
      try {
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      } catch {
        range = null;
      }
    }
  }
  if (!range || !root.contains(range.startContainer)) return false;
  const sel = doc.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
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
