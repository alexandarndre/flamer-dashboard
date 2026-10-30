import { useDeferredValue, useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarClock, Download, RotateCcw, Search } from 'lucide-react'
import { api, queries } from '@/lib/api'
import { ago, dateTime, num } from '@/lib/format'
import { useNow } from '@/lib/live'
import { BLOCKER_INFO } from '@/shared/catalog'
import { ORG_TYPE_LABEL } from '@/shared/geo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageHeader } from '@/components/blocks'
import { StatusBadge } from '@/components/status'

const route = getRouteApi('/domains')

export function DomainsPage() {
  const { data: domains } = useSuspenseQuery(queries.domains())
  const { q = '', due } = route.useSearch()
  const navigate = route.useNavigate()
  const now = useNow()
  const [draft, setDraft] = useState(q)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const term = useDeferredValue(draft.trim().toLowerCase())
  const isDue = (d: (typeof domains)[number]) => d.nextRecrawlAt !== null && d.nextRecrawlAt <= now
  const dueDomains = domains.filter(isDue)
  const visible = domains.filter(
    (d) =>
      (due !== true || isDue(d)) &&
      [d.domain, d.org.name ?? '', d.org.place?.countryName ?? '', d.org.place?.city ?? ''].some((x) =>
        x.toLowerCase().includes(term),
      ),
  )
  const allSelected = visible.length > 0 && visible.every((d) => selected.has(d.domain))

  const toggle = (domain: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (!next.delete(domain)) next.add(domain)
      return next
    })

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <PageHeader
        title="Domains"
        description={`${num(domains.length)} sources the crawler knows about, with their latest result.`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                void api
                  .download('domains.csv', 'flamer-domains.csv')
                  .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
              }
            >
              <Download /> Export CSV
            </Button>
            {dueDomains.length > 0 && (
              <Button variant="outline" asChild>
                <Link to="/runs/new" search={{ domains: dueDomains.map((d) => d.domain).join(','), mode: 'recrawl' }}>
                  <CalendarClock /> Recrawl {dueDomains.length} due
                </Link>
              </Button>
            )}
            {selected.size === 0 ? (
              <Button disabled>
                <RotateCcw /> Recrawl selected
              </Button>
            ) : (
              <Button asChild>
                <Link to="/runs/new" search={{ domains: [...selected].join(','), mode: 'recrawl' }}>
                  <RotateCcw /> Recrawl {selected.size} selected
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="max-w-sm">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search domains…"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              void navigate({
                search: (s) => ({ ...s, q: e.target.value === '' ? undefined : e.target.value }),
                replace: true,
                viewTransition: false,
              })
            }}
          />
        </InputGroup>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Switch
            checked={due === true}
            onCheckedChange={(v) =>
              void navigate({
                search: (s) => ({ ...s, due: v ? true : undefined }),
                replace: true,
                viewTransition: false,
              })
            }
          />
          Only due for recrawl ({dueDomains.length})
        </Label>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table className="min-w-[76rem]">
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all"
                  checked={allSelected}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(visible.map((d) => d.domain)) : new Set())}
                />
              </TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Latest status</TableHead>
              <TableHead>Latest run</TableHead>
              <TableHead className="text-right">Published</TableHead>
              <TableHead className="text-right">Duplicates</TableHead>
              <TableHead className="text-right">Rejected</TableHead>
              <TableHead>Known blockers</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Next recrawl</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((d) => (
              <TableRow key={d.domain} data-state={selected.has(d.domain) ? 'selected' : undefined}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${d.domain}`}
                    checked={selected.has(d.domain)}
                    onCheckedChange={() => toggle(d.domain)}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    to="/runs/$runId"
                    params={{ runId: d.lastRunId }}
                    search={{ domain: d.domain }}
                    className="font-medium hover:underline"
                  >
                    {d.domain}
                  </Link>
                </TableCell>
                <TableCell className="max-w-56">
                  <div className="truncate text-sm">{d.org.name ?? ORG_TYPE_LABEL[d.org.type]}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {d.org.name !== null && `${ORG_TYPE_LABEL[d.org.type]} · `}
                    {d.org.place === null ? 'Location unknown' : (d.org.place.city ?? d.org.place.countryName)}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={d.lastStatus} />
                </TableCell>
                <TableCell className="max-w-56">
                  <Link
                    to="/runs/$runId"
                    params={{ runId: d.lastRunId }}
                    className="block truncate text-sm hover:underline"
                  >
                    {d.lastRunName}
                  </Link>
                  {d.runs > 1 && <span className="text-xs text-muted-foreground">{d.runs} runs total</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{num(d.published)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(d.duplicates)}</TableCell>
                <TableCell className="text-right tabular-nums">{num(d.rejected)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {d.blockers.length === 0 ? (
                      <span className="text-muted-foreground">–</span>
                    ) : (
                      d.blockers.map((b) => (
                        <Tooltip key={b}>
                          <TooltipTrigger className="rounded-md border border-danger/30 px-1.5 text-xs text-danger">
                            {BLOCKER_INFO[b].title}
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">{BLOCKER_INFO[b].explain}</TooltipContent>
                        </Tooltip>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                  {ago(d.lastSeen, now)}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {d.nextRecrawlAt === null ? (
                    <span className="text-muted-foreground">
                      {d.recrawlEveryDays === null ? 'Not scheduled' : 'After this run'}
                    </span>
                  ) : isDue(d) ? (
                    <Badge variant="ghost" className="bg-warn/14 text-warn">
                      Due now
                    </Badge>
                  ) : (
                    <span title={dateTime(d.nextRecrawlAt)}>{ago(d.nextRecrawlAt, now)}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visible.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No domains match.</p>}
      </div>
    </div>
  )
}
