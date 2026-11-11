/**
 * The API contract shared by apps/api (implements it) and apps/web (calls it).
 * Routes are defined here first; the server registers handlers for them.
 */
export const API_V1_PREFIX = '/api/v1'

export * from './coach'
export * from './engine'
export * from './health'
export * from './humanMoves'
export * from './library'
export * from './problem'
export * from './settings'
export * from './sources'
export * from './stats'
export * from './openings'
export * from './openingLibrary'
export * from './repertoire'
