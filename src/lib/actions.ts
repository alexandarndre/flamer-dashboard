import { useOptimistic, useTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ActionInput } from '@/shared/contract'
import { api, queries } from './api'
import { operatorName } from './identity'

type Pending = { keys: string[]; label: string }

export const pendingKey = (runId: string, domain?: string) => `${runId}:${domain ?? '*'}`

export function useRunActions() {
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [pending, addPending] = useOptimistic(new Map<string, string>(), (state, next: Pending) => {
    const copy = new Map(state)
    for (const key of next.keys) copy.set(key, next.label)
    return copy
  })

  const act = (runId: string, input: ActionInput, label: string, success?: string) =>
    startTransition(async () => {
      addPending({
        keys: 'domains' in input ? input.domains.map((d) => pendingKey(runId, d)) : [pendingKey(runId)],
        label,
      })
      try {
        const detail = await api.act(runId, { ...input, actor: operatorName() })
        queryClient.setQueryData(queries.run(runId).queryKey, detail)
        await Promise.all(
          (['overview', 'runs', 'issues', 'domains'] as const).map((key) =>
            queryClient.invalidateQueries({ queryKey: [key] }),
          ),
        )
        if (success !== undefined) toast.success(success)
      } catch (error) {
        toast.error('That didn’t work', { description: error instanceof Error ? error.message : String(error) })
      }
    })

  return { act, pending, isPending }
}
