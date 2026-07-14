import dagre from "@dagrejs/dagre";

import type { FieldNode } from "./components/FieldCardNode.tsx";
import type { FieldConnection } from "./shared/workspace.ts";

export type CanvasLayoutMode = "custom" | "grouped";
export type HandleSide = "top" | "right" | "bottom" | "left";

const fallbackNodeWidth = 252;
const fallbackNodeHeight = 210;
const islandGap = 112;
const islandPadding = 36;

function dimensions(node: FieldNode) {
  return {
    width: node.measured?.width ?? node.width ?? fallbackNodeWidth,
    height: node.measured?.height ?? node.height ?? fallbackNodeHeight,
  };
}

function center(node: FieldNode) {
  const size = dimensions(node);
  return {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2,
  };
}

export function getConnectionHandles(source: FieldNode, target: FieldNode): {
  sourceHandle: HandleSide;
  targetHandle: HandleSide;
} {
  const sourceCenter = center(source);
  const targetCenter = center(target);
  const horizontalDistance = targetCenter.x - sourceCenter.x;
  const verticalDistance = targetCenter.y - sourceCenter.y;

  if (Math.abs(horizontalDistance) >= Math.abs(verticalDistance)) {
    return horizontalDistance >= 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" };
  }

  return verticalDistance >= 0
    ? { sourceHandle: "bottom", targetHandle: "top" }
    : { sourceHandle: "top", targetHandle: "bottom" };
}

export function getGroupedNodes(nodes: FieldNode[], connections: FieldConnection[]): FieldNode[] {
  if (nodes.length < 2) return nodes.map((node) => ({ ...node }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  const validConnections = connections.filter(
    (connection) => nodeIds.has(connection.from) && nodeIds.has(connection.to),
  );

  for (const connection of validConnections) {
    adjacency.get(connection.from)?.add(connection.to);
    adjacency.get(connection.to)?.add(connection.from);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const component: string[] = [];
    const queue = [node.id];
    visited.add(node.id);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      component.push(current);
      for (const neighbour of adjacency.get(current) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }
    components.push(component);
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const islands = components.map((componentIds) => {
    const componentIdSet = new Set(componentIds);
    const graph = new dagre.graphlib.Graph({ multigraph: true })
      .setDefaultEdgeLabel(() => ({}))
      .setGraph({
        rankdir: componentIds.length >= 4 ? "TB" : "LR",
        ranker: "network-simplex",
        acyclicer: "greedy",
        align: "UL",
        nodesep: 46,
        edgesep: 28,
        ranksep: 118,
      });

    for (const id of componentIds) {
      const node = nodeById.get(id);
      if (node) graph.setNode(id, dimensions(node));
    }
    for (const connection of validConnections) {
      if (componentIdSet.has(connection.from) && componentIdSet.has(connection.to)) {
        graph.setEdge(connection.from, connection.to, {}, connection.id);
      }
    }

    dagre.layout(graph);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const id of componentIds) {
      const node = nodeById.get(id);
      const laidOut = graph.node(id) as { x: number; y: number } | undefined;
      if (!node || !laidOut) continue;
      const size = dimensions(node);
      minX = Math.min(minX, laidOut.x - size.width / 2);
      minY = Math.min(minY, laidOut.y - size.height / 2);
      maxX = Math.max(maxX, laidOut.x + size.width / 2);
      maxY = Math.max(maxY, laidOut.y + size.height / 2);
    }

    const width = maxX - minX + islandPadding * 2;
    const height = maxY - minY + islandPadding * 2;
    const positions = new Map<string, { x: number; y: number }>();
    for (const id of componentIds) {
      const node = nodeById.get(id);
      const laidOut = graph.node(id) as { x: number; y: number } | undefined;
      if (!node || !laidOut) continue;
      const size = dimensions(node);
      positions.set(id, {
        x: laidOut.x - size.width / 2 - minX + islandPadding,
        y: laidOut.y - size.height / 2 - minY + islandPadding,
      });
    }

    return { width, height, positions };
  });

  islands.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const packingWidth = Math.max(1_700, ...islands.map((island) => island.width));
  const groupedPositions = new Map<string, { x: number; y: number }>();
  let cursorX = 48;
  let cursorY = 48;
  let rowHeight = 0;

  for (const island of islands) {
    if (cursorX > 48 && cursorX + island.width > packingWidth + 48) {
      cursorX = 48;
      cursorY += rowHeight + islandGap;
      rowHeight = 0;
    }
    for (const [id, position] of island.positions) {
      groupedPositions.set(id, { x: cursorX + position.x, y: cursorY + position.y });
    }
    cursorX += island.width + islandGap;
    rowHeight = Math.max(rowHeight, island.height);
  }

  return nodes.map((node) => {
    const position = groupedPositions.get(node.id);
    return {
      ...node,
      position: position ?? node.position,
    };
  });
}
