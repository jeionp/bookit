"use client";

import { useState, useRef, useEffect } from "react";
import { Facility } from "@/lib/types";
import { Selection, DragState, SlotState, getValidRange } from "@/lib/slots";

export function useSlotSelection(facility: Facility, bookedHours: number[]) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const slotsRef = useRef<HTMLDivElement>(null);
  const prevSelectionRef = useRef<Selection | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const lastTouchTime = useRef(0);

  // Mirror props into refs so always-on effects read fresh values without
  // needing to be re-registered whenever bookedHours or selection changes.
  const bookedHoursRef = useRef(bookedHours);
  bookedHoursRef.current = bookedHours;
  const selectionRef = useRef<Selection | null>(null);
  selectionRef.current = selection;

  const activeSelection = selection?.facilityId === facility.id ? selection : null;
  const previewHours = drag
    ? getValidRange(drag.startHour, drag.currentHour, bookedHours)
    : [];

  // Registered once — clears selection when clicking outside slot grid / action bar.
  useEffect(() => {
    function handleOutside(e: PointerEvent) {
      if (dragRef.current) return;
      const target = e.target as Node;
      const inSlots = slotsRef.current?.contains(target);
      const inActionBar = (document.querySelector("[data-testid='action-bar']") as HTMLElement | null)?.contains(target);
      if (!inSlots && !inActionBar) setSelection(null);
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, []);

  // Registered once — tracks drag position via mousemove / touchmove.
  // Guards on dragRef.current so it's a no-op when not dragging.
  // Empty deps avoids the re-registration timing gap that breaks Playwright tests:
  // with [drag] deps, the listener wasn't registered yet when Playwright fired
  // mousemove immediately after mousedown, keeping currentHour stuck at the start slot.
  useEffect(() => {
    function updateHourAt(clientX: number, clientY: number) {
      if (!dragRef.current) return;
      const el = document.elementFromPoint(clientX, clientY);
      const btn = el?.closest("[data-slot-hour]");
      if (!btn) return;
      const hour = parseInt(btn.getAttribute("data-slot-hour") ?? "", 10);
      if (!isNaN(hour)) {
        dragRef.current = { ...dragRef.current, currentHour: hour };
        setDrag((d) => (d ? { ...d, currentHour: hour } : null));
      }
    }
    function handleMouseMove(e: MouseEvent) { updateHourAt(e.clientX, e.clientY); }
    function handleTouchMove(e: TouchEvent) {
      if (!dragRef.current) return;
      e.preventDefault();
      updateHourAt(e.touches[0].clientX, e.touches[0].clientY);
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  // Registered once — finalizes selection on mouseup / touchend.
  // Reads bookedHours and selection from refs for fresh values without re-registration.
  useEffect(() => {
    function finalizeSelection() {
      const currentDrag = dragRef.current;
      if (!currentDrag) return;
      const hours = getValidRange(currentDrag.startHour, currentDrag.currentHour, bookedHoursRef.current);
      dragRef.current = null;
      setDrag(null);

      if (hours.length === 0) return;

      const prev = prevSelectionRef.current;
      if (
        hours.length === 1 &&
        prev?.facilityId === currentDrag.facilityId &&
        prev.hours.length === 1 &&
        prev.hours[0] === hours[0]
      ) {
        setSelection(null);
        return;
      }

      const { pricePerHour, primePricePerHour, primeTimeStart } = currentDrag;
      const totalPrice = hours.reduce((sum, h) => {
        const isPrime = primePricePerHour && primeTimeStart && h >= primeTimeStart;
        return sum + (isPrime ? primePricePerHour : pricePerHour);
      }, 0);
      setSelection({
        facilityId: currentDrag.facilityId,
        facilityName: currentDrag.facilityName,
        hours,
        pricePerHour,
        primePricePerHour,
        primeTimeStart,
        totalPrice,
      });
    }

    window.addEventListener("mouseup", finalizeSelection);
    window.addEventListener("touchend", finalizeSelection);
    return () => {
      window.removeEventListener("mouseup", finalizeSelection);
      window.removeEventListener("touchend", finalizeSelection);
    };
  }, []);

  function handleSlotMouseDown(hour: number) {
    if (bookedHoursRef.current.includes(hour)) return;
    prevSelectionRef.current = selectionRef.current;
    setSelection(null);
    const newDrag: DragState = {
      facilityId: facility.id,
      facilityName: facility.name,
      startHour: hour,
      currentHour: hour,
      pricePerHour: facility.pricePerHour,
      primePricePerHour: facility.primePricePerHour,
      primeTimeStart: facility.primeTimeStart,
    };
    dragRef.current = newDrag;
    setDrag(newDrag);
  }

  function slotState(hour: number): SlotState {
    if (bookedHours.includes(hour)) return "booked";
    if (drag?.facilityId === facility.id && previewHours.includes(hour)) return "preview";
    if (!drag && activeSelection?.hours.includes(hour)) return "active";
    return "available";
  }

  return { activeSelection, drag, slotsRef, lastTouchTime, handleSlotMouseDown, slotState };
}
