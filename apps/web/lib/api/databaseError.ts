export function getDatabaseErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null
  }

  const message = error.message.toLowerCase()

  if (
    message.includes("can't reach database server")
    || message.includes('prismaclientinitializationerror')
    || message.includes('p1001')
  ) {
    return 'Database is temporarily unavailable. Please try again in a moment.'
  }

  return null
}

export function isDatabaseUnavailable(error: unknown): boolean {
  return getDatabaseErrorMessage(error) !== null
}
