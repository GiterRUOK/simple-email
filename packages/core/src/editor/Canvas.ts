import Sortable from 'sortablejs';
import type { Registry } from '../registry/registry';
import {
  createSection,
  findBlockLocation,
  findSection,
  pruneSectionIfEmpty,
  type Store,
} from '../store/store';
import type {
  Block,
  Column,
  EditorUiOptions,
  EmailDoc,
  PaletteDropResult,
  RenderContext,
  Section,
  SectionAttrs,
  SectionLayout,
} from '../types';
import { getSectionDynamicVariantKey } from '../utils/dynamicVariantSection';
import { blockButtonWidthCss, docContentWidthCss } from '../utils/contentWidth';
import { globalListIndentCssVarValue } from '../utils/emailListStyles';
import { normalizeFontWeightStep } from '../utils/fontWeightSteps';
import { clear, escapeHtml, h } from '../utils/dom';
import {
  defaultPaddingForLockedBlock,
  resolveLockedMjmlCanvasContent,
} from '../utils/lockedMjml';
import { layoutHumanLabel } from '../utils/sectionLayout';
import { BlockCodeModal } from './BlockCodeModal';
import { InlineEditor, type SelectionState } from './InlineEditor';
import type { RichTextToolbar } from './RichTextToolbar';

export interface CanvasOptions {
  store: Store;
  registry: Registry;
  /** 富文本工具条由 Editor 主类创建，Canvas 只负责调用 attach/detach/update */
  toolbar: RichTextToolbar;
  /** 是否允许 Block 落到 sections 之间空白处时自动裹一列 Section */
  autoWrapSection: boolean;
  /**
   * 为 true 时：点击中栏灰色衬底、白底画布上未落到 Section/块的空白、空文档提示区等会提交内联编辑并清空选中。
   * 默认不绑定（由 MailEditor 的 clearSelectionOnCanvasMargin 控制）。
   */
  clearSelectionOnCanvasMargin?: boolean;
  /**
   * 画布内弹层（如「编辑组件代码」）挂接到此节点，以继承 `.sm-root` 上的主题 CSS 变量。
   * 应传入 MailEditor 根节点；若挂到 `document.body`，`var(--sm-code-bg)` 等会失效，弹框背景会变透明。
   */
  layerRoot: HTMLElement;
  /** 与 MailEditor.opts.ui 对齐 */
  ui?: EditorUiOptions;
}

/**
 * 画布。负责：
 *  1. 根据 doc 渲染轻量预览 DOM（非真实邮件 HTML）
 *  2. 选中态/悬浮态/工具条
 *  3. SortableJS 两级拖拽（仅 hover 显示的拖拽 handle 触发）：
 *     - 顶层（sections 组）：Section 列表纵向排序，并接收左栏布局拖入
 *     - 列内（blocks 组）：Block 列表纵向排序，并接收左栏内容/自定义拖入
 *  4. 双击 Block 进入"内联编辑"——文本类直接富文本编辑，按钮文字单行编辑
 *  5. 设计画布内所有 <a href> 拦截默认行为，避免误跳转；真实跳转仅在「预览」iframe 中可用。
 *
 * 关键约束：所有数据变更走 store.update()，UI 通过 subscribe 全量重渲染。
 * 内联编辑是例外：编辑期间不再每次输入都 update，避免 contenteditable 因重渲染丢光标。
 */
export class Canvas {
  el: HTMLElement;
  private inner: HTMLElement;
  private addBar: HTMLElement;
  private opts: CanvasOptions;
  private sortableRefs: Sortable[] = [];
  /** 正在内联编辑的 block id；进入时画布不会被 store 触发的重渲染干扰它 */
  private editingBlockId: string | null = null;
  private inlineEditor: InlineEditor | null = null;
  /** 当 store 在编辑期间触发了 change（外部调用之类），延迟到编辑结束再重渲染 */
  private pendingRender = false;
  /** 设计模式下禁用画布内超链接导航（预览弹框 iframe 不在此 DOM 内，不受影响） */
  private linkNavSuppression = new AbortController();
  /** clearSelectionOnCanvasMargin：记录本次指针是否从编辑区内按下（区分拖选松手 vs 点空白退出） */
  private clearSelectionGestureTracking = new AbortController();
  private pointerGestureStartedInInlineEdit = false;
  private blockCodeModal: BlockCodeModal;

  constructor(opts: CanvasOptions) {
    this.opts = opts;
    this.el = h('div', { class: 'sm-canvas-wrap' });
    this.inner = h('div', { class: 'sm-canvas' });
    this.addBar = this._renderAddBar();
    this.el.append(this.inner, this.addBar);
    this.blockCodeModal = new BlockCodeModal({
      store: opts.store,
      registry: opts.registry,
      mountParent: opts.layerRoot,
    });

    this._bindDesignModeLinkSuppression();
    if (opts.clearSelectionOnCanvasMargin) {
      this._bindClearSelectionGestureTracking();
      this._bindClearSelectionOnCanvasWhitespace();
      this._bindClearSelectionOnCanvasMargin();
    }

    this.inner.addEventListener('dblclick', (e: MouseEvent) => {
      this._onEmptyCanvasDblClick(e);
    });

    this._render();

    opts.store.subscribe((detail) => {
      // 编辑态下若走了文档级 undo/redo，必须丢弃未提交 DOM，否则失焦提交会与 store 脱节（整节消失等）
      if (this.editingBlockId && detail?.source === 'history') {
        this.abortInlineEdit();
        this._render();
        return;
      }
      if (this.editingBlockId) {
        this.pendingRender = true;
        return;
      }
      this._render();
    });
    opts.store.subscribeSelection(() => this._syncSelection());
  }

