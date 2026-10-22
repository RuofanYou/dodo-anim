// Triangle lookup and texture sampling use the exported draw geometry, independently
// of the author's weight function. UVs address texel centres as WebGL linear filtering does.
export function barycentric(point, a, b, c) {
  const bx = b[0] - a[0], by = b[1] - a[1];
  const cx = c[0] - a[0], cy = c[1] - a[1];
  const px = point[0] - a[0], py = point[1] - a[1];
  const det = bx * cy - by * cx;
  if (Math.abs(det) < 1e-12) return null;
  const v = (px * cy - py * cx) / det;
  const w = (bx * py - by * px) / det;
  return [1 - v - w, v, w];
}

export function contains(weights) {
  return weights !== null && weights.every(value => value >= -1e-8 && value <= 1 + 1e-8);
}

export function interpolate(values, indices, weights) {
  return [0, 1].map(axis => indices.reduce((sum, index, k) => sum + values[index][axis] * weights[k], 0));
}

export function triangleIndices(quad) {
  if (quad.kind === 'region') return [[0, 1, 2], [0, 2, 3]];
  if (quad.kind !== 'mesh' || !quad.triangles || quad.triangles.length % 3) throw new Error(`Invalid triangle topology: ${quad.image}`);
  const out = [];
  for (let i = 0; i < quad.triangles.length; i += 3) out.push(quad.triangles.slice(i, i + 3));
  return out;
}

export function alphaBilinear(image, u, v) {
  const x = Math.max(0, Math.min(image.width - 1, u * image.width - .5));
  const y = Math.max(0, Math.min(image.height - 1, v * image.height - .5));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(image.width - 1, x0 + 1), y1 = Math.min(image.height - 1, y0 + 1);
  const dx = x - x0, dy = y - y0;
  const read = (xx, yy) => image.data[(yy * image.width + xx) * 4 + 3] / 255;
  return (read(x0, y0) * (1 - dx) + read(x1, y0) * dx) * (1 - dy)
    + (read(x0, y1) * (1 - dx) + read(x1, y1) * dx) * dy;
}

export class QuadSampler {
  constructor(quad, image, cellSize = 20) {
    this.quad = quad;
    this.image = image;
    this.cellSize = cellSize;
    this.triangles = triangleIndices(quad);
    this.cells = new Map();
    for (let index = 0; index < this.triangles.length; index++) {
      const positions = this.triangles[index].map(vertex => quad.positions[vertex]);
      const minX = Math.floor(Math.min(...positions.map(p => p[0])) / cellSize);
      const maxX = Math.floor(Math.max(...positions.map(p => p[0])) / cellSize);
      const minY = Math.floor(Math.min(...positions.map(p => p[1])) / cellSize);
      const maxY = Math.floor(Math.max(...positions.map(p => p[1])) / cellSize);
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const key = `${x},${y}`;
        let cell = this.cells.get(key);
        if (!cell) this.cells.set(key, cell = []);
        cell.push(index);
      }
    }
  }

  locate(point) {
    const key = `${Math.floor(point[0] / this.cellSize)},${Math.floor(point[1] / this.cellSize)}`;
    for (const index of this.cells.get(key) ?? []) {
      const indices = this.triangles[index];
      const weights = barycentric(point, ...indices.map(vertex => this.quad.positions[vertex]));
      if (contains(weights)) return { indices, weights };
    }
    return null;
  }

  sample(point) {
    const key = `${Math.floor(point[0] / this.cellSize)},${Math.floor(point[1] / this.cellSize)}`;
    let alpha = 0;
    // A shared edge belongs to two triangles of one surface. Taking the maximum
    // avoids compositing that surface twice at an exact probe/triangle boundary.
    for (const index of this.cells.get(key) ?? []) {
      const indices = this.triangles[index];
      const weights = barycentric(point, ...indices.map(vertex => this.quad.positions[vertex]));
      if (!contains(weights)) continue;
      const [u, v] = interpolate(this.quad.uvs, indices, weights);
      alpha = Math.max(alpha, alphaBilinear(this.image, u, v) * this.quad.color[3]);
    }
    return alpha;
  }
}

export function checkSamplingMath() {
  const image = { width: 2, height: 1, data: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255]) };
  for (const [u, expected] of [[.25, 0], [.5, .5], [.75, 1]]) {
    if (Math.abs(alphaBilinear(image, u, .5) - expected) > 1e-12) throw new Error('Texel-centre alpha check failed');
  }
  const quad = { kind: 'region', image: 'sampling-check', positions: [[0, 0], [2, 0], [2, 1], [0, 1]], uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], color: [1, 1, 1, 1] };
  const sampler = new QuadSampler(quad, image);
  if (Math.abs(sampler.sample([1, .5]) - .5) > 1e-12 || sampler.sample([3, .5]) !== 0) throw new Error('Triangle alpha lookup check failed');
}
