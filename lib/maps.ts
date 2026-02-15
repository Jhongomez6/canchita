export function googleMapsEmbedUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
}

export function googleMapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function wazeLink(lat: number, lng: number) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}
