// Java code with the current statement highlighted (docs/ARCHITECTURE.md §5.2).
// The highlight is conveyed by aria-current, a left bar, and a text marker,
// not by color alone.

import type { Terminology } from '../engine/types'
import { nodeClasses } from '../content/nodeClasses'
import { tokenizeJava, type TokenKind } from './javaTokens'

const TOKEN_CLASS: Record<TokenKind, string> = {
  keyword: 'font-semibold text-indigo-800',
  type: 'text-teal-800',
  number: 'text-amber-800',
  string: 'text-emerald-800',
  comment: 'italic text-slate-500',
  plain: '',
}

function JavaLine({ line }: { line: string }) {
  return (
    <>
      {tokenizeJava(line).map((t, i) => (
        <span key={i} className={TOKEN_CLASS[t.kind]}>
          {t.text}
        </span>
      ))}
    </>
  )
}

export interface CodePanelProps {
  code: string[]
  highlighted: number[]
  /** "next": about to run (question). "ran": just executed (review). */
  mode: 'next' | 'ran'
  focus?: string
  terminology: Terminology
}

export function CodePanel({ code, highlighted, mode, focus, terminology }: CodePanelProps) {
  const nodeClass = nodeClasses[terminology]
  return (
    <div>
      <ol aria-label="Java code" className="relative overflow-x-auto rounded-md border border-slate-200 bg-slate-50 py-2 font-mono text-[14px] leading-6">
        {code.map((line, i) => {
          const n = i + 1
          const current = highlighted.includes(n)
          return (
            <li
              key={n}
              data-line={n}
              aria-current={current ? 'step' : undefined}
              className={`flex min-w-max items-center border-l-4 pr-3 ${current ? 'border-indigo-600 bg-indigo-50' : 'border-transparent'}`}
            >
              <span aria-hidden="true" className="w-9 shrink-0 select-none pr-3 text-right text-slate-400">
                {n}
              </span>
              <code className="whitespace-pre text-slate-900">
                <JavaLine line={line} />
              </code>
              {current && (
                <span className="ml-3 rounded bg-indigo-700 px-1.5 font-sans text-[11px] font-semibold uppercase leading-5 tracking-wide text-white">
                  {mode === 'next' ? 'next' : 'ran'}
                  <span className="sr-only">{mode === 'next' ? ' (this line runs next)' : ' (this line just ran)'}</span>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      {focus && (
        <p className="mt-2 text-sm text-slate-700">
          {mode === 'next' ? 'Evaluating ' : 'Evaluated '}
          <code className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[0.92em] text-indigo-900 ring-1 ring-indigo-200">{focus}</code>
        </p>
      )}
      <details className="group mt-3 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded text-slate-700 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          {nodeClass.title}
        </summary>
        <pre className="mt-1 overflow-x-auto rounded-md border border-slate-200 bg-white p-3 font-mono text-[13px] leading-6 text-slate-800">
          {nodeClass.code.map((line, i) => (
            <div key={i}>
              <JavaLine line={line} />
              {line === '' ? '\n' : ''}
            </div>
          ))}
        </pre>
        {nodeClass.ownerFields && (
          <>
            <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{nodeClass.ownerFields.title}</h3>
            <pre className="mt-1 overflow-x-auto rounded-md border border-slate-200 bg-white p-3 font-mono text-[13px] leading-6 text-slate-800">
              {nodeClass.ownerFields.code.map((line, i) => (
                <div key={i}>
                  <JavaLine line={line} />
                </div>
              ))}
            </pre>
          </>
        )}
      </details>
    </div>
  )
}
