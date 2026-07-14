import dagre from "@dagrejs/dagre";

import type { FieldNode } from "./components/FieldCardNode.tsx";
import type { FieldConnection } from "./shared/workspace.ts";

export type CanvasLayoutMode = "custom" | "grouped";
export type HandleSide = "top" | "right" | "bottom" | "left";
export type CanvasPoint = { x: number; y: number };

export type RoutedConnection = {
  sourceHandle: HandleSide;
  targetHandle: HandleSide;
  points: CanvasPoint[];
};

const fallbackNodeWidth = 252;
const fallbackNodeHeight = 210;
const islandGap = 112;
const islandPadding = 36;
const routingClearances = [28, 20, 12, 6, 2, 0] as const;
const routingTurnPenalty = 56;
const epsilon = 0.01;

type CanvasRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type RouteResult = {
  points: CanvasPoint[];
  cost: number;
};

export function interpolateNodePositions(fromNodes: FieldNode[], toNodes: FieldNode[], progress: number) {
  const boundedProgress = Math.min(1, Math.max(0, progress));
  const fromById = new Map(fromNodes.map((node) => [node.id, node.position]));
  return toNodes.map((node) => {
    const from = fromById.get(node.id) ?? node.position;
    return {
      ...node,
      position: {
        x: from.x + (node.position.x - from.x) * boundedProgress,
        y: from.y + (node.position.y - from.y) * boundedProgress,
      },
    };
  });
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function subdivideRoute(points: CanvasPoint[], segmentCount: number) {
  const sourceSegments = Math.max(1, points.length - 1);
  const divisionsPerSegment = Math.max(1, segmentCount / sourceSegments);
  const result: CanvasPoint[] = [];
  for (let index = 0; index < sourceSegments; index += 1) {
    const start = points[index] ?? points[0];
    const end = points[index + 1] ?? start;
    for (let division = 0; division < divisionsPerSegment; division += 1) {
      const progress = division / divisionsPerSegment;
      result.push({
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

export function interpolateRoutePoints(fromPoints: CanvasPoint[], toPoints: CanvasPoint[], progress: number) {
  if (fromPoints.length < 2) return toPoints.map((point) => ({ ...point }));
  if (toPoints.length < 2) return fromPoints.map((point) => ({ ...point }));
  const fromSegments = fromPoints.length - 1;
  const toSegments = toPoints.length - 1;
  const segmentCount = (fromSegments * toSegments) / greatestCommonDivisor(fromSegments, toSegments);
  const from = subdivideRoute(fromPoints, segmentCount);
  const to = subdivideRoute(toPoints, segmentCount);
  const boundedProgress = Math.min(1, Math.max(0, progress));
  return to.map((point, index) => ({
    x: from[index].x + (point.x - from[index].x) * boundedProgress,
    y: from[index].y + (point.y - from[index].y) * boundedProgress,
  }));
}

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

function nodeRect(node: FieldNode, padding = 0): CanvasRect {
  const size = dimensions(node);
  return {
    left: node.position.x - padding,
    right: node.position.x + size.width + padding,
    top: node.position.y - padding,
    bottom: node.position.y + size.height + padding,
  };
}

function port(node: FieldNode, side: HandleSide): CanvasPoint {
  const size = dimensions(node);
  switch (side) {
    case "top": return { x: node.position.x + size.width / 2, y: node.position.y };
    case "right": return { x: node.position.x + size.width, y: node.position.y + size.height / 2 };
    case "bottom": return { x: node.position.x + size.width / 2, y: node.position.y + size.height };
    case "left": return { x: node.position.x, y: node.position.y + size.height / 2 };
  }
}

function escape(point: CanvasPoint, side: HandleSide, distance: number): CanvasPoint {
  switch (side) {
    case "top": return { x: point.x, y: point.y - distance };
    case "right": return { x: point.x + distance, y: point.y };
    case "bottom": return { x: point.x, y: point.y + distance };
    case "left": return { x: point.x - distance, y: point.y };
  }
}

function pointInsideRect(point: CanvasPoint, rect: CanvasRect) {
  return point.x > rect.left + epsilon
    && point.x < rect.right - epsilon
    && point.y > rect.top + epsilon
    && point.y < rect.bottom - epsilon;
}

function segmentCrossesRectInterior(start: CanvasPoint, end: CanvasPoint, rect: CanvasRect) {
  if (Math.abs(start.y - end.y) < epsilon) {
    if (start.y <= rect.top + epsilon || start.y >= rect.bottom - epsilon) return false;
    const segmentLeft = Math.min(start.x, end.x);
    const segmentRight = Math.max(start.x, end.x);
    return Math.max(segmentLeft, rect.left) < Math.min(segmentRight, rect.right) - epsilon;
  }
  if (Math.abs(start.x - end.x) < epsilon) {
    if (start.x <= rect.left + epsilon || start.x >= rect.right - epsilon) return false;
    const segmentTop = Math.min(start.y, end.y);
    const segmentBottom = Math.max(start.y, end.y);
    return Math.max(segmentTop, rect.top) < Math.min(segmentBottom, rect.bottom) - epsilon;
  }
  return true;
}

function segmentIsClear(start: CanvasPoint, end: CanvasPoint, obstacles: CanvasRect[]) {
  return obstacles.every((rect) => !segmentCrossesRectInterior(start, end, rect));
}

function uniqueCoordinates(values: number[]) {
  return values
    .sort((a, b) => a - b)
    .filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) >= epsilon);
}

function simplifyRoute(points: CanvasPoint[]) {
  const distinct = points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || Math.abs(point.x - previous.x) >= epsilon || Math.abs(point.y - previous.y) >= epsilon;
  });
  return distinct.filter((point, index) => {
    if (index === 0 || index === distinct.length - 1) return true;
    const previous = distinct[index - 1];
    const next = distinct[index + 1];
    const sameX = Math.abs(previous.x - point.x) < epsilon && Math.abs(point.x - next.x) < epsilon;
    const sameY = Math.abs(previous.y - point.y) < epsilon && Math.abs(point.y - next.y) < epsilon;
    return !sameX && !sameY;
  });
}

function pushHeap(heap: Array<{ state: number; cost: number }>, entry: { state: number; cost: number }) {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].cost <= heap[index].cost) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function popHeap(heap: Array<{ state: number; cost: number }>) {
  const first = heap[0];
  const last = heap.pop();
  if (!first || !last || heap.length === 0) return first;
  heap[0] = last;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    let smallest = index;
    if (left < heap.length && heap[left].cost < heap[smallest].cost) smallest = left;
    if (right < heap.length && heap[right].cost < heap[smallest].cost) smallest = right;
    if (smallest === index) break;
    [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
    index = smallest;
  }
  return first;
}

function findOrthogonalRoute(start: CanvasPoint, end: CanvasPoint, obstacles: CanvasRect[]): RouteResult | null {
  const xs = uniqueCoordinates([start.x, end.x, ...obstacles.flatMap((rect) => [rect.left, rect.right])]);
  const ys = uniqueCoordinates([start.y, end.y, ...obstacles.flatMap((rect) => [rect.top, rect.bottom])]);
  const width = xs.length;
  const pointCount = width * ys.length;
  const points = Array.from({ length: pointCount }, (_, index) => ({
    x: xs[index % width],
    y: ys[Math.floor(index / width)],
  }));
  const startX = xs.findIndex((value) => Math.abs(value - start.x) < epsilon);
  const startY = ys.findIndex((value) => Math.abs(value - start.y) < epsilon);
  const endX = xs.findIndex((value) => Math.abs(value - end.x) < epsilon);
  const endY = ys.findIndex((value) => Math.abs(value - end.y) < epsilon);
  if (startX < 0 || startY < 0 || endX < 0 || endY < 0) return null;
  const startIndex = startY * width + startX;
  const endIndex = endY * width + endX;
  const blocked = points.map((point, index) => (
    index !== startIndex && index !== endIndex && obstacles.some((rect) => pointInsideRect(point, rect))
  ));

  // Direction states are horizontal, vertical, and an initial directionless state.
  const distance = new Float64Array(pointCount * 3);
  distance.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(pointCount * 3);
  previous.fill(-1);
  const startState = startIndex * 3 + 2;
  distance[startState] = 0;
  const heap: Array<{ state: number; cost: number }> = [];
  pushHeap(heap, { state: startState, cost: 0 });

  while (heap.length > 0) {
    const current = popHeap(heap);
    if (!current || current.cost > distance[current.state] + epsilon) continue;
    const pointIndex = Math.floor(current.state / 3);
    const direction = current.state % 3;
    const xIndex = pointIndex % width;
    const yIndex = Math.floor(pointIndex / width);
    const neighbours = [
      { x: xIndex - 1, y: yIndex, direction: 0 },
      { x: xIndex + 1, y: yIndex, direction: 0 },
      { x: xIndex, y: yIndex - 1, direction: 1 },
      { x: xIndex, y: yIndex + 1, direction: 1 },
    ];

    for (const neighbour of neighbours) {
      if (neighbour.x < 0 || neighbour.x >= width || neighbour.y < 0 || neighbour.y >= ys.length) continue;
      const neighbourIndex = neighbour.y * width + neighbour.x;
      if (blocked[neighbourIndex]) continue;
      const from = points[pointIndex];
      const to = points[neighbourIndex];
      if (!segmentIsClear(from, to, obstacles)) continue;
      const length = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
      const bend = direction !== 2 && direction !== neighbour.direction ? routingTurnPenalty : 0;
      const nextState = neighbourIndex * 3 + neighbour.direction;
      const nextCost = current.cost + length + bend;
      if (nextCost + epsilon >= distance[nextState]) continue;
      distance[nextState] = nextCost;
      previous[nextState] = current.state;
      pushHeap(heap, { state: nextState, cost: nextCost });
    }
  }

  const endStates = [endIndex * 3, endIndex * 3 + 1, endIndex * 3 + 2];
  const endState = endStates.reduce((best, state) => distance[state] < distance[best] ? state : best);
  if (!Number.isFinite(distance[endState])) return null;
  const reversed: CanvasPoint[] = [];
  let state = endState;
  while (state >= 0) {
    reversed.push(points[Math.floor(state / 3)]);
    if (state === startState) break;
    state = previous[state];
  }
  if (state !== startState) return null;
  return { points: simplifyRoute(reversed.reverse()), cost: distance[endState] };
}

function candidateHandles(source: FieldNode, target: FieldNode, preferred: ReturnType<typeof getConnectionHandles>) {
  const sourceCenter = center(source);
  const targetCenter = center(target);
  const horizontal = targetCenter.x >= sourceCenter.x
    ? { sourceHandle: "right" as const, targetHandle: "left" as const }
    : { sourceHandle: "left" as const, targetHandle: "right" as const };
  const vertical = targetCenter.y >= sourceCenter.y
    ? { sourceHandle: "bottom" as const, targetHandle: "top" as const }
    : { sourceHandle: "top" as const, targetHandle: "bottom" as const };
  const reverseHorizontal = horizontal.sourceHandle === "right"
    ? { sourceHandle: "left" as const, targetHandle: "right" as const }
    : { sourceHandle: "right" as const, targetHandle: "left" as const };
  const reverseVertical = vertical.sourceHandle === "bottom"
    ? { sourceHandle: "top" as const, targetHandle: "bottom" as const }
    : { sourceHandle: "bottom" as const, targetHandle: "top" as const };
  const candidates = [preferred, horizontal, vertical, reverseHorizontal, reverseVertical];
  return candidates.filter((candidate, index) => candidates.findIndex((other) => (
    other.sourceHandle === candidate.sourceHandle && other.targetHandle === candidate.targetHandle
  )) === index);
}

export function getObstacleAvoidingRoute(
  source: FieldNode,
  target: FieldNode,
  nodes: FieldNode[],
  fixedHandles?: { sourceHandle: HandleSide; targetHandle: HandleSide },
): RoutedConnection {
  const preferred = fixedHandles ?? getConnectionHandles(source, target);
  let best: (RoutedConnection & { cost: number }) | null = null;

  for (const clearance of routingClearances) {
    const obstacles = nodes.map((node) => nodeRect(node, clearance));
    const handlesToTry = fixedHandles ? [fixedHandles] : candidateHandles(source, target, preferred);
    for (const handles of handlesToTry) {
      const sourcePort = port(source, handles.sourceHandle);
      const targetPort = port(target, handles.targetHandle);
      const sourceEscape = escape(sourcePort, handles.sourceHandle, clearance);
      const targetEscape = escape(targetPort, handles.targetHandle, clearance);
      const routed = findOrthogonalRoute(sourceEscape, targetEscape, obstacles);
      if (!routed) continue;
      const points = simplifyRoute([sourcePort, ...routed.points, targetPort]);
      const preferencePenalty = handles.sourceHandle === preferred.sourceHandle ? 0 : routingTurnPenalty;
      const candidate = { ...handles, points, cost: routed.cost + clearance * 2 + preferencePenalty };
      if (!best || candidate.cost < best.cost) best = candidate;
    }
    if (best) break;
  }

  if (best) {
    return {
      sourceHandle: best.sourceHandle,
      targetHandle: best.targetHandle,
      points: best.points,
    };
  }

  const sourcePort = port(source, preferred.sourceHandle);
  const targetPort = port(target, preferred.targetHandle);
  return { ...preferred, points: [sourcePort, targetPort] };
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
