import { Link } from '@tanstack/react-router'

/** The two kinds of training: the user's mistakes as puzzles, and their openings. */
export function TrainingTabs() {
  return (
    <nav className="training-tabs" aria-label="Training">
      <Link to="/training" activeOptions={{ exact: true }} activeProps={{ 'aria-current': 'page' }}>
        My mistakes
      </Link>
      <Link to="/training/openings" search={{}} activeProps={{ 'aria-current': 'page' }}>
        My openings
      </Link>
      <Link to="/training/library" search={{}} activeProps={{ 'aria-current': 'page' }}>
        Opening library
      </Link>
    </nav>
  )
}
