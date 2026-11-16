'use strict';

/* =============================================================
   weather.js — current weather from Open-Meteo (free, no API key).
   1. The city name you type is turned into coordinates
      (geocoding-api.open-meteo.com).
   2. Current temperature + weather code are fetched for those
      coordinates (api.open-meteo.com).
   Results are cached for 30 minutes so new tabs open instantly.
   No location permission is needed: only the city name is sent.
   ============================================================= */

const Weather = (() => {
  const KEY = 'glyph-zoo:weather';
  const MAX_AGE = 30 * 60 * 1000; // 30 minutes

  // WMO weather codes -> [symbol, description]
  function describe(code, isDay) {
    if (code === 0) return isDay ? ['☀', 'Clear'] : ['☾', 'Clear'];
    if (code <= 2) return isDay ? ['⛅', 'Partly cloudy'] : ['☾', 'Partly cloudy'];
    if (code === 3) return ['☁', 'Cloudy'];
    if (code === 45 || code === 48) return ['≋', 'Fog'];
    if (code >= 51 && code <= 57) return ['☂', 'Drizzle'];
    if (code >= 61 && code <= 67) return ['☂', 'Rain'];
    if (code >= 71 && code <= 77) return ['❄', 'Snow'];
    if (code >= 80 && code <= 82) return ['☂', 'Showers'];
    if (code === 85 || code === 86) return ['❄', 'Snow showers'];
    if (code >= 95) return ['⚡', 'Thunderstorm'];
    return ['☁', 'Cloudy'];
  }

  function readCache() {
    try {
      return JSON.parse(localStorage.getItem(KEY));
    } catch {
      return null;
    }
  }

  function writeCache(value) {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      /* storage blocked — just refetch next time */
    }
  }

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('network');
    return res.json();
  }

  // Returns { name, temp, code, isDay, ... } or throws Error('notfound' | 'network').
  async function get(city, unit, force = false) {
    const query = city.trim().toLowerCase();
    const cached = readCache();
    if (!force && cached && cached.query === query && cached.unit === unit && Date.now() - cached.at < MAX_AGE) {
      return cached;
    }

    const geo = await getJSON(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1&language=en&format=json`
    );
    const place = geo.results && geo.results[0];
    if (!place) throw new Error('notfound');

    const forecast = await getJSON(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,weather_code,is_day&temperature_unit=${unit === 'f' ? 'fahrenheit' : 'celsius'}`
    );
    const cur = forecast.current;
    const value = {
      query,
      unit,
      name: place.name,
      temp: cur.temperature_2m,
      code: cur.weather_code,
      isDay: cur.is_day === 1,
      at: Date.now(),
    };
    writeCache(value);
    return value;
  }

  return { get, describe };
})();
