import { sourceName, type LinkedAccount } from '@chessy/library'
import { useQueryClient } from '@tanstack/react-query'
import { useServices } from '@/app/servicesContext'
import { importRecord, runImport, useImportState } from './historyImport'

/** An account's import: progress while it runs, what it brought, and a way to run it again. */
export function ImportStatus({ account }: { account: LinkedAccount }) {
  const state = useImportState(account)
  const { library } = useServices()
  const queryClient = useQueryClient()
  const record = importRecord(account)
  const start = (full: boolean) =>
    void runImport(library, account, {
      full,
      onGames: () => void queryClient.invalidateQueries({ queryKey: ['games'] }),
    })

  return (
    <div className="import-status" data-testid={`import-${account.source}`}>
      {state.status === 'running' && <Progress state={state} source={account.source} />}
      {state.status === 'done' && (
        <p className="message message-info" role="status">
          {state.mode === 'full'
            ? `All games imported: ${state.fetched} games, ${state.added} new.`
            : state.added > 0
              ? `${state.added} new games imported.`
              : 'Up to date: no new games.'}
        </p>
      )}
      {state.status === 'error' && (
        <p className="message message-error" role="alert">
          Import stopped: {state.message}
        </p>
      )}
      {state.status === 'idle' && record.completedAt && (
        <p className="message message-info">
          All games imported on {new Date(record.completedAt).toLocaleDateString()}.
        </p>
      )}
      {state.status !== 'running' && (
        <button type="button" onClick={() => start(false)}>
          {record.cursor
            ? 'Continue the import'
            : record.completedAt
              ? 'Import new games'
              : `Import all ${sourceName(account.source)} games`}
        </button>
      )}
    </div>
  )
}

function Progress({
  state,
  source,
}: {
  state: { progress: { done: number; total?: number }; fetched: number; mode: 'full' | 'new' }
  source: LinkedAccount['source']
}) {
  const { done, total } = state.progress
  const unit = source === 'chesscom' ? 'month' : 'page'
  return (
    <div className="import-progress" role="status">
      {total !== undefined && total > 0 && (
        <div className="import-bar" aria-hidden>
          <div style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}
      <span>
        {state.mode === 'new' ? 'Looking for new games' : 'Importing your games'}
        {total ? ` · ${unit} ${done} of ${total}` : ''} · {state.fetched} games
      </span>
    </div>
  )
}
