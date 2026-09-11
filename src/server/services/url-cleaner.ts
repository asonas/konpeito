const PREFIX_PARAMS = ['utm_', 'mtm_', 'itm_']

const EXACT_PARAMS = [
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'gclsrc',
  'srsltid',
  'yclid',
  'ysclid',
  'twclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'mc_tc',
  '_openstat',
  'fb_action_ids',
  'fb_action_types',
  'fb_ref',
  'fb_source',
  'fb_comment_id',
  'hsa_cam',
  '_hsenc',
  '__hssc',
  '__hstc',
  '__hsfp',
  '_hsmi',
  'hsctatracking',
  'mkt_tok',
  'sc_cid',
  'vero_id',
  'vero_conv',
  '_bhlid',
  '_branch_match_id',
  '_branch_referrer',
  'rb_clickid',
  'oly_anon_id',
  'oly_enc_id',
  'wickedid',
  'campaign_id',
  'campaign_medium',
  'campaign_name',
  'campaign_source',
  'campaign_term',
  'campaign_content',
  '__readwiseLocation',
]

const EXACT_PARAM_SET: ReadonlySet<string> = new Set(EXACT_PARAMS)

export interface FeedHosts {
  feedHost: string
  siteHost: string | null
}

function isTrackingParam(key: string, value: string, hosts: FeedHosts): boolean {
  const lower = key.toLowerCase()
  for (const prefix of PREFIX_PARAMS) {
    if (lower.startsWith(prefix)) {
      return true
    }
  }
  if (EXACT_PARAM_SET.has(lower)) {
    return true
  }
  if (lower === 'ref') {
    const v = value.toLowerCase()
    return (
      v === hosts.feedHost.toLowerCase() ||
      (hosts.siteHost !== null && v === hosts.siteHost.toLowerCase())
    )
  }
  return false
}

export function cleanTrackingParams(url: string, hosts: FeedHosts): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  const toDelete: string[] = []
  for (const [key, value] of parsed.searchParams) {
    if (isTrackingParam(key, value, hosts)) {
      toDelete.push(key)
    }
  }
  if (toDelete.length === 0) {
    return url
  }
  for (const key of toDelete) {
    parsed.searchParams.delete(key)
  }
  return parsed.toString()
}
