"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Facility } from "@/lib/types";
import { Selection, SlotState, getValidRange } from "@/lib/slots";

export function useSlotSelection(facility: Facility, bookedHours: number[], pendingHours: number[] = []) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const slotsRef = useRef<HTMLDivElement>(null);

  // Mirror props + state into refs so always-on effects read fresh values.
  const bookedHoursRef = useRef(bookedHours);
  const pendingHoursRef = useRef(pendingHours);
  const selectionRef = useRef<Selection | null>(null);
  const pendingStartRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    bookedHoursRef.current = bookedHours;
    pendingHoursRef.current = pendingHours;
    selectionRef.current = selection;
    pendingStartRef.current = pendingStart;
  });

  const activeSelection = selection?.facilityId === facility.id ? selection : null;
  const blockedHours = [...bookedHours, ...pendingHours];

  // Clear selection + pendingStart when tapping outside the slot grid / action bar.
  useEffect(() => {
    function handleOutside(e: PointerEvent) {
      const target = e.target as Node;
      const inSlots = slotsRef.current?.contains(target);
      const inActionBar = (document.querySelector("[data-testid='action-bar']") as HTMLElement | null)?.contains(target);
      if (!inSlots && !inActionBar) {
        setSelection(null);
        setPendingStart(null);
        pendingStartRef.current = null;
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, []);

  function handleSlotClick(hour: number) {
    if (blockedHours.includes(hour)) return;

    if (pendingStartRef.current === null) {
      // First tap: if tapping the only currently-selected slot, deselect it.
      if (selectionRef.current?.hours.length === 1 && selectionRef.current.hours[0] === hour) {
        setSelection(null);
        return;
      }
      // Otherwise start a new pending range.
      setSelection(null);
      setPendingStart(hour);
      pendingStartRef.current = hour;
    } else {
      // Second tap: commit the range.
      const start = pendingStartRef.current;
      const hours = getValidRange(start, hour, [...bookedHoursRef.current, ...pendingHoursRef.current]);
      setPendingStart(null);
      pendingStartRef.current = null;
      if (hours.length === 0) return;
      const totalPrice = hours.reduce((sum, h) => {
        const isPrime = facility.primePricePerHour && facility.primeTimeStart && h >= facility.primeTimeStart;
        return sum + (isPrime ? facility.primePricePerHour! : facility.pricePerHour);
      }, 0);
      setSelection({
        facilityId: facility.id,
        facilityName: facility.name,
        hours,
        pricePerHour: facility.pricePerHour,
        primePricePerHour: facility.primePricePerHour,
        primeTimeStart: facility.primeTimeStart,
        totalPrice,
      });
    }
  }

  function slotState(hour: number): SlotState {
    if (bookedHours.includes(hour)) return "booked";
    if (pendingHours.includes(hour)) return "pending";
    if (pendingStart === hour) return "pending-start";
    if (activeSelection?.hours.includes(hour)) return "active";
    return "available";
  }

  return { activeSelection, pendingStart, slotsRef, handleSlotClick, slotState };
}