  setWidth(width: number) {
    this.inner.style.maxWidth = `${width}px`;
  }

  /** 暴露给 Editor，用于"插入变量"等外部交互直接写入到当前富文本光标处。 */
  get currentInlineEditor(): InlineEditor | null {
    return this.inlineEditor;
  }

  /** 强制提交并退出当前内联编辑（切换源码模式、destroy 前等场景） */
  commitInlineEdit() {
    this.inlineEditor?.commit();
  }

  get isInlineEditing(): boolean {
    return this.editingBlockId != null;
  }

  /**
   * 放弃未提交的内联编辑（不写入 store）。
   * 用于文档级撤销/重做：编辑期间画布不重绘，若直接 undo 会导致 DOM 与 doc 不一致。
   */
  abortInlineEdit() {
    if (!this.editingBlockId) return;
    const id = this.editingBlockId;
    this.editingBlockId = null;
    this.pendingRender = false;
    if (this.inlineEditor) {
      this.inlineEditor.destroy(false);
      this.inlineEditor = null;
    }
    this.opts.toolbar.detach();
    const blockEl = this.inner.querySelector(
      `.sm-block[data-id="${cssEscape(id)}"]`,
    ) as HTMLElement | null;
    blockEl?.classList.remove('is-editing');
  }

  /** 强制重绘（内联编辑中会延迟到 commit 后） */
  refresh() {
    if (this.editingBlockId) {
      this.pendingRender = true;
      return;
    }
    this._render();
  }

  destroy() {
    this.linkNavSuppression.abort();
    this.clearSelectionGestureTracking.abort();
    this._exitEditing(false);
    this._destroySortables();
    this.blockCodeModal.destroy();
  }

  /**
   * clearSelectionOnCanvasMargin：mousedown 在编辑区内、mouseup 落在灰底/留白时，
   * 浏览器仍可能对 mouseup 目标派发 click；需与 Section padding 的拖选抑制同理。
   */
  private _bindClearSelectionGestureTracking() {
    const opts = { capture: true, signal: this.clearSelectionGestureTracking.signal } as const;
    document.addEventListener(
      'mousedown',
      (e: MouseEvent) => {
        if (e.button !== 0) {
          this.pointerGestureStartedInInlineEdit = false;
          return;
        }
        if (!this.editingBlockId) {
          this.pointerGestureStartedInInlineEdit = false;
          return;
        }
        const editingEl = this.inner.querySelector('.sm-inline-editing');
        if (!editingEl) {
          this.pointerGestureStartedInInlineEdit = false;
          return;
        }
        const t = e.target;
        if (!(t instanceof Node)) {
          this.pointerGestureStartedInInlineEdit = false;
          return;
        }
        const node = t.nodeType === Node.TEXT_NODE ? t.parentNode : t;
        this.pointerGestureStartedInInlineEdit = !!(node && editingEl.contains(node));
      },
      opts,
    );
  }

  /**
   * 点击画布白底上未落到 Section 内的区域（如 min-height 下方留白、空文档提示）时清空选中，
   * Section/Block 上的点击会在冒泡到此前被 stopPropagation，不会误清。
   */
  private _bindClearSelectionOnCanvasWhitespace() {
    this.inner.addEventListener('click', (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      const el = t instanceof Element ? t : t.parentElement;
      if (!el) return;
      if (el === this.inner || el.closest('.sm-empty-doc')) {
        if (this._shouldSuppressClearSelectionFromTextDrag()) return;
        this.commitInlineEdit();
        this.opts.store.setSelection(null);
      }
    });
  }

  /** 点击中栏灰色衬底（非白底画布、非底部添加 Section 条）时取消选中 */
  private _bindClearSelectionOnCanvasMargin() {
    this.el.addEventListener('click', (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (!this.el.contains(t)) return;
      if (this.inner.contains(t)) return;
      if (this.addBar.contains(t)) return;
      if (this._shouldSuppressClearSelectionFromTextDrag()) return;
      this.commitInlineEdit();
      this.opts.store.setSelection(null);
    });
  }

  /** 捕获阶段拦截 <a href>，防止 Chrome 等在画布预览 DOM 上触发跳转（含未进入内联编辑时点到按钮块链接） */
  private _bindDesignModeLinkSuppression() {
    const opts = { capture: true, signal: this.linkNavSuppression.signal } as const;
    const linkFromTarget = (target: EventTarget | null): HTMLAnchorElement | null => {
      if (!(target instanceof Element)) return null;
      const a = target.closest('a');
      if (!a || !this.inner.contains(a)) return null;
      if (!a.hasAttribute('href')) return null;
      return a;
    };
    this.inner.addEventListener(
      'mousedown',
      (e: MouseEvent) => {
        const a = linkFromTarget(e.target);
        if (!a) return;
        // 内联编辑时保留 mousedown 默认行为，以便在链接文字上拖选
        if (a.closest('.sm-inline-editing')) return;
        e.preventDefault();
      },
      opts,
    );
    const stopNavigate = (e: MouseEvent) => {
      if (!linkFromTarget(e.target)) return;
      e.preventDefault();
    };
    this.inner.addEventListener('click', stopNavigate, opts);
    this.inner.addEventListener('auxclick', stopNavigate, opts);
  }

