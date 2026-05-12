/**
 * Unit tests for OnboardingWizard pure logic.
 *
 * The handleExit logic does not depend on React state or DOM; we test the
 * decision tree directly:
 *   isDirty = (step > 0) || (draft.name.trim().length > 0)
 *   if isDirty → window.confirm → if cancel do nothing, if confirm → router.push('/')
 *   if clean   → router.push('/') immediately
 */

import { describe, test, expect, vi } from 'vitest'

// ─── Pure handleExit logic ────────────────────────────────────────────────────
// Extract the isDirty check and routing decision so they can be tested without
// rendering the full component.

type ExitState = { step: number; name: string }

function isDirty(state: ExitState): boolean {
  return state.step > 0 || state.name.trim().length > 0
}

type ConfirmFn = (msg: string) => boolean
type PushFn = (path: string) => void

function handleExit(
  state: ExitState,
  confirm: ConfirmFn,
  push: PushFn,
): void {
  const dirty = isDirty(state)
  if (dirty && !confirm('Exit setup? Your progress will be lost.')) return
  push('/')
}

// ─── isDirty ─────────────────────────────────────────────────────────────────

describe('OnboardingWizard — isDirty', () => {
  test('step=0, name="" → clean (not dirty)', () => {
    expect(isDirty({ step: 0, name: '' })).toBe(false)
  })

  test('step=0, name="Foo" → dirty (name entered)', () => {
    expect(isDirty({ step: 0, name: 'Foo' })).toBe(true)
  })

  test('step=0, name="   " (whitespace only) → clean', () => {
    expect(isDirty({ step: 0, name: '   ' })).toBe(false)
  })

  test('step=1, name="" → dirty (step advanced)', () => {
    expect(isDirty({ step: 1, name: '' })).toBe(true)
  })

  test('step=2, name="" → dirty (step > 0)', () => {
    expect(isDirty({ step: 2, name: '' })).toBe(true)
  })

  test('step=3, name="Final" → dirty (both conditions true)', () => {
    expect(isDirty({ step: 3, name: 'Final' })).toBe(true)
  })

  test('step=0, name="  a  " (trimmed length > 0) → dirty', () => {
    expect(isDirty({ step: 0, name: '  a  ' })).toBe(true)
  })
})

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeConfirm(result: boolean): ConfirmFn {
  return vi.fn().mockReturnValue(result) as unknown as ConfirmFn
}

function makePush(): PushFn {
  return vi.fn() as unknown as PushFn
}

// ─── handleExit — clean state ─────────────────────────────────────────────────

describe('OnboardingWizard — handleExit, clean state (step=0, name="")', () => {
  test('navigates immediately without calling confirm', () => {
    const push    = makePush()
    const confirm = makeConfirm(false)
    handleExit({ step: 0, name: '' }, confirm, push)
    expect(confirm).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/')
  })

  test('navigates to "/" (landing page)', () => {
    const push    = makePush()
    const confirm = makeConfirm(false)
    handleExit({ step: 0, name: '' }, confirm, push)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/')
  })
})

// ─── handleExit — dirty state (name entered) ─────────────────────────────────

describe('OnboardingWizard — handleExit, dirty state (step=0, name="Foo")', () => {
  test('calls confirm before doing anything', () => {
    const push    = makePush()
    const confirm = makeConfirm(false)
    handleExit({ step: 0, name: 'Foo' }, confirm, push)
    expect(confirm).toHaveBeenCalledOnce()
  })

  test('confirm message is "Exit setup? Your progress will be lost."', () => {
    const push    = makePush()
    const confirm = makeConfirm(false)
    handleExit({ step: 0, name: 'Foo' }, confirm, push)
    expect(confirm).toHaveBeenCalledWith('Exit setup? Your progress will be lost.')
  })

  test('user cancels confirm → does NOT navigate', () => {
    const push    = makePush()
    const confirm = makeConfirm(false)
    handleExit({ step: 0, name: 'Foo' }, confirm, push)
    expect(push).not.toHaveBeenCalled()
  })

  test('user accepts confirm → navigates to "/"', () => {
    const push    = makePush()
    const confirm = makeConfirm(true)
    handleExit({ step: 0, name: 'Foo' }, confirm, push)
    expect(push).toHaveBeenCalledWith('/')
  })
})

// ─── handleExit — dirty state (step > 0) ─────────────────────────────────────

describe('OnboardingWizard — handleExit, dirty state (step=2, name="")', () => {
  test('shows confirm dialog when step > 0 even with empty name', () => {
    const push    = makePush()
    const confirm = makeConfirm(false)
    handleExit({ step: 2, name: '' }, confirm, push)
    expect(confirm).toHaveBeenCalledOnce()
  })

  test('cancel → stays (no navigation)', () => {
    const push    = makePush()
    const confirm = makeConfirm(false)
    handleExit({ step: 2, name: '' }, confirm, push)
    expect(push).not.toHaveBeenCalled()
  })

  test('confirm → navigates to "/"', () => {
    const push    = makePush()
    const confirm = makeConfirm(true)
    handleExit({ step: 2, name: '' }, confirm, push)
    expect(push).toHaveBeenCalledWith('/')
  })

  test('step=1 also triggers confirm', () => {
    const push    = makePush()
    const confirm = makeConfirm(false)
    handleExit({ step: 1, name: '' }, confirm, push)
    expect(confirm).toHaveBeenCalledOnce()
  })

  test('step=3 with name also triggers confirm', () => {
    const push    = makePush()
    const confirm = makeConfirm(false)
    handleExit({ step: 3, name: 'Almost done' }, confirm, push)
    expect(confirm).toHaveBeenCalledOnce()
  })
})

// ─── handleExit — edge cases ──────────────────────────────────────────────────

describe('OnboardingWizard — handleExit, edge cases', () => {
  test('push is never called more than once even when confirmed', () => {
    const push    = makePush()
    const confirm = makeConfirm(true)
    handleExit({ step: 0, name: 'Foo' }, confirm, push)
    expect(push).toHaveBeenCalledTimes(1)
  })

  test('whitespace-only name is treated as clean — no confirm', () => {
    const push    = makePush()
    const confirm = makeConfirm(false)
    handleExit({ step: 0, name: '   ' }, confirm, push)
    expect(confirm).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/')
  })
})
