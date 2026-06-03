import type { Registry } from '../registry/registry';
import { renderDoc } from '../renderer';
import type { Store } from '../store/store';
import { h } from '../utils/dom';
import { Modal } from './Modal';

export type PreviewDevice = 'pc' | 'pad' | 'phone';

interface DeviceSpec {
  width: number;
  label: string;
}

const DEVICES: Record<PreviewDevice, DeviceSpec> = {
  pc: { width: 800, label: 'PC' },
  pad: { width: 640, label: 'Pad' },
  phone: { width: 375, label: 'Phone' },
};

export interface PreviewModalOptions {
  store: Store;
  registry: Registry;
}

/**
 * 预览弹框：用 iframe 渲染真实 mjml 编译产物。
 * 通过 srcdoc 写入 HTML，避免跨域；默认保留 {{var}} 占位符，与画布编辑态一致。
 * 三个设备宽度切换：800 / 640 / 375，按邮件常见宽度档位。
 */
export class PreviewModal {
  private opts: PreviewModalOptions;
  private modal: Modal;
  private device: PreviewDevice = 'pc';
  private iframe: HTMLIFrameElement;
  private viewport: HTMLElement;
  private deviceBtns: Record<PreviewDevice, HTMLButtonElement> = {} as any;
  private iframeRo?: ResizeObserver;
  private layoutRaf: number | null = null;
  private onWinResize?: () => void;

  constructor(opts: PreviewModalOptions) {
    this.opts = opts;
    this.modal = new Modal({
      title: '预览邮件',
      className: 'sm-modal--preview',
      width: 'min(960px, calc(100vw - 32px))',
      /** 高度随 iframe 内容测量，见 _fitPreviewHeight；不超过屏高由 CSS max-height 约束 */
      onClose: () => this._teardownLayoutHooks(),
    });

    this.iframe = h('iframe', {
      class: 'sm-preview__frame',
      sandbox: 'allow-same-origin',
      title: 'preview',
    }) as HTMLIFrameElement;
    this.iframe.addEventListener('load', () => {
      this._bindIframeResizeObserver();
      this._scheduleFitPreviewHeight();
    });

    this.viewport = h('div', { class: 'sm-preview__viewport' }, [this.iframe]);
    this.modal.body.classList.add('sm-modal__body--center');
    this.modal.body.append(this.viewport);

    // 设备切换工具条放在 header 右侧
    const switcher = h('div', { class: 'sm-segmented' });
    (['pc', 'pad', 'phone'] as PreviewDevice[]).forEach((d) => {
      const btn = h(
        'button',
        {
          class: `sm-segmented__item ${d === this.device ? 'sm-segmented__item--active' : ''}`,
          type: 'button',
          onclick: () => this.setDevice(d),
        },
        [iconForDevice(d), DEVICES[d].label],
      ) as HTMLButtonElement;
      this.deviceBtns[d] = btn;
      switcher.append(btn);
    });
    this.modal.appendHeaderTool(switcher);
  }

  open(parent?: HTMLElement) {
    this._render();
    this.setDevice(this.device);
    this.modal.open(parent);
    this.onWinResize = () => this._scheduleFitPreviewHeight();
    window.addEventListener('resize', this.onWinResize);
  }

  setDevice(d: PreviewDevice) {
    this.device = d;
    const spec = DEVICES[d];
    this.viewport.style.setProperty('--sm-preview-w', `${spec.width}px`);
    for (const k of Object.keys(this.deviceBtns) as PreviewDevice[]) {
      this.deviceBtns[k].classList.toggle('sm-segmented__item--active', k === d);
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this._scheduleFitPreviewHeight()),
    );
  }

  private _render() {
    const result = renderDoc(this.opts.store.doc, this.opts.registry, {
      withSampleVariables: false,
    });
    // 用 srcdoc 而非 src=blob:，避免 about:srcdoc 偶发的相对资源问题
    this.iframe.srcdoc = result.html;
  }

  /** 标题栏 + body 上下 padding + 与视口的小间距 */
  private static readonly VIEWPORT_RESERVED_Y = 112;

  private _scheduleFitPreviewHeight() {
    if (this.layoutRaf != null) cancelAnimationFrame(this.layoutRaf);
    this.layoutRaf = requestAnimationFrame(() => {
      this.layoutRaf = null;
      this._fitPreviewHeight();
    });
  }

  private _fitPreviewHeight() {
    if (!this.iframe.isConnected) return;
    try {
      const doc = this.iframe.contentDocument;
      const root = doc?.documentElement;
      const body = doc?.body;
      if (!root || !body) return;
      const raw = Math.max(root.scrollHeight, body.scrollHeight);
      const maxPx = Math.max(
        240,
        window.innerHeight - PreviewModal.VIEWPORT_RESERVED_Y,
      );
      const minPx = 200;
      const next = Math.min(Math.max(Math.ceil(raw), minPx), maxPx);
      this.viewport.style.height = `${next}px`;
    } catch {
      /* srcdoc 同域，极端情况下忽略 */
    }
  }

  private _bindIframeResizeObserver() {
    this.iframeRo?.disconnect();
    try {
      const doc = this.iframe.contentDocument;
      const body = doc?.body;
      if (!body || typeof ResizeObserver === 'undefined') return;
      this.iframeRo = new ResizeObserver(() => this._scheduleFitPreviewHeight());
      this.iframeRo.observe(body);
      const html = doc.documentElement;
      if (html) this.iframeRo.observe(html);
    } catch {
      /* ignore */
    }
  }

  private _teardownLayoutHooks() {
    if (this.onWinResize) {
      window.removeEventListener('resize', this.onWinResize);
      this.onWinResize = undefined;
    }
    this.iframeRo?.disconnect();
    this.iframeRo = undefined;
    if (this.layoutRaf != null) {
      cancelAnimationFrame(this.layoutRaf);
      this.layoutRaf = null;
    }
  }
}

function iconForDevice(d: PreviewDevice): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '14');
  el.setAttribute('height', '14');
  el.setAttribute('viewBox', '0 0 20 20');
  if (d === 'pc')
    el.innerHTML =
      '<rect x="2" y="4" width="16" height="11" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M7 18h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>';
  else if (d === 'pad')
    el.innerHTML =
      '<rect x="4" y="2" width="12" height="16" rx="2" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="10" cy="16" r="0.6" fill="currentColor"/>';
  else
    el.innerHTML =
      '<rect x="6" y="2" width="8" height="16" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="10" cy="16" r="0.6" fill="currentColor"/>';
  return el;
}
