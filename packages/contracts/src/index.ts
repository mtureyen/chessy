/**
 * The API contract shared by apps/api (implements it) and apps/web (calls it).
 * Routes are defined here first; the server registers handlers for them.
 */
export const API_V1_PREFIX = '/api/v1'

export * from './health'
export * from './problem'
export * from './sources'
