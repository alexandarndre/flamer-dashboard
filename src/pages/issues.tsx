import { ViewTransition } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, PartyPopper, Sparkles } from 'lucide-react'
import { useRunActions } from '@/lib/actions'
import { api, queries } from '@/lib/api'
import { useOperatorName } from '@/lib/identity'
import type { Who } from '@/lib/search'
import { useNow } from '@/lib/live'
import { plural } from '@/lib/format'
import { BLOCKER_INFO, REMEDY_INFO, slaOf } from '@/shared/catalog'
import { BLOCKERS, type Blocker, type Issue } from '@/shared/contract'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageHeader, SectionCard } from '@/components/blocks'
import { IssueRow } from '@/components/remedies'

const route = getRouteApi('/issues')

const WHO_TABS: [Who, string][] = [
  ['all', 'Everyone'],
  ['mine', 'Mine'],
  ['unassigned', 'Unassigned'],
  ['overdue', 'Overdue'],
]

export function IssuesPage() {
  const { data: all } = useSuspenseQuery(queries.issues())
  const { blocker, who } = route.useSearch()
  const navigate = route.useNavigate()
  const actions = useRunActions()
  const now = useNow()
  const me = useOperatorName()
  const people = [...new Set(all.flatMap((i) => (i.owner === null ? [] : [i.owner])))]
  const WHO: Record<Who, (i: Issue) => boolean> = {
    all: () => true,
    mine: (i) => i.owner === me,
    unassigned: (i) => i.owner === null,
    overdue: (i) => slaOf(i.since, now) === 'overdue',
  }
  const issues = all.filter(WHO[who ?? 'all'])
  const groups = Object.groupBy(issues, (i) => i.blocker)
  const present = BLOCKERS.filter((b) => groups[b] !== undefined)
  const shown = present.filter((b) => blocker === undefined || b === blocker)

  const applyRecommended = (b: Blocker, list: Issue[]) => {
    const remedy = BLOCKER_INFO[b].recommended
    const byRun = Object.groupBy(
      list.filter((i) => i.remedies.includes(remedy)),
      (i) => i.runId,
    )
    for (const [runId, items] of Object.entries(byRun))
      actions.act(
        runId,
        { type: 'resolve', remedy, domains: items!.map((i) => i.domain) },
        REMEDY_INFO[remedy].label,
        `${REMEDY_INFO[remedy].label}: ${plural(items!.length, 'domain')}`,
      )
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <PageHeader
        title="Needs attention"
        description="Domains the crawler cannot get past on its own. Oldest first, grouped by what is blocking them."
        actions={
          <Button
            variant="outline"
            disabled={all.length === 0}
            onClick={() =>
              void api
                .download('issues.csv', 'flamer-blocked-domains.csv')
                .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
            }
          >
            <Download /> Export CSV
          </Button>
        }
      />

      {all.length > 0 && (
        <Tabs
          value={who ?? 'all'}
          onValueChange={(v) =>
            navigate({
              search: (s) => ({ ...s, who: v === 'all' ? undefined : (v as Who) }),
              replace: true,
              viewTransition: false,
            })
          }
        >
          <TabsList>
            {WHO_TABS.map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                {value === 'mine' ? `Mine (${me})` : label}
                <span className="text-muted-foreground tabular-nums">{all.filter(WHO[value]).length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {issues.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PartyPopper />
            </EmptyMedia>
            <EmptyTitle>{all.length === 0 ? 'All clear' : 'Nothing here'}</EmptyTitle>
            <EmptyDescription>
              {all.length === 0
                ? 'Nothing is blocked right now. New blocks show up here and as notifications.'
                : 'No blocked domain matches this filter.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={blocker ?? 'all'}
            onValueChange={(v) =>
              navigate({
                search: (s) => ({ ...s, blocker: v === '' || v === 'all' ? undefined : (v as Blocker) }),
                replace: true,
                viewTransition: false,
              })
            }
            className="flex-wrap"
          >
            <ToggleGroupItem value="all">All {issues.length}</ToggleGroupItem>
            {present.map((b) => (
              <ToggleGroupItem key={b} value={b} className="gap-1.5">
                {BLOCKER_INFO[b].title}
                <span className="text-muted-foreground tabular-nums">{groups[b]!.length}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {shown.map((b) => {
            const list = groups[b]!
            const recommended = BLOCKER_INFO[b].recommended
            const eligible = list.filter((i) => i.remedies.includes(recommended)).length
            return (
              <SectionCard
                key={b}
                title={`${BLOCKER_INFO[b].title} · ${list.length}`}
                description={BLOCKER_INFO[b].explain}
                action={
                  eligible > 1 && (
                    <Button size="sm" variant="outline" onClick={() => applyRecommended(b, list)}>
                      <Sparkles /> {REMEDY_INFO[recommended].label} for all {eligible}
                    </Button>
                  )
                }
                contentClassName="divide-y"
              >
                {list.map((issue) => (
                  <ViewTransition key={`${issue.runId}:${issue.domain}`}>
                    <IssueRow issue={issue} actions={actions} now={now} showRun people={people} />
                  </ViewTransition>
                ))}
              </SectionCard>
            )
          })}
        </>
      )}
    </div>
  )
}
