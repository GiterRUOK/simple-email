import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { html as cmHtml } from '@codemirror/lang-html';
import type { Registry } from '../registry/registry';
import { renderDoc } from '../renderer';
import type { Store } from '../store/store';
import { prettyHtml } from '../utils/html';
import { h } from '../utils/dom';
import { richTextExecCommand } from '../utils/richTextCommand';
import { Modal } from './Modal';

export interface ExportModalOptions {
  store: Store;
  registry: Registry;
  /** 替换 {{var}} 为 sample 值 */
  withSampleVariables?: boolean;
}

/**
 * 导出 HTML 弹框：
 *  - body 用 CodeMirror 只读展示当前文档编译产物
 *  - footer：复制、美化、下载 三个动作
 */
export class ExportModal {
  private opts: ExportModalOptions;
  private modal: Modal;
  private cm: EditorView | null = null;
  private current: string = '';

  constructor(opts: ExportModalOptions) {
    this.opts = opts;
    this.modal = new Modal({
      title: '导出 HTML',
      className: 'sm-modal--export',
      width: 'min(960px, 96vw)',
      height: 'min(720px, 88vh)',
      onClose: () => this._destroyCm(),
    });

    const editorHost = h('div', { class: 'sm-export__editor' });
    this.modal.body.append(editorHost);

    const copyBtn = h(
      'button',
      { class: 'sm-btn', type: 'button', onclick: () => this._copy() },
      ['复制 HTML'],
    );
    const beautifyBtn = h(
      'button',
      { class: 'sm-btn', type: 'button', onclick: () => this._beautify() },
      ['美化'],
    );
    const downloadBtn = h(
      'button',
      {
        class: 'sm-btn sm-btn--primary',
        type: 'button',
        onclick: () => this._download(),
      },
      ['下载 .html'],
    );
    this.modal.footer.append(copyBtn, beautifyBtn, downloadBtn);

    // 初始化 CodeMirror（在 open 时填充 doc）
    this.cm = new EditorView({
      parent: editorHost,
      state: EditorState.create({
        doc: '',
        extensions: [basicSetup, cmHtml(), EditorState.readOnly.of(true)],
      }),
    });
  }

  open(parent?: HTMLElement) {
    this._compile();
    this.modal.open(parent);
  }

  private _compile() {
    const result = renderDoc(this.opts.store.doc, this.opts.registry, {
      withSampleVariables: this.opts.withSampleVariables ?? true,
    });
    this.current = result.html;
    this._setText(result.html);
  }

  private _setText(text: string) {
    if (!this.cm) return;
    this.cm.dispatch({
      changes: { from: 0, to: this.cm.state.doc.length, insert: text },
    });
  }

  private async _copy() {
    try {
      await navigator.clipboard.writeText(this.current);
      this._toast('已复制到剪贴板');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = this.current;
      document.body.appendChild(ta);
      ta.select();
      richTextExecCommand('copy');
      document.body.removeChild(ta);
      this._toast('已复制');
    }
  }

  private _beautify() {
    this.current = prettyHtml(this.current);
    this._setText(this.current);
  }

  private _download() {
    const blob = new Blob([this.current], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-${Date.now()}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private _toast(text: string) {
    const t = h('div', { class: 'sm-toast' }, [text]);
    this.modal.body.append(t);
    requestAnimationFrame(() => t.classList.add('is-visible'));
    setTimeout(() => {
      t.classList.remove('is-visible');
      setTimeout(() => t.remove(), 200);
    }, 1400);
  }

  private _destroyCm() {
    this.cm?.destroy();
    this.cm = null;
  }
}
