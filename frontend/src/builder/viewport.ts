import { LEFT_GUTTER, MIN_READABLE_ZOOM } from './builder.constants';
import type { ViewportFlow } from './builder.types';

/**
 * Fit the whole graph when it fits legibly; otherwise keep a readable zoom and anchor the
 * left edge (where the trigger lives) so the flow reads left-to-right from its start.
 */
export function fitReadable(rf: ViewportFlow) {
  void rf.fitView({ padding: 0.2, maxZoom: 1.1 }).then(() => {
    if (rf.getZoom() >= MIN_READABLE_ZOOM) return;
    const bounds = rf.getNodesBounds(rf.getNodes().map((n) => n.id));
    const height = document.querySelector('.react-flow')?.getBoundingClientRect().height ?? 600;
    rf.setViewport({
      x: LEFT_GUTTER - bounds.x * MIN_READABLE_ZOOM,
      y: height / 2 - (bounds.y + bounds.height / 2) * MIN_READABLE_ZOOM,
      zoom: MIN_READABLE_ZOOM,
    });
  });
}
