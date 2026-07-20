import { EditorView, basicSetup } from 'codemirror';
import { html as cmHtml } from '@codemirror/lang-html';
import { EditorState } from '@codemirror/state';
import type { Registry } from '../registry/registry';
import { findBlockLocation } from '../store/store';
import type { Store } from '../store/store';
import { h } from '../utils/dom';
import { prettyHtml } from '../utils/html';
import {
  getCodeEditorModalDefaultSize,
  getCodeEditorModalMaximizedSize,
} from '../utils/modalSize';
import { Modal } from './Modal';
import type { SimpleMailT } from '../i18n';

export interface BlockCodeModalOptions {
  store: Store;
  registry: Registry;
  /** 须落在 MailEditor `.sm-root` 子树内，才能继承 `--sm-code-bg` 等变量 */
  mountParent: HTMLElement;
  t: SimpleMailT;
}

const MAXIMIZED_PREF_KEY = 'sm-block-code-modal-maximized';

/**
 * 画布内快速编辑单个 Block 的 MJML：与右栏「代码」Tab 行为一致（写入 lockedMjml）。
 */
export class BlockCodeModal {
  private opts: BlockCodeModalOptions;
  private modal: Modal;
  private editorHost: HTMLElement;
  private cm: EditorView | null = null;
  private blockId: string | null = null;
  private maximizeBtn: HTMLButtonElement;
  private maximized = false;

  constructor(opts: BlockCodeModalOptions) {
    this.opts = opts;
    const defaultSize = getCodeEditorModalDefaultSize();
    this.modal = new Modal({
      title: opts.t('blockCode.title'),
      className: 'sm-modal--block-code',
      width: defaultSize.width,
      height: defaultSize.height,
      onClose: () => this._destroyCm(),
      t: opts.t,
    });
    this.editorHost = h('div', { class: 'sm-export__editor' });
    this.modal.body.append(this.editorHost);

    this.maximizeBtn = h(
      'button',
      {
        class: 'sm-modal__close',
        type: 'button',
        onclick: () => this._toggleMaximize(),
      },
      [iconMaximize()],
    ) as HTMLButtonElement;
    this.modal.appendHeaderTool(this.maximizeBtn);
    this._syncMaximizeButton();

    const beautifyBtn = h(
      'button',
      { class: 'sm-btn', type: 'button', onclick: () => this._beautify() },
      [opts.t('common.beautify')],
    );
    const saveBtn = h(
      'button',
      {
        class: 'sm-btn sm-btn--primary',
        type: 'button',
        onclick: () => this._saveAndClose(),
      },
      [opts.t('common.save')],
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

    this.maximized = readMaximizedPref();
    this.modal.setTitle(this.opts.t('blockCode.titleWithName', { name: componentLabel }));
    this._applyModalSize();
    this.cm = new EditorView({
      parent: this.editorHost,
      state: EditorState.create({
        doc: initial,
        extensions: [basicSetup, cmHtml()],
      }),
    });
    this.modal.open(this.opts.mountParent);
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

  private _applyModalSize() {
    const size = this.maximized
      ? getCodeEditorModalMaximizedSize()
      : getCodeEditorModalDefaultSize();
    this.modal.setSize(size.width, size.height);
    this.modal.cardElement.classList.toggle('is-maximized', this.maximized);
    this._syncMaximizeButton();
  }

  private _toggleMaximize() {
    this.maximized = !this.maximized;
    writeMaximizedPref(this.maximized);
    this._applyModalSize();
    requestAnimationFrame(() => this.cm?.requestMeasure());
  }

  private _syncMaximizeButton() {
    this.maximizeBtn.title = this.maximized ? this.opts.t('common.restore') : this.opts.t('common.maximize');
    this.maximizeBtn.setAttribute('aria-pressed', this.maximized ? 'true' : 'false');
    this.maximizeBtn.replaceChildren(this.maximized ? iconRestore() : iconMaximize());
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
    this.modal.cardElement.classList.remove('is-maximized');
  }
}

function readMaximizedPref(): boolean {
  try {
    return localStorage.getItem(MAXIMIZED_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMaximizedPref(maximized: boolean) {
  try {
    localStorage.setItem(MAXIMIZED_PREF_KEY, maximized ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

function iconMaximize(): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '16');
  el.setAttribute('height', '16');
  el.setAttribute('viewBox', '0 0 20 20');
  el.innerHTML =
    '<path d="M4 10V4h6M10 10h6v6M10 4h6v6M4 10v6h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
  return el;
}

function iconRestore(): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '16');
  el.setAttribute('height', '16');
  el.setAttribute('viewBox', '0 0 20 20');
  el.innerHTML =
    '<path d="M7 4H4v3M13 4h3v3M7 16H4v-3M13 16h3v-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
  return el;
}
