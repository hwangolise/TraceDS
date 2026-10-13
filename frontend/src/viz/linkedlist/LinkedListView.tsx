// Read-only linked-list memory diagram (docs/ARCHITECTURE.md §6).
//
// State in, picture out: ProgramState → layout → React Flow. The diagram is
// hidden from assistive technology. An equivalent text description (§6.3) is
// rendered alongside it and announced when the state changes.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ProgramState } from '../../engine/types'
import { describe } from '../describe'
import { diff } from '../diff'
import { FIT_PADDING, layout, MIN_SCALE } from '../layout'
import { BigNumBoxView, NodeBoxView, NullMarkerView, VariablePillView } from './boxes'
import { toFlow } from './toFlow'

export interface LinkedListViewProps {
  state: ProgramState
  /** The state before the last transition; changed parts are highlighted. */
  previousState?: ProgramState | null
}

const nodeTypes: NodeTypes = {
  node: NodeBoxView,
  bignum: BigNumBoxView,
  null: NullMarkerView,
  variable: VariablePillView,
}

/** Increments when the window is resized, so the diagram re-fits its new width. */
function useResizeTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setTick((t) => t + 1), 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])
  return tick
}

export function LinkedListView({ state, previousState = null }: LinkedListViewProps) {
  const viz = useMemo(() => layout(state), [state])
  const changes = useMemo(() => (previousState ? diff(previousState, state) : null), [previousState, state])
  const { nodes, edges } = useMemo(() => toFlow(viz, changes), [viz, changes])
  const description = useMemo(() => describe(state), [state])
  const signature = useMemo(() => nodes.map((n) => `${n.id}@${n.position.x},${n.position.y}`).join('|'), [nodes])
  const resizeTick = useResizeTick()

  // On narrow screens a wide diagram scrolls inside its box; say so, because
  // a clipped edge alone is easy to miss. (The text description is complete.)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    const el = scrollRef.current
    setOverflowing(!!el && el.scrollWidth > el.clientWidth + 1)
  }, [signature, resizeTick])

  // Below MIN_SCALE the diagram box scrolls sideways instead of shrinking
  // further. Page scrolling is never captured (no pan or zoom gestures).
  const minWidth = Math.ceil(viz.width * MIN_SCALE) + 2 * FIT_PADDING
  const height = Math.ceil(viz.height) + 2 * FIT_PADDING

  return (
    <figure className="m-0 w-full">
      {viz.scalars.length > 0 && (
        <ul aria-hidden="true" className="mb-2 flex flex-wrap gap-3 font-mono text-sm text-slate-800">
          {viz.scalars.map((s) => (
            <li key={`${s.frameIndex}:${s.name}`}>
              {s.name} ={' '}
              {s.unspecified ? (
                <span title="not shown in this exercise" className="rounded border-2 border-dashed border-slate-500 px-1">
                  ?
                </span>
              ) : (
                s.display
              )}
            </li>
          ))}
        </ul>
      )}
      {viz.boxes.length === 0 && (
        <p aria-hidden="true" className="py-6 text-center text-sm text-slate-500">
          Nothing in memory yet.
        </p>
      )}
      {/* Mounted only when there is something to draw, so React Flow always
          measures a visible container (a display:none container measures 0). */}
      {viz.boxes.length > 0 && (
      <div ref={scrollRef} data-testid="ll-diagram" aria-hidden="true" className="overflow-x-auto overflow-y-hidden">
        <div style={{ minWidth, height: Math.max(height, 2 * FIT_PADDING + 28) }}>
          {/* Remounted whenever the layout or window size changes: fitView then
              runs on freshly measured nodes. (Re-fitting a mounted instance ran
              before newly added nodes were measured, leaving them clipped.) */}
          <ReactFlow
            key={`${signature}#${resizeTick}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: `${FIT_PADDING}px`, minZoom: MIN_SCALE, maxZoom: 1 }}
            minZoom={MIN_SCALE}
            maxZoom={1}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
          />
        </div>
      </div>
      )}
      {overflowing && (
        <p aria-hidden="true" className="mt-1 text-xs text-slate-600">
          Swipe sideways to see the whole diagram →
        </p>
      )}
      <figcaption className="sr-only" aria-live="polite">
        {description}
      </figcaption>
    </figure>
  )
}
