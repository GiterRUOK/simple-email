import { EditorView, basicSetup } from 'codemirror';
import { html as cmHtml } from '@codemirror/lang-html';
import { EditorState } from '@codemirror/state';
import type { Registry } from '../registry/registry';
import { findBlockLocation } from '../store/store';
import type { Store } from '../store/store';
import { h } from '../utils/dom';
import { prettyHtml } from '../utils/html';
import { Modal } from './Modal';

export interface BlockCodeModalOptions {
  store: Store;
  registry: Registry;
}

/**
 * 画布内快速编辑单个 Block 的 MJML：与右栏「代码」Tab 行为一致（写入 lockedMjml）。
 */
export class BlockCodeModal {
  private opts: BlockCodeModalOptions;
  private modal: Modal;
  private editorHost: HTMLElement;
  private cm: EditorView | null = null;
  private blockId: string | null = null;

  constructor(opts: BlockCodeModalOptions) {
    this.opts = opts;
    this.modal = new Modal({
      title: '编辑组件代码',
      className: 'sm-modal--block-code',
      width: 'min(720px, 92vw)',
      height: 'min(560px, 85vh)',
      onClose: () => this._destroyCm(),
    });
    this.editorHost = h('div', { class: 'sm-export__editor' });
    this.modal.body.append(this.editorHost);

    const beautifyBtn = h(
      'button',
      { class: 'sm-btn', type: 'button', onclick: () => this._beautify() },
      ['美化'],
    );
    const saveBtn = h(
      'button',
      {
        class: 'sm-btn sm-btn--primary',
        type: 'button',
        onclick: () => this._saveAndClose(),
      },
      ['保存'],
    );
    this.modal.footer.append(beautifyBtn, saveBtn);
  }

  open(blockId: string, componentLabel: string) {
    const doc = this.opts.store.doc;
    const loc = findBlockLocation(doc, blockId);
    if (!loc) return;

    this._destroyCm();
    this.blockId = blockId;
    const block = loc.block;
    const def = this.opts.registry.get(block.type);
    const initial =
      block.lockedMjml ??
      (def ? def.toMjml(block.props as Record<string, unknown>, { doc, engine: 'mjml' }) : '');

    this.modal.setTitle(`编辑组件代码 · ${componentLabel}`);
    this.cm = new EditorView({
      parent: this.editorHost,
      state: EditorState.create({
        doc: initial,
        extensions: [basicSetup, cmHtml()],
      }),
    });
    this.modal.open();
  }

  destroy() {
    this._destroyCm();
    if (this.modal.el.parentElement) this.modal.close();
  }

  private _beautify() {
    if (!this.cm) return;
    const text = prettyHtml(this.cm.state.doc.toString());
    this.cm.dispatch({
      changes: { from: 0, to: this.cm.state.doc.length, insert: text },
    });
  }

  private _saveAndClose() {
    if (!this.cm || !this.blockId) return;
    const text = this.cm.state.doc.toString();
    const id = this.blockId;
    this.opts.store.update((d) => {
      const l = findBlockLocation(d, id);
      if (l) l.block.lockedMjml = text;
    });
    this.modal.close();
  }

  private _destroyCm() {
    if (this.cm) {
      this.cm.destroy();
      this.cm = null;
    }
    this.blockId = null;
  }
}
