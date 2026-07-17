import type { ChangesetSummary } from "./api";

export type GraphEdgeType = "continue" | "branch" | "merge";

export interface StableBranchLaneEdge {
  from: string;
  to: string;
  fromLane: number;
  toLane: number;
  type: GraphEdgeType;
}

export interface StableBranchLaneNode {
  node: string;
  parents: string[];
  branch: string;
  lane: number;
  laneOwner: string;
  colorKey: string;
  reason: string;
  graphEdges: StableBranchLaneEdge[];
}

export interface StableBranchLaneResult {
  laneByNode: Map<string, number>;
  colorKeyByNode: Map<string, string>;
  laneCount: number;
  primaryBranchName: string;
  laneByBranch: Map<string, number>;
  nodes: StableBranchLaneNode[];
}

interface GraphRelations {
  changesetByNode: Map<string, ChangesetSummary>;
  childrenByNode: Map<string, string[]>;
  oldestIndexByNode: Map<string, number>;
}

interface BranchBirth {
  branch: string;
  node: string;
  timestamp: string;
  oldestIndex: number;
  visibleParents: ChangesetSummary[];
}

function findPrimaryBranch(changesets: ChangesetSummary[]) {
  const branchNames = new Set(changesets.map((changeset) => changeset.branch));

  if (branchNames.has("default")) {
    return "default";
  }

  if (branchNames.has("main")) {
    return "main";
  }

  const oldestFirst = [...changesets].reverse();
  const nodeIds = new Set(changesets.map((changeset) => changeset.node));
  const root = oldestFirst.find((changeset) =>
    changeset.parents.every((parentNode) => !nodeIds.has(parentNode)),
  );

  return root?.branch ?? oldestFirst[0]?.branch ?? changesets[0]?.branch ?? "default";
}

function colorKeyForLane(lane: number) {
  return `lane-${lane}`;
}

function buildGraphRelations(changesets: ChangesetSummary[]): GraphRelations {
  const changesetByNode = new Map<string, ChangesetSummary>();
  const childrenByNode = new Map<string, string[]>();
  const oldestIndexByNode = new Map<string, number>();
  const oldestFirst = [...changesets].reverse();

  oldestFirst.forEach((changeset, index) => {
    changesetByNode.set(changeset.node, changeset);
    oldestIndexByNode.set(changeset.node, index);
  });

  oldestFirst.forEach((changeset) => {
    changeset.parents.forEach((parentNode) => {
      if (!changesetByNode.has(parentNode)) {
        return;
      }
      const children = childrenByNode.get(parentNode) ?? [];
      children.push(changeset.node);
      childrenByNode.set(parentNode, children);
    });
  });

  return {
    changesetByNode,
    childrenByNode,
    oldestIndexByNode,
  };
}

function sortChildNodes(
  childNodes: string[],
  changesetByNode: Map<string, ChangesetSummary>,
  oldestIndexByNode: Map<string, number>,
) {
  return [...childNodes].sort((leftNode, rightNode) => {
    const left = changesetByNode.get(leftNode);
    const right = changesetByNode.get(rightNode);
    if (!left || !right) {
      return leftNode.localeCompare(rightNode);
    }

    const byTimestamp = left.timestamp.localeCompare(right.timestamp);
    if (byTimestamp !== 0) {
      return byTimestamp;
    }

    const byTopology =
      (oldestIndexByNode.get(leftNode) ?? 0) - (oldestIndexByNode.get(rightNode) ?? 0);
    if (byTopology !== 0) {
      return byTopology;
    }

    return left.branch.localeCompare(right.branch) || left.node.localeCompare(right.node);
  });
}

function findPreferredContinuationChild(
  parent: ChangesetSummary,
  childNodes: string[],
  primaryBranchName: string,
  changesetByNode: Map<string, ChangesetSummary>,
  oldestIndexByNode: Map<string, number>,
) {
  const sortedChildren = sortChildNodes(childNodes, changesetByNode, oldestIndexByNode)
    .map((childNode) => changesetByNode.get(childNode))
    .filter((child): child is ChangesetSummary => Boolean(child));

  if (parent.branch === primaryBranchName) {
    const primaryChild = sortedChildren.find(
      (child) => child.branch === primaryBranchName,
    );
    if (primaryChild) {
      return primaryChild.node;
    }
  }

  const sameBranchChild = sortedChildren.find((child) => child.branch === parent.branch);
  if (sameBranchChild) {
    return sameBranchChild.node;
  }

  return sortedChildren[0]?.node ?? null;
}

