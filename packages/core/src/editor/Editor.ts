import { Registry, defineBlock } from '../registry/registry';
import { renderDoc } from '../renderer';
import { Store } from '../store/store';
import type {
  BlockDefinition,
  EmailDoc,
  RenderEngine,
  Selection,
  Variable,
} from '../types';
import { clear, h } from '../utils/dom';
import { Canvas } from './Canvas';
import { LeftPanel } from './LeftPanel';
import { RichTextToolbar } from './RichTextToolbar';
import { RightPanel } from './RightPanel';
import { SourceView } from './SourceView';
import { Topbar, type EditorMode } from './Topbar';

import './styles.css';

export interface EditorOptions {
  /** 挂载点 */
  container: HTMLElement;
  /** 初始文档；不传时使用空文档 */
  initialDoc?: Partial<EmailDoc>;
  /** 自定义组件定义（除内置组件之外） */
  blocks?: BlockDefinition<any>[];
  /** 渲染引擎，目前仅 'mjml'。预留 'table' 切换 */
  engine?: RenderEngine;
  /**
   * 把 Block 拖到 sections 之间的空白处时，是否自动包一个一列 Section。
   * - true（默认）：宽容，运营即使没瞄准列也能落下，自动加壳
   * - false：严格，只允许拖到现有列内；落到顶层会被 SortableJS 显示为禁止
   */
  autoWrapSection?: boolean;
  /** 文档变更回调（防抖发出） */
  onChange?: (doc: EmailDoc) => void;
}

/**
 * 编辑器主类。所有外部能力都通过它暴露。
 *
 * 使用示例（vanilla）：
 *   const editor = new MailEditor({
 *     container: document.getElementById('app')!,
 *     blocks: [/* 自定义组件 *\/],
 *   });
 *   editor.setVariables([{ key: 'user.name', label: '用户名', sample: '张三' }]);
 *   editor.export(); // -> { mjml, html }
 */
export class MailEditor {
  readonly store: Store;
  readonly registry: Registry;
  private opts: EditorOptions;
  private root: HTMLElement;
  private mode: EditorMode = 'design';
  private topbar!: Topbar;
  private leftPanel!: LeftPanel;
  private canvas!: Canvas;
  private rightPanel!: RightPanel;
  private sourceView!: SourceView;
  private toolbar!: RichTextToolbar;
  private body: HTMLElement;
  private changeTimer: number | null = null;

  constructor(opts: EditorOptions) {
    this.opts = opts;
    this.registry = new Registry();

    // 注册外部 blocks
    if (opts.blocks) {
      for (const def of opts.blocks) this.registry.register(def);
    }

    const initialDoc = createDefaultDoc(opts.initialDoc);
    this.store = new Store(initialDoc);

    this.root = h('div', { class: 'sm-root' });
    this.body = h('div', { class: 'sm-body' });
    opts.container.append(this.root);

    this._buildUI();
    this._bindKeyboard();

    this.store.subscribe(() => this._onChange());
  }

  /* ------------------------------ Public API ------------------------------ */

  setValue(doc: EmailDoc) {
    this.store.replace(doc);
  }

  getValue(): EmailDoc {
    return this.store.doc;
  }

  setVariables(vars: Variable[]) {
    this.store.update((d) => {
      d.variables = vars;
    });
  }

  getVariables(): Variable[] {
    return this.store.doc.variables;
  }

  /** 导出 MJML 与编译后的 HTML。withSampleVariables=true 时把 {{var}} 替换为 sample 值用于预览。 */
  export(opts: { withSampleVariables?: boolean } = {}) {
    return renderDoc(this.store.doc, this.registry, {
      engine: this.opts.engine ?? 'mjml',
      withSampleVariables: opts.withSampleVariables ?? false,
    });
  }

  registerBlock<P extends object>(def: BlockDefinition<P>) {
    this.registry.register(def);
    this.leftPanel?.refresh();
  }

  setSelection(sel: Selection | null) {
    this.store.setSelection(sel);
  }

  destroy() {
    if (this.changeTimer) window.clearTimeout(this.changeTimer);
    this.canvas?.destroy?.();
    this.sourceView?.destroy?.();
    this.toolbar?.destroy?.();
    this.root.remove();
  }

  /* -------------------------------- 私有 ---------------------------------- */

  private _buildUI() {
    this.topbar = new Topbar({
      store: this.store,
      mode: this.mode,
      onModeChange: (m) => this._setMode(m),
      onUndo: () => this.store.undo(),
      onRedo: () => this.store.redo(),
      onInsertVariable: (anchor) => this._showVariablePopover(anchor),
      onExport: () => this._showExport(),
    });

    this.toolbar = new RichTextToolbar({ positionRoot: this.root });
    this.leftPanel = new LeftPanel({ registry: this.registry });
    const autoWrap = this.opts.autoWrapSection !== false;
    this.root.classList.toggle('sm-allow-auto-wrap', autoWrap);
    this.canvas = new Canvas({
      store: this.store,
      registry: this.registry,
      toolbar: this.toolbar,
      autoWrapSection: autoWrap,
    });
    this.rightPanel = new RightPanel({ store: this.store, registry: this.registry });
    this.sourceView = new SourceView({ store: this.store, registry: this.registry });

    this.body.append(this.leftPanel.el, this.canvas.el, this.rightPanel.el);
    this.root.append(this.topbar.el, this.body);
  }

