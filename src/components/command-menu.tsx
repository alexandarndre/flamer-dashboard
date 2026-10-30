import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Globe, Hand, LayoutDashboard, ListChecks, Plus, Waypoints } from 'lucide-react'
import { queries } from '@/lib/api'
import { BLOCKER_INFO, RUN_STATUS_INFO } from '@/shared/catalog'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const { data: runs = [] } = useQuery({ ...queries.runs(), enabled: open })
  const { data: domains = [] } = useQuery({ ...queries.domains(), enabled: open })
  const { data: issues = [] } = useQuery({ ...queries.issues(), enabled: open })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const go = (fn: () => void) => {
    onOpenChange(false)
    fn()
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Jump to" description="Search runs, domains and pages">
      <Command>
        <CommandInput placeholder="Search runs, domains, pages…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Pages">
            <CommandItem onSelect={() => go(() => navigate({ to: '/' }))}>
              <LayoutDashboard /> Overview
            </CommandItem>
            <CommandItem onSelect={() => go(() => navigate({ to: '/runs' }))}>
              <ListChecks /> Crawl runs
            </CommandItem>
            <CommandItem onSelect={() => go(() => navigate({ to: '/issues' }))}>
              <Hand /> Needs attention
              {issues.length > 0 && <CommandShortcut>{issues.length}</CommandShortcut>}
            </CommandItem>
            <CommandItem onSelect={() => go(() => navigate({ to: '/domains' }))}>
              <Globe /> Domains
            </CommandItem>
            <CommandItem onSelect={() => go(() => navigate({ to: '/explore' }))}>
              <Waypoints /> Explore map & connections
            </CommandItem>
            <CommandItem onSelect={() => go(() => navigate({ to: '/runs/new' }))}>
              <Plus /> Start a new crawl
            </CommandItem>
          </CommandGroup>
          {issues.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Needs attention">
                {issues.map((issue) => (
                  <CommandItem
                    key={`${issue.runId}:${issue.domain}`}
                    value={`issue ${issue.domain} ${BLOCKER_INFO[issue.blocker].title}`}
                    onSelect={() =>
                      go(() =>
                        navigate({
                          to: '/runs/$runId',
                          params: { runId: issue.runId },
                          search: { domain: issue.domain },
                        }),
                      )
                    }
                  >
                    <Hand className="text-danger" />
                    {issue.domain}
                    <CommandShortcut>{BLOCKER_INFO[issue.blocker].title}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          <CommandSeparator />
          <CommandGroup heading="Runs">
            {runs.map((run) => (
              <CommandItem
                key={run.id}
                value={`run ${run.name}`}
                onSelect={() => go(() => navigate({ to: '/runs/$runId', params: { runId: run.id } }))}
              >
                <ListChecks />
                {run.name}
                <CommandShortcut>{RUN_STATUS_INFO[run.status].label}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Domains">
            {domains.map((d) => (
              <CommandItem
                key={d.domain}
                value={`domain ${d.domain}`}
                onSelect={() =>
                  go(() =>
                    navigate({ to: '/runs/$runId', params: { runId: d.lastRunId }, search: { domain: d.domain } }),
                  )
                }
              >
                <Globe />
                {d.domain}
                <CommandShortcut>{d.lastRunName}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
