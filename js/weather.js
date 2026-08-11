/* ===========================
   Weather Functionality
   =========================== */

(function () {
  const BASE_URL = "https://api.open-meteo.com/v1/forecast";

  function getSettings() {
    const config = window.APP_CONFIG || {};
    const weather = config.weather || {};
    return {
      name: weather.name || "Your location",
      latitude: Number(weather.latitude),
      longitude: Number(weather.longitude),
      temperatureUnit: weather.temperatureUnit === "celsius" ? "celsius" : "fahrenheit",
      windspeedUnit: weather.windspeedUnit || "mph",
      timezone: weather.timezone || "auto"
    };
  }

  function featureEnabled(name) {
    const features = (window.APP_CONFIG && window.APP_CONFIG.features) || {};
    return features[name] !== false;
  }

  function temperatureSymbol(settings) {
    return settings.temperatureUnit === "celsius" ? "°C" : "°F";
  }

  function windspeedLabel(unit) {
    return ({ mph: "mph", kmh: "km/h", ms: "m/s", kn: "kn" })[unit] || unit;
  }

  function buildUrl(params) {
    return `${BASE_URL}?${new URLSearchParams(params).toString()}`;
  }

  async function fetchWeeklyWeather(settings) {
    const element = document.getElementById("weekly-weather");
    if (!element) return;

    const url = buildUrl({
      latitude: settings.latitude,
      longitude: settings.longitude,
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_mean",
      temperature_unit: settings.temperatureUnit,
      timezone: settings.timezone
    });

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
      const data = await response.json();
      if (!data.daily || !Array.isArray(data.daily.time)) throw new Error("Weekly forecast is unavailable");

      const maxTemps = data.daily.temperature_2m_max || [];
      const minTemps = data.daily.temperature_2m_min || [];
      const precipitation = data.daily.precipitation_probability_mean || [];
      const overallMin = Math.min(...minTemps);
      const overallMax = Math.max(...maxTemps);
      const symbol = temperatureSymbol(settings);

      element.replaceChildren();
      data.daily.time.forEach((date, index) => {
        const day = document.createElement("div");
        day.className = "flex flex-col items-center";

        const weekday = document.createElement("span");
        weekday.className = "font-medium text-sm";
        weekday.textContent = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });

        const maximum = document.createElement("span");
        maximum.className = "text-xs";
        maximum.style.color = getTemperatureColor(maxTemps[index], overallMin, overallMax);
        maximum.textContent = `${Math.round(maxTemps[index])}${symbol}`;

        const minimum = document.createElement("span");
        minimum.className = "text-xs";
        minimum.style.color = getTemperatureColor(minTemps[index], overallMin, overallMax);
        minimum.textContent = `${Math.round(minTemps[index])}${symbol}`;

        const rain = document.createElement("span");
        rain.className = "text-xs text-blue-500";
        rain.textContent = `${Math.round(precipitation[index] || 0)}%`;

        day.append(weekday, maximum, minimum, rain);
        element.appendChild(day);
      });
    } catch (_error) {
      element.textContent = "Unable to fetch weekly forecast.";
    }
  }

  async function fetchHourlyWeather(settings) {
    const status = document.getElementById("weather");
    if (!status) return;

    const url = buildUrl({
      latitude: settings.latitude,
      longitude: settings.longitude,
      current_weather: "true",
      temperature_unit: settings.temperatureUnit,
      windspeed_unit: settings.windspeedUnit,
      hourly: "temperature_2m,precipitation_probability",
      forecast_days: "1",
      timezone: settings.timezone
    });

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
      const data = await response.json();
      if (!data.current_weather || !data.hourly) throw new Error("Hourly forecast is unavailable");

      const current = data.current_weather;
      status.textContent = `Now: ${current.temperature}${temperatureSymbol(settings)}, ${current.windspeed} ${windspeedLabel(settings.windspeedUnit)} wind`;

      const times = data.hourly.time.map((value) => new Date(value));
      const labels = times.map(formatHour);
      let currentHourIndex = data.hourly.time.findIndex((value) => value === current.time);
      if (currentHourIndex === -1) {
        const currentHour = new Date(current.time).getHours();
        currentHourIndex = times.findIndex((value) => value.getHours() === currentHour);
      }

      createWeatherChart(
        labels,
        data.hourly.temperature_2m,
        data.hourly.precipitation_probability,
        currentHourIndex,
        temperatureSymbol(settings)
      );
    } catch (_error) {
      status.textContent = "Unable to fetch weather.";
    }
  }

  function getTemperatureColor(temp, minTemp, maxTemp) {
    const range = maxTemp - minTemp;
    const ratio = Number.isFinite(range) && range > 0 ? (temp - minTemp) / range : 0.5;
    const red = Math.round(255 * ratio);
    const blue = Math.round(255 * (1 - ratio));
    return `rgb(${red}, 0, ${blue})`;
  }

  function formatHour(date) {
    return date.toLocaleTimeString("en-US", { hour: "numeric" });
  }

  function createWeatherChart(labels, temperatures, precipitation, currentHourIndex, symbol) {
    const canvas = document.getElementById("forecastChart");
    if (!canvas || typeof window.Chart !== "function") return;

    if (window.forecastChartInstance) window.forecastChartInstance.destroy();

    window.forecastChartInstance = new window.Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Precip (%)",
            data: precipitation,
            backgroundColor: "rgba(34,197,94,0.2)",
            borderColor: "#22c55e",
            borderWidth: 1,
            yAxisID: "y2"
          },
          {
            label: `Temp (${symbol})`,
            data: temperatures,
            type: "line",
            borderColor: "#3b82f6",
            backgroundColor: "transparent",
            yAxisID: "y1",
            tension: 0.4,
            pointBackgroundColor: labels.map((_, index) => index === currentHourIndex ? "#dc2626" : "#3b82f6"),
            pointRadius: labels.map((_, index) => index === currentHourIndex ? 5 : 3)
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: { mode: "index", intersect: false },
          legend: { position: "bottom" }
        },
        scales: {
          y1: {
            type: "linear",
            position: "left",
            title: { display: true, text: `Temperature (${symbol})` },
            suggestedMin: Math.min(...temperatures) - 5,
            suggestedMax: Math.max(...temperatures) + 5
          },
          y2: {
            type: "linear",
            position: "right",
            title: { display: true, text: "Precip (%)" },
            min: 0,
            max: 100,
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  function initializeWeather() {
    const settings = getSettings();
    const heading = document.getElementById("weekly-weather-heading");
    if (heading) heading.textContent = `Weekly Forecast: ${settings.name}`;

    if (!Number.isFinite(settings.latitude) || !Number.isFinite(settings.longitude)) {
      const weekly = document.getElementById("weekly-weather");
      const hourly = document.getElementById("weather");
      if (weekly) weekly.textContent = "Add weather coordinates in js/app-config.js.";
      if (hourly) hourly.textContent = "Add weather coordinates in js/app-config.js.";
      return;
    }

    if (featureEnabled("weeklyWeather")) fetchWeeklyWeather(settings);
    if (featureEnabled("hourlyWeather")) fetchHourlyWeather(settings);
  }

  window.initializeWeather = initializeWeather;
})();
