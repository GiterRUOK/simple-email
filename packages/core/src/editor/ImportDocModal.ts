import type { EmailDoc } from '../types';
import { h, clear } from '../utils/dom';
import { parseDocClipboard } from '../utils/docClipboard';
import { richTextExecCommand } from '../utils/richTextCommand';
import { Modal } from './Modal';
import type { SimpleMailT } from '../i18n';

export interface ImportDocModalOptions {
  /** 读取剪贴板初始内容（失败时返回空字符串） */
  readClipboard?: () => Promise<string>;
  onApply: (doc: EmailDoc) => void;
  t: SimpleMailT;
}

/**
 * 导入设计稿：展示 JSON 文本区，支持从剪贴板填入后覆盖当前画布。
 */
export class ImportDocModal {
  private modal: Modal;
  private textarea: HTMLTextAreaElement;
  private hintEl: HTMLElement;
  private opts: ImportDocModalOptions;

  constructor(opts: ImportDocModalOptions) {
    this.opts = opts;
    const t = opts.t;
    this.modal = new Modal({
      title: t('importDoc.title'),
      className: 'sm-modal--import-doc',
      width: 'min(720px, 96vw)',
      height: 'auto',
      t,
    });

    this.hintEl = h('p', { class: 'sm-import-doc__hint' }, [
      t('importDoc.hint1'),
      t('importDoc.hint2'),
      t('importDoc.hint3'),
    ]);

    this.textarea = h('textarea', {
      class: 'sm-import-doc__input',
      spellcheck: 'false',
      placeholder: t('importDoc.placeholder'),
      rows: '14',
    }) as HTMLTextAreaElement;

    this.modal.body.append(this.hintEl, this.textarea);

    const cancelBtn = h(
      'button',
      { class: 'sm-btn', type: 'button', onclick: () => this.modal.close() },
      [t('common.cancel')],
    );
    const pasteBtn = h(
      'button',
      { class: 'sm-btn', type: 'button', onclick: () => void this._fillFromClipboard() },
      [t('importDoc.pasteFromClipboard')],
    );
    const applyBtn = h(
      'button',
      {
        class: 'sm-btn sm-btn--primary',
        type: 'button',
        onclick: () => this._apply(),
      },
      [t('importDoc.apply')],
    );
    this.modal.footer.append(cancelBtn, pasteBtn, applyBtn);
  }

  async open(parent?: HTMLElement) {
    this.hintEl.classList.remove('sm-import-doc__hint--error');
    this.textarea.value = '';
    this.modal.open(parent);
    const initial = (await this.opts.readClipboard?.()) ?? '';
    if (initial.trim()) this.textarea.value = initial;
  }

  private async _fillFromClipboard() {
    const text = (await this.opts.readClipboard?.()) ?? '';
    if (!text.trim()) {
      this._setHint(this.opts.t('importDoc.clipboardEmpty'), true);
      return;
    }
    this.textarea.value = text;
    this._setHint(this.opts.t('importDoc.clipboardFilled'), false);
  }

  private _apply() {
    const raw = this.textarea.value.trim();
    if (!raw) {
      this._setHint(this.opts.t('importDoc.empty'), true);
      return;
    }
    const doc = parseDocClipboard(raw);
    if (!doc) {
      this._setHint(this.opts.t('importDoc.invalid'), true);
      return;
    }
    this.opts.onApply(doc);
    this.modal.close();
  }

  private _setHint(message: string, isError: boolean) {
    clear(this.hintEl);
    this.hintEl.classList.toggle('sm-import-doc__hint--error', isError);
    this.hintEl.append(message);
  }
}

export async function readTextFromClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard.readText()) || '';
  } catch {
    return '';
  }
}

export async function writeTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = richTextExecCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}
