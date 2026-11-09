import { loadAddress, saveAddress } from './address'
import { normalizePawniaUrl } from './link'

const input = document.querySelector<HTMLInputElement>('#pawnia-url')!
const status = document.querySelector<HTMLParagraphElement>('#status')!

void loadAddress(chrome.storage.sync).then((url) => (input.value = url))

input.addEventListener('change', () => {
  const url = normalizePawniaUrl(input.value)
  if (!url) {
    status.textContent = 'Enter an http(s) address, e.g. http://localhost:5173.'
    return
  }
  void saveAddress(chrome.storage.sync, url).then(() => {
    input.value = url
    status.textContent = 'Saved.'
  })
})
