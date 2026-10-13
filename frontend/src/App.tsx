// Routes the student flow: landing → module → exercise → completion
// (docs/ARCHITECTURE.md §5.1). Completion results live in memory only.

import { useEffect, useRef, useState } from 'react'
import { Layout } from './components/Layout'
import { catalog } from './content/catalog'
import { getExercise } from './content'
import { findModule } from './content/modules'
import type { StepResult } from './engine/types'
import { validateExercise } from './engine/validate'
import { markCompleted } from './progress'
import { navigate, useRoute, type Route } from './router'
import { CompletionScreen } from './screens/CompletionScreen'
import { ExerciseScreen } from './screens/ExerciseScreen'
import { Landing } from './screens/Landing'
import { ModuleScreen } from './screens/ModuleScreen'
import { NotFound } from './screens/NotFound'

const routeKey = (route: Route) => JSON.stringify(route)

export default function App() {
  const route = useRoute()
  const [results, setResults] = useState<Record<string, StepResult[]>>({})
  const previousKey = useRef<string | null>(null)

  // On navigation: start at the top and move focus to the page heading.
  useEffect(() => {
    const key = routeKey(route)
    if (previousKey.current !== null && previousKey.current !== key) {
      document.documentElement.scrollTop = 0
      document.querySelector<HTMLElement>('h1')?.focus()
    }
    previousKey.current = key
  }, [route])

  const completionMissing = route.name === 'complete' && !results[route.exerciseId]
  useEffect(() => {
    if (completionMissing && route.name === 'complete') navigate({ name: 'exercise', exerciseId: route.exerciseId }, { replace: true })
  }, [completionMissing, route])

  switch (route.name) {
    case 'landing':
      return <Landing />
    case 'module': {
      const module = findModule(route.moduleId)
      return module ? <ModuleScreen module={module} /> : <NotFound />
    }
    case 'exercise':
    case 'complete': {
      const exercise = getExercise(route.exerciseId)
      const module = exercise && findModule(exercise.moduleId)
      if (!exercise || !module) return <NotFound message="This exercise isn't available yet." />
      if (!validateExercise(exercise, catalog).ok) {
        return <NotFound message="This exercise is unavailable right now." />
      }
      if (route.name === 'complete') {
        const finished = results[exercise.id]
        return finished ? <CompletionScreen exercise={exercise} module={module} results={finished} /> : null
      }
      return (
        <Layout>
          <ExerciseScreen
            key={exercise.id}
            exercise={exercise}
            onComplete={(stepResults) => {
              markCompleted(exercise.id)
              setResults((all) => ({ ...all, [exercise.id]: stepResults }))
              navigate({ name: 'complete', exerciseId: exercise.id })
            }}
          />
        </Layout>
      )
    }
    case 'not-found':
      return <NotFound />
  }
}
