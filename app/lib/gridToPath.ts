import type {
  BWGrid,
  DotGrid,
  NormalizedPoint,
  MouseAction,
  MouseEventItem,
  RectData,
  Stroke,
  Vertex,
} from "./types";

function formatPercent(value: number) {
  return `${Number(value.toFixed(6))}%`;
}

export function bwGridToDotGrid(grid: BWGrid, blockSize = 3): DotGrid {
  const dotWidth = Math.ceil(grid.width / blockSize);
  const dotHeight = Math.ceil(grid.height / blockSize);
  const points: (NormalizedPoint | null)[][] = Array.from(
    { length: dotHeight },
    () => Array.from({ length: dotWidth }, () => null)
  );

  for (let by = 0; by < dotHeight; by += 1) {
    for (let bx = 0; bx < dotWidth; bx += 1) {
      const startX = bx * blockSize;
      const startY = by * blockSize;
      const endX = Math.min(startX + blockSize, grid.width);
      const endY = Math.min(startY + blockSize, grid.height);

      let sumX = 0;
      let sumY = 0;
      let count = 0;

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          if (!grid.data[y][x]) {
            continue;
          }
          sumX += x + 0.5;
          sumY += y + 0.5;
          count += 1;
        }
      }

      if (count > 0) {
        const avgX = sumX / count;
        const avgY = sumY / count;
        points[by][bx] = {
          x: avgX / grid.width,
          y: avgY / grid.height,
        };
      }
    }
  }

  return {
    width: dotWidth,
    height: dotHeight,
    points,
  };
}

export function dotGridToStrokesAndEvents(
  dotGrid: DotGrid,
  rect: RectData
): {
  strokes: Stroke[];
  events: MouseEventItem[];
} {
  const visited: boolean[][] = Array.from({ length: dotGrid.height }, () =>
    Array.from({ length: dotGrid.width }, () => false)
  );

  const strokes: Stroke[] = [];
  const events: MouseEventItem[] = [];

  const neighbors = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];

  const rectWidth = rect.maxX - rect.minX;
  const rectHeight = rect.maxY - rect.minY;

  const toVertex = (point: NormalizedPoint): Vertex => ({
    x: rect.minX + point.x * rectWidth,
    y: rect.minY + point.y * rectHeight,
  });

  const pushStroke = (stroke: Stroke) => {
    if (stroke.length === 0) {
      return;
    }

    strokes.push(stroke);

    if (events.length > 0) {
      const start = stroke[0];
      events.push([
        24,
        "EM",
        "mouse move",
        [formatPercent(start.x), formatPercent(start.y)],
      ]);
    }

    if (stroke.length === 1) {
      const point = stroke[0];
      events.push([
        24,
        "EM",
        "mouse left down",
        [formatPercent(point.x), formatPercent(point.y)],
      ]);
      events.push([
        24,
        "EM",
        "mouse left up",
        [formatPercent(point.x), formatPercent(point.y)],
      ]);
      return;
    }

    for (let i = 0; i < stroke.length; i += 1) {
      const point = stroke[i];
      const action: MouseAction =
        i === 0
          ? "mouse left down"
          : i === stroke.length - 1
            ? "mouse left up"
            : "mouse move";
      events.push([
        24,
        "EM",
        action,
        [formatPercent(point.x), formatPercent(point.y)],
      ]);
    }
  };

  for (let sy = 0; sy < dotGrid.height; sy += 1) {
    for (let sx = 0; sx < dotGrid.width; sx += 1) {
      const startPoint = dotGrid.points[sy][sx];
      if (!startPoint || visited[sy][sx]) {
        continue;
      }

      const stack: { x: number; y: number; dir: number }[] = [];
      let currentStroke: Stroke = [];

      visited[sy][sx] = true;
      stack.push({ x: sx, y: sy, dir: 0 });

      while (stack.length > 0) {
        const current = stack[stack.length - 1];
        let moved = false;

        while (current.dir < neighbors.length) {
          const [dx, dy] = neighbors[current.dir];
          current.dir += 1;
          const nx = current.x + dx;
          const ny = current.y + dy;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= dotGrid.width ||
            ny >= dotGrid.height ||
            visited[ny][nx] ||
            !dotGrid.points[ny][nx]
          ) {
            continue;
          }

          if (currentStroke.length === 0) {
            const currentPoint = dotGrid.points[current.y][current.x];
            if (currentPoint) {
              currentStroke.push(toVertex(currentPoint));
            }
          }

          const nextPoint = dotGrid.points[ny][nx];
          if (nextPoint) {
            currentStroke.push(toVertex(nextPoint));
          }

          visited[ny][nx] = true;
          stack.push({ x: nx, y: ny, dir: 0 });
          moved = true;
          break;
        }

        if (!moved) {
          if (currentStroke.length > 0) {
            pushStroke(currentStroke);
            currentStroke = [];
          } else if (stack.length === 1) {
            const lone = dotGrid.points[current.y][current.x];
            if (lone) {
              pushStroke([toVertex(lone)]);
            }
          }

          stack.pop();
        }
      }
    }
  }

  return { strokes, events };
}
