import type { ReactNode } from 'react';
import type { VariationTree } from '../chess/variationTree';
import { moveNumberAt } from '../chess/variationTree';

export interface VariationViewProps {
  tree: VariationTree;
  currentId: string;
  onSelect: (nodeId: string) => void;
}

export function VariationView({ tree, currentId, onSelect }: VariationViewProps) {
  const renderLine = (startId: string, forceNumber: boolean, depth: number): ReactNode[] => {
    const elements: ReactNode[] = [];
    let force = forceNumber;
    for (let node = tree.nodes[startId]; node;) {
      const parent = node.parentId ? tree.nodes[node.parentId] : undefined;
      if (!parent) break;
      const { number, whiteToMove } = moveNumberAt(parent.fen);
      const prefix = whiteToMove ? `${number}. ` : force ? `${number}… ` : '';
      const nodeId = node.id;
      elements.push(
        <button
          key={nodeId}
          type="button"
          className={`tree-move ${nodeId === currentId ? 'active' : ''}`}
          onClick={() => onSelect(nodeId)}
        >
          {prefix}
          {node.san}
        </button>,
      );
      force = false;
      if (parent.children[0] === node.id) {
        for (const siblingId of parent.children.slice(1)) {
          elements.push(
            <span
              key={`variation-${siblingId}`}
              className={`tree-variation depth-${Math.min(depth, 3)}`}
            >
              ({renderLine(siblingId, true, depth + 1)})
            </span>,
          );
          force = true;
        }
      }
      const next = node.children[0];
      node = next ? tree.nodes[next] : undefined;
    }
    return elements;
  };

  const first = tree.nodes[tree.rootId]?.children[0];
  if (!first)
    return (
      <div className="variation-view empty-state">Make a move on the board to start exploring.</div>
    );
  return <div className="variation-view">{renderLine(first, true, 0)}</div>;
}
