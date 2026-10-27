import type { SourceId } from '@chessy/library'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServices } from '@/app/servicesContext'
import '@/features/analysis/PlayerBar.css'
import { GameList } from './GameList'
import { ImportForm } from './ImportForm'
import './LibraryPage.css'

/** "My games": import from lichess / chess.com, browse, open on the analysis board. */
export function LibraryPage() {
  const { library } = useServices()
  const queryClient = useQueryClient()

  const settings = useQuery({
    queryKey: ['library-settings'],
    queryFn: () => library.settings.load(),
  })
  const games = useQuery({ queryKey: ['games'], queryFn: () => library.games.list() })

  const importGames = useMutation({
    mutationFn: ({ source, username }: { source: SourceId; username: string }) =>
      library.importRecentGames(source, username),
    onSuccess: async (_report, { source, username }) => {
      const current = settings.data ?? { usernames: {} }
      await library.settings.save({
        usernames: { ...current.usernames, [source]: username },
        lastSource: source,
      })
      await queryClient.invalidateQueries({ queryKey: ['games'] })
      await queryClient.invalidateQueries({ queryKey: ['library-settings'] })
    },
  })

  const removeGame = useMutation({
    mutationFn: (id: string) => library.games.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['games'] }),
  })

  return (
    <div className="library">
      <section className="library-import">
        <h1>My games</h1>
        {settings.data && (
          <ImportForm
            settings={settings.data}
            pending={importGames.isPending}
            onImport={(source, username) => importGames.mutate({ source, username })}
          />
        )}
        {importGames.isSuccess && (
          <p className="message message-info" role="status">
            {importGames.data.games.length} games imported, {importGames.data.added} new
          </p>
        )}
        {importGames.isError && (
          <p className="message message-error" role="alert">
            {importGames.error.message}
          </p>
        )}
      </section>

      {games.data && (
        <GameList
          games={games.data}
          usernames={settings.data?.usernames ?? {}}
          onDelete={(id) => removeGame.mutate(id)}
        />
      )}
    </div>
  )
}
