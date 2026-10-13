// React Flow node renderers. They draw a box from layout data and nothing else:
// no layout decisions, no knowledge of where the state came from.

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { CAPTION_H, CELL_CENTER_Y, CELL_H, FOOTER_H } from '../layout'
import type { RefDisplay } from '../types'
import type { VizNodeData } from './toFlow'

type BoxProps = NodeProps<Node<VizNodeData>>

/** Hidden connection points; edges attach here. Readers never interact with them. */
const handleStyle = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 } as const

function Unspecified() {
  return (
    <span
      title="not shown in this exercise"
      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm border-2 border-dashed border-slate-500 font-mono text-xs leading-none text-slate-700"
    >
      ?
    </span>
  )
}

/** A reference cell: a dot the arrow leaves from, or the dashed "?" for unspecified. */
function RefCell({ display }: { display: RefDisplay }) {
  return display === 'unspecified' ? <Unspecified /> : <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-slate-800" />
}

function Footer({ changed, unreachable }: { changed: boolean; unreachable: boolean }) {
  return (
    <div className="flex items-center justify-center gap-1 text-[11px] leading-none" style={{ height: FOOTER_H }}>
      {unreachable && <span className="rounded bg-slate-100 px-1 py-0.5 text-slate-600">unreachable</span>}
      {changed && <span className="rounded bg-amber-100 px-1 py-0.5 font-medium text-amber-900">changed</span>}
    </div>
  )
}

const cellBase = 'flex flex-1 items-center justify-center'
const changedCell = 'bg-amber-50 ring-2 ring-inset ring-amber-500'

export function NodeBoxView({ id, data }: BoxProps) {
  const box = data.box
  if (box.kind !== 'node') return null
  const fieldChanged = (name: string) => data.changedFields.includes(name)
  return (
    <div
      data-viz-id={id}
      data-changed={data.changed ? 'true' : undefined}
      className={`h-full w-full ${box.unreachable ? 'opacity-60' : ''}`}
    >
      <div className="flex text-[11px] leading-none text-slate-500" style={{ height: CAPTION_H }}>
        <span className="flex-1 pt-0.5 text-center">{box.fieldName}</span>
        <span className="flex-1 pt-0.5 text-center">next</span>
      </div>
      <div
        className={`flex overflow-hidden rounded-md border-2 bg-white ${box.unreachable ? 'border-dashed border-slate-400' : 'border-slate-800'} ${data.changed ? 'outline outline-2 outline-offset-2 outline-amber-500' : ''}`}
        style={{ height: CELL_H }}
      >
        <div className={`${cellBase} font-mono text-base text-slate-900 ${fieldChanged(box.fieldName) ? changedCell : ''}`}>
          {box.value}
        </div>
        <div className={`${cellBase} border-l-2 ${box.unreachable ? 'border-slate-400' : 'border-slate-800'} ${fieldChanged('next') ? changedCell : ''}`}>
          <RefCell display={box.next} />
        </div>
      </div>
      <Footer changed={data.changed} unreachable={box.unreachable} />
      <Handle id="left" type="target" position={Position.Left} style={{ ...handleStyle, top: CELL_CENTER_Y }} isConnectable={false} />
      <Handle id="top" type="target" position={Position.Top} style={handleStyle} isConnectable={false} />
      <Handle id="next" type="source" position={Position.Right} style={{ ...handleStyle, top: CELL_CENTER_Y, right: 22 }} isConnectable={false} />
    </div>
  )
}

export function BigNumBoxView({ id, data }: BoxProps) {
  const box = data.box
  if (box.kind !== 'bignum') return null
  const fieldChanged = (name: string) => data.changedFields.includes(name)
  return (
    <div
      data-viz-id={id}
      data-changed={data.changed ? 'true' : undefined}
      className={`h-full w-full ${box.unreachable ? 'opacity-60' : ''}`}
    >
      <div className="text-center text-[11px] font-semibold leading-none text-slate-600" style={{ height: CAPTION_H, paddingTop: 2 }}>
        BigNum
      </div>
      <div
        className={`flex overflow-hidden rounded-md border-2 border-slate-800 bg-slate-50 ${data.changed ? 'outline outline-2 outline-offset-2 outline-amber-500' : ''}`}
        style={{ height: CELL_H }}
      >
        {/* mySize first so the myHead arrow leaves from the box's right edge. */}
        <div className={`${cellBase} flex-col ${fieldChanged('mySize') ? changedCell : ''}`}>
          <span className="text-[10px] leading-none text-slate-500">mySize</span>
          <span className="font-mono text-sm leading-tight text-slate-900">{box.mySize}</span>
        </div>
        <div className={`${cellBase} flex-col border-l-2 border-slate-800 ${fieldChanged('myHead') ? changedCell : ''}`}>
          <span className="text-[10px] leading-none text-slate-500">myHead</span>
          <span className="flex h-5 items-center">
            <RefCell display={box.myHead} />
          </span>
        </div>
      </div>
      <Footer changed={data.changed} unreachable={box.unreachable} />
      <Handle id="left" type="target" position={Position.Left} style={{ ...handleStyle, top: CELL_CENTER_Y }} isConnectable={false} />
      <Handle id="top" type="target" position={Position.Top} style={handleStyle} isConnectable={false} />
      <Handle id="myHead" type="source" position={Position.Right} style={{ ...handleStyle, top: CELL_CENTER_Y + 4, right: 32 }} isConnectable={false} />
    </div>
  )
}

export function NullMarkerView({ id }: BoxProps) {
  return (
    <div
      data-viz-id={id}
      className="flex h-full w-full items-center justify-center rounded border-2 border-slate-400 bg-white font-mono text-xs text-slate-600"
    >
      null
      <Handle id="left" type="target" position={Position.Left} style={handleStyle} isConnectable={false} />
      <Handle id="top" type="target" position={Position.Top} style={handleStyle} isConnectable={false} />
    </div>
  )
}

export function VariablePillView({ id, data }: BoxProps) {
  const box = data.box
  if (box.kind !== 'variable') return null
  return (
    <div
      data-viz-id={id}
      data-changed={data.changed ? 'true' : undefined}
      title={data.changed ? 'changed' : undefined}
      className={`flex h-full w-full items-center justify-center rounded-full font-mono text-[13px] text-white ${data.changed ? 'bg-amber-700 ring-2 ring-amber-300 ring-offset-1' : 'bg-indigo-700'}`}
    >
      {box.name}
      <Handle id="ref" type="source" position={Position.Bottom} style={handleStyle} isConnectable={false} />
    </div>
  )
}
