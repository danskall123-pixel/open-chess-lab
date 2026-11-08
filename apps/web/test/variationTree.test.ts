import { describe, expect, it } from 'vitest';
import { STANDARD_START_FEN } from '@open-chess-lab/shared';
import {
  ROOT_ID,
  addMove,
  createTree,
  deleteVariation,
  mainlineFrom,
  movesUciTo,
  nodeOf,
  promoteVariation,
  treeToPgn,
} from '../src/chess/variationTree';

describe('variation tree', () => {
  it('builds the mainline from a list of moves', () => {
    const tree = createTree(STANDARD_START_FEN, ['e2e4', 'e7e5', 'g1f3']);
    const line = mainlineFrom(tree, ROOT_ID).map((node) => node.san);
    expect(line).toEqual([null, 'e4', 'e5', 'Nf3']);
  });

  it('adds variations without duplicating existing moves', () => {
    const tree = createTree(STANDARD_START_FEN, ['e2e4', 'e7e5']);
    const same = addMove(tree, 'e2e4', 'e7e5');
    expect(same?.tree).toBe(tree);
    const sideline = addMove(tree, 'e2e4', 'c7c5');
    expect(sideline).not.toBeNull();
    if (!sideline) return;
    expect(nodeOf(sideline.tree, 'e2e4').children).toEqual(['e2e4.e7e5', 'e2e4.c7c5']);
    expect(movesUciTo(sideline.tree, sideline.nodeId)).toEqual(['e2e4', 'c7c5']);
  });

  it('rejects illegal moves', () => {
    expect(addMove(createTree(STANDARD_START_FEN), ROOT_ID, 'e2e5')).toBeNull();
  });

  it('promotes and deletes variations', () => {
    const base = createTree(STANDARD_START_FEN, ['e2e4', 'e7e5']);
    const withSideline = addMove(base, 'e2e4', 'c7c5');
    if (!withSideline) throw new Error('expected a sideline');
    const promoted = promoteVariation(withSideline.tree, withSideline.nodeId);
    expect(mainlineFrom(promoted, ROOT_ID).map((node) => node.san)).toEqual([null, 'e4', 'c5']);
    const pruned = deleteVariation(promoted, 'e2e4.e7e5');
    expect(nodeOf(pruned, 'e2e4').children).toEqual(['e2e4.c7c5']);
    expect(pruned.nodes['e2e4.e7e5']).toBeUndefined();
  });
});

describe('treeToPgn', () => {
  it('writes mainline and variations as PGN movetext', () => {
    const base = createTree(STANDARD_START_FEN, ['e2e4', 'e7e5', 'g1f3']);
    const sideline = addMove(base, 'e2e4', 'c7c5');
    if (!sideline) throw new Error('expected a sideline');
    const deeper = addMove(sideline.tree, sideline.nodeId, 'g1f3');
    if (!deeper) throw new Error('expected a deeper move');
    const pgn = treeToPgn(deeper.tree, { White: 'A' }, STANDARD_START_FEN);
    expect(pgn).toContain('[White "A"]');
    expect(pgn).toContain('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *');
  });

  it('includes the starting FEN for custom positions', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 1';
    const tree = createTree(fen, ['e8d7']);
    const pgn = treeToPgn(tree, {}, STANDARD_START_FEN);
    expect(pgn).toContain(`[FEN "${fen}"]`);
    expect(pgn).toContain('1... Kd7 *');
  });
});
