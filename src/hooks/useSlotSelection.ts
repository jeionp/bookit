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

  const activeSelection = selection?.facilityId === facility.id ? selection : null;
  const previewHours = drag
    ? getValidRange(drag.startHour, drag.currentHour, bookedHours)
    : [];

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

  useEffect(() => {
    if (!drag) return;
    function updateHourAt(clientX: number, clientY: number) {
      const el = document.elementFromPoint(clientX, clientY);
      const btn = el?.closest("[data-slot-hour]");
      if (!btn) return;
      const hour = parseInt(btn.getAttribute("data-slot-hour") ?? "", 10);
      if (!isNaN(hour)) {
        if (dragRef.current) dragRef.current = { ...dragRef.current, currentHour: hour };
        setDrag((d) => (d ? { ...d, currentHour: hour } : null));
      }
    }
    function handleMouseMove(e: MouseEvent) { updateHourAt(e.clientX, e.clientY); }
    function handleTouchMove(e: TouchEvent) {
      e.preventDefault();
      updateHourAt(e.touches[0].clientX, e.touches[0].clientY);
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [drag]);

  useEffect(() => {
    function finalizeSelection() {
      const currentDrag = dragRef.current;
      if (!currentDrag) return;
      const hours = getValidRange(currentDrag.startHour, currentDrag.currentHour, bookedHours);
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
  }, [drag, bookedHours, selection]);

  function handleSlotMouseDown(hour: number) {
    if (bookedHours.includes(hour)) return;
    prevSelectionRef.current = selection;
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
