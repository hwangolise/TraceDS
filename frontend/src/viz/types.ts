// Visualization model (docs/ARCHITECTURE.md §6).
//
// A renderer-independent description of the picture: positioned boxes and
// edges computed from a ProgramState by layout.ts. React Flow is only one way
// to draw it (see linkedlist/toFlow.ts).

/** How a reference cell is drawn. */
export type RefDisplay = 'ref' | 'null' | 'unspecified'

interface BoxBase {
  /** Stable, deterministic id, e.g. "obj:A", "null:A.next", "var:0:head". */
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** A Node object drawn as [field | next]. */
export interface NodeBox extends BoxBase {
  kind: 'node'
  objectId: string
  /** Field name from state: "data" (generic) or "digit" (BigNum). Never inferred. */
  fieldName: string
  /** The int field's value, as text. */
  value: string
  next: RefDisplay
  unreachable: boolean
}

/** A BigNum object drawn as a box with myHead and mySize cells. */
export interface BigNumBox extends BoxBase {
  kind: 'bignum'
  objectId: string
  myHead: RefDisplay
  mySize: string
  unreachable: boolean
}

/** An explicit `null` marker: a terminator after a node, or the target of a null variable. */
export interface NullBox extends BoxBase {
  kind: 'null'
}

/** A reference variable label (head, cur, copy, …) drawn above what it refers to. */
export interface VariableBox extends BoxBase {
  kind: 'variable'
  name: string
  frameIndex: number
}

export type VizBox = NodeBox | BigNumBox | NullBox | VariableBox

export interface VizEdge {
  /** Stable, deterministic id. */
  id: string
  /** next: Node.next; myHead: BigNum.myHead; variable: variable → object/null. */
  kind: 'next' | 'myHead' | 'variable'
  source: string
  /** Handle on the source box: "next", "myHead", or "ref" (variables). */
  sourceHandle: 'next' | 'myHead' | 'ref'
  target: string
  /** "left" for field references, "top" for variable references. */
  targetHandle: 'left' | 'top'
}

/** A non-reference or unspecified variable, listed as text beside the diagram. */
export interface VizScalar {
  name: string
  frameIndex: number
  /** e.g. "3", or "?" for unspecified. */
  display: string
  unspecified: boolean
}

export interface VizLayout {
  boxes: VizBox[]
  edges: VizEdge[]
  scalars: VizScalar[]
  /** Bounding size of all boxes, in layout units (pixels at zoom 1). */
  width: number
  height: number
}

/** What changed between two program states (docs/ARCHITECTURE.md §6.1). */
export interface ChangeSet {
  /** Objects that were added or had any field change. */
  objects: string[]
  /** Objects present before and absent now. */
  removedObjects: string[]
  /** Changed fields as "<objectId>.<fieldName>". */
  fields: string[]
  /** Added, removed, or changed variables as "<frameIndex>:<name>". */
  variables: string[]
  outputChanged: boolean
}