  private _setMode(m: EditorMode) {
    if (this.mode === m) return;
    if (m !== 'design') this.canvas.commitInlineEdit();
    this.mode = m;
    this.topbar.setMode(m);
    clear(this.body);
    if (m === 'design') {
      this.body.style.gridTemplateColumns = '240px 1fr 300px';
      this.body.append(this.leftPanel.el, this.canvas.el, this.rightPanel.el);
    } else {
      this.body.style.gridTemplateColumns = '1fr';
      this.body.append(this.sourceView.el);
    }
  }

  private _bindKeyboard() {
    this.root.addEventListener('keydown', (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.store.undo();
      } else if (meta && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.store.redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) {
          return;
        }
        const sel = this.store.selection;
        if (!sel) return;
        e.preventDefault();
        if (sel.kind === 'section') {
          this.store.update((d) => {
            d.sections = d.sections.filter((s) => s.id !== sel.sectionId);
          });
          this.store.setSelection(null);
        } else {
          this.store.update((d) => {
            const sec = d.sections.find((s) => s.id === sel.sectionId);
            if (!sec) return;
            const col = sec.columns[sel.columnIndex];
            if (!col) return;
            col.blocks = col.blocks.filter((b) => b.id !== sel.blockId);
          });
          this.store.setSelection(null);
        }
      }
    });
    this.root.tabIndex = 0;
  }

  private _onChange() {
    if (!this.opts.onChange) return;
    if (this.changeTimer) window.clearTimeout(this.changeTimer);
    this.changeTimer = window.setTimeout(() => {
      this.opts.onChange?.(this.store.doc);
      this.changeTimer = null;
    }, 60) as unknown as number;
  }

  private _showVariablePopover(anchor: HTMLElement) {
    const vars = this.store.doc.variables;
    if (!vars.length) {
      alert('当前未配置变量。请先调用 editor.setVariables([...])');
      return;
    }
    const existing = this.root.querySelector('.sm-popover');
    if (existing) {
      existing.remove();
      return;
    }

    const pop = h('div', { class: 'sm-popover' });
    for (const v of vars) {
      pop.append(
        h(
          'button',
          {
            class: 'sm-popover__item',
            type: 'button',
            onclick: () => {
              this._insertVariable(v);
              pop.remove();
            },
          },
          [
            h('span', { class: 'sm-popover__key' }, [`{{${v.key}}}`]),
            h('span', { class: 'sm-popover__label' }, [v.label]),
          ],
        ),
      );
    }

    const rect = anchor.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    pop.style.top = `${rect.bottom - rootRect.top + 4}px`;
    pop.style.left = `${rect.left - rootRect.left}px`;
    this.root.append(pop);

    const onDocClick = (ev: MouseEvent) => {
      if (!pop.contains(ev.target as Node) && ev.target !== anchor) {
        pop.remove();
        document.removeEventListener('click', onDocClick, true);
      }
    };
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  }

  private _insertVariable(v: Variable) {
    const sel = this.store.selection;
    const placeholder = `{{${v.key}}}`;

    // 最高优：正在画布内联编辑的富文本光标处
    const inline = this.canvas.currentInlineEditor;
    if (inline) {
      inline.insertText(placeholder);
      return;
    }

    // 次之：当前聚焦的 input/textarea（属性面板）
    const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    if (
      active &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
      this.root.contains(active)
    ) {
      const start = active.selectionStart ?? active.value.length;
      const end = active.selectionEnd ?? active.value.length;
      active.value = active.value.slice(0, start) + placeholder + active.value.slice(end);
      const ev = new Event('input', { bubbles: true });
      active.dispatchEvent(ev);
      return;
    }

    // 最次：选中 Block 时追加到该 block 的 inlineEditable 字段或第一个文本字段
    if (sel?.kind === 'block') {
      this.store.update((d) => {
        for (const s of d.sections) {
          for (const c of s.columns) {
            const b = c.blocks.find((x) => x.id === sel.blockId);
            if (!b) continue;
            const def = this.registry.get(b.type);
            const key =
              def?.inlineEditable?.propKey ??
              def?.schema.find((f) => f.type === 'text' || f.type === 'textarea')?.key;
            if (key) {
              const cur = String((b.props as any)[key] ?? '');
              (b.props as any)[key] = cur + placeholder;
            }
          }
        }
      });
      return;
    }

    alert('请先双击进入文本编辑、或聚焦一个输入框后再插入变量');
  }

  private _showExport() {
    const result = this.export({ withSampleVariables: true });
    const blob = new Blob([result.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-${Date.now()}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/* ----------------------------- 默认空文档 ------------------------------- */

function createDefaultDoc(partial?: Partial<EmailDoc>): EmailDoc {
  return {
    version: '1',
    meta: {
      subject: '一封新邮件',
      preheader: '',
      width: 600,
      ...(partial?.meta ?? {}),
    },
    variables: partial?.variables ?? [],
    styles: {
      backgroundColor: '#f4f4f6',
      contentBackgroundColor: '#ffffff',
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '14px',
      color: '#1f2328',
      linkColor: '#4f46e5',
      lineHeight: '1.6',
      ...(partial?.styles ?? {}),
    },
    sections: partial?.sections ?? [],
  };
}

export { defineBlock };
