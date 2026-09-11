import { hc } from 'hono/client'
import type { ApiType } from '../../server/routes/api/index.ts'

export const api = hc<ApiType>('/api/v1')
