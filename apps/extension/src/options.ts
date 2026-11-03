import { DEFAULT_CHESSY_URL, normalizeChessyUrl } from './link'

const input = document.querySelector<HTMLInputElement>('#chessy-url')!
const status = document.querySelector<HTMLParagraphElement>('#status')!

chrome.storage.sync.get({ chessyUrl: DEFAULT_CHESSY_URL }, (items) => {
  input.value = String(items.chessyUrl)
})

input.addEventListener('change', () => {
  const url = normalizeChessyUrl(input.value)
  if (!url) {
    status.textContent = 'Enter an http(s) address, e.g. http://localhost:5173.'
    return
  }
  chrome.storage.sync.set({ chessyUrl: url }, () => {
    input.value = url
    status.textContent = 'Saved.'
  })
})