  /* -------------------------------- 渲染 ---------------------------------- */

  private _render() {
    this._destroySortables();
    clear(this.inner);

    const { doc } = this.opts.store;
    this.inner.style.maxWidth = docContentWidthCss(doc.meta.width);
    this.inner.style.background = doc.styles.contentBackgroundColor;
    this.inner.style.fontFamily = doc.styles.fontFamily;
    this.inner.style.fontSize = doc.styles.fontSize;
    this.inner.style.fontWeight = normalizeFontWeightStep(doc.styles.fontWeight);
    this.inner.style.color = doc.styles.color;
    this.inner.style.lineHeight = doc.styles.lineHeight ?? '1.25';
    this.inner.style.setProperty('--sm-editor-link-color', doc.styles.linkColor);
    this.inner.style.setProperty(
      '--sm-list-indent-default',
      globalListIndentCssVarValue(doc.styles),
    );

    if (!doc.sections.length) {
      this.inner.append(
        h('div', { class: 'sm-empty-doc' }, [
          '从左侧拖入布局开始，或直接双击开始 ✦',
        ]),
      );
    } else {
      for (let si = 0; si < doc.sections.length; si++) {
        this.inner.append(this._renderSection(doc.sections[si], doc, si));
      }
    }

    // 顶层 Sortable：负责 Section 排序。
    // put 规则随 autoWrapSection 切换：
    //  - autoWrapSection=true：同时接收 sections 与 blocks（block 落到这里时由 path B/C 自动套壳）
    //  - autoWrapSection=false：仅接收 sections（block 落不下来，SortableJS 会显示禁止）
    // pull:false 始终：Section 不允许被拖到 column 里（保持四层模型）
    const topPut: string[] = this.opts.autoWrapSection ? ['sections', 'blocks'] : ['sections'];
    const top = Sortable.create(this.inner, {
      group: { name: 'sections', pull: false, put: topPut },
      animation: 150,
      handle: '.sm-section__handle',
      draggable: '> .sm-section-host',
      ghostClass: 'sm-ghost',
      chosenClass: 'sm-chosen',
      dragClass: 'sm-drag',
      onAdd: (e) => this._handleSectionAdd(e),
      onUpdate: (e) => this._handleSectionMove(e),
    });
    this.sortableRefs.push(top);

    this._syncSelection();
  }

