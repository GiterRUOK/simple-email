import Sortable from 'sortablejs';
import type { Registry } from '../registry/registry';
import { createSection, findBlockLocation } from '../store/store';
import type { Store } from '../store/store';
import type { Block, Column, EmailDoc, RenderContext, Section, SectionLayout } from '../types';
import { clear, escapeHtml, h } from '../utils/dom';
import { htmlFragmentForLockedHtmlBlockCanvas } from '../utils/lockedMjml';
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
   * 默认 true：点击 `.sm-canvas-wrap` 灰色衬底（白底画布、底部添加条以外）清空选中。
   * 设为 false 可关闭（极少数嵌入场景需保留选中时）。
   */
  clearSelectionOnCanvasMargin?: boolean;
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
    });

    this._bindDesignModeLinkSuppression();
    this._bindClearSelectionOnCanvasWhitespace();
    if (opts.clearSelectionOnCanvasMargin !== false) {
      this._bindClearSelectionOnCanvasMargin();
    }

    this._render();

    opts.store.subscribe(() => {
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

  destroy() {
    this.linkNavSuppression.abort();
    this._exitEditing(false);
    this._destroySortables();
    this.blockCodeModal.destroy();
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
      this.commitInlineEdit();
      this.opts.store.setSelection(null);
    });
  }

  /** 捕获阶段拦截 <a href>，防止 Chrome 等在画布预览 DOM 上触发跳转（含未进入内联编辑时点到按钮块链接） */
  private _bindDesignModeLinkSuppression() {
    const opts = { capture: true, signal: this.linkNavSuppression.signal } as const;
    const stop = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      const a = e.target.closest('a');
      if (!a || !this.inner.contains(a)) return;
      if (!a.hasAttribute('href')) return;
      e.preventDefault();
    };
    this.inner.addEventListener('mousedown', stop, opts);
    this.inner.addEventListener('click', stop, opts);
    this.inner.addEventListener('auxclick', stop, opts);
  }

  /* -------------------------------- 渲染 ---------------------------------- */

  private _render() {
    this._destroySortables();
    clear(this.inner);

    const { doc } = this.opts.store;
    this.inner.style.maxWidth = `${doc.meta.width}px`;
    this.inner.style.background = doc.styles.contentBackgroundColor;
    this.inner.style.fontFamily = doc.styles.fontFamily;
    this.inner.style.fontSize = doc.styles.fontSize;
    this.inner.style.fontWeight = doc.styles.fontWeight || 'normal';
    this.inner.style.color = doc.styles.color;
    this.inner.style.lineHeight = doc.styles.lineHeight ?? '1.5';
    this.inner.style.setProperty('--sm-editor-link-color', doc.styles.linkColor);

    if (!doc.sections.length) {
      this.inner.append(h('div', { class: 'sm-empty-doc' }, ['从左侧把"布局"拖到这里开始 ✦']));
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
      draggable: '.sm-section',
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
    const sectionChip = `区块 ${sectionIndex + 1} · ${layoutShort}`;

    const wrap = h('div', {
      class: 'sm-section',
      'data-id': section.id,
      title: `${sectionChip}。子组件铺满列内时：按 Esc 或 Alt+点击块可选中本节。`,
      style: `padding:${padding};${a.backgroundColor ? `background:${a.backgroundColor};` : ''}`,
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
            onmousedown: (e: Event) => e.stopPropagation(),
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
      style: layoutFlexStyle(section.layout),
    });

    section.columns.forEach((col, i) => {
      cols.append(this._renderColumn(section, col, i, doc));
    });

    wrap.append(toolbar, cols);

    wrap.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.sm-block')) return;
      e.stopPropagation();
      this.opts.store.setSelection({ kind: 'section', sectionId: section.id });
    });

    return wrap;
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
      onStart: () => document.documentElement.classList.add('sm-dragging-block'),
      onEnd: () => document.documentElement.classList.remove('sm-dragging-block'),
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
      if (block.type === 'html') {
        const p = block.props as {
          paddingTop?: number;
          paddingRight?: number;
          paddingBottom?: number;
          paddingLeft?: number;
        };
        const frag = htmlFragmentForLockedHtmlBlockCanvas(block.lockedMjml, {
          top: Number(p.paddingTop ?? 8),
          right: Number(p.paddingRight ?? 16),
          bottom: Number(p.paddingBottom ?? 8),
          left: Number(p.paddingLeft ?? 16),
        });
        inner = `<div class="sm-html-content">${frag}</div>`;
      } else {
        inner = `<div style="padding:8px;color:#92400e;background:#fffbeb;border:1px dashed #f59e0b;font-family:monospace;font-size:11px;white-space:pre-wrap;">${escapeHtml(
          block.lockedMjml,
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
            onmousedown: (e: Event) => e.stopPropagation(),
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

    if (def?.inlineEditable && !block.lockedMjml) {
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
      { layout: '1-1', label: '两列' },
      { layout: '1-2', label: '1:2' },
      { layout: '2-1', label: '2:1' },
      { layout: '1-1-1', label: '三列' },
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

  private _handleSectionAdd(e: Sortable.SortableEvent) {
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
      const newBlock = this.opts.registry.createBlock(blockType);
      const newSection = createSection('1');
      newSection.columns[0].blocks.push(newBlock);
      this.opts.store.update((d) => {
        d.sections.splice(newIndex, 0, newSection);
      });
      this.opts.store.setSelection({
        kind: 'block',
        sectionId: newSection.id,
        columnIndex: 0,
        blockId: newBlock.id,
      });
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
    const oldIndex = e.oldIndex ?? 0;
    const newIndex = e.newIndex ?? 0;
    if (oldIndex === newIndex) return;
    this.opts.store.update((d) => {
      const [moved] = d.sections.splice(oldIndex, 1);
      d.sections.splice(newIndex, 0, moved);
    });
  }

  private _handleBlockAdd(e: Sortable.SortableEvent, sectionId: string, columnIndex: number) {
    const item = e.item;
    const newIndex = e.newIndex ?? 0;
    const sourceGroup = item.getAttribute('data-source-group');
    const blockType = item.getAttribute('data-block-type');
    const fromBlockId = item.getAttribute('data-id');

    if (sourceGroup === 'blocks' && blockType) {
      item.parentElement?.removeChild(item);
      const newBlock = this.opts.registry.createBlock(blockType);
      this.opts.store.update((d) => {
        const sec = d.sections.find((s) => s.id === sectionId);
        if (!sec) return;
        sec.columns[columnIndex]?.blocks.splice(newIndex, 0, newBlock);
      });
      this.opts.store.setSelection({
        kind: 'block',
        sectionId,
        columnIndex,
        blockId: newBlock.id,
      });
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
      });
    }
  }

  private _handleBlockMove(e: Sortable.SortableEvent, sectionId: string, columnIndex: number) {
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

  private _syncSelection() {
    const sel = this.opts.store.selection;
    this.inner.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
    if (!sel) return;
    if (sel.kind === 'section') {
      this.inner
        .querySelector(`.sm-section[data-id="${cssEscape(sel.sectionId)}"]`)
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

const LAYOUT_LABELS: Record<SectionLayout, string> = {
  '1': '一列',
  '1-1': '两列',
  '1-2': '1:2',
  '2-1': '2:1',
  '1-1-1': '三列',
};

function layoutHumanLabel(layout: SectionLayout): string {
  return LAYOUT_LABELS[layout] ?? layout;
}

function layoutFlexStyle(_layout: SectionLayout): string {
  return 'display:flex;flex-wrap:nowrap;width:100%;';
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
