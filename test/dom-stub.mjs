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
globalThis.Blob = class { constructor(p) { this.size = (p || []).join('').length; } };
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
globalThis.addEventListener = () => {};
export const fireDoc = (t, e) => (listeners[t] || []).forEach(fn => fn(e));
