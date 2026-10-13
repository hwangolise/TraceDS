import type { ReactNode } from 'react'
import { hrefFor } from '../router'

/** App chrome for inner pages: a quiet header with the wordmark linking home. */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <a href={hrefFor({ name: 'landing' })} className="rounded font-semibold tracking-tight text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            Trace<span className="text-indigo-700">DS</span>
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{children}</main>
    </div>
  )
}
