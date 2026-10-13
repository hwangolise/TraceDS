// Renders the inline formatting used in exercise text: `code` and *emphasis*.
// Content strings keep the markdown markers exactly as in docs/EXERCISES.md.

const PATTERN = /(`[^`]+`|\*[^*\s][^*]*\*)/g

export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(PATTERN).map((part, i) => {
        if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="rounded bg-slate-100 px-1 py-px font-mono text-[0.92em] text-slate-900">
              {part.slice(1, -1)}
            </code>
          )
        }
        if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
        return part
      })}
    </>
  )
}
