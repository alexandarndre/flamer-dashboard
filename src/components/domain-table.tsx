import { useDeferredValue, useRef, useState } from 'react'
import {
  createColumnHelper,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Search,
  SkipForward,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { pendingKey, type useRunActions } from '@/lib/actions'
import { ago, duration, num, pct, plural, short } from '@/lib/format'
import { ACTIVE_STATUSES, BLOCKER_INFO, STATUS_INFO, availableActions } from '@/shared/catalog'
import type { DomainActionType, DomainSnapshot, DomainStatus, RunDetail } from '@/shared/contract'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ProgressBar, StatusBadge } from './status'

export type DomainFilter = 'all' | 'active' | 'attention' | 'waiting' | 'done' | DomainStatus

const FILTERS: { value: DomainFilter; label: string; match: (s: DomainStatus) => boolean }[] = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'active', label: 'Crawling', match: (s) => ACTIVE_STATUSES.includes(s) },
  { value: 'attention', label: 'Needs you', match: (s) => s === 'needs_attention' },
  { value: 'waiting', label: 'Waiting', match: (s) => ['queued', 'waiting_owner', 'paused'].includes(s) },
  { value: 'done', label: 'Finished', match: (s) => ['completed', 'skipped', 'cancelled'].includes(s) },
]

const matchFilter = (filter: DomainFilter, s: DomainStatus) =>
  (FILTERS.find((f) => f.value === filter)?.match ?? ((x: DomainStatus) => x === filter))(s)

const STATUS_ORDER = Object.keys(STATUS_INFO) as DomainStatus[]

const features = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
})

const helper = createColumnHelper<typeof features, DomainSnapshot>()

const columns = helper.columns([
  helper.display({ id: 'select', enableSorting: false }),
  helper.accessor('domain', { header: 'Domain', sortFn: 'alphanumeric' }),
  helper.accessor((d) => STATUS_ORDER.indexOf(d.status), { id: 'status', header: 'Status' }),
  helper.accessor((d) => d.owner ?? '', { id: 'owner', header: 'Owner', sortFn: 'alphanumeric' }),
  helper.accessor('progress', { header: 'Progress' }),
  helper.accessor((d) => d.counters.pages, { id: 'pages', header: 'Pages' }),
  helper.accessor((d) => d.counters.pdfsFound, { id: 'pdfs', header: 'PDFs found' }),
  helper.accessor((d) => d.counters.published + d.counters.updated, { id: 'published', header: 'Published' }),
  helper.accessor('pagesPerMin', { header: 'Speed' }),
  helper.accessor((d) => d.lastEvent?.at ?? 0, { id: 'updated', header: 'Last update' }),
  helper.display({ id: 'actions', enableSorting: false }),
])

type BulkAction = Exclude<DomainActionType, 'resolve' | 'assign' | 'note'>

const BULK_ACTIONS: BulkAction[] = ['pause', 'resume', 'retry', 'skip']

const ACTION_META: Record<BulkAction, { label: string; pending: string; icon: typeof Pause }> = {
  pause: { label: 'Pause', pending: 'Pausing', icon: Pause },
  resume: { label: 'Resume', pending: 'Resuming', icon: Play },
  retry: { label: 'Retry', pending: 'Retrying', icon: RotateCcw },
  skip: { label: 'Skip', pending: 'Skipping', icon: SkipForward },
}

const ROW_HEIGHT = 56

