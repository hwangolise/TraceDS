// Read-only linked-list memory diagram (docs/ARCHITECTURE.md §6).
//
// State in, picture out: ProgramState → layout → React Flow. The diagram is
// hidden from assistive technology. An equivalent text description (§6.3) is
// rendered alongside it and announced when the state changes.

import { useEffect, useMemo } from 'react'
import { ReactFlow, useNodesInitialized, useReactFlow, type NodeTypes } from '@xyflow/react'
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

/** Re-fits the diagram whenever the rendered state changes. */
function FitOnChange({ signature }: { signature: string }) {
  const { fitView } = useReactFlow()
  const initialized = useNodesInitialized()
  useEffect(() => {
    if (initialized) void fitView({ padding: `${FIT_PADDING}px`, minZoom: MIN_SCALE, maxZoom: 1 })
  }, [initialized, signature, fitView])
  return null
}

export function LinkedListView({ state, previousState = null }: LinkedListViewProps) {
  const viz = useMemo(() => layout(state), [state])
  const changes = useMemo(() => (previousState ? diff(previousState, state) : null), [previousState, state])
  const { nodes, edges } = useMemo(() => toFlow(viz, changes), [viz, changes])
  const description = useMemo(() => describe(state), [state])
  const signature = useMemo(() => nodes.map((n) => `${n.id}@${n.position.x},${n.position.y}`).join('|'), [nodes])

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
      <div data-testid="ll-diagram" aria-hidden="true" className="overflow-x-auto overflow-y-hidden">
        <div style={{ minWidth, height: Math.max(height, 2 * FIT_PADDING + 28) }}>
          <ReactFlow
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
          >
            <FitOnChange signature={signature} />
          </ReactFlow>
        </div>
      </div>
      <figcaption className="sr-only" aria-live="polite">
        {description}
      </figcaption>
    </figure>
  )
}
