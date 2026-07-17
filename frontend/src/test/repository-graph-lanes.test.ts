import { describe, expect, test } from "vitest";
import type { ChangesetSummary } from "../lib/api";
import { assignStableBranchLanes } from "../lib/repository-graph";

function makeChangeset(
  node: string,
  branch: string,
  parents: string[],
): ChangesetSummary {
  return {
    node,
    short_node: node.slice(0, 12),
    parents,
    author_name: "Owner User",
    author_email_when_available: "owner@example.com",
    timestamp: "2026-07-15T12:00:00Z",
    message: node,
    branch,
    files_changed_count_when_available: 1,
    insertions_when_available: 1,
    deletions_when_available: 0,
  };
}

describe("assignStableBranchLanes", () => {
  test("keeps a linear default branch on lane 0", () => {
    const changesets = [
      makeChangeset("c", "default", ["b"]),
      makeChangeset("b", "default", ["a"]),
      makeChangeset("a", "default", []),
    ];

    const result = assignStableBranchLanes(changesets);

    expect(result.laneByNode.get("a")).toBe(0);
    expect(result.laneByNode.get("b")).toBe(0);
    expect(result.laneByNode.get("c")).toBe(0);
  });

  test("keeps one feature branch off default on lane 1 and merge on lane 0", () => {
    const changesets = [
      makeChangeset("n", "default", ["m"]),
      makeChangeset("m", "default", ["c", "e"]),
      makeChangeset("e", "feature", ["d"]),
      makeChangeset("d", "feature", ["b"]),
      makeChangeset("c", "default", ["b"]),
      makeChangeset("b", "default", ["a"]),
      makeChangeset("a", "default", []),
    ];

    const result = assignStableBranchLanes(changesets);

    expect(result.laneByNode.get("a")).toBe(0);
    expect(result.laneByNode.get("b")).toBe(0);
    expect(result.laneByNode.get("c")).toBe(0);
    expect(result.laneByNode.get("m")).toBe(0);
    expect(result.laneByNode.get("n")).toBe(0);
    expect(result.laneByNode.get("d")).toBe(1);
    expect(result.laneByNode.get("e")).toBe(1);
    const mergeNode = result.nodes.find((node) => node.node === "m");
    expect(mergeNode?.lane).toBe(0);
    expect(
      mergeNode?.graphEdges.find((edge) => edge.to === "e"),
    ).toMatchObject({
      fromLane: 0,
      toLane: 1,
      type: "merge",
    });
  });

  test("assigns nested branches to deeper lanes", () => {
    const changesets = [
      makeChangeset("m2", "default", ["b", "m1"]),
      makeChangeset("m1", "feature", ["c", "d"]),
      makeChangeset("d", "subfeature", ["c"]),
      makeChangeset("c", "feature", ["b"]),
      makeChangeset("b", "default", ["a"]),
      makeChangeset("a", "default", []),
    ];

    const result = assignStableBranchLanes(changesets);

    expect(result.laneByNode.get("a")).toBe(0);
    expect(result.laneByNode.get("b")).toBe(0);
    expect(result.laneByNode.get("m2")).toBe(0);
    expect(result.laneByNode.get("c")).toBe(1);
    expect(result.laneByNode.get("m1")).toBe(1);
    expect(result.laneByNode.get("d")).toBe(2);
    expect(result.nodes.find((node) => node.node === "m1")?.lane).toBe(1);
  });

  test("keeps multiple direct branches from default on stable sibling lanes", () => {
    const changesets = [
      makeChangeset("m2", "default", ["d", "f"]),
      makeChangeset("f", "feature-b", ["e"]),
      makeChangeset("e", "feature-b", ["b"]),
      makeChangeset("d", "default", ["c"]),
      makeChangeset("c", "feature-a", ["b"]),
      makeChangeset("b", "default", ["a"]),
      makeChangeset("a", "default", []),
    ];

    const result = assignStableBranchLanes(changesets);

    expect(result.laneByNode.get("c")).toBe(1);
    expect(result.laneByNode.get("e")).toBe(2);
    expect(result.laneByNode.get("f")).toBe(2);
    expect(result.laneByNode.get("d")).toBe(0);
    expect(result.laneByNode.get("m2")).toBe(0);
  });

  test("adding a merge commit does not shift existing lanes", () => {
    const beforeMerge = [
      makeChangeset("e", "feature", ["d"]),
      makeChangeset("d", "feature", ["b"]),
      makeChangeset("c", "default", ["b"]),
      makeChangeset("b", "default", ["a"]),
      makeChangeset("a", "default", []),
    ];
    const afterMerge = [
      makeChangeset("m", "default", ["c", "e"]),
      ...beforeMerge,
    ];

    const before = assignStableBranchLanes(beforeMerge);
    const after = assignStableBranchLanes(afterMerge);

    ["a", "b", "c", "d", "e"].forEach((node) => {
      expect(after.laneByNode.get(node)).toBe(before.laneByNode.get(node));
      expect(after.colorKeyByNode.get(node)).toBe(before.colorKeyByNode.get(node));
    });
    expect(after.laneByNode.get("m")).toBe(0);
  });

  test("keeps color keys stable for existing lanes after new branches appear", () => {
    const before = assignStableBranchLanes([
      makeChangeset("c", "default", ["b"]),
      makeChangeset("b", "default", ["a"]),
      makeChangeset("a", "default", []),
    ]);
    const after = assignStableBranchLanes([
      makeChangeset("f", "feature", ["e"]),
      makeChangeset("e", "feature", ["b"]),
      makeChangeset("c", "default", ["b"]),
      makeChangeset("b", "default", ["a"]),
      makeChangeset("a", "default", []),
    ]);

    expect(after.colorKeyByNode.get("a")).toBe(before.colorKeyByNode.get("a"));
    expect(after.colorKeyByNode.get("b")).toBe(before.colorKeyByNode.get("b"));
    expect(after.colorKeyByNode.get("c")).toBe(before.colorKeyByNode.get("c"));
    expect(after.colorKeyByNode.get("e")).toBe("lane-1");
    expect(after.colorKeyByNode.get("f")).toBe("lane-1");
  });

  test("keeps multiple direct branches from default on distinct stable lanes", () => {
    const result = assignStableBranchLanes([
      makeChangeset("g", "feature-c", ["b"]),
      makeChangeset("f", "feature-b", ["b"]),
      makeChangeset("e", "feature-a", ["b"]),
      makeChangeset("d", "default", ["c"]),
      makeChangeset("c", "default", ["b"]),
      makeChangeset("b", "default", ["a"]),
      makeChangeset("a", "default", []),
    ]);

    expect(result.laneByBranch.get("default")).toBe(0);
    expect(result.laneByBranch.get("feature-a")).toBe(1);
    expect(result.laneByBranch.get("feature-b")).toBe(2);
    expect(result.laneByBranch.get("feature-c")).toBe(3);
  });

  test("merge commit stays on its target branch lane", () => {
    const result = assignStableBranchLanes([
      makeChangeset("m", "default", ["c", "e"]),
      makeChangeset("e", "feature", ["d"]),
      makeChangeset("d", "feature", ["b"]),
      makeChangeset("c", "default", ["b"]),
      makeChangeset("b", "default", ["a"]),
      makeChangeset("a", "default", []),
    ]);

    const mergeNode = result.nodes.find((node) => node.node === "m");

    expect(mergeNode?.lane).toBe(0);
    expect(mergeNode?.laneOwner).toBe("default");
    expect(mergeNode?.reason).toBe("branch-owned:primary");
  });

  test("graph edges stay independent from node lane ownership", () => {
    const result = assignStableBranchLanes([
      makeChangeset("m", "default", ["c", "e"]),
      makeChangeset("e", "feature", ["d"]),
      makeChangeset("d", "feature", ["b"]),
      makeChangeset("c", "default", ["b"]),
      makeChangeset("b", "default", ["a"]),
      makeChangeset("a", "default", []),
    ]);

    const featureHead = result.nodes.find((node) => node.node === "e");
    const mergeNode = result.nodes.find((node) => node.node === "m");

    expect(featureHead?.lane).toBe(1);
    expect(mergeNode?.lane).toBe(0);
    expect(
      mergeNode?.graphEdges.find((edge) => edge.to === "e")?.type,
    ).toBe("merge");
  });
});
