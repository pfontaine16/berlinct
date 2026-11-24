// Hand corrections to the automatic tree detection: no trees are planted inside these
// polygons (world metres, x east / z south, flat [x,z,...] rings).
// trees.mjs honours them on a full rebuild; clear-trees.mjs applies them to existing tiles.
export const CLEARINGS = [
  // 2 Misty Mountain Rd: front yard between the cul-de-sac and the house
  [58, -2198, 80, -2198, 83, -2212, 82, -2215.5, 70, -2221, 62, -2223, 60, -2210],
];
const pip = (r, x, z) => { let c = false; for (let a = 0, n = r.length, p = n - 2; a < n; p = a, a += 2) { if ((r[a + 1] > z) !== (r[p + 1] > z) && x < (r[p] - r[a]) * (z - r[a + 1]) / (r[p + 1] - r[a + 1]) + r[a]) c = !c; } return c; };
export const inClearing = (x, z) => CLEARINGS.some((r) => pip(r, x, z));
