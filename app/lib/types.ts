export type Vertex = {
  x: number;
  y: number;
};

export type Stroke = Vertex[];

export type RectData = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  vertices: Vertex[];
};

export type BWGrid = {
  width: number;
  height: number;
  data: boolean[][];
};

export type NormalizedPoint = {
  x: number;
  y: number;
};

export type DotGrid = {
  width: number;
  height: number;
  points: (NormalizedPoint | null)[][];
};

export type MouseAction = "mouse move" | "mouse left down" | "mouse left up";
export type MouseEventItem = [24, "EM", MouseAction, [string, string]];

export type StrokeSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  d: number;
  strokeIndex: number;
};

export type SegmentsData = {
  segments: StrokeSegment[];
  minD: number;
  maxD: number;
};

export type CanvasSize = {
  width: number;
  height: number;
};
