export type BusinessType = "court" | "appointment" | "room";

export interface Facility {
  id: string;
  name: string;
  description: string;
  image: string;
  pricePerHour: number;       // base/normal rate
  primePricePerHour?: number; // prime time rate (optional)
  primeTimeStart?: number;    // hour when prime time begins e.g. 17 = 5 PM
  currency: string;
}

export interface OperatingHours {
  day: string;
  open: string;
  close: string;
  closed?: boolean;
}

export interface Business {
  slug: string;
  name: string;
  type: BusinessType;
  tagline: string;
  description: string;
  coverImage: string;
  location: string;
  address: string;
  phone: string;
  email: string;
  accentColor: string;
  rating: number;
  reviewCount: number;
  facilities: Facility[];
  amenities: string[];
  operatingHours: OperatingHours[];
}
