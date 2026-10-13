// The UI-facing tracking interface (docs/ANALYTICS.md §7 "UI boundary",
// docs/ARCHITECTURE.md §8). Screens and components import analytics only from
// this module. Delivery (client.ts) and storage (session.ts) stay behind it.
//
// M7A stub. The implementation may add helpers here (for example, mapping
// engine Outcomes to events). Every export must never throw and return void.

import type { TrackedEvent } from './client'

/** Records one logical event. Never throws, never blocks. */
export function track(event: TrackedEvent): void {
  void event
  throw new Error('not implemented')
}
