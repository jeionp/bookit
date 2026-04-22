import { Business } from "./types";

export const businesses: Business[] = [
  {
    slug: "paddleup",
    name: "PaddleUp",
    type: "court",
    tagline: "Where Pickleball Happens",
    description:
      "PaddleUp is Quezon City's premier pickleball facility, offering top-quality courts for players of all skill levels. Whether you're a beginner looking to learn the game or a seasoned competitor, our courts and community welcome you. Enjoy well-maintained surfaces, quality equipment rentals, and a vibrant community of fellow players.",
    coverImage: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1400&q=80",
    location: "Quezon City, Metro Manila",
    address: "123 Katipunan Ave, Loyola Heights, Quezon City, 1108 Metro Manila",
    phone: "+63 917 123 4567",
    email: "hello@paddleup.ph",
    accentColor: "#16a34a",
    rating: 4.8,
    reviewCount: 214,
    facilities: [
      {
        id: "court-1",
        name: "Court 1",
        description: "Full-size outdoor pickleball court with premium surface and LED lighting for night play.",
        image: "https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80",
        pricePerHour: 500,
        currency: "PHP",
      },
      {
        id: "court-2",
        name: "Court 2",
        description: "Full-size outdoor pickleball court with premium surface and LED lighting for night play.",
        image: "https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?w=800&q=80",
        pricePerHour: 500,
        currency: "PHP",
      },
      {
        id: "court-3",
        name: "Court 3 (Indoor)",
        description: "Climate-controlled indoor court perfect for year-round play regardless of weather.",
        image: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80",
        pricePerHour: 700,
        currency: "PHP",
      },
      {
        id: "court-4",
        name: "Court 4 (Indoor)",
        description: "Climate-controlled indoor court perfect for year-round play regardless of weather.",
        image: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80",
        pricePerHour: 700,
        currency: "PHP",
      },
    ],
    amenities: [
      "Free Parking",
      "Restrooms & Showers",
      "Equipment Rental",
      "Locker Room",
      "Pro Shop",
      "Snack Bar",
      "Free Wi-Fi",
      "Spectator Area",
    ],
    operatingHours: [
      { day: "Monday", open: "6:00 AM", close: "10:00 PM" },
      { day: "Tuesday", open: "6:00 AM", close: "10:00 PM" },
      { day: "Wednesday", open: "6:00 AM", close: "10:00 PM" },
      { day: "Thursday", open: "6:00 AM", close: "10:00 PM" },
      { day: "Friday", open: "6:00 AM", close: "11:00 PM" },
      { day: "Saturday", open: "5:00 AM", close: "11:00 PM" },
      { day: "Sunday", open: "5:00 AM", close: "10:00 PM" },
    ],
  },
];

export function getBusinessBySlug(slug: string): Business | undefined {
  return businesses.find((b) => b.slug === slug);
}
