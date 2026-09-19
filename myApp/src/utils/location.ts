import * as Location from "expo-location";

export async function reverseGeocodeAreaLabel(latitude: number, longitude: number): Promise<string> {
  try {
    const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!address) {
      return "";
    }

    const area = address.district ?? address.subregion ?? address.name ?? "";
    const city = address.city ?? address.region ?? "";
    if (area && city && area.toLowerCase() !== city.toLowerCase()) {
      return `${area}, ${city}`;
    }

    return area || city;
  } catch {
    return "";
  }
}