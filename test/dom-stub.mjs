/* The smallest DOM the modules touch at import time, so views can be
 * rendered in Node. Only render() paths are exercised, never mount(). */
const listeners = {};
const el = () => ({
  innerHTML: '', textContent: '', className: '', value: '', scrollTop: 0,
  style: {}, dataset: {}, files: [],
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, removeEventListener() {},
  querySelector: () => el(), querySelectorAll: () => [],
  appendChild() {}, remove() {}, closest: () => null, focus() {}, click() {}
});
globalThis.document = {
  addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
  removeEventListener() {},
  dispatchEvent() {},
  querySelector: () => el(),
  querySelectorAll: () => [],
  createElement: () => el(),
  body: { appendChild() {} },
  visibilityState: 'visible'
};
globalThis.window = globalThis;
globalThis.location = { hash: '#/', protocol: 'http:', replace() {} };
globalThis.history = { length: 1, back() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
// Node's own Blob is real (has .stream()); no stub needed.
Object.defineProperty(globalThis, 'navigator', {
  value: { vibrate() {}, share: undefined, clipboard: undefined },
  configurable: true, writable: true
});
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
  clear: () => mem.clear()
};
// A real (tiny) window event bus, so listeners registered by modules at import
// time can actually be exercised — the cross-tab 'storage' handler needs it.
const winListeners = {};
globalThis.addEventListener = (type, fn) => { (winListeners[type] ||= []).push(fn); };
globalThis.removeEventListener = (type, fn) => {
  winListeners[type] = (winListeners[type] || []).filter(f => f !== fn);
};
globalThis.dispatchEvent = ev => { (winListeners[ev.type] || []).forEach(fn => fn(ev)); return true; };
export const fireDoc = (t, e) => (listeners[t] || []).forEach(fn => fn(e));
