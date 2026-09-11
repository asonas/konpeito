import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useEffect } from 'react'
import { applyLocale, loadCatalog } from '../i18n/locale.ts'
import { type Bootstrap, fetchBootstrap, queryKeys } from './queries.ts'
import { applyTheme } from './theme.ts'

const readerRoute = getRouteApi('/_reader')

export function useLiveBootstrap(): Bootstrap {
  const { bootstrap: initial } = readerRoute.useRouteContext()
  const query = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: fetchBootstrap,
    initialData: initial,
  })
  const bootstrap = query.data
  useEffect(() => {
    applyTheme(bootstrap.settings.theme)
    void loadCatalog(bootstrap.settings.locale).then(() => {
      applyLocale(bootstrap.settings.locale)
    })
  }, [bootstrap.settings.locale, bootstrap.settings.theme])
  return bootstrap
}
