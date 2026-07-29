export type ConstellationNodeId = string;

export type ConstellationNode = {
  id: ConstellationNodeId;
  position: [number, number, number];
  size: number;
  brightness: number;
};

export type ConstellationLink = {
  from: ConstellationNodeId;
  to: ConstellationNodeId;
};

/** Absent connection — used only for break-zone placement, never drawn. */
export type BrokenLink = ConstellationLink;

/**
 * Two interwoven link hints made of stars — organic, asymmetric, no closed rings.
 * 7 field stars remain unconnected.
 */
export const CONSTELLATION_NODES: ConstellationNode[] = [
  { id: 's00', position: [-0.64, 0.44, 0], size: 0.126, brightness: 1.12 },
  { id: 's01', position: [-0.8, 0.12, 0], size: 0.132, brightness: 1.14 },
  { id: 's02', position: [-0.6, -0.26, 0], size: 0.062, brightness: 0.79 },
  { id: 's03', position: [-0.34, -0.2, 0], size: 0.058, brightness: 0.76 },
  { id: 's04', position: [-0.12, 0.06, 0], size: 0.064, brightness: 0.82 },
  { id: 's05', position: [-0.24, 0.36, 0], size: 0.055, brightness: 0.72 },
  { id: 's06', position: [-0.46, 0.54, 0], size: 0.052, brightness: 0.7 },
  { id: 's07', position: [0.56, 0.4, 0], size: 0.128, brightness: 1.1 },
  { id: 's08', position: [0.72, 0.1, 0], size: 0.134, brightness: 1.15 },
  { id: 's09', position: [0.52, -0.24, 0], size: 0.061, brightness: 0.78 },
  { id: 's10', position: [0.28, -0.18, 0], size: 0.057, brightness: 0.75 },
  { id: 's11', position: [0.1, 0.04, 0], size: 0.063, brightness: 0.81 },
  { id: 's12', position: [0.26, 0.34, 0], size: 0.054, brightness: 0.73 },
  { id: 's13', position: [0.48, 0.5, 0], size: 0.051, brightness: 0.71 },
  { id: 's14', position: [-1.04, 0.1, 0], size: 0.048, brightness: 0.68 },
  { id: 's15', position: [-0.9, -0.4, 0], size: 0.047, brightness: 0.67 },
  { id: 's16', position: [0.98, 0.2, 0], size: 0.049, brightness: 0.69 },
  { id: 's17', position: [0.84, -0.38, 0], size: 0.048, brightness: 0.68 },
  { id: 's18', position: [-0.06, 0.64, 0], size: 0.056, brightness: 0.74 },
  { id: 's19', position: [0.04, -0.56, 0], size: 0.05, brightness: 0.7 },
  { id: 's20', position: [-0.4, -0.5, 0], size: 0.047, brightness: 0.66 },
  { id: 's21', position: [0.36, 0.62, 0], size: 0.046, brightness: 0.65 },
  { id: 's22', position: [-0.52, 0.08, 0], size: 0.045, brightness: 0.64 },
  { id: 's23', position: [0.62, -0.08, 0], size: 0.046, brightness: 0.65 },
];

/**
 * Sparse partial arcs — open at the center. Deliberately absent:
 * s04↔s11, s04↔s05, s11↔s12, s05↔s12 (broken interlock).
 */
export const CONSTELLATION_LINKS: ConstellationLink[] = [
  { from: 's06', to: 's00' },
  { from: 's00', to: 's01' },
  { from: 's01', to: 's02' },
  { from: 's02', to: 's03' },
  { from: 's03', to: 's04' },
  { from: 's13', to: 's07' },
  { from: 's07', to: 's08' },
  { from: 's08', to: 's09' },
  { from: 's09', to: 's10' },
  { from: 's10', to: 's11' },
];

/** Primary missing link — particles only, no line geometry. */
export const BROKEN_LINK: BrokenLink = { from: 's04', to: 's11' };

export function nodeMap(): Map<ConstellationNodeId, ConstellationNode> {
  return new Map(CONSTELLATION_NODES.map((node) => [node.id, node]));
}

export function isBrightNode(id: ConstellationNodeId): boolean {
  return id === 's00' || id === 's01' || id === 's07' || id === 's08';
}
