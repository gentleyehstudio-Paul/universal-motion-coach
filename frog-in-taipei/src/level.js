// Turns the declarative rows of a level (listed bottom -> top, i.e. in the order
// the frog crosses them) into world coordinates. Pure data, no DOM.
const DEFAULT_H = { island: 36, lane: null, zone: null, parking: 34 };

export function buildLayout(cfg, idx) {
  const L = cfg.levels[idx];
  const W = cfg.world.width;
  const laneH = cfg.world.laneHeight;
  const curbH = L.curbHeight ?? 90;

  const heights = L.rows.map((r) => r.h ?? DEFAULT_H[r.t] ?? laneH);
  const padBottom = 58; // sidewalk below the start island, keeps the frog clear of the charge bar
  const H = curbH + heights.reduce((a, b) => a + b, 0) + padBottom;

  const rows = [];
  const statics = [];
  let y = H - padBottom;
  L.rows.forEach((r, i) => {
    const h = heights[i];
    y -= h;
    const row = { ...r, i, y, h, cy: y + h / 2 };
    rows.push(row);
    if (r.t === 'island') {
      statics.push({ kind: 'island', x: 10, y, w: W - 20, h, row: i });
    } else if (r.t === 'zone') {
      statics.push({ kind: 'zone', x: r.x, y: y + 2, w: r.w, h: h - 4, row: i });
    }
  });

  return {
    W,
    H,
    curbH,
    rows,
    statics,
    padBottom,
    boundsTop: curbH + 6,
    boundsBottom: H - padBottom - 4,
  };
}

export function rowIndexAt(layout, y) {
  for (const r of layout.rows) if (y >= r.y && y < r.y + r.h) return r.i;
  return y < layout.curbH ? layout.rows.length - 1 : 0;
}
