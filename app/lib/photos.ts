// FORIOR stock photos, kept in public/stock/ for places that need a picture (dashboard hero, empty states, mockups).
// Add a file to public/stock/ and list it here to make it available.
export const STOCK = [
  { file: "villa-exterior-dusk.jpg", title: "Villa eksterior saat senja", kind: "Eksterior" },
  { file: "living-room-wood-ceiling.jpg", title: "Living room plafon kayu", kind: "Interior" },
  { file: "villa-interior-dining.jpg", title: "Interior villa, ruang makan", kind: "Interior" },
  { file: "japanese-restaurant.jpg", title: "Restoran Jepang", kind: "Komersial" }
] as const;

/** URL of a stock photo; follows the app's base path (domain root on Vercel, /social on GitHub Pages). */
export const stockUrl = (file: string) => `${typeof window === "undefined" ? "" : window.location.pathname.replace(/\/[^/]*$/, "")}/stock/${file}`;
