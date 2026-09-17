import type { SimpleMailT } from '../i18n';
import type { EmailDoc } from '../types';
import {
  type SelectionClipboardEnvelope,
  parseDocClipboard,
  parseSelectionClipboard,
} from '../utils/docClipboard';
import { clear, h } from '../utils/dom';
import { richTextExecCommand } from '../utils/richTextCommand';
import { Modal } from './Modal';

export interface ImportDocModalOptions {
  /** 读取剪贴板初始内容（失败时返回空字符串） */
  readClipboard?: () => Promise<string>;
  onApply: (doc: EmailDoc) => void;
  /** 局部设计稿（simple-mail/selection）回调：追加到画布而非覆盖 */
  onApplySelection?: (envelope: SelectionClipboardEnvelope) => void;
  t: SimpleMailT;
}

/**
 * 导入设计稿：展示 JSON 文本区，支持从剪贴板填入。
 * - 整稿（simple-mail/doc 或裸 EmailDoc）：覆盖当前画布
 * - 局部（simple-mail/selection）：追加到当前画布（按钮与提示自动切换）
 */
export class ImportDocModal {
  private modal: Modal;
  private textarea: HTMLTextAreaElement;
  private hintEl: HTMLElement;
  private applyBtn: HTMLButtonElement;
  private opts: ImportDocModalOptions;
  /** 当前输入识别为局部设计稿时为 true */
  private selectionMode = false;

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
    this.textarea.addEventListener('input', () => this._syncMode());

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
    this.applyBtn = h(
      'button',
      {
        class: 'sm-btn sm-btn--primary',
        type: 'button',
        onclick: () => this._apply(),
      },
      [t('importDoc.apply')],
    ) as HTMLButtonElement;
    this.modal.footer.append(cancelBtn, pasteBtn, this.applyBtn);
  }

  async open(parent?: HTMLElement) {
    this.hintEl.classList.remove('sm-import-doc__hint--error');
    this.textarea.value = '';
    this.modal.open(parent);
    const initial = (await this.opts.readClipboard?.()) ?? '';
    if (initial.trim()) this.textarea.value = initial;
    this._syncMode();
  }

  private async _fillFromClipboard() {
    const text = (await this.opts.readClipboard?.()) ?? '';
    if (!text.trim()) {
      this._setHint(this.opts.t('importDoc.clipboardEmpty'), true);
      return;
    }
    this.textarea.value = text;
    this._setHint(this.opts.t('importDoc.clipboardFilled'), false);
    this._syncMode();
  }

  /** 根据输入内容切换「覆盖整稿 / 追加局部」两种模式（按钮文案与提示）。 */
  private _syncMode() {
    const selection = parseSelectionClipboard(this.textarea.value);
    const next = selection != null && typeof this.opts.onApplySelection === 'function';
    if (next === this.selectionMode) return;
    this.selectionMode = next;
    clear(this.applyBtn);
    this.applyBtn.append(this.opts.t(next ? 'importDoc.applyAppend' : 'importDoc.apply'));
    this.hintEl.classList.remove('sm-import-doc__hint--error');
    clear(this.hintEl);
    if (next) {
      this.hintEl.append(this.opts.t('importDoc.hintSelection'));
    } else {
      this.hintEl.append(
        this.opts.t('importDoc.hint1'),
        this.opts.t('importDoc.hint2'),
        this.opts.t('importDoc.hint3'),
      );
    }
  }

  private _apply() {
    const raw = this.textarea.value.trim();
    if (!raw) {
      this._setHint(this.opts.t('importDoc.empty'), true);
      return;
    }
    if (this.selectionMode) {
      const selection = parseSelectionClipboard(raw);
      if (selection) {
        this.opts.onApplySelection?.(selection);
        this.modal.close();
        return;
      }
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
