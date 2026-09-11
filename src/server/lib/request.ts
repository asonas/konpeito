/**
 * WebAuthnのRelying Partyは、リクエストが届いたホストそのものとする
 * デプロイ先のドメインを設定として持たないので、どのドメインに置いても動く
 */
export function rpFromRequest(url: URL): { rpID: string; origin: string } {
  return { rpID: url.hostname, origin: url.origin }
}
