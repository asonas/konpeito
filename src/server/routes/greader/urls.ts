export function absolutizeImageProxyUrls(html: string, origin: string): string {
  return html.replaceAll(/(^|["'\s,=])\/img\?/g, `$1${origin}/img?`)
}
