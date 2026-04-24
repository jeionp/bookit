// ─── Types ────────────────────────────────────────────────────────────────────

export type PriceConfig = {
  standardRate: number
  primeTimeRate: number
  primeTimeStartHour: number
}

export type SlotBreakdownItem = {
  hour: number
  rate: number
  isPrimeTime: boolean
}

export type PriceResult = {
  total: number
  standardHours: number
  primeTimeHours: number
  breakdown: SlotBreakdownItem[]
}

export type WeeklySchedule = {
  dayOfWeek: number // 0 = Sunday … 6 = Saturday
  openHour: number
  closeHour: number
  isClosed: boolean
}

export type ExistingBooking = {
  courtId: string
  date: string // YYYY-MM-DD
  hours: number[]
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Returns current date and hour in Philippine Standard Time (UTC+8).
function getPHTNow(): { dateStr: string; hour: number } {
  const pht = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return {
    dateStr: pht.toISOString().split('T')[0],
    hour: pht.getUTCHours(),
  }
}

// ─── Implementations ──────────────────────────────────────────────────────────

export function generateTimeSlots(openHour: number, closeHour: number): number[] {
  if (closeHour <= openHour) return []
  const slots: number[] = []
  for (let h = openHour; h < closeHour; h++) slots.push(h)
  return slots
}

export function isPastSlot(date: Date, hour: number): boolean {
  const { dateStr: todayStr, hour: currentHour } = getPHTNow()
  const slotDateStr = date.toISOString().split('T')[0]
  if (slotDateStr < todayStr) return true
  if (slotDateStr > todayStr) return false
  // Same day: the slot is past only if it has already finished (hour < currentHour)
  return hour < currentHour
}

export function isWithinBookingWindow(date: Date): boolean {
  const { dateStr: todayStr } = getPHTNow()
  const slotDateStr = date.toISOString().split('T')[0]
  if (slotDateStr < todayStr) return false
  const maxDate = new Date(todayStr)
  maxDate.setDate(maxDate.getDate() + 30)
  const maxStr = maxDate.toISOString().split('T')[0]
  return slotDateStr <= maxStr
}

export function calculateBookingPrice(selectedHours: number[], config: PriceConfig): PriceResult {
  const breakdown: SlotBreakdownItem[] = selectedHours.map((hour) => {
    const isPrimeTime = hour >= config.primeTimeStartHour
    return { hour, rate: isPrimeTime ? config.primeTimeRate : config.standardRate, isPrimeTime }
  })
  const total = breakdown.reduce((sum, item) => sum + item.rate, 0)
  const standardHours = breakdown.filter((item) => !item.isPrimeTime).length
  const primeTimeHours = breakdown.filter((item) => item.isPrimeTime).length
  return { total, standardHours, primeTimeHours, breakdown }
}

export function isSlotAvailable(hour: number, bookedHours: number[]): boolean {
  return !bookedHours.includes(hour)
}

export function isSelectionContiguous(selectedHours: number[]): boolean {
  if (selectedHours.length <= 1) return true
  const sorted = [...selectedHours].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false
  }
  return true
}

export function getUpdatedSelection(currentSelection: number[], clickedHour: number): number[] {
  if (currentSelection.includes(clickedHour)) return []
  if (currentSelection.length === 0) return [clickedHour]
  const sorted = [...currentSelection].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  if (clickedHour === max + 1) return [...sorted, clickedHour]
  if (clickedHour === min - 1) return [clickedHour, ...sorted]
  // Non-contiguous — leave selection unchanged
  return currentSelection
}

export function selectSlotRange(fromHour: number, toHour: number): number[] {
  const start = Math.min(fromHour, toHour)
  const end = Math.max(fromHour, toHour)
  const hours: number[] = []
  for (let h = start; h <= end; h++) hours.push(h)
  return hours
}

export function isBusinessOpen(dayOfWeek: number, schedule: WeeklySchedule[]): boolean {
  const entry = schedule.find((s) => s.dayOfWeek === dayOfWeek)
  return entry ? !entry.isClosed : false
}

export function detectBookingConflict(
  courtId: string,
  date: string,
  requestedHours: number[],
  existingBookings: ExistingBooking[],
): boolean {
  const takenHours = new Set(
    existingBookings
      .filter((b) => b.courtId === courtId && b.date === date)
      .flatMap((b) => b.hours)
  )
  return requestedHours.some((h) => takenHours.has(h))
}

export function shouldResetSelection(currentCourtId: string, newCourtId: string): boolean {
  return currentCourtId !== newCourtId
}
