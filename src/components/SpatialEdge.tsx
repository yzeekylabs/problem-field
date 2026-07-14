import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";

import type { CanvasPoint } from "../field-layout.ts";

type SpatialEdgeData = Record<string, unknown> & {
  points: CanvasPoint[];
};

export type SpatialFieldEdge = Edge<SpatialEdgeData, "spatial">;

function distance(a: CanvasPoint, b: CanvasPoint) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function pointTowards(from: CanvasPoint, to: CanvasPoint, amount: number): CanvasPoint {
  const segmentLength = distance(from, to);
  if (segmentLength === 0) return from;
  const ratio = amount / segmentLength;
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}

function roundedPath(points: CanvasPoint[], radius = 14) {
  if (points.length < 2) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const cornerRadius = Math.min(radius, distance(previous, corner) / 2, distance(corner, next) / 2);
    const before = pointTowards(corner, previous, cornerRadius);
    const after = pointTowards(corner, next, cornerRadius);
    path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

function midpoint(points: CanvasPoint[]) {
  const lengths = points.slice(1).map((point, index) => distance(points[index], point));
  const halfway = lengths.reduce((sum, length) => sum + length, 0) / 2;
  let travelled = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    if (travelled + lengths[index] >= halfway) {
      return pointTowards(points[index], points[index + 1], halfway - travelled);
    }
    travelled += lengths[index];
  }
  return points[Math.floor(points.length / 2)];
}

export function SpatialEdge({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  markerStart,
  interactionWidth,
  label,
  labelBgBorderRadius,
  labelBgPadding,
  labelBgStyle,
  labelShowBg,
  labelStyle,
  style,
}: EdgeProps<SpatialFieldEdge>) {
  const storedPoints = data?.points ?? [];
  const points = storedPoints.length >= 2
    ? [
        { x: sourceX, y: sourceY },
        ...storedPoints.slice(1, -1),
        { x: targetX, y: targetY },
      ]
    : [{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }];
  const labelPoint = midpoint(points);

  return (
    <BaseEdge
      id={id}
      interactionWidth={interactionWidth}
      label={label}
      labelBgBorderRadius={labelBgBorderRadius}
      labelBgPadding={labelBgPadding}
      labelBgStyle={labelBgStyle}
      labelShowBg={labelShowBg}
      labelStyle={labelStyle}
      labelX={labelPoint.x}
      labelY={labelPoint.y}
      markerEnd={markerEnd}
      markerStart={markerStart}
      path={roundedPath(points)}
      style={style}
    />
  );
}
