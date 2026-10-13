// Maps the renderer-independent layout onto React Flow nodes and edges.
// React Flow only draws; positions and meaning come from layout.ts.

import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { ChangeSet, VizBox, VizLayout } from '../types'

export interface VizNodeData extends Record<string, unknown> {
  box: VizBox
  changed: boolean
  /** Names of changed fields, for object boxes. */
  changedFields: string[]
}

function changeFor(box: VizBox, changes: ChangeSet | null): Pick<VizNodeData, 'changed' | 'changedFields'> {
  if (!changes) return { changed: false, changedFields: [] }
  if (box.kind === 'node' || box.kind === 'bignum') {
    const prefix = `${box.objectId}.`
    return {
      changed: changes.objects.includes(box.objectId),
      changedFields: changes.fields.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length)),
    }
  }
  if (box.kind === 'variable') {
    return { changed: changes.variables.includes(`${box.frameIndex}:${box.name}`), changedFields: [] }
  }
  return { changed: false, changedFields: [] }
}

const EDGE_COLOR: Record<VizLayout['edges'][number]['kind'], string> = {
  next: '#1e293b', // slate-800, matches node borders
  myHead: '#1e293b',
  variable: '#4338ca', // indigo-700, matches variable pills
}

export function toFlow(layout: VizLayout, changes: ChangeSet | null): { nodes: Node<VizNodeData>[]; edges: Edge[] } {
  const nodes: Node<VizNodeData>[] = layout.boxes.map((box) => ({
    id: box.id,
    type: box.kind,
    position: { x: box.x, y: box.y },
    width: box.w,
    height: box.h,
    data: { box, ...changeFor(box, changes) },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
  }))

  const edges: Edge[] = layout.edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: e.targetHandle,
    type: e.kind === 'variable' ? 'straight' : 'default',
    // References are the subject being taught, so arrows are dark and solid.
    style: { stroke: EDGE_COLOR[e.kind], strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: EDGE_COLOR[e.kind] },
    className: `viz-edge viz-edge-${e.kind}`,
    selectable: false,
    focusable: false,
  }))

  return { nodes, edges }
}
