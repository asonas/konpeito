export function feedTitle(feed: { title: string; custom_title: string | null }): string {
  const custom = feed.custom_title
  return custom !== null && custom.length > 0 ? custom : feed.title
}
