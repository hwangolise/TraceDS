/** Printed output so far, like a console. */
export function OutputPanel({ lines }: { lines: string[] }) {
  return (
    <section aria-label="Output" className="mt-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Output</h3>
      <pre className="min-h-11 rounded-md bg-slate-900 px-3 py-2 font-mono text-[14px] leading-6 text-slate-100">
        {lines.length === 0 ? <span className="text-slate-400">No output yet</span> : lines.join('\n')}
      </pre>
    </section>
  )
}
