/**
 * Safe formatting helpers for EJSON-serialized BSON values coming from the main process.
 *
 * Dates are a known crash source: in relaxed EJSON, a Date is serialized as
 * `{ $date: "ISOString" }` only when the year is within 1970-9999. Outside that
 * range it falls back to the canonical `{ $date: { $numberLong: "..." } }` form.
 * Feeding that object straight into `new Date(...).toISOString()` yields an
 * `Invalid Date` and `toISOString()` throws `RangeError: Invalid time value`,
 * which (with no error boundary) blanks the whole renderer.
 */

/**
 * Coerce an EJSON `$date` payload into a millisecond timestamp.
 * Handles ISO strings, raw numbers, and the `{ $numberLong: "..." }` form.
 * Returns NaN when it cannot be parsed.
 */
const toEpochMs = (raw) => {
  if (raw === null || typeof raw === 'undefined') return NaN
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const asNum = Number(raw)
    // Pure numeric string -> treat as epoch ms, otherwise parse as a date string.
    return Number.isNaN(asNum) ? new Date(raw).getTime() : asNum
  }
  if (typeof raw === 'object') {
    // Canonical extended JSON: { $numberLong: "..." }
    if (typeof raw.$numberLong !== 'undefined') return Number(raw.$numberLong)
    if (typeof raw.$numberDouble !== 'undefined') return Number(raw.$numberDouble)
  }
  return NaN
}

/**
 * Format an EJSON `$date` value to an ISO string without ever throwing.
 * Falls back to a readable representation of the raw value on failure.
 */
export const formatBsonDate = (rawDate) => {
  const ms = toEpochMs(rawDate)
  if (!Number.isNaN(ms)) {
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  // Could not interpret as a real date — show something instead of crashing.
  try {
    return typeof rawDate === 'object' ? JSON.stringify(rawDate) : String(rawDate)
  } catch {
    return String(rawDate)
  }
}
