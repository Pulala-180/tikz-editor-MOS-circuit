import { describe, expect, it } from 'vitest';
import { inspectorElementPriority } from '../../packages/app/src/ui/inspector-panel/useInspectorModel.js';

describe('inspectorElementPriority', () => {
  const treeId = 'path:0:tree-child:1:child:0';

  it('prefers tree child node geometry over edge-from-parent and text variants', () => {
    const nodePath = {
      kind: 'Path',
      id: 'scene-node-box:path:0:tree-child:1:child:0:node:0',
      sourceRef: { sourceId: treeId }
    } as any;
    const edgePath = {
      kind: 'Path',
      id: 'scene-path:path:0:tree-child:1:child:0:edge-from-parent:1',
      sourceRef: { sourceId: treeId }
    } as any;
    const text = {
      kind: 'Text',
      id: 'scene-text:path:0:tree-child:1:child:0:node:0',
      sourceRef: { sourceId: treeId }
    } as any;

    const nodePriority = inspectorElementPriority(treeId, nodePath);
    const edgePriority = inspectorElementPriority(treeId, edgePath);
    const textPriority = inspectorElementPriority(treeId, text);

    expect(nodePriority).toBeLessThan(edgePriority);
    expect(nodePriority).toBeLessThan(textPriority);
  });

  it('keeps non-tree ids neutral', () => {
    const normalId = 'path:0';
    const path = {
      kind: 'Path',
      id: 'scene-path:path:0',
      sourceRef: { sourceId: normalId }
    } as any;
    const text = {
      kind: 'Text',
      id: 'scene-text:path:0',
      sourceRef: { sourceId: normalId }
    } as any;

    expect(inspectorElementPriority(normalId, path)).toBe(0);
    expect(inspectorElementPriority(normalId, text)).toBe(0);
  });
});