function pickAnchorParent(
  changeset: Pick<ChangesetSummary, "branch" | "parents">,
  visibleParents: ChangesetSummary[],
  primaryBranchName: string,
  laneByNode: Map<string, number>,
) {
  const orderedParents = changeset.parents
    .map((parentNode) => visibleParents.find((parent) => parent.node === parentNode))
    .filter((parent): parent is ChangesetSummary => Boolean(parent));

  if (changeset.branch === primaryBranchName) {
    const primaryParent = orderedParents.find(
      (parent) => parent.branch === primaryBranchName,
    );
    if (primaryParent) {
      return primaryParent;
    }
  }

  const sameBranchParent = orderedParents.find(
    (parent) => parent.branch === changeset.branch,
  );
  if (sameBranchParent) {
    return sameBranchParent;
  }

  const firstParent = orderedParents[0];
  if (firstParent) {
    return firstParent;
  }

  return [...visibleParents].sort(
    (left, right) =>
      (laneByNode.get(left.node) ?? 0) - (laneByNode.get(right.node) ?? 0),
  )[0];
}

function allocateLane(
  usedLanes: Set<number>,
  desiredLane: number,
) {
  let candidate = Math.max(desiredLane, 1);
  while (usedLanes.has(candidate)) {
    candidate += 1;
  }
  usedLanes.add(candidate);
  return candidate;
}

function buildBranchBirths(
  oldestFirst: ChangesetSummary[],
  changesetByNode: Map<string, ChangesetSummary>,
  primaryBranchName: string,
  oldestIndexByNode: Map<string, number>,
) {
  const branchBirths = new Map<string, BranchBirth>();

  oldestFirst.forEach((changeset) => {
    const branch = changeset.branch || "";
    if (!branch || branch === primaryBranchName || branchBirths.has(branch)) {
      return;
    }

    const visibleParents = changeset.parents
      .map((parentNode) => changesetByNode.get(parentNode))
      .filter((parent): parent is ChangesetSummary => Boolean(parent));

    branchBirths.set(branch, {
      branch,
      node: changeset.node,
      timestamp: changeset.timestamp,
      oldestIndex: oldestIndexByNode.get(changeset.node) ?? 0,
      visibleParents,
    });
  });

  return [...branchBirths.values()].sort((left, right) => {
    const byTimestamp = left.timestamp.localeCompare(right.timestamp);
    if (byTimestamp !== 0) {
      return byTimestamp;
    }

    const byOldestIndex = left.oldestIndex - right.oldestIndex;
    if (byOldestIndex !== 0) {
      return byOldestIndex;
    }

    return left.branch.localeCompare(right.branch);
  });
}

function inferVirtualLane(
  changeset: ChangesetSummary,
  visibleParents: ChangesetSummary[],
  primaryBranchName: string,
  laneByNode: Map<string, number>,
  preferredContinuationChildByParent: Map<string, string>,
  usedLanes: Set<number>,
) {
  if (visibleParents.length === 0) {
    return {
      lane: changeset.branch === primaryBranchName ? 0 : allocateLane(usedLanes, 1),
      reason: changeset.branch === primaryBranchName ? "primary-root" : "virtual-root",
    };
  }

  const anchorParent = pickAnchorParent(
    changeset,
    visibleParents,
    primaryBranchName,
    laneByNode,
  );
  const anchorLane = laneByNode.get(anchorParent.node) ?? 0;
  const preferredChild = preferredContinuationChildByParent.get(anchorParent.node);
  const isPreferredContinuation = preferredChild === changeset.node;

  if (changeset.branch === primaryBranchName) {
    return {
      lane: 0,
      reason: "primary-continuation",
    };
  }

  if (anchorParent.branch === changeset.branch && isPreferredContinuation) {
    return {
      lane: anchorLane,
      reason: `virtual-continuation:${anchorParent.node}`,
    };
  }

  return {
    lane: allocateLane(usedLanes, anchorLane + 1),
    reason: `virtual-divergence:${anchorParent.node}`,
  };
}