  private _renderSection(section: Section, doc: EmailDoc, sectionIndex: number) {
    const a = section.attrs;
    const padding = `${a.paddingTop ?? 0}px ${a.paddingRight ?? 0}px ${
      a.paddingBottom ?? 0
    }px ${a.paddingLeft ?? 0}px`;

    const layoutShort = layoutHumanLabel(section.layout);
    const dvKey =
      this.opts.ui?.enableDynamicVariantKey === true
        ? getSectionDynamicVariantKey(section)
        : undefined;
    const sectionChip = dvKey
      ? `动态变量 ${sectionIndex + 1} · {{${dvKey}}}`
      : `区块 ${sectionIndex + 1} · ${layoutShort}`;

    const sw = blockButtonWidthCss(a.width);
    const box =
      sw != null ? `max-width:${sw};width:100%;margin-left:auto;margin-right:auto;box-sizing:border-box;` : '';

    const host = h('div', {
      class: 'sm-section-host',
      'data-id': section.id,
    });

    const wrap = h('div', {
      class: `sm-section${dvKey ? ' sm-section--dynamic-variant' : ''}`,
      title: `${sectionChip}。子组件铺满列内时：按 Esc 或 Alt+点击块可选中本节。`,
      style: `padding:${padding};${a.backgroundColor ? `background:${a.backgroundColor};` : ''}${box}`,
    });

    const toolbar = h('div', { class: 'sm-section__toolbar' }, [
      h('span', { class: 'sm-section__toolbar-label', title: sectionChip }, [sectionChip]),
      h('div', { class: 'sm-section__toolbar-actions' }, [
        h(
          'button',
          {
            class: 'sm-tool-btn sm-section__handle',
            type: 'button',
            title: '拖拽排序',
          },
          [iconDrag()],
        ),
        h(
          'button',
          {
            class: 'sm-tool-btn',
            type: 'button',
            title: '复制',
            onclick: (e: Event) => {
              e.stopPropagation();
              this._duplicateSection(section.id);
            },
          },
          [iconCopy()],
        ),
        h(
          'button',
          {
            class: 'sm-tool-btn sm-tool-btn--danger',
            type: 'button',
            title: '删除',
            onclick: (e: Event) => {
              e.stopPropagation();
              this._removeSection(section.id);
            },
          },
          [iconTrash()],
        ),
      ]),
    ]);

    const cols = h('div', {
      class: 'sm-section__columns',
      style: layoutFlexStyle(section.layout, section.attrs.columnGap),
    });

    section.columns.forEach((col, i) => {
      cols.append(this._renderColumn(section, col, i, doc));
    });

    wrap.append(cols);

    host.append(wrap, toolbar);

    host.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.sm-block')) return;
      // 文本拖选时在 Section padding 等区域松开会冒泡 click，不应误切成 Section 选中
      if (!e.altKey && this._shouldSuppressSectionSelectFromTextInteraction()) return;
      e.stopPropagation();
      this.opts.store.setSelection({ kind: 'section', sectionId: section.id });
    });

    return host;
  }

  private _renderColumn(
    section: Section,
    column: Column,
    columnIndex: number,
    doc: EmailDoc,
  ): HTMLElement {
    const isEmpty = column.blocks.length === 0;
    const colEl = h('div', {
      class: `sm-column ${isEmpty ? 'is-empty' : ''}`,
      'data-section-id': section.id,
      'data-column-index': String(columnIndex),
      style: `flex:${layoutFlexValue(section.layout, columnIndex)};${
        column.attrs.backgroundColor ? `background:${column.attrs.backgroundColor};` : ''
      }${column.attrs.verticalAlign ? `align-self:${vaToFlex(column.attrs.verticalAlign)};` : ''}`,
    });

    for (const block of column.blocks) {
      colEl.append(this._renderBlock(section, columnIndex, block, doc));
    }

    if (isEmpty) {
      colEl.addEventListener('dblclick', (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('.sm-block')) return;
        e.preventDefault();
        e.stopPropagation();
        this._insertEmptyTextAndEdit(section.id, columnIndex);
      });
    }

    // 列内 Sortable：负责块排序，并且：
    //  - put: ['blocks']        接受外来 block（同 group）
    //  - pull: true（默认）     允许把内部 block 拖出到其他列 / 或顶层（自动裹一列）
    //  - handle 限制为 .sm-block__handle：点选/编辑文本不会误触拖拽
    const sortable = Sortable.create(colEl, {
      group: { name: 'blocks', put: ['blocks'] },
      animation: 150,
      draggable: '.sm-block',
      handle: '.sm-block__handle',
      ghostClass: 'sm-ghost',
      chosenClass: 'sm-chosen',
      dragClass: 'sm-drag',
      onAdd: (e) => this._handleBlockAdd(e, section.id, columnIndex),
      onUpdate: (e) => this._handleBlockMove(e, section.id, columnIndex),
      onRemove: () => {
        /* DOM 调整由 store 重渲染负责；这里不处理。
           源 column 把 block 拖出后，store 会被 onAdd 同步从源数组里移除该 block。 */
      },
    });
    this.sortableRefs.push(sortable);

    return colEl;
  }

  private _renderBlock(
    section: Section,
    columnIndex: number,
    block: Block,
    doc: EmailDoc,
  ): HTMLElement {
    const ctx: RenderContext = { doc, engine: 'mjml' };
    const def = this.opts.registry.get(block.type);
    let inner = '';
    if (block.lockedMjml) {
      const isHtmlLike = block.type === 'html' || def?.inlineEditable?.mode === 'html';
      const padding = defaultPaddingForLockedBlock(
        block.type,
        block.lockedMjml,
        block.props as {
          paddingTop?: number;
          paddingRight?: number;
          paddingBottom?: number;
          paddingLeft?: number;
        },
      );
      const resolved = resolveLockedMjmlCanvasContent(block.lockedMjml, padding);
      if (resolved.mode === 'preview') {
        const wrapClass = isHtmlLike ? 'sm-html-content' : 'sm-locked-preview';
        inner = `<div class="${wrapClass}">${resolved.html}</div>`;
      } else {
        inner = `<div style="padding:8px;color:#92400e;background:#fffbeb;border:1px dashed #f59e0b;font-family:monospace;font-size:11px;white-space:pre-wrap;">${escapeHtml(
          resolved.source,
        )}</div>`;
      }
    } else if (def?.renderPreview) {
      inner = def.renderPreview(block.props as any, ctx);
    } else if (def) {
      inner = `<div style="padding:16px;color:#6b7280;background:#f9fafb;border:1px dashed #d1d5db;text-align:center;">${escapeHtml(
        def.name,
      )}</div>`;
    } else {
      inner = `<div style="padding:8px;color:#dc2626;">未知组件: ${escapeHtml(block.type)}</div>`;
    }

    const displayName = def?.name ?? block.type;

    const el = h('div', {
      class: `sm-block ${block.lockedMjml ? 'is-locked' : ''}`,
      'data-id': block.id,
      'data-section-id': section.id,
      'data-column-index': String(columnIndex),
    });

    // 内容容器：renderPreview 输出放这里，便于精确定位 inlineEditable selector
    const content = h('div', { class: 'sm-block__content', html: inner });

    // 块工具条：hover 仅名称；选中 / 编辑中显示全部按钮；贴在块顶边之上不压内容
    const blockToolbar = h('div', { class: 'sm-block__toolbar' }, [
      h('span', { class: 'sm-block__toolbar-name', title: displayName }, [displayName]),
      h('div', { class: 'sm-block__toolbar-actions' }, [
        h(
          'button',
          {
            class: 'sm-tool-btn sm-block__handle',
            type: 'button',
            title: '拖拽排序',
            onclick: (e: Event) => e.stopPropagation(),
          },
          [iconDrag()],
        ),
        def?.inlineEditable && !block.lockedMjml
          ? h(
              'button',
              {
                class: 'sm-tool-btn',
                type: 'button',
                title: '编辑文本',
                onclick: (e: Event) => {
                  e.stopPropagation();
                  this._enterEditing(block);
                },
              },
              [iconEdit()],
            )
          : null,
        h(
          'button',
          {
            class: 'sm-tool-btn',
            type: 'button',
            title: '编辑组件代码',
            onclick: (e: Event) => {
              e.stopPropagation();
              this.blockCodeModal.open(block.id, displayName);
            },
          },
          [iconCode()],
        ),
        h(
          'button',
          {
            class: 'sm-tool-btn',
            type: 'button',
            title: '复制',
            onclick: (e: Event) => {
              e.stopPropagation();
              this._duplicateBlock(block.id);
            },
          },
          [iconCopy()],
        ),
        h(
          'button',
          {
            class: 'sm-tool-btn sm-tool-btn--danger',
            type: 'button',
            title: '删除',
            onclick: (e: Event) => {
              e.stopPropagation();
              this._removeBlock(block.id);
            },
          },
          [iconTrash()],
        ),
      ]),
    ]);

    el.append(blockToolbar, content);

    el.addEventListener('click', (e) => {
      if (this.editingBlockId === block.id) return; // 编辑中不抢焦点
      /** Alt（mac Option）：穿透选中父级 Section，解决单列内边距为 0 时块铺满无法点到 Section */
      if (e.altKey) {
        e.stopPropagation();
        this.opts.store.setSelection({ kind: 'section', sectionId: section.id });
        return;
      }
      e.stopPropagation();
      this.opts.store.setSelection({
        kind: 'block',
        sectionId: section.id,
        columnIndex,
        blockId: block.id,
      });
    });

    if (block.lockedMjml) {
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.blockCodeModal.open(block.id, displayName);
      });
    } else if (def?.inlineEditable) {
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._enterEditing(block);
      });
    }

    return el;
  }

  private _renderAddBar(): HTMLElement {
    const layouts: { layout: SectionLayout; label: string }[] = [
      { layout: '1', label: '一列' },
      { layout: '1-1', label: '多列' },
    ];
    const bar = h('div', { class: 'sm-add-section-bar' }, [h('span', {}, ['+ 添加 Section：'])]);
    for (const l of layouts) {
      bar.append(
        h(
          'button',
          {
            class: 'sm-add-section-bar__btn',
            type: 'button',
            onclick: () =>
              this.opts.store.update((d) => {
                d.sections.push(createSection(l.layout));
              }),
          },
          [l.label],
        ),
      );
    }
    return bar;
  }

  /* ----------------------------- 内联编辑 -------------------------------- */

  /** 空文档时：在画布白底区域双击，插入一列 Section + 空文本并进入编辑 */
  private _onEmptyCanvasDblClick(e: MouseEvent) {
    if (this.opts.store.doc.sections.length > 0) return;
    const t = e.target as HTMLElement | null;
    if (!t || !this.inner.contains(t)) return;
    e.preventDefault();
    e.stopPropagation();
    this._bootstrapEmptyDocWithText();
  }

  /** 无任何 Section 时：创建单栏布局并放入空正文块，再进入内联编辑 */
  private _bootstrapEmptyDocWithText() {
    const reg = this.opts.registry;
    if (!reg.get('text')?.inlineEditable) return;
    this.opts.store.update((d) => {
      if (d.sections.length > 0) return;
      const newBlock = reg.createBlock('text');
      (newBlock.props as { content: string }).content = '';
      const section = createSection('1');
      section.columns[0].blocks.push(newBlock);
      d.sections.push(section);
    });

    const doc = this.opts.store.doc;
    const firstBlock = doc.sections[0]?.columns[0]?.blocks[0];
    if (!firstBlock) return;

    requestAnimationFrame(() => {
      const loc = findBlockLocation(this.opts.store.doc, firstBlock.id);
      if (loc) this._enterEditing(loc.block);
    });
  }

  /** 空列双击：插入正文组件（content 为空）并直接进入编辑 */
  private _insertEmptyTextAndEdit(sectionId: string, columnIndex: number) {
    const reg = this.opts.registry;
    if (!reg.get('text')?.inlineEditable) return;
    const newBlock = reg.createBlock('text');
    (newBlock.props as { content: string }).content = '';

    this.opts.store.update((d) => {
      const sec = findSection(d, sectionId);
      if (!sec) return;
      const col = sec.columns[columnIndex];
      if (!col || col.blocks.length > 0) return;
      col.blocks.push(newBlock);
    });

    requestAnimationFrame(() => {
      const loc = findBlockLocation(this.opts.store.doc, newBlock.id);
      if (loc) this._enterEditing(loc.block);
    });
  }

  private _enterEditing(block: Block) {
    if (this.editingBlockId === block.id) return;
    this._exitEditing(true);

    const def = this.opts.registry.get(block.type);
    if (!def?.inlineEditable) return;

    const blockEl = this.inner.querySelector(
      `.sm-block[data-id="${cssEscape(block.id)}"]`,
    ) as HTMLElement | null;
    const contentRoot = blockEl?.querySelector('.sm-block__content') as HTMLElement | null;
    if (!contentRoot) return;

    const target = (
      def.inlineEditable.selector
        ? contentRoot.querySelector(def.inlineEditable.selector)
        : contentRoot.firstElementChild
    ) as HTMLElement | null;
    if (!target) return;

    this.editingBlockId = block.id;
    blockEl?.classList.add('is-editing');

    const initial =
      def.inlineEditable.mode === 'plain'
        ? String((block.props as any)[def.inlineEditable.propKey] ?? '')
        : String((block.props as any)[def.inlineEditable.propKey] ?? '');

    this.inlineEditor = new InlineEditor({
      el: target,
      initialValue: initial,
      mode: def.inlineEditable.mode,
      multiline: !!def.inlineEditable.multiline,
      placeholder: def.inlineEditable.placeholder,
      globalStyles: this.opts.store.doc.styles,
      onCommit: (value) => {
        const propKey = def.inlineEditable!.propKey;
        const editingId = block.id;
        this._exitEditing(false);
        this.opts.store.update((d) => {
          const loc = findBlockLocation(d, editingId);
          if (loc) (loc.block.props as any)[propKey] = value;
        });
      },
      onCancel: () => this._exitEditing(true),
      onSelectionChange: (state: SelectionState | null) => {
        this.opts.toolbar.update(state);
      },
    });

    if (def.inlineEditable.mode === 'rich') {
      this.opts.toolbar.attach(this.inlineEditor);
    }

    // 选中该 block，便于属性面板同步
    this.opts.store.setSelection({
      kind: 'block',
      sectionId: blockEl!.getAttribute('data-section-id')!,
      columnIndex: Number(blockEl!.getAttribute('data-column-index')),
      blockId: block.id,
    });
  }

  /** restoreUI=true：编辑器自身恢复原 DOM（取消场景）；false：保留新内容（提交场景，等待 store 回写后重渲染） */
  private _exitEditing(restoreUI: boolean) {
    if (!this.editingBlockId) return;
    const id = this.editingBlockId;
    this.editingBlockId = null;
    if (this.inlineEditor) {
      this.inlineEditor.destroy(restoreUI);
      this.inlineEditor = null;
    }
    this.opts.toolbar.detach();
    const blockEl = this.inner.querySelector(
      `.sm-block[data-id="${cssEscape(id)}"]`,
    ) as HTMLElement | null;
    blockEl?.classList.remove('is-editing');

    if (this.pendingRender) {
      this.pendingRender = false;
      this._render();
    }
  }

  /* -------------------------------- 拖拽 ---------------------------------- */

  /** 结构变更（拖入/排序）前提交内联编辑，避免编辑态 pendingRender 与 Sortable DOM 不同步 */
  private _commitEditingBeforeStructureChange() {
    if (this.editingBlockId) this.commitInlineEdit();
  }

  private _resolvePaletteDrop(blockType: string): PaletteDropResult {
    const def = this.opts.registry.get(blockType);
    if (def?.expandPaletteDrop) {
      const out = def.expandPaletteDrop((t) => this.opts.registry.createBlock(t));
      if (Array.isArray(out)) return { blocks: out };
      return out;
    }
    return { blocks: [this.opts.registry.createBlock(blockType)] };
  }

  private _applySectionAttrs(target: Section, partial?: Partial<SectionAttrs>) {
    if (!partial) return;
    const { meta, ...rest } = partial;
    Object.assign(target.attrs, rest);
    if (meta && typeof meta === 'object') {
      target.attrs.meta = { ...(target.attrs.meta ?? {}), ...meta };
    }
  }

  /** 未开启 `enableDynamicVariantKey` 时剥离 palette 上的动态变量节属性 */
  private _paletteSectionAttrsForDrop(
    sectionAttrs?: Partial<SectionAttrs>,
  ): Partial<SectionAttrs> | undefined {
    if (!sectionAttrs) return undefined;
    if (this.opts.ui?.enableDynamicVariantKey === true) return sectionAttrs;
    const { dynamicVariantKey: _dv, ...rest } = sectionAttrs;
    return Object.keys(rest).length ? rest : undefined;
  }

  private _handleSectionAdd(e: Sortable.SortableEvent) {
    this._commitEditingBeforeStructureChange();
    const item = e.item;
    const layout = item.getAttribute('data-layout') as SectionLayout | null;
    const blockType = item.getAttribute('data-block-type');
    const fromBlockId = item.getAttribute('data-id');
    const sourceGroup = item.getAttribute('data-source-group');
    const newIndex = e.newIndex ?? 0;

    // 路径 A：左栏布局卡片
    if (layout) {
      item.parentElement?.removeChild(item);
      this.opts.store.update((d) => {
        d.sections.splice(newIndex, 0, createSection(layout));
      });
      return;
    }

    // 路径 B：左栏内容/自定义卡片拖到 sections 之间 → 自动裹一列 Section
    if (sourceGroup === 'blocks' && blockType) {
      item.parentElement?.removeChild(item);
      const { blocks, sectionAttrs } = this._resolvePaletteDrop(blockType);
      const newSection = createSection('1');
      this._applySectionAttrs(newSection, this._paletteSectionAttrsForDrop(sectionAttrs));
      newSection.columns[0].blocks.splice(newIndex, 0, ...blocks);
      this.opts.store.update((d) => {
        d.sections.splice(newIndex, 0, newSection);
      });
      const head = blocks[0];
      if (head) {
        this.opts.store.setSelection({
          kind: 'block',
          sectionId: newSection.id,
          columnIndex: 0,
          blockId: head.id,
        });
      }
      return;
    }

    // 路径 C：从某个已有 column 把 block 拖到 sections 之间 → 自动裹一列 Section
    if (fromBlockId) {
      item.parentElement?.removeChild(item);
      const newSection = createSection('1');
      this.opts.store.update((d) => {
        const loc = findBlockLocation(d, fromBlockId);
        if (!loc) return;
        const fromCol = loc.section.columns[loc.columnIndex];
        const idx = fromCol.blocks.findIndex((b) => b.id === fromBlockId);
        if (idx < 0) return;
        const [moved] = fromCol.blocks.splice(idx, 1);
        newSection.columns[0].blocks.push(moved);
        // 注意：newIndex 是 SortableJS 把 item 放进 DOM 后看到的索引；
        // 由于来源 column 内的 block 不属于 inner 的直接子节点，
        // newIndex 在 inner 的可视位置上是准确的。
        d.sections.splice(newIndex, 0, newSection);
        pruneSectionIfEmpty(d, loc.section.id);
      });
      this.opts.store.setSelection({
        kind: 'block',
        sectionId: newSection.id,
        columnIndex: 0,
        blockId: fromBlockId,
      });
    }
  }

  private _handleSectionMove(e: Sortable.SortableEvent) {
    this._commitEditingBeforeStructureChange();
    const oldIndex = e.oldIndex ?? 0;
    const newIndex = e.newIndex ?? 0;
    if (oldIndex === newIndex) return;
    this.opts.store.update((d) => {
      const [moved] = d.sections.splice(oldIndex, 1);
      d.sections.splice(newIndex, 0, moved);
    });
  }

  private _handleBlockAdd(e: Sortable.SortableEvent, sectionId: string, columnIndex: number) {
    this._commitEditingBeforeStructureChange();
    const item = e.item;
    const newIndex = e.newIndex ?? 0;
    const sourceGroup = item.getAttribute('data-source-group');
    const blockType = item.getAttribute('data-block-type');
    const fromBlockId = item.getAttribute('data-id');

    if (sourceGroup === 'blocks' && blockType) {
      item.parentElement?.removeChild(item);
      const drop = this._resolvePaletteDrop(blockType);
      const paletteSectionAttrs = this._paletteSectionAttrsForDrop(drop.sectionAttrs);
      if (paletteSectionAttrs?.dynamicVariantKey) {
        const newSection = createSection('1');
        this._applySectionAttrs(newSection, paletteSectionAttrs);
        newSection.columns[0].blocks.push(...drop.blocks);
        this.opts.store.update((d) => {
          const secIdx = d.sections.findIndex((s) => s.id === sectionId);
          const insertAt = secIdx >= 0 ? secIdx + 1 : d.sections.length;
          d.sections.splice(insertAt, 0, newSection);
        });
        const head = drop.blocks[0];
        if (head) {
          this.opts.store.setSelection({
            kind: 'block',
            sectionId: newSection.id,
            columnIndex: 0,
            blockId: head.id,
          });
        }
        return;
      }
      const blocks = drop.blocks;
      this.opts.store.update((d) => {
        const sec = d.sections.find((s) => s.id === sectionId);
        if (!sec) return;
        sec.columns[columnIndex]?.blocks.splice(newIndex, 0, ...blocks);
      });
      const head = blocks[0];
      if (head) {
        this.opts.store.setSelection({
          kind: 'block',
          sectionId,
          columnIndex,
          blockId: head.id,
        });
      }
      return;
    }

    if (fromBlockId) {
      this.opts.store.update((d) => {
        const loc = findBlockLocation(d, fromBlockId);
        if (!loc) return;
        const fromCol = loc.section.columns[loc.columnIndex];
        const idx = fromCol.blocks.findIndex((b) => b.id === fromBlockId);
        if (idx < 0) return;
        const [moved] = fromCol.blocks.splice(idx, 1);
        const targetSec = d.sections.find((s) => s.id === sectionId);
        targetSec?.columns[columnIndex]?.blocks.splice(newIndex, 0, moved);
        pruneSectionIfEmpty(d, loc.section.id);
      });
    }
  }

  private _handleBlockMove(e: Sortable.SortableEvent, sectionId: string, columnIndex: number) {
    this._commitEditingBeforeStructureChange();
    const oldIndex = e.oldIndex ?? 0;
    const newIndex = e.newIndex ?? 0;
    if (oldIndex === newIndex) return;
    this.opts.store.update((d) => {
      const sec = d.sections.find((s) => s.id === sectionId);
      const col = sec?.columns[columnIndex];
      if (!col) return;
      const [moved] = col.blocks.splice(oldIndex, 1);
      col.blocks.splice(newIndex, 0, moved);
    });
  }

  /* -------------------------------- 操作 ---------------------------------- */

  private _removeSection(id: string) {
    this.opts.store.update((d) => {
      d.sections = d.sections.filter((s) => s.id !== id);
    });
    this.opts.store.setSelection(null);
  }

  private _duplicateSection(id: string) {
    this.opts.store.update((d) => {
      const idx = d.sections.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const clone = structuredClone(d.sections[idx]);
      clone.id = `${clone.id}_c${Date.now().toString(36)}`;
      clone.columns = clone.columns.map((c) => ({
        ...c,
        id: `${c.id}_c${Date.now().toString(36)}`,
        blocks: c.blocks.map((b) => ({ ...b, id: `${b.id}_c${Date.now().toString(36)}` })),
      }));
      d.sections.splice(idx + 1, 0, clone);
    });
  }

  private _removeBlock(id: string) {
    this.opts.store.update((d) => {
      const loc = findBlockLocation(d, id);
      if (!loc) return;
      const col = loc.section.columns[loc.columnIndex];
      col.blocks = col.blocks.filter((b) => b.id !== id);
      pruneSectionIfEmpty(d, loc.section.id);
    });
    this.opts.store.setSelection(null);
  }

  private _duplicateBlock(id: string) {
    this.opts.store.update((d) => {
      const loc = findBlockLocation(d, id);
      if (!loc) return;
      const col = loc.section.columns[loc.columnIndex];
      const idx = col.blocks.findIndex((b) => b.id === id);
      if (idx < 0) return;
      const clone = structuredClone(col.blocks[idx]);
      clone.id = `${clone.id}_c${Date.now().toString(36)}`;
      col.blocks.splice(idx + 1, 0, clone);
    });
  }

  /**
   * 内联编辑中从编辑区拖选文字，若 mouseup 落在 Section padding / 灰底 / 留白，
   * 浏览器仍可能对 mouseup 目标派发 click；选区仍在编辑区内时不应提交或改选中。
   */
  private _shouldSuppressClearSelectionFromTextDrag(): boolean {
    return (
      this.pointerGestureStartedInInlineEdit &&
      this._shouldSuppressSectionSelectFromTextInteraction()
    );
  }

  private _shouldSuppressSectionSelectFromTextInteraction(): boolean {
    if (!this.editingBlockId) return false;
    const editingEl = this.inner.querySelector('.sm-inline-editing');
    if (!editingEl) return false;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const nodeInEditing = (n: Node | null): boolean => {
      if (!n) return false;
      const el = n.nodeType === Node.TEXT_NODE ? n.parentNode : n;
      return !!el && editingEl.contains(el);
    };
    return nodeInEditing(sel.anchorNode) || nodeInEditing(sel.focusNode);
  }

  private _syncSelection() {
    const sel = this.opts.store.selection;
    this.inner.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
    if (!sel) return;
    if (sel.kind === 'section') {
      this.inner
        .querySelector(`.sm-section-host[data-id="${cssEscape(sel.sectionId)}"]`)
        ?.classList.add('is-selected');
    } else {
      this.inner
        .querySelector(`.sm-block[data-id="${cssEscape(sel.blockId)}"]`)
        ?.classList.add('is-selected');
    }
  }

  private _destroySortables() {
    for (const s of this.sortableRefs) s.destroy();
    this.sortableRefs = [];
  }
}

