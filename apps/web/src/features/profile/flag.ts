/** "DE" → 🇩🇪 (regional indicator symbols); undefined for anything but a 2-letter code. */
export function flagEmoji(country: string | undefined): string | undefined {
  if (!country || !/^[A-Z]{2}$/.test(country)) return undefined
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}
