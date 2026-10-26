import pkg from '../package.json' with { type: 'json' }
import { createApp } from './app'
import { loadConfig } from './config'

// Composition root: the only place that knows which adapters fill which ports.
const config = loadConfig(process.env)
const app = createApp({ version: pkg.version, startedAt: Date.now() })

console.log(
  `chessy-api ${pkg.version} listening on http://localhost:${config.PORT} (${config.NODE_ENV})`,
)

export default { port: config.PORT, fetch: app.fetch }
