import { type SimpleMailT, createI18nContext } from '../i18n';
import { clear, h } from '../utils/dom';
import { Modal } from './Modal';
import {
  type AssetPermissionAction,
  type GalleryItem,
  type ImageAssetPermissions,
  type ImageGalleryAdapter,
  resolveAssetPermission,
} from './imageAssets';

export interface OpenImageGalleryModalOptions {
  adapter: ImageGalleryAdapter;
  onPick: (url: string) => void;
  t?: SimpleMailT;
  /** 挂载父节点，默认 `document.body` */
  parent?: HTMLElement;
  onClose?: () => void;
  /**
   * 资源动作权限管控。未配置或未提供 `check` 时弹层内按钮不做管控；
   * 配置后「添加 / 上传 / 删除」按 `check` 结果禁用（默认）或隐藏，禁用时 hover 提示无权限。
   */
  permissions?: ImageAssetPermissions;
}

/**
 * 打开内置图库弹层：搜索、分页、选图插入；可选「链接添加」「上传到图库」「删除」由 adapter 决定。
 */
export function openImageGalleryModal(opts: OpenImageGalleryModalOptions): void {
  const { adapter, onPick, parent = document.body, onClose, permissions } = opts;
  const t = opts.t ?? createI18nContext().t;

  /** 默认无权限提示文案（i18n），按动作取对应文案 */
  const noPermissionTip = (action: AssetPermissionAction): string => {
    switch (action) {
      case 'upload':
        return t('common.noPermissionUpload');
      case 'addUrl':
        return t('common.noPermissionAdd');
      case 'delete':
        return t('common.noPermissionDelete');
      default:
        return t('common.noPermission');
    }
  };
  const perm = (action: AssetPermissionAction) =>
    resolveAssetPermission(permissions, action, noPermissionTip(action));

  const modal = new Modal({
    title: t('gallery.title'),
    width: 'min(760px, 94vw)',
    height: 'min(580px, 88vh)',
    className: 'sm-modal--gallery',
    onClose,
    t,
  });

  const wrap = h('div', { class: 'sm-gallery-modal' });

  let query = '';
  let page = 0;
  let hasMore = false;
  let loading = false;
  let selected: GalleryItem | null = null;

  const errEl = h('div', {
    class: 'sm-gallery-modal__error',
    style: 'display:none',
    role: 'alert',
  });

  const searchInp = h('input', {
    class: 'sm-input sm-gallery-modal__search',
    type: 'search',
    placeholder: t('gallery.searchPlaceholder'),
    'aria-label': t('gallery.searchAria'),
  });

  let debounceId: ReturnType<typeof setTimeout> | null = null;
  searchInp.addEventListener('input', () => {
    if (debounceId) clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      query = (searchInp as HTMLInputElement).value;
      void loadFirst();
    }, 320);
  });

  const gridEl = h('div', { class: 'sm-gallery-modal__grid' });

  const loadMoreBtn = h(
    'button',
    {
      class: 'sm-btn sm-btn--secondary sm-gallery-modal__loadmore',
      type: 'button',
      style: 'display:none',
      onclick: () => {
        if (!hasMore || loading) return;
        void loadPage(page + 1, true);
      },
    },
    [t('gallery.loadMore')],
  ) as HTMLButtonElement;

  const confirmBtn = h(
    'button',
    {
      class: 'sm-btn sm-btn--primary',
      type: 'button',
      disabled: true,
      onclick: () => finishPick(),
    },
    [t('common.insert')],
  ) as HTMLButtonElement;

  function setError(msg: string | null) {
    if (msg) {
      errEl.textContent = msg;
      errEl.style.display = '';
    } else {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
  }

  function syncSelectionStyles() {
    const cells = gridEl.querySelectorAll('.sm-gallery-modal__cell');
    cells.forEach((c) => {
      const id = (c as HTMLElement).dataset.id;
      c.classList.toggle('is-selected', !!selected && id === selected.id);
    });
  }

  function renderCells(items: GalleryItem[], append: boolean) {
    if (!append) clear(gridEl);
    if (items.length === 0 && !append) {
      gridEl.append(h('div', { class: 'sm-gallery-modal__empty' }, [t('gallery.empty')]));
      loadMoreBtn.style.display = hasMore ? '' : 'none';
      return;
    }
    for (const it of items) {
      const thumb = it.thumbnailUrl || it.url;
      const cellWrap = h('div', { class: 'sm-gallery-modal__cell-wrap' });
      const cell = h(
        'button',
        {
          type: 'button',
          class: 'sm-gallery-modal__cell',
          title: it.title || it.url,
          'data-id': it.id,
          onclick: () => {
            selected = it;
            syncSelectionStyles();
            confirmBtn.disabled = false;
          },
          ondblclick: (e: Event) => {
            e.preventDefault();
            selected = it;
            finishPick();
          },
        },
        [],
      );
      const img = h('img', {
        class: 'sm-gallery-modal__thumb',
        alt: '',
        loading: 'lazy',
        decoding: 'async',
      }) as HTMLImageElement;
      img.src = thumb;
      img.onerror = () => {
        img.style.opacity = '0.72';
      };
      const cap = h('div', { class: 'sm-gallery-modal__caption' }, [
        it.title?.trim() ? it.title : t('common.image'),
      ]);
      cell.append(img, cap);
      cellWrap.append(cell);

      if (adapter.deleteItem) {
        const deletePerm = perm('delete');
        if (!deletePerm.allowed && deletePerm.mode === 'hide') {
          // 无删除权限且配置为隐藏：不渲染删除按钮
        } else {
          const delBtn = h(
            'button',
            {
              type: 'button',
              class: 'sm-gallery-modal__cell-delete',
              title: deletePerm.allowed ? t('gallery.deleteTitle') : deletePerm.tip,
              disabled: !deletePerm.allowed,
              ...(deletePerm.allowed
                ? {
                    onclick: async (e: Event) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!window.confirm(t('gallery.deleteConfirm'))) return;
                      try {
                        await adapter.deleteItem!(it.id);
                        if (selected?.id === it.id) {
                          selected = null;
                          confirmBtn.disabled = true;
                        }
                        await loadFirst();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : t('gallery.deleteFailed'));
                      }
                    },
                  }
                : {}),
            },
            ['×'],
          );
          cellWrap.append(delBtn);
        }
      }

      gridEl.append(cellWrap);
    }
    loadMoreBtn.style.display = hasMore ? '' : 'none';
  }

  async function loadPage(p: number, append: boolean) {
    if (loading) return;
    loading = true;
    loadMoreBtn.disabled = true;
    setError(null);
    try {
      const res = await adapter.listItems({ query, page: p });
      hasMore = res.hasMore;
      page = p;
      renderCells(res.items, append);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('gallery.loadFailed'));
    } finally {
      loading = false;
      loadMoreBtn.disabled = false;
    }
  }

  async function loadFirst() {
    page = 0;
    selected = null;
    confirmBtn.disabled = true;
    clear(gridEl);
    await loadPage(0, false);
    syncSelectionStyles();
  }

  function finishPick() {
    if (!selected?.url?.trim()) return;
    onPick(selected.url.trim());
    modal.close();
  }

  /** 搜索、链接、添加、上传同一行（窄屏可换行） */
  const toolbar = h('div', { class: 'sm-gallery-modal__toolbar' });
  const toolRow = h('div', { class: 'sm-gallery-modal__toolbar-row' });
  toolRow.append(searchInp);

  if (adapter.addByUrl) {
    const addPerm = perm('addUrl');
    if (!addPerm.allowed && addPerm.mode === 'hide') {
      // 无添加权限且配置为隐藏：不渲染添加链接输入框与按钮
    } else {
      const urlInp = h('input', {
        class: 'sm-input sm-gallery-modal__addurl-input',
        type: 'url',
        placeholder: t('gallery.addUrlPlaceholder'),
        disabled: !addPerm.allowed,
      }) as HTMLInputElement;
      const addBtn = h(
        'button',
        {
          class: 'sm-btn sm-btn--secondary sm-gallery-modal__toolbar-action',
          type: 'button',
          title: addPerm.allowed ? '' : addPerm.tip,
          disabled: !addPerm.allowed,
          ...(addPerm.allowed
            ? {
                onclick: async () => {
                  const u = urlInp.value.trim();
                  if (!u) return;
                  try {
                    await adapter.addByUrl!(u);
                    urlInp.value = '';
                    await loadFirst();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : t('gallery.addFailed'));
                  }
                },
              }
            : {}),
        },
        [t('common.add')],
      );
      toolRow.append(urlInp, addBtn);
    }
  }

  if (adapter.uploadFile) {
    const uploadPerm = perm('upload');
    if (!uploadPerm.allowed && uploadPerm.mode === 'hide') {
      // 无上传权限且配置为隐藏：不渲染上传按钮
    } else {
      const fileInp = h('input', {
        type: 'file',
        accept: 'image/*',
        class: 'sm-gallery-modal__file',
      });
      fileInp.addEventListener('change', async () => {
        const f = (fileInp as HTMLInputElement).files?.[0];
        (fileInp as HTMLInputElement).value = '';
        if (!f) return;
        try {
          await adapter.uploadFile!(f);
          await loadFirst();
        } catch (e) {
          setError(e instanceof Error ? e.message : t('gallery.uploadFailed'));
        }
      });
      const upBtn = h(
        'button',
        {
          class: 'sm-btn sm-btn--secondary sm-gallery-modal__toolbar-action',
          type: 'button',
          title: uploadPerm.allowed ? '' : uploadPerm.tip,
          disabled: !uploadPerm.allowed,
          ...(uploadPerm.allowed ? { onclick: () => fileInp.click() } : {}),
        },
        [t('common.upload')],
      );
      toolRow.append(upBtn, fileInp);
    }
  }

  toolbar.append(toolRow);

  const scrollArea = h('div', { class: 'sm-gallery-modal__scroll' }, [gridEl, loadMoreBtn]);

  wrap.append(toolbar, errEl, scrollArea);

  modal.body.append(wrap);
  modal.footer.append(
    h(
      'button',
      {
        class: 'sm-btn sm-btn--secondary',
        type: 'button',
        onclick: () => modal.close(),
      },
      [t('common.cancel')],
    ),
    confirmBtn,
  );

  modal.open(parent);
  void loadFirst();
}
