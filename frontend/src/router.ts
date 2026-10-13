// Minimal hash router (docs/ARCHITECTURE.md §5.1, ADR-10). No dependency.

import { useEffect, useState } from 'react'

export type Route =
  | { name: 'landing' }
  | { name: 'module'; moduleId: string }
  | { name: 'exercise'; exerciseId: string }
  | { name: 'complete'; exerciseId: string }
  | { name: 'not-found' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '')
  if (path === '' || path === '/') return { name: 'landing' }
  const parts = path.replace(/^\//, '').split('/')
  if (parts.length === 2 && parts[0] === 'm' && parts[1]) return { name: 'module', moduleId: parts[1] }
  if (parts.length === 2 && parts[0] === 'x' && parts[1]) return { name: 'exercise', exerciseId: parts[1] }
  if (parts.length === 3 && parts[0] === 'x' && parts[1] && parts[2] === 'done') {
    return { name: 'complete', exerciseId: parts[1] }
  }
  return { name: 'not-found' }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'landing':
    case 'not-found':
      return '#/'
    case 'module':
      return `#/m/${route.moduleId}`
    case 'exercise':
      return `#/x/${route.exerciseId}`
    case 'complete':
      return `#/x/${route.exerciseId}/done`
  }
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const href = hrefFor(route)
  if (options.replace) {
    window.history.replaceState(null, '', href)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = href
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    onChange()
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
