"use client";

import { useEffect, useRef, useState } from "react";

// Two swagged strands of fairy lights across the top of the page. The SVG is
// drawn at the container's real pixel width (never stretched), so bulbs stay
// round and evenly spaced at any screen size.

const HEIGHT = 140; // desktop height in px; curves below are designed for this
const MOBILE_SCALE = 0.8; // vertical scale under 640px wide
const SPACING = 55; // px between bulbs along each wire
const WIRE = "#1C140E";

// x as a fraction of width, y in px at desktop height.
type Strand = { from: [number, number]; control: [number, number]; to: [number, number] };
const FRONT: Strand = { from: [-0.03, 10], control: [0.44, 110], to: [1.03, 30] };
const BACK: Strand = { from: [-0.03, 80], control: [0.47, 190], to: [1.03, 45] };

type Point = { x: number; y: number };
type Bulb = { wire: Point; drop: number; duration: number; delay: number };

// Deterministic pseudo-random in [0, 1) per bulb, so bulbs keep their
// character across resizes and renders.
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function curve(strand: Strand, width: number, scale: number) {
  const p0 = { x: strand.from[0] * width, y: strand.from[1] * scale };
  const c = { x: strand.control[0] * width, y: strand.control[1] * scale };
  const p1 = { x: strand.to[0] * width, y: strand.to[1] * scale };
  const at = (t: number): Point => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t ** 2 * p1.x,
    y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * c.y + t ** 2 * p1.y,
  });
  const d = `M ${p0.x} ${p0.y} Q ${c.x} ${c.y} ${p1.x} ${p1.y}`;
  return { at, d };
}

// Points every `spacing` px of arc length, starting `offset` px along.
function pointsAlong(at: (t: number) => Point, spacing: number, offset: number): Point[] {
  const SAMPLES = 600;
  const points: Point[] = [];
  let prev = at(0);
  let travelled = 0;
  let next = offset;
  for (let i = 1; i <= SAMPLES; i++) {
    const p = at(i / SAMPLES);
    const step = Math.hypot(p.x - prev.x, p.y - prev.y);
    while (travelled + step >= next) {
      const f = step === 0 ? 0 : (next - travelled) / step;
      points.push({ x: prev.x + (p.x - prev.x) * f, y: prev.y + (p.y - prev.y) * f });
      next += spacing;
    }
    travelled += step;
    prev = p;
  }
  return points;
}

function bulbsFor(at: (t: number) => Point, offset: number, seedBase: number): Bulb[] {
  return pointsAlong(at, SPACING, offset).map((wire, i) => {
    const seed = seedBase + i;
    return {
      wire,
      drop: 4 + rand(seed) * 2, // 4-6px stem
      duration: 3 + rand(seed + 0.5) * 3, // 3-6s
      delay: -rand(seed + 0.25) * 6, // negative: start mid-cycle
    };
  });
}

export function FairyLights() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = width > 0 && width < 640 ? MOBILE_SCALE : 1;
  const height = Math.round(HEIGHT * scale);
  const front = curve(FRONT, width, scale);
  const back = curve(BACK, width, scale);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none w-full"
      style={{ height: `${height}px` }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block overflow-visible"
        >
          <defs>
            <radialGradient id="fairy-glow">
              <stop offset="0" stopColor="#FFD27A" stopOpacity="0.75" />
              <stop offset="0.45" stopColor="#F5C05A" stopOpacity="0.3" />
              <stop offset="1" stopColor="#F5C05A" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g opacity={0.7}>
            <Strand d={back.d} bulbs={bulbsFor(back.at, SPACING, 1000)} />
          </g>
          <Strand d={front.d} bulbs={bulbsFor(front.at, SPACING / 2, 0)} />
        </svg>
      )}
    </div>
  );
}

function Strand({ d, bulbs }: { d: string; bulbs: Bulb[] }) {
  return (
    <g>
      <path d={d} fill="none" stroke={WIRE} strokeWidth={1.2} />
      {bulbs.map((b, i) => {
        const cy = b.wire.y + b.drop;
        return (
          <g key={i}>
            <line x1={b.wire.x} y1={b.wire.y} x2={b.wire.x} y2={cy} stroke={WIRE} strokeWidth={1} />
            <g
              className="fairy-bulb"
              style={{ animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` }}
            >
              <circle cx={b.wire.x} cy={cy} r={16} fill="url(#fairy-glow)" />
              <circle cx={b.wire.x} cy={cy} r={3.6} fill="#FFE6A8" />
            </g>
          </g>
        );
      })}
    </g>
  );
}
