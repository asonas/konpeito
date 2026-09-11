function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength)
  out.set(bytes)
  return out
}

export function blobToUint8Array(value: unknown): Uint8Array<ArrayBuffer> {
  if (value instanceof Uint8Array) {
    return copyBytes(value)
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  if (ArrayBuffer.isView(value)) {
    return copyBytes(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return copyBytes(Uint8Array.from(value))
  }
  if (typeof value === 'object' && value !== null && 'data' in value) {
    const data = value.data
    if (Array.isArray(data) && data.every((item) => typeof item === 'number')) {
      return copyBytes(Uint8Array.from(data))
    }
  }
  throw new Error('expected blob')
}
