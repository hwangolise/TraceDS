import { Layout } from '../components/Layout'
import { textLink } from '../components/ui'
import { hrefFor } from '../router'

export function NotFound({ message = 'This page does not exist.' }: { message?: string }) {
  return (
    <Layout>
      <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
        Not available
      </h1>
      <p className="mt-2 text-slate-700">{message}</p>
      <p className="mt-4">
        <a href={hrefFor({ name: 'landing' })} className={textLink}>
          Go to the home page
        </a>
      </p>
    </Layout>
  )
}
