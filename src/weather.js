export const plateauLocalGovernments = [
  { name: "Barkin Ladi", place: "Barkin Ladi", latitude: 9.53812, longitude: 8.8927 },
  { name: "Bassa", place: "Bassa", latitude: 9.94249, longitude: 8.74042 },
  { name: "Bokkos", place: "Bokkos", latitude: 9.29921, longitude: 8.99467 },
  { name: "Jos East", place: "Angware", latitude: 9.99105, longitude: 9.10811 },
  { name: "Jos North", place: "Jos", latitude: 9.92849, longitude: 8.89212 },
  { name: "Jos South", place: "Bukuru", latitude: 9.79399, longitude: 8.86397 },
  { name: "Kanam", place: "Dengi", latitude: 9.36872, longitude: 9.96223 },
  { name: "Kanke", place: "Kabwir", latitude: 9.39663, longitude: 9.57546 },
  { name: "Langtang North", place: "Langtang", latitude: 9.14164, longitude: 9.79101 },
  { name: "Langtang South", place: "Mabudi", latitude: 8.73037, longitude: 9.78512 },
  { name: "Mangu", place: "Mangu", latitude: 9.5206, longitude: 9.09769 },
  { name: "Mikang", place: "Tunkus", latitude: 9.02167, longitude: 9.61384 },
  { name: "Pankshin", place: "Pankshin", latitude: 9.32541, longitude: 9.4352 },
  { name: "Qua'an Pan", place: "Baap", latitude: 8.94321, longitude: 9.24126 },
  { name: "Riyom", place: "Riyom", latitude: 9.63681, longitude: 8.75694 },
  { name: "Shendam", place: "Shendam", latitude: 8.87866, longitude: 9.53464 },
  { name: "Wase", place: "Wase", latitude: 9.09424, longitude: 9.95605 }
];

export const weatherLocationStorageKey = "agriplus-weather-location";

export async function fetchWeather(latitude, longitude, signal) {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
    hourly: "temperature_2m,precipitation_probability,precipitation,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset",
    forecast_days: "7",
    timezone: "auto"
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal });
  if (!response.ok) throw new Error(`Weather provider returned HTTP ${response.status}.`);
  const data = await response.json();
  if (!data.current || !data.daily || !data.hourly || !data.timezone) {
    throw new Error("The weather provider returned incomplete forecast data.");
  }
  return data;
}

export async function searchWeatherLocations(search, signal) {
  const query = new URLSearchParams({
    name: search,
    count: "8",
    language: "en",
    format: "json",
    countryCode: "NG"
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${query}`, { signal });
  if (!response.ok) throw new Error(`Location search returned HTTP ${response.status}.`);
  const data = await response.json();
  return (data.results ?? []).map(location => ({
    id: `${location.id}-${location.latitude}-${location.longitude}`,
    name: location.name,
    admin1: location.admin1 ?? "",
    admin2: location.admin2 ?? "",
    country: location.country ?? "Nigeria",
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone
  }));
}

export function describeWeatherCode(code, isDay = true) {
  if (code === 0) return isDay ? "Clear sky" : "Clear night";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55].includes(code)) return "Drizzle";
  if ([56, 57].includes(code)) return "Freezing drizzle";
  if ([61, 63, 65].includes(code)) return "Rain";
  if ([66, 67].includes(code)) return "Freezing rain";
  if ([71, 73, 75, 77].includes(code)) return "Snow";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([85, 86].includes(code)) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if ([96, 99].includes(code)) return "Thunderstorm with hail";
  return "Conditions unavailable";
}

export function weatherLocationLabel(location) {
  return [location.name, location.admin2, location.admin1, location.country].filter(Boolean).join(", ");
}
