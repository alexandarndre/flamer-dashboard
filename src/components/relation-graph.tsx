import { useEffect, useRef, useState } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { cn } from '@/lib/utils'
import type { Graph, GraphEdgeKind, GraphNode, GraphNodeKind, GraphTone } from '@/shared/contract'

type SimNode = SimulationNodeDatum & { id: string; node: GraphNode; r: number }
type SimLink = SimulationLinkDatum<SimNode> & { kind: GraphEdgeKind; tone: GraphTone }

const FILL: Record<GraphTone, string> = {
  brand: 'fill-brand',
  danger: 'fill-danger',
  warn: 'fill-warn',
  info: 'fill-info',
  success: 'fill-success',
  muted: 'fill-idle',
}

const STROKE: Record<GraphTone, string> = {
  brand: 'stroke-brand',
  danger: 'stroke-danger',
  warn: 'stroke-warn',
  info: 'stroke-info',
  success: 'stroke-success',
  muted: 'stroke-idle',
}

const DISTANCE: Record<GraphEdgeKind, number> = { crawled: 95, blocked_by: 60, located_in: 70 }

export const KIND_LABEL: Record<GraphNodeKind, string> = {
  run: 'Run',
  domain: 'Domain',
  blocker: 'Blocker',
  country: 'Country',
}

function layout(graph: Graph) {
  const maxWeight = Math.max(1, ...graph.nodes.map((n) => n.weight))
  const nodes: SimNode[] = graph.nodes.map((node) => ({
    id: node.id,
    node,
    r:
      node.kind === 'run'
        ? 14 + Math.sqrt(node.weight / maxWeight) * 10
        : node.kind === 'domain'
          ? 5 + Math.sqrt(node.weight / maxWeight) * 7
          : node.kind === 'blocker'
            ? 9 + Math.min(8, node.weight)
            : 8 + Math.min(8, node.weight / 2),
    ...(node.depth === 0 ? { fx: 0, fy: 0 } : {}),
  }))
  const links: SimLink[] = graph.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, tone: e.tone }))
  forceSimulation(nodes)
    .force(
      'link',
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((l) => DISTANCE[l.kind])
        .strength(0.6),
    )
    .force(
      'charge',
      forceManyBody<SimNode>().strength((d) => -90 - d.r * 9),
    )
    .force(
      'collide',
      forceCollide<SimNode>((d) => d.r + 4),
    )
    .force('x', forceX(0).strength(0.05))
    .force('y', forceY(0).strength(0.05))
    .stop()
    .tick(320)
  const extents = nodes.map((n) => {
    const x = n.x ?? 0
    const y = n.y ?? 0
    if (!labelled(n, nodes.length)) return [x - n.r, x + n.r, y - n.r, y + n.r]
    const label = labelPlacement(n)
    const width = Math.min(30, n.node.label.length) * 6.6
    const left = label.textAnchor === 'start' ? 0 : label.textAnchor === 'middle' ? width / 2 : width
    return [
      Math.min(x - n.r, x + label.x - left),
      Math.max(x + n.r, x + label.x - left + width),
      Math.min(y - n.r, y + label.y - 12),
      Math.max(y + n.r, y + label.y + 4),
    ]
  })
  const pad = 16
  const minX = Math.min(...extents.map((e) => e[0]!)) - pad
  const maxX = Math.max(...extents.map((e) => e[1]!)) + pad
  const minY = Math.min(...extents.map((e) => e[2]!)) - pad
  const maxY = Math.max(...extents.map((e) => e[3]!)) + pad
  return {
    nodes,
    links: links as (SimLink & { source: SimNode; target: SimNode })[],
    viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
  }
}

const labelled = (n: SimNode, total: number) =>
  n.node.kind !== 'domain' || total <= 45 || (n.node.depth !== null && n.node.depth <= 1)

function labelPlacement(n: SimNode) {
  const x = n.x ?? 0
  const y = n.y ?? 0
  const length = Math.hypot(x, y)
  if (n.node.depth === 0 || length < 1 || (n.node.kind === 'run' && n.node.depth === null))
    return { x: 0, y: n.r + 13, textAnchor: 'middle' as const }
  const cos = x / length
  const sin = y / length
  return {
    x: cos * (n.r + 5),
    y: sin * (n.r + 5) + (sin > 0.4 ? 9 : sin < -0.4 ? -2 : 4),
    textAnchor: cos > 0.35 ? ('start' as const) : cos < -0.35 ? ('end' as const) : ('middle' as const),
  }
}

type Point = { x: number; y: number }
type View = Point & { k: number }

function zoomed(v: View, factor: number, at: Point): View {
  const k = Math.min(6, Math.max(0.4, v.k * factor))
  return { k, x: at.x - ((at.x - v.x) * k) / v.k, y: at.y - ((at.y - v.y) * k) / v.k }
}

