/** How the board looks: square colours, piece set and coordinates. A per-device preference. */
export interface BoardAppearance {
  theme: BoardThemeId
  pieces: PieceSetId
  coordinates: boolean
}

export interface BoardTheme {
  label: string
  light: string
  dark: string
  /** Last move and selected square, drawn over both square colours. */
  highlight: string
}

/** Square colours only (no images), so a theme is a few CSS variables. */
export const BOARD_THEMES = {
  green: { label: 'Green', light: '#ebecd0', dark: '#779556', highlight: 'rgb(255 255 51 / 0.5)' },
  brown: { label: 'Brown', light: '#f0d9b5', dark: '#b58863', highlight: 'rgb(155 199 0 / 0.41)' },
  blue: { label: 'Blue', light: '#dee3e6', dark: '#8ca2ad', highlight: 'rgb(155 199 0 / 0.41)' },
  grey: { label: 'Grey', light: '#e2e2e2', dark: '#a1a1a1', highlight: 'rgb(255 255 51 / 0.45)' },
  purple: {
    label: 'Purple',
    light: '#efeaf6',
    dark: '#8a78b4',
    highlight: 'rgb(255 255 51 / 0.45)',
  },
  walnut: {
    label: 'Walnut',
    light: '#ead1a8',
    dark: '#a8754d',
    highlight: 'rgb(255 255 51 / 0.42)',
  },
} as const satisfies Record<string, BoardTheme>

export type BoardThemeId = keyof typeof BOARD_THEMES

export interface PieceSet {
  label: string
  author: string
  license: string
}

/**
 * Piece sets from lichess (public/piece in lichess-org/lila) whose licences allow use here; files
 * and licence notes are in public/pieces/.
 */
export const PIECE_SETS = {
  cburnett: { label: 'Classic', author: 'Colin M.L. Burnett', license: 'GPLv2+' },
  merida: { label: 'Merida', author: 'Armando Hernandez Marroquin', license: 'GPLv2+' },
  chessnut: { label: 'Chessnut', author: 'Alexis Luengas', license: 'Apache 2.0' },
  mpchess: { label: 'MPChess', author: 'Maxime Chupin', license: 'GPLv3+' },
  fantasy: { label: 'Fantasy', author: 'Maurizio Monge', license: 'MIT' },
  papercut: { label: 'Papercut', author: 'Nikolay Anzarov', license: 'CC BY 4.0' },
  rhosgfx: { label: 'RhosGFX', author: 'RhosGFX', license: 'CC0 1.0' },
  pixel: { label: 'Pixel', author: 'therealqtpi', license: 'AGPLv3+' },
} as const satisfies Record<string, PieceSet>

export type PieceSetId = keyof typeof PIECE_SETS

export const DEFAULT_APPEARANCE: BoardAppearance = {
  theme: 'green',
  pieces: 'cburnett',
  coordinates: true,
}

/** A stored appearance, with anything unknown (an old or edited value) back at the default. */
export function parseAppearance(value: unknown): BoardAppearance {
  const stored = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >
  return {
    theme: isKey(BOARD_THEMES, stored.theme) ? stored.theme : DEFAULT_APPEARANCE.theme,
    pieces: isKey(PIECE_SETS, stored.pieces) ? stored.pieces : DEFAULT_APPEARANCE.pieces,
    coordinates:
      typeof stored.coordinates === 'boolean' ? stored.coordinates : DEFAULT_APPEARANCE.coordinates,
  }
}

const PIECE_FILES = { white: 'w', black: 'b' } as const
const ROLE_FILES = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
} as const

/** The piece image for a set, e.g. `<base>pieces/merida/wN.svg`. */
export function pieceUrl(
  set: PieceSetId,
  color: keyof typeof PIECE_FILES,
  role: keyof typeof ROLE_FILES,
  base = '/',
): string {
  return `${base}pieces/${set}/${PIECE_FILES[color]}${ROLE_FILES[role]}.svg`
}

/**
 * The CSS variables the board stylesheet reads: square colours and one image per piece, e.g.
 * `--piece-white-knight`.
 */
export function appearanceVariables(
  appearance: BoardAppearance,
  base = '/',
): Record<string, string> {
  const theme = BOARD_THEMES[appearance.theme]
  const variables: Record<string, string> = {
    '--board-light': theme.light,
    '--board-dark': theme.dark,
    '--board-highlight': theme.highlight,
  }
  for (const color of Object.keys(PIECE_FILES) as (keyof typeof PIECE_FILES)[]) {
    for (const role of Object.keys(ROLE_FILES) as (keyof typeof ROLE_FILES)[]) {
      variables[`--piece-${color}-${role}`] =
        `url("${pieceUrl(appearance.pieces, color, role, base)}")`
    }
  }
  return variables
}

function isKey<T extends object>(record: T, key: unknown): key is keyof T {
  return typeof key === 'string' && Object.hasOwn(record, key)
}
