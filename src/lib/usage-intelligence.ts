export type Classification =
  | 'actively_using'
  | 'passive'
  | 'low_usage'
  | 'not_using'
  | 'dormant_enabled'

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  actively_using:  'Actively Using',
  passive:         'Passive User',
  low_usage:       'Low Usage',
  not_using:       'Not Using',
  dormant_enabled: 'Dormant (Enabled)',
}

export const CLASSIFICATION_COLORS: Record<Classification, string> = {
  actively_using:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  passive:         'bg-amber-50 text-amber-700 border-amber-200',
  low_usage:       'bg-blue-50 text-blue-700 border-blue-200',
  not_using:       'bg-red-50 text-red-600 border-red-200',
  dormant_enabled: 'bg-gray-100 text-gray-600 border-gray-300',
}

/** Compute weighted activity score within a time window */
export function computeActivityScore(
  activities: { ts: string; weight: number }[],
  since: string
): number {
  return activities
    .filter(a => a.ts >= since)
    .reduce((sum, a) => sum + a.weight, 0)
}

/**
 * Classify a user based on login recency + activity score.
 *
 * Thresholds (field sales context):
 *   Actively Using   → last login ≤ 7d  AND score_7d ≥ 5
 *   Passive User     → last login ≤ 14d AND score_7d < 5   (logs in but does nothing)
 *   Low Usage        → score_30d ≥ 1 but not enough for active/passive
 *   Dormant (Enabled)→ status=Active, no login in 30d, no activity in 30d
 *   Not Using        → no login in 30d AND no activity in 30d
 */
export function classifyUser(params: {
  status: string
  lastLogin: Date | null
  score7d: number
  score30d: number
  logins7d: number
}): Classification {
  const { status, lastLogin, score7d, score30d } = params
  const now = Date.now()
  const daysSinceLogin = lastLogin
    ? (now - lastLogin.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity

  const noLoginIn30d   = daysSinceLogin > 30
  const noActivityIn30d = score30d === 0

  if (noLoginIn30d && noActivityIn30d) {
    return status === 'Active' ? 'dormant_enabled' : 'not_using'
  }
  if (daysSinceLogin <= 7 && score7d >= 5) return 'actively_using'
  if (daysSinceLogin <= 14 && score7d < 5)  return 'passive'
  if (score30d >= 1)                         return 'low_usage'
  return 'not_using'
}
