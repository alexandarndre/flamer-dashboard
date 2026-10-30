import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { clock, num, short } from '@/lib/format'
import type { ThroughputPoint } from '@/shared/contract'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SectionCard } from './blocks'

const config = {
  pages: { label: 'Pages & files fetched', color: 'var(--chart-1)' },
  published: { label: 'Documents published', color: 'var(--chart-2)' },
} satisfies ChartConfig

type Series = keyof typeof config

export function ThroughputChart({ points, title = 'Crawl speed' }: { points: ThroughputPoint[]; title?: string }) {
  const [series, setSeries] = useState<Series>('pages')
  const total = points.reduce((n, p) => n + p[series], 0)
  const recent = points.slice(-6, -1)
  const perMin = recent.length > 0 ? recent.reduce((n, p) => n + p[series], 0) / recent.length : 0

  return (
    <SectionCard
      title={title}
      description={
        <>
          {num(total)} {series === 'pages' ? 'pages & files' : 'documents'} in the last hour · ~{short(perMin)}/min
          lately
        </>
      }
      action={
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={series}
          onValueChange={(v) => v !== '' && setSeries(v as Series)}
        >
          <ToggleGroupItem value="pages">Fetched</ToggleGroupItem>
          <ToggleGroupItem value="published">Published</ToggleGroupItem>
        </ToggleGroup>
      }
    >
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <AreaChart data={points.slice(0, -1)} margin={{ left: 0, right: 8, top: 8 }}>
          <defs>
            <linearGradient id={`fill-${series}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${series})`} stopOpacity={0.35} />
              <stop offset="95%" stopColor={`var(--color-${series})`} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="t"
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tickFormatter={(t: number) => clock(t)}
          />
          <YAxis width={40} tickLine={false} axisLine={false} tickFormatter={(v: number) => short(v)} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => clock(payload[0]?.payload.t ?? 0)}
                indicator="line"
              />
            }
          />
          <Area
            dataKey={series}
            type="monotone"
            stroke={`var(--color-${series})`}
            strokeWidth={2}
            fill={`url(#fill-${series})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </SectionCard>
  )
}
