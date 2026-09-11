export interface FeedForClient {
  id: number
  title: string
  custom_title: string | null
  feed_url: string
  site_url: string | null
  fetch_full_content: number
  show_lead_image: number
  disabled: number
  disabled_reason: string | null
  last_error_kind: string | null
  last_error: string | null
  last_fetch_at: number | null
  unread_count: number
  public_id: string | null
  tags: { id: number; name: string }[]
  icon_url: string | null
}

export interface ItemForList {
  id: number
  feed_id: number
  title: string
  url: string | null
  author: string | null
  summary: string | null
  lead_image_url: string | null
  published_at: number
  is_read: boolean
  is_bookmarked: boolean
  has_update: boolean
  public_id: string | null
}

export interface ItemForDetail extends Omit<ItemForList, 'has_update'> {
  updated_at: number | null
  has_update: boolean
  has_full_content: boolean
  content_html: string | null
  full_content_html: string | null
  original_content_html: string | null
  enclosure_url: string | null
  enclosure_mime: string | null
  enclosure_length: number | null
  language: string | null
}

export function feedForClient(
  feed: Omit<FeedForClient, 'tags' | 'icon_url'> & { tags?: { id: number; name: string }[] },
  iconUrl: string | null,
): FeedForClient {
  return {
    id: feed.id,
    title: feed.title,
    custom_title: feed.custom_title,
    feed_url: feed.feed_url,
    site_url: feed.site_url,
    fetch_full_content: feed.fetch_full_content,
    show_lead_image: feed.show_lead_image,
    disabled: feed.disabled,
    disabled_reason: feed.disabled_reason,
    last_error_kind: feed.last_error_kind,
    last_error: feed.last_error,
    last_fetch_at: feed.last_fetch_at,
    unread_count: feed.unread_count,
    public_id: feed.public_id,
    tags: feed.tags ?? [],
    icon_url: iconUrl,
  }
}
