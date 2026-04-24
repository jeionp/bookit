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

// ─── Stubs ────────────────────────────────────────────────────────────────────
// Replace each stub with a real implementation to make the tests pass.

export function generateTimeSlots(_openHour: number, _closeHour: number): number[] {
  throw new Error('not implemented')
}

export function isPastSlot(_date: Date, _hour: number): boolean {
  throw new Error('not implemented')
}

export function isWithinBookingWindow(_date: Date): boolean {
  throw new Error('not implemented')
}

export function calculateBookingPrice(_selectedHours: number[], _config: PriceConfig): PriceResult {
  throw new Error('not implemented')
}

export function isSlotAvailable(_hour: number, _bookedHours: number[]): boolean {
  throw new Error('not implemented')
}

export function isSelectionContiguous(_selectedHours: number[]): boolean {
  throw new Error('not implemented')
}

export function getUpdatedSelection(_currentSelection: number[], _clickedHour: number): number[] {
  throw new Error('not implemented')
}

export function selectSlotRange(_fromHour: number, _toHour: number): number[] {
  throw new Error('not implemented')
}

export function isBusinessOpen(_dayOfWeek: number, _schedule: WeeklySchedule[]): boolean {
  throw new Error('not implemented')
}

export function detectBookingConflict(
  _courtId: string,
  _date: string,
  _requestedHours: number[],
  _existingBookings: ExistingBooking[],
): boolean {
  throw new Error('not implemented')
}

export function shouldResetSelection(_currentCourtId: string, _newCourtId: string): boolean {
  throw new Error('not implemented')
}
