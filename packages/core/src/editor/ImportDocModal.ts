import type { EmailDoc } from '../types';
import { h, clear } from '../utils/dom';
import { parseDocClipboard } from '../utils/docClipboard';
import { richTextExecCommand } from '../utils/richTextCommand';
import { Modal } from './Modal';

export interface ImportDocModalOptions {
  /** 读取剪贴板初始内容（失败时返回空字符串） */
  readClipboard?: () => Promise<string>;
  onApply: (doc: EmailDoc) => void;
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
    this.modal = new Modal({
      title: '导入设计稿',
      className: 'sm-modal--import-doc',
      width: 'min(720px, 96vw)',
      height: 'auto',
    });

    this.hintEl = h('p', { class: 'sm-import-doc__hint' }, [
      '将覆盖当前画布上的所有 Section 与组件（全局样式会一并替换）。',
      '若宿主管理邮件主题/宽度，这些字段可能保持不变。',
      '粘贴由「复制设计稿」生成的 JSON，或裸 EmailDoc（version: "1"）。',
    ]);

    this.textarea = h('textarea', {
      class: 'sm-import-doc__input',
      spellcheck: 'false',
      placeholder: '在此粘贴设计稿 JSON…',
      rows: '14',
    }) as HTMLTextAreaElement;

    this.modal.body.append(this.hintEl, this.textarea);

    const cancelBtn = h(
      'button',
      { class: 'sm-btn', type: 'button', onclick: () => this.modal.close() },
      ['取消'],
    );
    const pasteBtn = h(
      'button',
      { class: 'sm-btn', type: 'button', onclick: () => void this._fillFromClipboard() },
      ['从剪贴板填入'],
    );
    const applyBtn = h(
      'button',
      {
        class: 'sm-btn sm-btn--primary',
        type: 'button',
        onclick: () => this._apply(),
      },
      ['应用并覆盖画布'],
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
      this._setHint('剪贴板为空或无法读取，请手动粘贴 JSON。', true);
      return;
    }
    this.textarea.value = text;
    this._setHint('已从剪贴板填入，请确认后点击「应用并覆盖画布」。', false);
  }

  private _apply() {
    const raw = this.textarea.value.trim();
    if (!raw) {
      this._setHint('请先粘贴设计稿 JSON。', true);
      return;
    }
    const doc = parseDocClipboard(raw);
    if (!doc) {
      this._setHint('JSON 无效或不是 simple-mail 设计稿格式。', true);
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
