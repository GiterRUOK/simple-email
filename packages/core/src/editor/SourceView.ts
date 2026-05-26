import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { html as cmHtml } from '@codemirror/lang-html';
import type { Registry } from '../registry/registry';
import { renderDoc } from '../renderer';
import type { Store } from '../store/store';
import { clear, h } from '../utils/dom';
import { richTextExecCommand } from '../utils/richTextCommand';

export interface SourceViewOptions {
  store: Store;
  registry: Registry;
}

type SourceTab = 'mjml' | 'html';

/**
 * 文档级源码视图：只读地展示当前文档编译出的 MJML 与 HTML。
 *
 * 本期不支持把源码直接回写到数据模型——MJML/HTML 反推 doc 风险大且不必要，
 * 用户若需要直接写源码，可在右栏对单个 Block 走"组件级代码模式"。
 */
export class SourceView {
  el: HTMLElement;
  private opts: SourceViewOptions;
  private currentTab: SourceTab = 'mjml';
  private body: HTMLElement;
  private cm: EditorView | null = null;

  constructor(opts: SourceViewOptions) {
    this.opts = opts;
    this.el = h('div', { class: 'sm-doc-source' });
    this.body = h('div', { class: 'sm-doc-source__body' });
    this._render();
    opts.store.subscribe(() => {
      if (this._isVisible()) this._renderEditor();
    });
  }

  /**
   * 设计态运行时 SourceView 不在 DOM，`store.subscribe` 里的 `_renderEditor()` 全部被跳过，
   * CodeMirror 里仍是构造函数那一刻的快照。**切到「源码」模式后必须手动调一次**，
   * 否则会看到空文档 / 旧文档，但「导出」「预览」「MJML→HTML」却一直是当前 doc ——这正是用户报告的错位。
   */
  refreshDoc() {
    this._renderEditor();
  }

  private _isVisible(): boolean {
    return this.el.isConnected && (this.el.offsetParent !== null || this.el.getClientRects().length > 0);
  }

  private _render() {
    clear(this.el);
    const bar = h('div', { class: 'sm-doc-source__bar' }, [
      this._tabBtn('mjml', 'MJML'),
      this._tabBtn('html', 'HTML（编译产物）'),
      h('div', { class: 'sm-topbar__spacer' }),
      h(
        'button',
        {
          class: 'sm-btn',
          type: 'button',
          onclick: () => this._copy(),
        },
        ['复制'],
      ),
    ]);
    this.el.append(bar, this.body);
    this._renderEditor();
  }

  private _tabBtn(tab: SourceTab, label: string) {
    return h(
      'button',
      {
        class: `sm-segmented__item ${tab === this.currentTab ? 'sm-segmented__item--active' : ''}`,
        type: 'button',
        onclick: () => {
          this.currentTab = tab;
          this._render();
        },
      },
      [label],
    );
  }

  private _renderEditor() {
    this._destroyCm();
    clear(this.body);
    const result = renderDoc(this.opts.store.doc, this.opts.registry, {
      withSampleVariables: false,
    });
    const text = this.currentTab === 'mjml' ? result.mjml : result.html;
    this.cm = new EditorView({
      parent: this.body,
      state: EditorState.create({
        doc: text,
        extensions: [basicSetup, cmHtml(), EditorState.readOnly.of(true)],
      }),
    });
  }

  private async _copy() {
    if (!this.cm) return;
    const text = this.cm.state.doc.toString();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      richTextExecCommand('copy');
      document.body.removeChild(ta);
    }
  }

  private _destroyCm() {
    if (this.cm) {
      this.cm.destroy();
      this.cm = null;
    }
  }

  destroy() {
    this._destroyCm();
  }
}
