export interface CodeEditorModalSize {
  width: string;
  height: string;
}

const DEFAULT_MAX_WIDTH_RATIO = 0.96;
const DEFAULT_MAX_HEIGHT_RATIO = 0.88;

/** 组件代码弹框默认固定尺寸 */
export function getCodeEditorModalDefaultSize(): CodeEditorModalSize {
  return {
    width: 'min(720px, 92vw)',
    height: 'min(560px, 85vh)',
  };
}

/** 代码编辑弹框最大化时的视口占比 */
export function getCodeEditorModalMaximizedSize(
  opts?: { maxWidthRatio?: number; maxHeightRatio?: number },
): CodeEditorModalSize {
  const maxWidthRatio = opts?.maxWidthRatio ?? DEFAULT_MAX_WIDTH_RATIO;
  const maxHeightRatio = opts?.maxHeightRatio ?? DEFAULT_MAX_HEIGHT_RATIO;
  return {
    width: `${Math.floor(window.innerWidth * maxWidthRatio)}px`,
    height: `${Math.floor(window.innerHeight * maxHeightRatio)}px`,
  };
}
