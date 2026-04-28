let _counter = 0;

/**
 * 生成短 ID。无需密码学强度——仅用于文档内引用。
 * 使用 base36 + 自增计数，保证同 doc 内单调，便于 diff 调试。
 */
export function uid(prefix = 'id'): string {
  _counter += 1;
  const ts = Date.now().toString(36).slice(-4);
  const rand = Math.floor(Math.random() * 36 ** 3)
    .toString(36)
    .padStart(3, '0');
  return `${prefix}_${ts}${rand}${_counter.toString(36)}`;
}
