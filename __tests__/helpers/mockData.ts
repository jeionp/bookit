import type { Booking } from "@/lib/firebase/bookings";
import type { Business } from "@/lib/types";
import type { Timestamp } from "firebase/firestore";

export const mockUser = {
  uid: "user-abc-123",
  email: "test@example.com",
  displayName: "Test User",
};

export const mockTimestamp = {
  seconds: 1745366400,
  nanoseconds: 0,
} as unknown as Timestamp;

export const mockBookingConfirmed: Booking = {
  id: "booking-111",
  userId: "user-abc-123",
  userEmail: "test@example.com",
  userName: "Test User",
  businessSlug: "paddleup",
  businessName: "PaddleUp",
  facilityId: "court-1",
  facilityName: "Court 1",
  date: "2026-04-27",
  hours: [9, 10, 11],
  totalPrice: 1500,
  currency: "PHP",
  status: "confirmed",
  createdAt: mockTimestamp,
};

export const mockBookingCancelled: Booking = {
  ...mockBookingConfirmed,
  id: "booking-222",
  hours: [14, 15],
  totalPrice: 1000,
  status: "cancelled",
};

// Normal-hours-only selection (all before prime time at 17)
export const mockSelectionNormal = {
  facilityId: "court-1",
  facilityName: "Court 1",
  hours: [9, 10, 11],
  pricePerHour: 500,
  primePricePerHour: 600,
  primeTimeStart: 17,
  totalPrice: 1500,
};

// Mixed normal + prime hours selection
export const mockSelectionMixed = {
  facilityId: "court-1",
  facilityName: "Court 1",
  hours: [15, 16, 17, 18],
  pricePerHour: 500,
  primePricePerHour: 600,
  primeTimeStart: 17,
  totalPrice: 2200, // 500*2 + 600*2
};

// Prime hours only
export const mockSelectionPrime = {
  facilityId: "court-1",
  facilityName: "Court 1",
  hours: [17, 18],
  pricePerHour: 500,
  primePricePerHour: 600,
  primeTimeStart: 17,
  totalPrice: 1200,
};

export const mockBusiness: Business = {
  slug: "paddleup",
  name: "PaddleUp",
  type: "court",
  tagline: "Where Pickleball Happens",
  description: "Test description.",
  coverImage: "https://example.com/cover.jpg",
  location: "Quezon City, Metro Manila",
  address: "123 Katipunan Ave, Quezon City",
  phone: "+63 917 123 4567",
  email: "hello@paddleup.ph",
  accentColor: "#16a34a",
  rating: 4.8,
  reviewCount: 214,
  facilities: [
    {
      id: "court-1",
      name: "Court 1",
      description: "Outdoor court.",
      image: "https://example.com/court1.jpg",
      pricePerHour: 500,
      primePricePerHour: 600,
      primeTimeStart: 17,
      currency: "PHP",
    },
    {
      id: "court-2",
      name: "Court 2",
      description: "Outdoor court.",
      image: "https://example.com/court2.jpg",
      pricePerHour: 500,
      primePricePerHour: 600,
      primeTimeStart: 17,
      currency: "PHP",
    },
  ],
  amenities: ["Free Parking", "Restrooms"],
  operatingHours: [
    { day: "Monday", open: "6:00 AM", close: "10:00 PM" },
    { day: "Tuesday", open: "6:00 AM", close: "10:00 PM" },
    { day: "Wednesday", open: "6:00 AM", close: "10:00 PM" },
    { day: "Thursday", open: "6:00 AM", close: "10:00 PM" },
    { day: "Friday", open: "6:00 AM", close: "11:00 PM" },
    { day: "Saturday", open: "5:00 AM", close: "11:00 PM" },
    { day: "Sunday", open: "5:00 AM", close: "10:00 PM" },
  ],
};
