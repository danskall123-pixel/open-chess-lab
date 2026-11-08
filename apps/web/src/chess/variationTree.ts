import { Chess } from 'chess.js';
import { tryMove, uciOf } from '@open-chess-lab/shared';

export interface TreeNode {
  id: string;
  parentId: string | null;
  ply: number;
  san: string | null;
  uci: string | null;
  fen: string;
  children: string[];
}

export interface VariationTree {
  rootId: string;
  nodes: Record<string, TreeNode>;
}

export const ROOT_ID = 'root';

export function createTree(initialFen: string, mainline: readonly string[] = []): VariationTree {
  let tree: VariationTree = {
    rootId: ROOT_ID,
    nodes: {
      [ROOT_ID]: {
        id: ROOT_ID,
        parentId: null,
        ply: 0,
        san: null,
        uci: null,
        fen: initialFen,
        children: [],
      },
    },
  };
  let currentId = ROOT_ID;
  for (const uci of mainline) {
    const result = addMove(tree, currentId, uci);
    if (!result) break;
    tree = result.tree;
    currentId = result.nodeId;
  }
  return tree;
}

export function nodeOf(tree: VariationTree, id: string): TreeNode {
  const node = tree.nodes[id];
  if (!node) throw new Error(`Unknown node ${id}`);
  return node;
}

export function addMove(
  tree: VariationTree,
  parentId: string,
  uci: string,
): { tree: VariationTree; nodeId: string } | null {
  const parent = nodeOf(tree, parentId);
  const existing = parent.children.find((childId) => nodeOf(tree, childId).uci === uci);
  if (existing) return { tree, nodeId: existing };

  const chess = new Chess(parent.fen);
  const move = tryMove(chess, uci);
  if (!move) return null;
  const normalizedUci = uciOf(move);
  const nodeId = parentId === ROOT_ID ? normalizedUci : `${parentId}.${normalizedUci}`;
  const node: TreeNode = {
    id: nodeId,
    parentId,
    ply: parent.ply + 1,
    san: move.san,
    uci: normalizedUci,
    fen: chess.fen(),
    children: [],
  };
  return {
    nodeId,
    tree: {
      ...tree,
      nodes: {
        ...tree.nodes,
        [parentId]: { ...parent, children: [...parent.children, nodeId] },
        [nodeId]: node,
      },
    },
  };
}

export function pathTo(tree: VariationTree, id: string): TreeNode[] {
  const path: TreeNode[] = [];
  for (
    let node: TreeNode | undefined = tree.nodes[id];
    node;
    node = node.parentId ? tree.nodes[node.parentId] : undefined
  ) {
    path.unshift(node);
  }
  return path;
}

export function mainlineFrom(tree: VariationTree, id: string): TreeNode[] {
  const line: TreeNode[] = [];
  for (let node = tree.nodes[id]; node;) {
    line.push(node);
    const next = node.children[0];
    node = next ? tree.nodes[next] : undefined;
  }
  return line;
}

export function deleteVariation(tree: VariationTree, id: string): VariationTree {
  const node = nodeOf(tree, id);
  if (!node.parentId) return tree;
  const parent = nodeOf(tree, node.parentId);
  const removed = new Set<string>();
  const collect = (nodeId: string) => {
    removed.add(nodeId);
    tree.nodes[nodeId]?.children.forEach(collect);
  };
  collect(id);
  const nodes = Object.fromEntries(
    Object.entries(tree.nodes).filter(([nodeId]) => !removed.has(nodeId)),
  );
  nodes[parent.id] = { ...parent, children: parent.children.filter((childId) => childId !== id) };
  return { ...tree, nodes };
}

export function promoteVariation(tree: VariationTree, id: string): VariationTree {
  const node = nodeOf(tree, id);
  if (!node.parentId) return tree;
  const parent = nodeOf(tree, node.parentId);
  const reordered = [id, ...parent.children.filter((childId) => childId !== id)];
  return { ...tree, nodes: { ...tree.nodes, [parent.id]: { ...parent, children: reordered } } };
}

export function movesUciTo(tree: VariationTree, id: string): string[] {
  return pathTo(tree, id)
    .map((node) => node.uci)
    .filter((uci): uci is string => uci !== null);
}

export function moveNumberAt(fen: string): { number: number; whiteToMove: boolean } {
  const fields = fen.split(' ');
  return { number: Number(fields[5] ?? '1'), whiteToMove: fields[1] !== 'b' };
}

function lineTokens(tree: VariationTree, startId: string, forceNumber: boolean): string[] {
  const tokens: string[] = [];
  let force = forceNumber;
  for (let node = tree.nodes[startId]; node;) {
    const parent = node.parentId ? tree.nodes[node.parentId] : undefined;
    if (!parent || !node.san) break;
    const { number, whiteToMove } = moveNumberAt(parent.fen);
    if (whiteToMove) tokens.push(`${number}.`);
    else if (force) tokens.push(`${number}...`);
    tokens.push(node.san);
    force = false;
    if (parent.children[0] === node.id) {
      for (const siblingId of parent.children.slice(1)) {
        tokens.push(`(${lineTokens(tree, siblingId, true).join(' ')})`);
        force = true;
      }
    }
    const next = node.children[0];
    node = next ? tree.nodes[next] : undefined;
  }
  return tokens;
}

export function treeToPgn(
  tree: VariationTree,
  headers: Record<string, string>,
  standardStartFen: string,
): string {
  const root = nodeOf(tree, tree.rootId);
  const allHeaders: Record<string, string> = { Event: 'Analysis', Result: '*', ...headers };
  if (root.fen !== standardStartFen) {
    allHeaders.SetUp = '1';
    allHeaders.FEN = root.fen;
  }
  const headerText = Object.entries(allHeaders)
    .map(([key, value]) => `[${key} "${value.replace(/"/g, "'")}"]`)
    .join('\n');
  const first = root.children[0];
  const movetext = first ? lineTokens(tree, first, true).join(' ') : '';
  return `${headerText}\n\n${movetext} ${allHeaders.Result ?? '*'}`.trim() + '\n';
}
