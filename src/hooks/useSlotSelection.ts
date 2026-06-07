"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Facility } from "@/lib/types";
import { Selection, SlotState, getValidRange } from "@/lib/slots";

export function useSlotSelection(facility: Facility, bookedHours: number[], pendingHours: number[] = []) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const slotsRef = useRef<HTMLDivElement>(null);

  // Mirror props + state into refs so always-on effects read fresh values.
  const bookedHoursRef = useRef(bookedHours);
  const pendingHoursRef = useRef(pendingHours);
  const selectionRef = useRef<Selection | null>(null);
  useLayoutEffect(() => {
    bookedHoursRef.current = bookedHours;
    pendingHoursRef.current = pendingHours;
    selectionRef.current = selection;
  });

  const activeSelection = selection?.facilityId === facility.id ? selection : null;
  const blockedHours = [...bookedHours, ...pendingHours];

  // Clear selection when tapping outside the slot grid / action bar.
  useEffect(() => {
    function handleOutside(e: PointerEvent) {
      const target = e.target as Node;
      const inSlots = slotsRef.current?.contains(target);
      const inActionBar = (document.querySelector("[data-testid='action-bar']") as HTMLElement | null)?.contains(target);
      if (!inSlots && !inActionBar) {
        setSelection(null);
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, []);

  function handleSlotClick(hour: number) {
    if (blockedHours.includes(hour)) return;

    const current = selectionRef.current;

    const makeSelection = (hours: number[]) => ({
      facilityId: facility.id,
      facilityName: facility.name,
      hours,
      pricePerHour: facility.pricePerHour,
      primePricePerHour: facility.primePricePerHour,
      primeTimeStart: facility.primeTimeStart,
      totalPrice: hours.reduce((sum, h) => {
        const isPrime = facility.primePricePerHour && facility.primeTimeStart && h >= facility.primeTimeStart;
        return sum + (isPrime ? facility.primePricePerHour! : facility.pricePerHour);
      }, 0),
    });

    if (!current) {
      // No selection → commit single slot immediately
      setSelection(makeSelection([hour]));
      return;
    }

    // Tap any slot already in the selection → deselect
    if (current.hours.includes(hour)) {
      setSelection(null);
      return;
    }

    // Tap a different slot → extend/shrink range from original start
    const start = current.hours[0];
    const hours = getValidRange(start, hour, [...bookedHoursRef.current, ...pendingHoursRef.current]);
    setSelection(makeSelection(hours.length > 0 ? hours : [hour]));
  }

  function slotState(hour: number): SlotState {
    if (bookedHours.includes(hour)) return "booked";
    if (pendingHours.includes(hour)) return "pending";
    if (activeSelection?.hours.includes(hour)) return "active";
    return "available";
  }

  return { activeSelection, slotsRef, handleSlotClick, slotState };
}
