import type { Profile } from '../domain/profile'

/** Port: where the user's profile is kept (the browser, and the server's copy). */
export interface ProfileStore {
  load(): Promise<Profile | undefined>
  save(profile: Profile): Promise<void>
}
