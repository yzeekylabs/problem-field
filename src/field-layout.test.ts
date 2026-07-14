import { describe, expect, it } from "vitest";

import type { FieldNode } from "./components/FieldCardNode.tsx";
import { getConnectionHandles, getGroupedNodes, getObstacleAvoidingRoute, type CanvasPoint } from "./field-layout.ts";
import type { FieldConnection } from "./shared/workspace.ts";

function node(id: string, x: number, y: number): FieldNode {
  const now = "2026-07-14T00:00:00.000Z";
  return {
    id,
    type: "fieldCard",
    position: { x, y },
    measured: { width: 252, height: 180 },
    data: {
      card: {
        id,
        kind: id.startsWith("evidence") ? "evidence" : "pattern",
        title: id,
        body: "",
        position: { x, y },
        createdBy: "human",
        createdAt: now,
        updatedAt: now,
      },
    },
  };
}

function connection(from: string, to: string): FieldConnection {
  return { id: `${from}-${to}`, from, to, kind: "supports" };
}

function crossesNode(start: CanvasPoint, end: CanvasPoint, obstacle: FieldNode) {
  const width = obstacle.measured?.width ?? 252;
  const height = obstacle.measured?.height ?? 180;
  const left = obstacle.position.x;
  const right = left + width;
  const top = obstacle.position.y;
  const bottom = top + height;
  if (start.y === end.y) {
    return start.y > top && start.y < bottom
      && Math.max(Math.min(start.x, end.x), left) < Math.min(Math.max(start.x, end.x), right);
  }
  return start.x > left && start.x < right
    && Math.max(Math.min(start.y, end.y), top) < Math.min(Math.max(start.y, end.y), bottom);
}

describe("canvas layout", () => {
  it("lays a directed evidence graph from left to right without mutating custom positions", () => {
    const nodes = [node("evidence-a", 700, 400), node("evidence-b", -200, 80), node("pattern-a", -600, -300)];
    const originalPositions = nodes.map((item) => ({ ...item.position }));
    const grouped = getGroupedNodes(nodes, [connection("evidence-a", "pattern-a"), connection("evidence-b", "pattern-a")]);
    const pattern = grouped.find((item) => item.id === "pattern-a")!;

    expect(grouped.filter((item) => item.id.startsWith("evidence")).every((item) => item.position.x < pattern.position.x)).toBe(true);
    expect(nodes.map((item) => item.position)).toEqual(originalPositions);
  });

  it("connects horizontally from the nearest opposing card sides", () => {
    expect(getConnectionHandles(node("evidence-a", 600, 0), node("pattern-a", 0, 20))).toEqual({
      sourceHandle: "left",
      targetHandle: "right",
    });
  });

  it("connects vertically when the vertical distance dominates", () => {
    expect(getConnectionHandles(node("evidence-a", 20, 600), node("pattern-a", 0, 0))).toEqual({
      sourceHandle: "top",
      targetHandle: "bottom",
    });
  });

  it("routes around an unrelated card instead of drawing through it", () => {
    const source = node("evidence-a", 0, 0);
    const obstacle = node("pattern-blocker", 320, 0);
    const target = node("pattern-target", 640, 0);
    const route = getObstacleAvoidingRoute(source, target, [source, obstacle, target]);

    expect(route.points.length).toBeGreaterThan(2);
    for (let index = 1; index < route.points.length; index += 1) {
      expect(crossesNode(route.points[index - 1], route.points[index], obstacle)).toBe(false);
    }
  });

  it("keeps each relationship out of every unrelated card in a grouped cluster", () => {
    const evidence = [
      node("evidence-left", 0, 0),
      node("evidence-middle", 320, 0),
      node("evidence-right", 640, 0),
    ];
    const pattern = node("pattern-target", 320, 440);
    const nodes = [...evidence, pattern];

    for (const source of evidence) {
      const route = getObstacleAvoidingRoute(source, pattern, nodes);
      for (const obstacle of nodes.filter((item) => item.id !== source.id && item.id !== pattern.id)) {
        for (let index = 1; index < route.points.length; index += 1) {
          expect(crossesNode(route.points[index - 1], route.points[index], obstacle)).toBe(false);
        }
      }
    }
  });

  it("packs disconnected relationship islands instead of making one very long rank", () => {
    const nodes = [
      ...Array.from({ length: 6 }, (_, index) => node(`evidence-large-${index}`, index * 20, index * 30)),
      node("pattern-large-a", 0, 0),
      node("pattern-large-b", 0, 0),
      ...Array.from({ length: 3 }, (_, index) => node(`evidence-small-${index}`, index * 20, index * 30)),
      node("pattern-small", 0, 0),
    ];
    const connections = [
      ...Array.from({ length: 6 }, (_, index) => connection(`evidence-large-${index}`, index < 3 ? "pattern-large-a" : "pattern-large-b")),
      ...Array.from({ length: 3 }, (_, index) => connection(`evidence-small-${index}`, "pattern-small")),
    ];
    const grouped = getGroupedNodes(nodes, connections);
    const xs = grouped.map((item) => item.position.x);
    const ys = grouped.map((item) => item.position.y);

    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1_800);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(500);
  });
});
