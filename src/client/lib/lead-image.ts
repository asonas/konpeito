export function feedShowsLeadImage(
  feeds: readonly { id: number; show_lead_image?: number }[],
  feedId: number,
): boolean {
  const feed = feeds.find((entry) => entry.id === feedId)
  return feed?.show_lead_image !== 0
}

export function leadImageToShow(html: string, leadImageUrl: string | null): string | null {
  if (leadImageUrl === null || leadImageUrl.length === 0) {
    return null
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const first = doc.querySelector('img[src]')?.getAttribute('src')
  if (first === leadImageUrl) {
    return null
  }
  return leadImageUrl
}
