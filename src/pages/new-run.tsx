import { useActionState, useDeferredValue, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { CircleAlert, CircleCheck, Copy, FileUp, Info, Rocket, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { duration, plural } from '@/lib/format'
import { operatorName } from '@/lib/identity'
import { useNow } from '@/lib/live'
import { PACE_INFO } from '@/shared/catalog'
import { CreateRunInput, PACES, type Pace, type RunMode } from '@/shared/contract'
import { parseDomainList } from '@/shared/domains'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, SectionCard } from '@/components/blocks'

const route = getRouteApi('/runs/new')

const RECRAWL_OPTIONS: [string, string][] = [
  ['0', 'Off'],
  ['1', 'Daily'],
  ['7', 'Weekly'],
  ['30', 'Monthly'],
  ['90', 'Quarterly'],
]

const SAMPLES: Record<string, string> = {
  'Climate think tanks':
    'wri.org\ne3g.org\niea.org\nirena.org\nember-energy.org\nrmi.org\nclimateanalytics.org\nodi.org',
  'EU agencies': 'eea.europa.eu\neurofound.europa.eu\nefsa.europa.eu\nema.europa.eu\necdc.europa.eu\ncedefop.europa.eu',
  'Messy paste':
    'domain\nhttps://www.unicef.org/reports\nunicef.org\nwww.who.int/publications/i\nnot a domain\n10.1.1.1\nodi.org; iied.org\n',
}

type FormState = { error: string | null; fields: Partial<Record<string, string[]>> }

export function NewRunPage() {
  const { domains: prefill, mode: prefillMode } = route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [text, setText] = useState(prefill?.split(',').join('\n') ?? '')
  const [mode, setMode] = useState<RunMode>(prefillMode ?? 'backfill')
  const [every, setEvery] = useState('0')
  const [pace, setPace] = useState<Pace>('standard')
  const [concurrency, setConcurrency] = useState(4)
  const [respectRobots, setRespectRobots] = useState(true)
  const [dragging, setDragging] = useState(false)
  const now = useNow()

  const deferred = useDeferredValue(text)
  const parsed = parseDomainList(deferred)
  const { data: server } = useQuery({
    queryKey: ['validate', deferred],
    queryFn: () => api.validate(deferred),
    enabled: parsed.valid.length > 0,
    placeholderData: keepPreviousData,
    refetchInterval: false,
  })
  const inFlight = (server?.inFlight ?? []).filter((f) => parsed.valid.includes(f.domain))
  const stale = deferred !== text

  const estimateSec =
    (parsed.valid.length === 0 ? 0 : Math.ceil(parsed.valid.length / concurrency) * 390) / PACE_INFO[pace].factor
  const suggestedName = `${mode === 'backfill' ? 'Backfill' : 'Recrawl'} · ${plural(parsed.valid.length, 'domain')} · ${new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  const [state, formAction] = useActionState<FormState, FormData>(
    async (_previous, form) => {
      const input = CreateRunInput.safeParse({
        name: String(form.get('name') ?? '').trim() || suggestedName,
        mode: form.get('mode'),
        settings: {
          concurrency: Number(form.get('concurrency')),
          pace: form.get('pace'),
          respectRobots: form.get('respectRobots') === 'on',
          recrawlEveryDays: Number(form.get('recrawlEveryDays') ?? 0),
        },
        domains: parseDomainList(String(form.get('domains') ?? '')).valid,
        actor: operatorName(),
      })
      if (!input.success)
        return { error: 'Please check the highlighted fields.', fields: z.flattenError(input.error).fieldErrors }
      try {
        const run = await api.createRun(input.data)
        await queryClient.invalidateQueries()
        toast.success('Crawl started', { description: `${plural(run.domainCount, 'domain')} queued in “${run.name}”` })
        void navigate({ to: '/runs/$runId', params: { runId: run.id } })
        return { error: null, fields: {} }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), fields: {} }
      }
    },
    { error: null, fields: {} },
  )

  const readFiles = async (files: FileList | null) => {
    if (files === null) return
    const contents = await Promise.all([...files].map((f) => f.text()))
    setText((t) => [t.trim(), ...contents].filter((x) => x !== '').join('\n'))
  }

  return (
    <form action={formAction} className="mx-auto grid max-w-6xl gap-6">
      <PageHeader
        title="New crawl"
        description="Paste the domains the editorial team sent you. We clean the list, show what will be crawled, and you can watch it live."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-6">
          <SectionCard
            title="1. Domains"
            description="One per line. Full links, commas and CSV files are fine: we keep just the domain."
            action={
              <div className="flex flex-wrap gap-1">
                {Object.entries(SAMPLES).map(([label, sample]) => (
                  <Button key={label} type="button" size="xs" variant="ghost" onClick={() => setText(sample)}>
                    {label}
                  </Button>
                ))}
              </div>
            }
            contentClassName="grid gap-3"
          >
            <div
              className={cn(
                'relative rounded-lg transition',
                dragging && 'ring-2 ring-brand ring-offset-2 ring-offset-background',
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                void readFiles(e.dataTransfer.files)
              }}
            >
              <Textarea
                name="domains"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'worldbank.org\nhttps://www.oecd.org/publications\nwho.int, unicef.org'}
                className="min-h-56 font-mono text-sm"
                aria-invalid={state.fields.domains !== undefined}
              />
              <label className="absolute right-2 bottom-2 flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                <FileUp className="size-3.5" /> Upload .txt / .csv
                <input
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  multiple
                  className="sr-only"
                  onChange={(e) => void readFiles(e.target.files)}
                />
              </label>
            </div>

            <div className={cn('grid gap-3 transition-opacity', stale && 'opacity-60')}>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="ghost" className="bg-success/12 text-success">
                  <CircleCheck /> {plural(parsed.valid.length, 'domain')} ready
                </Badge>
                {parsed.duplicates.length > 0 && (
                  <Badge variant="ghost" className="bg-muted text-muted-foreground">
                    <Copy /> {plural(parsed.duplicates.length, 'duplicate')} removed
                  </Badge>
                )}
                {parsed.invalid.length > 0 && (
                  <Badge variant="ghost" className="bg-danger/12 text-danger">
                    <CircleAlert /> {parsed.invalid.length} can’t be used
                  </Badge>
                )}
              </div>
              {parsed.invalid.length > 0 && (
                <ul className="grid gap-1 rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm">
                  {parsed.invalid.slice(0, 8).map((i) => (
                    <li key={i.input} className="flex gap-2">
                      <code className="truncate font-mono text-xs">{i.input}</code>
                      <span className="text-muted-foreground">· {i.reason}</span>
                    </li>
                  ))}
                  {parsed.invalid.length > 8 && (
                    <li className="text-muted-foreground">…and {parsed.invalid.length - 8} more</li>
                  )}
                </ul>
              )}
              {inFlight.length > 0 && (
                <Alert>
                  <TriangleAlert />
                  <AlertTitle>{plural(inFlight.length, 'domain')} already being crawled</AlertTitle>
                  <AlertDescription>
                    {inFlight
                      .slice(0, 4)
                      .map((f) => `${f.domain} (in “${f.run}”)`)
                      .join(', ')}
                    {inFlight.length > 4 && ` and ${inFlight.length - 4} more`}. They will be crawled twice.
                  </AlertDescription>
                </Alert>
              )}
              {parsed.valid.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {parsed.valid.slice(0, 40).map((d) => (
                    <span key={d} className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs">
                      {d}
                    </span>
                  ))}
                  {parsed.valid.length > 40 && (
                    <span className="px-2 py-0.5 text-xs text-muted-foreground">+{parsed.valid.length - 40} more</span>
                  )}
                </div>
              )}
              {state.fields.domains !== undefined && <FieldError>Add at least one valid domain.</FieldError>}
            </div>
          </SectionCard>

          <SectionCard title="2. What kind of crawl?" contentClassName="grid gap-6">
            <FieldSet>
              <FieldLegend variant="label">Mode</FieldLegend>
              <RadioGroup
                name="mode"
                value={mode}
                onValueChange={(v) => setMode(v as RunMode)}
                className="grid gap-3 sm:grid-cols-2"
              >
                {(
                  [
                    ['backfill', 'Backfill', 'First full crawl of new sources. Every PDF is new to us.'],
                    ['recrawl', 'Recrawl', 'Revisit known sources and pick up only new or changed documents.'],
                  ] as const
                ).map(([value, label, hint]) => (
                  <Label
                    key={value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-[state=checked]:border-brand has-data-[state=checked]:bg-brand/5"
                  >
                    <RadioGroupItem value={value} className="mt-0.5" />
                    <div className="grid gap-1">
                      <span className="font-medium">{label}</span>
                      <span className="text-xs font-normal text-muted-foreground">{hint}</span>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">Pace</FieldLegend>
              <RadioGroup
                name="pace"
                value={pace}
                onValueChange={(v) => setPace(v as Pace)}
                className="grid gap-3 sm:grid-cols-3"
              >
                {PACES.map((value) => (
                  <Label
                    key={value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-data-[state=checked]:border-brand has-data-[state=checked]:bg-brand/5"
                  >
                    <RadioGroupItem value={value} className="mt-0.5" />
                    <div className="grid gap-1">
                      <span className="font-medium">{PACE_INFO[value].label}</span>
                      <span className="text-xs font-normal text-muted-foreground">{PACE_INFO[value].hint}</span>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </FieldSet>
          </SectionCard>
        </div>

        <div className="grid gap-6 lg:sticky lg:top-20">
          <SectionCard title="3. Settings" contentClassName="grid gap-6">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Run name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  placeholder={suggestedName}
                  aria-invalid={state.fields.name !== undefined}
                />
                {state.fields.name !== undefined && <FieldError>Use 3 to 80 characters.</FieldError>}
              </Field>
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel>Sites crawled at once</FieldLabel>
                  <span className="text-sm font-medium tabular-nums">{concurrency}</span>
                </div>
                <Slider
                  name="concurrency"
                  min={1}
                  max={16}
                  step={1}
                  value={[concurrency]}
                  onValueChange={([v]) => setConcurrency(v ?? 1)}
                />
                <FieldDescription>
                  More is faster, but each site still gets polite, rate-limited requests.
                </FieldDescription>
              </Field>
              <FieldSet>
                <FieldLegend variant="label">Recrawl automatically</FieldLegend>
                <RadioGroup
                  name="recrawlEveryDays"
                  value={every}
                  onValueChange={setEvery}
                  className="grid grid-cols-3 gap-2"
                >
                  {RECRAWL_OPTIONS.map(([value, label]) => (
                    <Label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 font-normal has-data-[state=checked]:border-brand has-data-[state=checked]:bg-brand/5"
                    >
                      <RadioGroupItem value={value} />
                      {label}
                    </Label>
                  ))}
                </RadioGroup>
                <FieldDescription>Domains that finish are marked due again after this interval.</FieldDescription>
              </FieldSet>
              <Field orientation="horizontal">
                <Switch id="robots" name="respectRobots" checked={respectRobots} onCheckedChange={setRespectRobots} />
                <FieldLabel htmlFor="robots" className="font-normal">
                  Respect robots.txt
                </FieldLabel>
              </Field>
              {!respectRobots && (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertDescription>Only turn this off for publishers who agreed in writing.</AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </SectionCard>

          <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 text-muted-foreground" />
              <p>
                {parsed.valid.length === 0 ? (
                  'Add domains to see an estimate.'
                ) : (
                  <>
                    We’ll crawl <strong>{plural(parsed.valid.length, 'domain')}</strong>,{' '}
                    {Math.min(concurrency, parsed.valid.length)} at a time. Rough estimate:{' '}
                    <strong>{duration(estimateSec)}</strong>, plus time for anything that needs you.
                  </>
                )}
              </p>
            </div>
            {state.error !== null && <p className="text-danger">{state.error}</p>}
            <SubmitButton disabled={parsed.valid.length === 0} />
          </div>
        </div>
      </div>
    </form>
  )
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" disabled={disabled || pending}>
      {pending ? <Spinner /> : <Rocket />}
      {pending ? 'Starting crawl…' : 'Start crawl'}
    </Button>
  )
}
