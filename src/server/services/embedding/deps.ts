import { isRecord } from '../../../shared/records.ts'

export const EMBEDDING_MODEL = '@cf/google/embeddinggemma-2'
/** Vectorizeのインデックスの次元数と揃える。変える時はインデックスを作り直す */
export const EMBEDDING_DIMENSIONS = 256

export type VectorMatch = { id: string; score: number }

export type EmbeddingDeps = {
  /** 渡した順に、テキストごとのベクトルを返す */
  embed(texts: readonly string[]): Promise<number[][]>
  index: {
    upsert(vectors: { id: string; values: number[] }[]): Promise<unknown>
    queryById(id: string, topK: number): Promise<VectorMatch[]>
    deleteByIds(ids: string[]): Promise<unknown>
  }
}

function parseEmbeddings(response: unknown, expected: number): number[][] {
  const data = isRecord(response) && Array.isArray(response.data) ? response.data : null
  if (data === null || data.length !== expected) {
    throw new Error('The embedding response does not match the request')
  }
  const vectors = new Array<number[]>(expected)
  data.forEach((entry, position) => {
    const index = isRecord(entry) && typeof entry.index === 'number' ? entry.index : position
    const values = isRecord(entry) ? entry.embedding : null
    if (
      !Array.isArray(values) ||
      values.length !== EMBEDDING_DIMENSIONS ||
      !values.every((value) => typeof value === 'number' && Number.isFinite(value))
    ) {
      throw new Error('The embedding response has an unexpected vector')
    }
    vectors[index] = values
  })
  if (vectors.includes(undefined as unknown as number[])) {
    throw new Error('The embedding response is missing a vector')
  }
  return vectors
}

/** バインディングが無いサーバーでは`null`。埋め込みを使う機能は何もしない */
export function embeddingDeps(env: Env): EmbeddingDeps | null {
  const { AI: ai, VECTORIZE: vectorize } = env
  if (!ai || !vectorize) {
    return null
  }
  // 生成された型のモデル一覧に無いモデルも呼べるよう、モデル名を文字列として渡す
  const run = ai.run.bind(ai) as (model: string, inputs: unknown) => Promise<unknown>
  return {
    async embed(texts) {
      const response = await run(EMBEDDING_MODEL, {
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      })
      return parseEmbeddings(response, texts.length)
    },
    index: {
      upsert: (vectors) => vectorize.upsert(vectors),
      async queryById(id, topK) {
        const result = await vectorize.queryById(id, { topK })
        return result.matches.map((match) => ({ id: match.id, score: match.score }))
      },
      deleteByIds: (ids) => vectorize.deleteByIds(ids),
    },
  }
}