export function RelationGraph({
  graph,
  onSelect,
  className,
}: {
  graph: Graph
  onSelect: (node: GraphNode) => void
  className?: string
}) {
  const [hover, setHover] = useState<string | null>(null)
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Point | null>(null)
  const { nodes, links, viewBox } = layout(graph)

  const toView = (clientX: number, clientY: number) => {
    const ctm = svgRef.current?.getScreenCTM()
    if (ctm === null || ctm === undefined) return { x: 0, y: 0 }
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  const zoomAt = (factor: number, at: Point) => setView((v) => zoomed(v, factor, at))

  useEffect(() => {
    const svg = svgRef.current
    if (svg === null) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const ctm = svg.getScreenCTM()
      if (ctm === null) return
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
      setView((v) => zoomed(v, Math.exp(-e.deltaY * 0.0015), { x: p.x, y: p.y }))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const near = new Set<string>()
  if (hover !== null) {
    near.add(hover)
    for (const l of links) {
      if (l.source.id === hover) near.add(l.target.id)
      if (l.target.id === hover) near.add(l.source.id)
    }
  }
  const dim = (id: string) => hover !== null && !near.has(id)
  const showLabel = (n: SimNode) => labelled(n, nodes.length) || near.has(n.id)
  const [vx, vy, vw, vh] = viewBox.split(' ').map(Number) as [number, number, number, number]
  const centre = { x: vx + vw / 2, y: vy + vh / 2 }

  return (
    <div className={cn('relative h-full w-full', className)}>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        role="group"
        aria-label="Relationship graph. Tab through items, Enter to focus. Scroll to zoom, drag to pan."
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return
          drag.current = toView(e.clientX, e.clientY)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return
          const p = toView(e.clientX, e.clientY)
          const start = drag.current
          setView((v) => ({ ...v, x: v.x + p.x - start.x, y: v.y + p.y - start.y }))
        }}
        onPointerUp={() => {
          drag.current = null
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g>
            {links.map((l) => (
              <line
                key={`${l.source.id}->${l.target.id}`}
                x1={l.source.x}
                y1={l.source.y}
                x2={l.target.x}
                y2={l.target.y}
                className={cn(STROKE[l.tone], 'pointer-events-none transition-[opacity] duration-300')}
                strokeOpacity={dim(l.source.id) || dim(l.target.id) ? 0.06 : l.kind === 'located_in' ? 0.35 : 0.5}
                strokeWidth={l.kind === 'blocked_by' ? 1.6 : 1.1}
                strokeDasharray={l.kind === 'located_in' ? '3 3' : undefined}
              />
            ))}
          </g>
          <g>
            {nodes.map((n) => (
              <g
                key={n.id}
                role="button"
                tabIndex={0}
                aria-label={`${KIND_LABEL[n.node.kind]} ${n.node.label}. ${n.node.sub}`}
                className="cursor-pointer transition-[transform,opacity] duration-500 ease-out outline-none focus-visible:[&>circle:first-child]:stroke-ring"
                style={{ transform: `translate(${n.x ?? 0}px, ${n.y ?? 0}px)` }}
                opacity={dim(n.id) ? 0.15 : 1}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
                onClick={() => onSelect(n.node)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return
                  e.preventDefault()
                  onSelect(n.node)
                }}
              >
                {n.node.depth === 0 && (
                  <circle r={n.r + 7} className="fill-none stroke-foreground" strokeWidth={2} strokeDasharray="4 3" />
                )}
                {n.node.kind === 'blocker' ? (
                  <rect
                    x={-n.r}
                    y={-n.r}
                    width={n.r * 2}
                    height={n.r * 2}
                    rx={4}
                    transform="rotate(45)"
                    className="fill-danger/20 stroke-danger"
                    strokeWidth={1.5}
                  />
                ) : n.node.kind === 'country' ? (
                  <circle
                    r={n.r}
                    className="fill-card stroke-muted-foreground"
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                ) : (
                  <circle
                    r={n.r}
                    className={cn(FILL[n.node.tone], 'stroke-card')}
                    strokeWidth={n.node.kind === 'run' ? 3 : 1.5}
                  />
                )}
                {showLabel(n) && (
                  <text
                    {...labelPlacement(n)}
                    className={cn(
                      'pointer-events-none fill-foreground stroke-background text-[11px] [paint-order:stroke]',
                      n.node.kind === 'run' && 'text-[12px] font-semibold',
                      n.node.kind === 'domain' && 'fill-muted-foreground',
                    )}
                    strokeWidth={3}
                  >
                    {n.node.label.length > 30 ? `${n.node.label.slice(0, 29)}…` : n.node.label}
                  </text>
                )}
                <title>{`${KIND_LABEL[n.node.kind]}: ${n.node.label}\n${n.node.sub}`}</title>
              </g>
            ))}
          </g>
        </g>
      </svg>
      <div className="absolute top-2 right-2 flex flex-col overflow-hidden rounded-md border bg-background/90 shadow-sm">
        <button
          type="button"
          aria-label="Zoom in"
          className="px-2 py-1 hover:bg-muted"
          onClick={() => zoomAt(1.3, centre)}
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          className="border-t px-2 py-1 hover:bg-muted"
          onClick={() => zoomAt(1 / 1.3, centre)}
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          className="border-t px-2 py-1 hover:bg-muted"
          onClick={() => setView({ k: 1, x: 0, y: 0 })}
        >
          <Maximize className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
