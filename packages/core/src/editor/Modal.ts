import { h } from '../utils/dom';

/**
 * 极简 Modal：遮罩 + 居中卡片 + header/body/footer 三段。
 * - 自带 Esc / 点遮罩 关闭
 * - 不锁 body scroll（邮件编辑器场景内通常已经接管了高度）
 * - 不依赖框架，保持 vanilla
 */
export interface ModalOptions {
  title: string;
  /** 卡片宽度 / 高度。可传 'auto' / px / % */
  width?: string;
  height?: string;
  /** 自定义类名，便于覆盖样式（如 sm-modal--preview） */
  className?: string;
  /** 关闭回调；用户取消、Esc、点遮罩时触发 */
  onClose?: () => void;
}

export class Modal {
  el: HTMLElement;
  private mask: HTMLElement;
  private card: HTMLElement;
  private headerEl: HTMLElement;
  private bodyEl: HTMLElement;
  private footerEl: HTMLElement;
  private opts: ModalOptions;
  private headerToolNodes: HTMLElement[] = [];
  private keydownHandler?: (e: KeyboardEvent) => void;

  constructor(opts: ModalOptions) {
    this.opts = opts;

    this.mask = h('div', {
      class: 'sm-modal__mask',
      onclick: (e: Event) => {
        if (e.target === this.mask) this._handleClose();
      },
    });

    this.headerEl = h('header', { class: 'sm-modal__header' });
    this.bodyEl = h('div', { class: 'sm-modal__body' });
    this.footerEl = h('footer', { class: 'sm-modal__footer' });

    this.card = h(
      'div',
      {
        class: `sm-modal__card ${opts.className ?? ''}`,
        style: [
          opts.width ? `width:${opts.width};` : '',
          opts.height ? `height:${opts.height};` : '',
        ].join(''),
      },
      [this.headerEl, this.bodyEl, this.footerEl],
    );

    this.mask.append(this.card);
    this.el = this.mask;

    this._renderHeader();
  }

  open(parent: HTMLElement = document.body) {
    parent.append(this.el);
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this._handleClose();
    };
    document.addEventListener('keydown', this.keydownHandler);
    requestAnimationFrame(() => this.el.classList.add('is-open'));
  }

  close() {
    this._handleClose();
  }

  setTitle(title: string) {
    this.opts.title = title;
    this._renderHeader();
  }

  /** 动态调整卡片宽高（如 CodeMirror 弹框按内容适配） */
  setSize(width?: string, height?: string) {
    if (width !== undefined) {
      this.opts.width = width;
      this.card.style.width = width;
    }
    if (height !== undefined) {
      this.opts.height = height;
      this.card.style.height = height;
    }
  }

  /** body 容器直接给外部填充 */
  get body(): HTMLElement {
    return this.bodyEl;
  }

  /** footer 容器直接给外部填充按钮等 */
  get footer(): HTMLElement {
    return this.footerEl;
  }

  /** 在 header 右侧追加自定义工具按钮（setTitle 重绘 header 时保留） */
  appendHeaderTool(el: HTMLElement) {
    this.headerToolNodes.push(el);
    const tools = this.headerEl.querySelector('.sm-modal__header-tools');
    tools?.append(el);
  }

  get cardElement(): HTMLElement {
    return this.card;
  }

  private _renderHeader() {
    this.headerEl.innerHTML = '';
    const title = h('div', { class: 'sm-modal__title' }, [this.opts.title]);
    const tools = h('div', { class: 'sm-modal__header-tools' });
    for (const el of this.headerToolNodes) tools.append(el);
    const closeBtn = h(
      'button',
      {
        class: 'sm-modal__close',
        type: 'button',
        title: '关闭 Esc',
        onclick: () => this._handleClose(),
      },
      [iconClose()],
    );
    this.headerEl.append(title, tools, closeBtn);
  }

  private _handleClose() {
    if (this.keydownHandler) document.removeEventListener('keydown', this.keydownHandler);
    this.el.classList.remove('is-open');
    setTimeout(() => this.el.remove(), 180);
    this.opts.onClose?.();
  }
}

function iconClose(): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '16');
  el.setAttribute('height', '16');
  el.setAttribute('viewBox', '0 0 20 20');
  el.innerHTML =
    '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
  return el;
}
