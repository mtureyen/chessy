import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createServices } from './app/services'
import { ServicesProvider } from './app/ServicesProvider'
import { router } from './app/router'
import { applyBoardAppearance } from './shared/board/appearanceStore'
import './styles/index.css'

applyBoardAppearance()
const queryClient = new QueryClient()
const services = createServices({
  onGamesChanged: () => void queryClient.invalidateQueries({ queryKey: ['games'] }),
})
// Catch the server's game history up with this browser's (games saved while it was down).
services.history.sync().catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ServicesProvider>
  </StrictMode>,
)
