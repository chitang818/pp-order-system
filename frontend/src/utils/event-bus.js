/**
 * 事件总线（轻量级）
 * 提供 on/off/emit/once 能力，统一模块间通信
 */

const listeners = new Map();

function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
}

function off(event, handler) {
  const set = listeners.get(event);
  if (set) set.delete(handler);
}

function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const handler of Array.from(set)) {
    try { handler(payload); } catch (e) { console.error('[EventBus] 处理事件失败:', event, e); }
  }
}

function once(event, handler) {
  const wrapper = (payload) => {
    off(event, wrapper);
    handler(payload);
  };
  on(event, wrapper);
}

export const EventBus = { on, off, emit, once };

// 向后兼容：导出到全局
if (typeof window !== 'undefined') {
  window.EventBus = EventBus;
}