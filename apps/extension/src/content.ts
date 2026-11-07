/**
 * Content script: on lichess, chess.com and Chessigma, shows an "Open in pawnia" button while the
 * page shows a game. It reads only the page address (no page content), and only on a click
 * sends that address to pawnia, which fetches the game through the platforms' public APIs.
 */
import { DEFAULT_CHESSY_URL, chessyLink } from './link'

const host = document.createElement('div')
// A shadow root keeps the page's styles off the button and the button's off the page.
const root = host.attachShadow({ mode: 'closed' })
root.innerHTML = `
  <style>
    button {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      padding: 10px 14px; border: 0; border-radius: 8px;
      background: #629924; color: #fff; font: 600 14px system-ui, sans-serif;
      box-shadow: 0 2px 8px rgb(0 0 0 / 0.3); cursor: pointer;
    }
    button:hover { filter: brightness(1.1); }
  </style>
  <button type="button" title="Open this game in pawnia">♟ Open in pawnia</button>`
const button = root.querySelector('button')!

let chessyUrl = DEFAULT_CHESSY_URL
chrome.storage.sync.get({ chessyUrl: DEFAULT_CHESSY_URL }, (items) => {
  chessyUrl = String(items.chessyUrl)
})
chrome.storage.onChanged.addListener((changes) => {
  if (changes.chessyUrl) chessyUrl = String(changes.chessyUrl.newValue ?? DEFAULT_CHESSY_URL)
})

button.addEventListener('click', () => {
  const link = chessyLink(chessyUrl, location.href)
  if (link) window.open(link, '_blank', 'noopener')
})

/** These sites change pages without reloading, so the address is checked now and then. */
let shownFor = ''
function update() {
  if (location.href === shownFor) return
  shownFor = location.href
  const isGame = chessyLink(chessyUrl, location.href) !== undefined
  if (isGame && !host.isConnected) document.body.append(host)
  if (!isGame && host.isConnected) host.remove()
}
update()
setInterval(update, 1000)