/* ---------------------------------- utils --------------------------------- */

function layoutFlexStyle(_layout: SectionLayout, columnGap?: number): string {
  const gap =
    columnGap != null && columnGap > 0 ? `gap:${Math.min(columnGap, 200)}px;` : '';
  return `display:flex;flex-wrap:nowrap;width:100%;${gap}`;
}

function layoutFlexValue(layout: SectionLayout, index: number): string {
  const parts = layout.split('-').map(Number);
  const total = parts.reduce((s, x) => s + x, 0);
  const ratio = parts[index] ?? 1;
  return `${ratio} 1 0;min-width:0;width:${((ratio / total) * 100).toFixed(2)}%`;
}

function vaToFlex(va: 'top' | 'middle' | 'bottom'): string {
  return va === 'top' ? 'flex-start' : va === 'bottom' ? 'flex-end' : 'center';
}

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return s.replace(/[^\w-]/g, '\\$&');
}

function svg(inner: string): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '12');
  el.setAttribute('height', '12');
  el.setAttribute('viewBox', '0 0 20 20');
  el.innerHTML = inner;
  return el;
}
function iconDrag() {
  return svg(
    '<circle cx="7" cy="5" r="1.4" fill="currentColor"/><circle cx="13" cy="5" r="1.4" fill="currentColor"/><circle cx="7" cy="10" r="1.4" fill="currentColor"/><circle cx="13" cy="10" r="1.4" fill="currentColor"/><circle cx="7" cy="15" r="1.4" fill="currentColor"/><circle cx="13" cy="15" r="1.4" fill="currentColor"/>',
  );
}
function iconCopy() {
  return svg(
    '<rect x="6" y="6" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M4 12V5a1 1 0 011-1h7" stroke="currentColor" stroke-width="1.4" fill="none"/>',
  );
}
function iconTrash() {
  return svg(
    '<path d="M5 6h10M8 6V4h4v2M6 6l1 10h6l1-10" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
  );
}
function iconEdit() {
  return svg(
    '<path d="M4 14l8-8 2 2-8 8H4v-2z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
  );
}
function iconCode() {
  return svg(
    '<path d="M7 7l-3 3 3 3M13 7l3 3-3 3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  );
}
