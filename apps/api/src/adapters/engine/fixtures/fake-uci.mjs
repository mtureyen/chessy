// A tiny UCI "engine" for tests: answers the protocol with fixed results, no chess at all.
// FAKE_UCI_MODE=crash exits as soon as a search starts.
import { createInterface } from 'node:readline'

const mode = process.env.FAKE_UCI_MODE ?? 'ok'
const say = (line) => process.stdout.write(`${line}\n`)
let multiPv = 1

createInterface({ input: process.stdin }).on('line', (line) => {
  const [command, ...rest] = line.trim().split(/\s+/)
  if (command === 'uci') say('id name FakeUCI 1\nuciok')
  else if (command === 'isready') say('readyok')
  else if (command === 'setoption' && rest[1] === 'MultiPV') multiPv = Number(rest[3])
  else if (command === 'go') {
    if (mode === 'crash') process.exit(3)
    const nodes = rest[rest.indexOf('nodes') + 1] ?? '0'
    for (let pv = 1; pv <= multiPv; pv++)
      say(`info depth 7 multipv ${pv} score cp ${10 * pv} nodes ${nodes} pv e2e4 e7e5`)
    say('bestmove e2e4 ponder e7e5')
  } else if (command === 'quit') process.exit(0)
})
