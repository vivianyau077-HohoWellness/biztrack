/**
 * Lark Base field extraction helpers.
 *
 * Lark field types:
 *   1  = Text
 *   2  = Number
 *   3  = SingleSelect
 *   4  = MultiSelect
 *   5  = DateTime (milliseconds timestamp)
 *  18  = LinkedRecord
 *  20  = Formula (result type varies)
 */

/** Type 1 – Text: array of { text, type } segments, joined into a single string. */
export function extractText(field: unknown): string | null {
  if (field == null) return null
  if (Array.isArray(field)) {
    const joined = field.map((seg: any) => seg?.text ?? '').join('')
    return joined || null
  }
  if (typeof field === 'string') return field || null
  return null
}

/** Type 2 – Number: raw numeric value. */
export function extractNumber(field: unknown): number | null {
  if (field == null) return null
  if (typeof field === 'number') return field
  return null
}

/**
 * Phone (stored as Number in Lark): strip decimal component and return as string.
 * e.g. 601112345678.0 → "601112345678"
 */
export function extractPhone(field: unknown): string | null {
  if (field == null) return null
  if (typeof field === 'number') return String(Math.trunc(field))
  if (typeof field === 'string') return field.replace(/\.0+$/, '') || null
  return null
}

/** Type 3 – SingleSelect: { value: string }. */
export function extractSingleSelect(field: unknown): string | null {
  if (field == null || typeof field !== 'object') return null
  return (field as any).value ?? null
}

/** Type 4 – MultiSelect: array of { value: string }, joined with ", ". */
export function extractMultiSelect(field: unknown): string | null {
  if (!Array.isArray(field)) return null
  const values = field.map((o: any) => o?.value ?? '').filter(Boolean)
  return values.length > 0 ? values.join(', ') : null
}

/**
 * Type 5 – DateTime: milliseconds timestamp → ISO date string (YYYY-MM-DD).
 * The spec calls for "timestamp ms → ISO date string".
 */
export function extractDateTime(field: unknown): string | null {
  if (field == null) return null
  try {
    const ms = typeof field === 'number' ? field : Number(field)
    if (isNaN(ms)) return null
    return new Date(ms).toISOString().split('T')[0]
  } catch {
    return null
  }
}

/**
 * Type 20 – Formula: result value whose type depends on the formula definition.
 * Pass resultType = 'number' for numeric formulas, 'text' for string formulas.
 */
export function extractFormula(field: unknown, resultType: 'text' | 'number'): string | number | null {
  if (field == null) return null
  if (resultType === 'number') {
    return typeof field === 'number' ? field : null
  }
  // text formula
  if (typeof field === 'string') return field || null
  if (typeof field === 'number') return String(field)
  return null
}

/**
 * Type 18 – LinkedRecord: array of linked record objects.
 * Extracts the display text of the first linked record.
 * Tries text_arr[0].text first, then .value, then .text.
 */
export function extractLinkedRecord(field: unknown): string | null {
  if (!Array.isArray(field) || field.length === 0) return null
  const first = field[0] as any
  if (!first) return null
  const fromTextArr = first?.text_arr?.[0]?.text
  if (fromTextArr) return fromTextArr
  if (typeof first?.value === 'string' && first.value) return first.value
  if (typeof first?.text === 'string' && first.text) return first.text
  return null
}