export function assignStableBranchLanes(
  changesets: ChangesetSummary[],
): StableBranchLaneResult {
  if (changesets.length === 0) {
    return {
      laneByNode: new Map(),
      colorKeyByNode: new Map(),
      laneCount: 1,
      laneByBranch: new Map([["default", 0]]),
      nodes: [],
      primaryBranchName: "default",
    };
  }

  const primaryBranchName = findPrimaryBranch(changesets);
  const oldestFirst = [...changesets].reverse();
  const { changesetByNode, childrenByNode, oldestIndexByNode } = buildGraphRelations(changesets);
  const preferredContinuationChildByParent = new Map<string, string>();

  childrenByNode.forEach((childNodes, parentNode) => {
    const parent = changesetByNode.get(parentNode);
    if (!parent) {
      return;
    }
    const preferred = findPreferredContinuationChild(
      parent,
      childNodes,
      primaryBranchName,
      changesetByNode,
      oldestIndexByNode,
    );
    if (preferred) {
      preferredContinuationChildByParent.set(parentNode, preferred);
    }
  });

  const laneByBranch = new Map<string, number>([[primaryBranchName, 0]]);
  const usedLanes = new Set<number>([0]);
  const branchBirths = buildBranchBirths(
    oldestFirst,
    changesetByNode,
    primaryBranchName,
    oldestIndexByNode,
  );

  branchBirths.forEach((branchBirth) => {
    const anchorParent = pickAnchorParent(
      {
        branch: branchBirth.branch,
        parents: branchBirth.visibleParents.map((parent) => parent.node),
      },
      branchBirth.visibleParents,
      primaryBranchName,
      new Map(
        branchBirth.visibleParents.map((parent) => [
          parent.node,
          laneByBranch.get(parent.branch) ?? 0,
        ]),
      ),
    );
    const desiredLane = anchorParent
      ? (laneByBranch.get(anchorParent.branch) ?? 0) + 1
      : 1;
    laneByBranch.set(branchBirth.branch, allocateLane(usedLanes, desiredLane));
  });

  const laneByNode = new Map<string, number>();
  const colorKeyByNode = new Map<string, string>();
  const reasonByNode = new Map<string, string>();
  const laneOwnerByNode = new Map<string, string>();

  oldestFirst.forEach((changeset) => {
    const visibleParents = changeset.parents
      .map((parentNode) => changesetByNode.get(parentNode))
      .filter((parent): parent is ChangesetSummary => Boolean(parent));

    const branchName = changeset.branch || "";
    if (branchName && laneByBranch.has(branchName)) {
      const lane = laneByBranch.get(branchName) ?? 0;
      laneByNode.set(changeset.node, lane);
      colorKeyByNode.set(changeset.node, colorKeyForLane(lane));
      laneOwnerByNode.set(changeset.node, branchName);
      reasonByNode.set(
        changeset.node,
        branchName === primaryBranchName
          ? "branch-owned:primary"
          : `branch-owned:${branchName}`,
      );
      return;
    }

    const virtualAssignment = inferVirtualLane(
      changeset,
      visibleParents,
      primaryBranchName,
      laneByNode,
      preferredContinuationChildByParent,
      usedLanes,
    );
    laneByNode.set(changeset.node, virtualAssignment.lane);
    colorKeyByNode.set(
      changeset.node,
      colorKeyForLane(virtualAssignment.lane),
    );
    laneOwnerByNode.set(changeset.node, `virtual:${changeset.node}`);
    reasonByNode.set(changeset.node, virtualAssignment.reason);
  });

  const nodes = changesets.map((changeset) => {
    const nodeLane = laneByNode.get(changeset.node) ?? 0;
    const graphEdges: StableBranchLaneEdge[] = changeset.parents
      .filter((parentNode) => laneByNode.has(parentNode))
      .map((parentNode) => {
        const parentLane = laneByNode.get(parentNode) ?? nodeLane;
        let type: GraphEdgeType = "continue";
        if (nodeLane > parentLane) {
          type = "branch";
        } else if (nodeLane < parentLane) {
          type = "merge";
        }

        return {
          from: changeset.node,
          to: parentNode,
          fromLane: nodeLane,
          toLane: parentLane,
          type,
        };
      });

    return {
      node: changeset.node,
      parents: changeset.parents,
      branch: changeset.branch,
      lane: nodeLane,
      laneOwner: laneOwnerByNode.get(changeset.node) ?? changeset.branch ?? "virtual",
      colorKey: colorKeyByNode.get(changeset.node) ?? colorKeyForLane(nodeLane),
      reason: reasonByNode.get(changeset.node) ?? "unclassified",
      graphEdges,
    };
  });

  return {
    laneByNode,
    colorKeyByNode,
    laneCount: Math.max(...laneByNode.values(), 0) + 1,
    primaryBranchName,
    laneByBranch,
    nodes,
  };
}

export const assignStableGraphLanes = assignStableBranchLanes;
