// Browser API stubs React Flow needs under jsdom (no-ops in the node environment).
// Based on React Flow's documented testing setup.

if (typeof window !== 'undefined') {
  class ResizeObserverStub {
    private readonly callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe(target: Element): void {
      // Current React Flow reads entry.contentRect; report a fixed panel size.
      const contentRect = { x: 0, y: 0, width: 600, height: 400, top: 0, left: 0, right: 600, bottom: 400 }
      this.callback([{ target, contentRect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve(): void {}
    disconnect(): void {}
  }

  class DOMMatrixReadOnlyStub {
    m22: number
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([1-9.])\)/)?.[1]
      this.m22 = scale !== undefined ? Number(scale) : 1
    }
  }

  Object.assign(globalThis, {
    ResizeObserver: ResizeObserverStub,
    DOMMatrixReadOnly: DOMMatrixReadOnlyStub,
  })

  Object.defineProperties(window.HTMLElement.prototype, {
    offsetHeight: { get() { return Number.parseFloat(this.style.height) || 1 } },
    offsetWidth: { get() { return Number.parseFloat(this.style.width) || 1 } },
  })

  ;(window.SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect
}

// jsdom lacks CSS.escape, which user-event uses for arrow-key navigation in
// radio groups. Minimal polyfill (identifier escaping is all it needs here).
if (typeof window !== 'undefined' && !(globalThis as { CSS?: { escape?: unknown } }).CSS?.escape) {
  const escape = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`)
  Object.assign(globalThis, { CSS: { ...(globalThis as { CSS?: object }).CSS, escape } })
}
