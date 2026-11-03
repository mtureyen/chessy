/**
 * The API contract shared by apps/api (implements it) and apps/web (calls it).
 * Routes are defined here first; the server registers handlers for them.
 */
export const API_V1_PREFIX = '/api/v1'

export * from './engine'
export * from './health'
export * from './humanMoves'
export * from './problem'
export * from './sources'