export function DomainTable({
  run,
  actions,
  filter,
  query,
  readOnly,
  onFilter,
  onQuery,
  onOpen,
}: {
  run: RunDetail
  actions: ReturnType<typeof useRunActions>
  filter: DomainFilter
  query: string
  readOnly: boolean
  onFilter: (f: DomainFilter) => void
  onQuery: (q: string) => void
  onOpen: (domain: string) => void
}) {
  'use no memo'
  // NOTE: Table v9 exposes state through stable table/row methods; compiler memoization would serve stale rows.
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [draft, setDraft] = useState(query)
  const deferredQuery = useDeferredValue(draft.trim().toLowerCase())
  const scrollRef = useRef<HTMLDivElement>(null)

  const counts = new Map(FILTERS.map((f) => [f.value, run.domains.filter((d) => f.match(d.status)).length]))
  const data = run.domains.filter((d) => matchFilter(filter, d.status) && d.domain.includes(deferredQuery))

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (d) => d.domain,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: !readOnly,
  })

  const rows = table.getRowModel().rows
  // eslint-disable-next-line react-hooks/incompatible-library -- this component opts out of the compiler ('use no memo')
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (i) => rows[i]!.id,
  })
  const items = virtualizer.getVirtualItems()
  const padTop = items[0]?.start ?? 0
  const padBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)

  const selected = run.domains.filter((d) => rowSelection[d.domain] === true)
  const eligible = (type: BulkAction) =>
    selected.filter((d) => availableActions(d.status).includes(type)).map((d) => d.domain)
  const runBulk = (type: BulkAction) => {
    const domains = eligible(type)
    actions.act(
      run.id,
      { type, domains },
      ACTION_META[type].pending,
      `${ACTION_META[type].label}: ${domains.length} domain(s)`,
    )
    setRowSelection({})
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={FILTERS.some((f) => f.value === filter) ? filter : ''}
          onValueChange={(v) => onFilter((v === '' ? 'all' : v) as DomainFilter)}
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} className="gap-1.5">
              {f.label}
              <span
                className={cn(
                  'text-muted-foreground tabular-nums',
                  f.value === 'attention' && counts.get(f.value)! > 0 && 'text-danger',
                )}
              >
                {counts.get(f.value)}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <InputGroup className="ml-auto h-8 w-full sm:w-64">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Filter domains…"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              onQuery(e.target.value)
            }}
          />
        </InputGroup>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
          <span className="font-medium">{selected.length} selected</span>
          <div className="flex flex-wrap gap-1.5">
            {BULK_ACTIONS.map((type) => {
              const domains = eligible(type)
              const Icon = ACTION_META[type].icon
              return (
                <Button
                  key={type}
                  size="xs"
                  variant="outline"
                  disabled={domains.length === 0}
                  onClick={() => runBulk(type)}
                >
                  <Icon /> {ACTION_META[type].label}
                  {domains.length > 0 && domains.length < selected.length && ` (${domains.length})`}
                </Button>
              )
            })}
          </div>
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setRowSelection({})}>
            <X /> Clear
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="relative max-h-[38rem] overflow-auto rounded-lg border">
        <table className="w-full min-w-[66rem] caption-bottom text-sm">
          <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b">
                {group.headers.map((header) => {
                  if (header.column.id === 'select')
                    return (
                      <th key={header.id} className="w-10 px-3">
                        <Checkbox
                          aria-label="Select all"
                          disabled={readOnly}
                          checked={
                            table.getIsAllRowsSelected()
                              ? true
                              : table.getIsSomeRowsSelected()
                                ? 'indeterminate'
                                : false
                          }
                          onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
                        />
                      </th>
                    )
                  if (header.column.id === 'actions') return <th key={header.id} className="w-10" />
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className="h-9 px-3 text-left font-medium whitespace-nowrap text-muted-foreground"
                    >
                      <button
                        type="button"
                        className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        {sorted === 'asc' ? (
                          <ArrowUp className="size-3" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: padTop }} />
              </tr>
            )}
            {items.map((item) => {
              const row = rows[item.index]!
              const d = row.original
              const pending = actions.pending.get(pendingKey(run.id, d.domain))
              const available = readOnly ? [] : availableActions(d.status)
              return (
                <tr
                  key={row.id}
                  data-state={rowSelection[row.id] === true ? 'selected' : undefined}
                  className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40 data-[state=selected]:bg-brand/5"
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => onOpen(d.domain)}
                >
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select ${d.domain}`}
                      disabled={readOnly}
                      checked={rowSelection[row.id] === true}
                      onClick={(e) =>
                        row.getToggleSelectedHandler()({
                          shiftKey: e.shiftKey,
                          target: { checked: rowSelection[row.id] !== true },
                        })
                      }
                    />
                  </td>
                  <td className="max-w-64 px-3">
                    <div className="truncate font-medium">{d.domain}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {d.lastEvent?.message ?? 'Waiting to start'}
                    </div>
                  </td>
                  <td className="px-3 whitespace-nowrap">
                    {pending !== undefined ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Spinner /> {pending}…
                      </span>
                    ) : (
                      <div className="grid justify-items-start gap-0.5">
                        <StatusBadge status={d.status} />
                        {d.blocker !== null && (
                          <span className="text-xs text-danger">{BLOCKER_INFO[d.blocker].title}</span>
                        )}
                        {d.resumeAt !== null && d.resumeAt > run.at && (
                          <span className="text-xs text-muted-foreground">
                            {d.status === 'backing_off' ? 'retrying' : 'reply expected'} in{' '}
                            {duration((d.resumeAt - run.at) / 1000)}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td
                    className="max-w-28 truncate px-3 text-xs"
                    title={d.notes.length > 0 ? plural(d.notes.length, 'note') : undefined}
                  >
                    {d.owner === null ? <span className="text-muted-foreground">–</span> : d.owner}
                    {d.notes.length > 0 && <span className="ml-1 text-muted-foreground">· {d.notes.length}✎</span>}
                  </td>
                  <td className="w-40 px-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        value={d.progress}
                        tone={d.status === 'needs_attention' ? 'danger' : d.status === 'completed' ? 'success' : 'info'}
                      />
                      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                        {pct(d.progress)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 tabular-nums">{short(d.counters.pages)}</td>
                  <td className="px-3 tabular-nums">{num(d.counters.pdfsFound)}</td>
                  <td className="px-3 tabular-nums">{num(d.counters.published + d.counters.updated)}</td>
                  <td className="px-3 whitespace-nowrap text-muted-foreground tabular-nums">
                    {d.pagesPerMin > 0 ? `${short(d.pagesPerMin)}/min` : '–'}
                    {d.etaSec !== null && <div className="text-xs">~{duration(d.etaSec)} left</div>}
                  </td>
                  <td className="px-3 whitespace-nowrap text-muted-foreground">
                    {d.lastEvent === null ? '–' : ago(d.lastEvent.at, run.at)}
                  </td>
                  <td className="px-2" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${d.domain}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onOpen(d.domain)}>Open details</DropdownMenuItem>
                        {available.some((a) => a !== 'resolve') && <DropdownMenuSeparator />}
                        {BULK_ACTIONS.filter((type) => available.includes(type)).map((type) => {
                          const Icon = ACTION_META[type].icon
                          return (
                            <DropdownMenuItem
                              key={type}
                              onSelect={() =>
                                actions.act(run.id, { type, domains: [d.domain] }, ACTION_META[type].pending)
                              }
                            >
                              <Icon /> {ACTION_META[type].label}
                            </DropdownMenuItem>
                          )
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
            {padBottom > 0 && (
              <tr aria-hidden>
                <td style={{ height: padBottom }} />
              </tr>
            )}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No domains match this filter.</p>
        )}
      </div>
    </div>
  )
}
