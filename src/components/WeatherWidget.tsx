import { useState, useEffect, useRef } from 'react'
import { MapPin, Plus, X, Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Wind } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './WeatherWidget.css'

interface City {
  id: string
  name: string
  lat: number
  lon: number
}

interface WeatherData {
  temp: number
  description: string
  icon: string
  feelsLike: number
  humidity: number
  windSpeed: number
}

const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY

const DEFAULT_CITIES: City[] = [
  { id: 'moscow', name: 'Москва', lat: 55.7558, lon: 37.6173 },
  { id: 'kovrov', name: 'Ковров', lat: 56.3567, lon: 41.3194 },
]

const CACHE_DURATION = 15 * 60 * 1000

const getWeatherIcon = (iconCode: string) => {
  if (iconCode.startsWith('01')) return Sun
  if (iconCode.startsWith('02') || iconCode.startsWith('03') || iconCode.startsWith('04')) return Cloud
  if (iconCode.startsWith('09') || iconCode.startsWith('10')) return CloudRain
  if (iconCode.startsWith('11')) return CloudLightning
  if (iconCode.startsWith('13')) return CloudSnow
  return Wind
}

export default function WeatherWidget() {
  const [cities, setCities] = useState<City[]>(DEFAULT_CITIES)
  const [activeCity, setActiveCity] = useState<string>(DEFAULT_CITIES[0]?.id || '')
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAddCity, setShowAddCity] = useState(false)
  const [newCityName, setNewCityName] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const initialized = useRef(false)

  // Load user and settings
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        loadCitiesFromDB(user.id)
      }
    })
  }, [])

  const loadCitiesFromDB = async (uid: string) => {
    const { data } = await supabase
      .from('user_settings')
      .select('weather_cities')
      .eq('user_id', uid)
      .maybeSingle()

    if (data?.weather_cities && Array.isArray(data.weather_cities) && data.weather_cities.length > 0) {
      const savedCities = data.weather_cities as City[]
      setCities(savedCities)
      setActiveCity(savedCities[0].id)
    }
    initialized.current = true
  }

  const saveCitiesToDB = async (newCities: City[]) => {
    if (!userId || !initialized.current) return
    await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        weather_cities: newCities,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
  }

  // Save to DB when cities change
  useEffect(() => {
    if (initialized.current && userId) {
      saveCitiesToDB(cities)
    }
  }, [cities, userId])

  useEffect(() => {
    if (!activeCity || !API_KEY) return

    const city = cities.find(c => c.id === activeCity)
    if (!city) return

    const cacheKey = `weather_${city.id}`
    const cached = localStorage.getItem(cacheKey)

    if (cached) {
      const { data, timestamp } = JSON.parse(cached)
      if (Date.now() - timestamp < CACHE_DURATION) {
        setWeather(data)
        return
      }
    }

    setLoading(true)
    fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${city.lat}&lon=${city.lon}&appid=${API_KEY}&units=metric&lang=ru`)
      .then(res => {
        if (!res.ok) {
          throw new Error(res.status === 401 ? 'API ключ активируется (до 2 часов)' : `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then(data => {
        const weatherData: WeatherData = {
          temp: Math.round(data.main.temp),
          description: data.weather[0].description,
          icon: data.weather[0].icon,
          feelsLike: Math.round(data.main.feels_like),
          humidity: data.main.humidity,
          windSpeed: Math.round(data.wind.speed)
        }
        setWeather(weatherData)
        localStorage.setItem(cacheKey, JSON.stringify({ data: weatherData, timestamp: Date.now() }))
      })
      .catch(err => {
        console.error('Weather error:', err.message)
        setWeather({ temp: 0, description: err.message, icon: '', feelsLike: 0, humidity: 0, windSpeed: 0 })
      })
      .finally(() => setLoading(false))
  }, [activeCity, cities])

  const handleAddCity = async () => {
    if (!newCityName.trim() || !API_KEY) return

    try {
      const res = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(newCityName)}&limit=1&appid=${API_KEY}`)
      const data = await res.json()

      if (data.length > 0) {
        const { name, lat, lon } = data[0]
        const newCity: City = {
          id: `city_${Date.now()}`,
          name: data[0].local_names?.ru || name,
          lat,
          lon
        }
        setCities(prev => [...prev, newCity])
        setActiveCity(newCity.id)
        setNewCityName('')
        setShowAddCity(false)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const removeCity = (cityId: string) => {
    setCities(prev => {
      const filtered = prev.filter(c => c.id !== cityId)
      if (activeCity === cityId && filtered.length > 0) {
        setActiveCity(filtered[0].id)
      }
      return filtered
    })
  }

  if (!API_KEY) {
    console.log('WeatherWidget: API_KEY not found')
    return <div className="weather-widget"><div className="weather-loading">API ключ не найден</div></div>
  }

  const WeatherIcon = weather ? getWeatherIcon(weather.icon) : Cloud

  return (
    <div className="weather-widget">
      <div className="weather-content">
        {loading ? (
          <div className="weather-loading">Загрузка...</div>
        ) : weather ? (
          <>
            <div className="weather-main">
              <WeatherIcon size={48} className="weather-icon" />
              <div className="weather-temp">{weather.temp}°</div>
            </div>
            <div className="weather-desc">{weather.description}</div>
            <div className="weather-details">
              <span>Ощущается {weather.feelsLike}°</span>
              <span>Влажность {weather.humidity}%</span>
              <span>Ветер {weather.windSpeed} м/с</span>
            </div>
          </>
        ) : (
          <div className="weather-loading">Нет данных</div>
        )}
      </div>

      <div className="weather-cities">
        {cities.map(city => (
          <button
            key={city.id}
            className={`city-tab ${activeCity === city.id ? 'active' : ''}`}
            onClick={() => setActiveCity(city.id)}
          >
            <MapPin size={14} />
            <span>{city.name}</span>
            {cities.length > 1 && (
              <X
                size={12}
                className="remove-city"
                onClick={(e) => { e.stopPropagation(); removeCity(city.id) }}
              />
            )}
          </button>
        ))}
        <button className="city-tab add-city" onClick={() => setShowAddCity(true)}>
          <Plus size={14} />
        </button>
      </div>

      {showAddCity && (
        <div className="add-city-form">
          <input
            type="text"
            value={newCityName}
            onChange={(e) => setNewCityName(e.target.value)}
            placeholder="Название города"
            onKeyDown={(e) => e.key === 'Enter' && handleAddCity()}
          />
          <button onClick={handleAddCity}>Добавить</button>
          <button onClick={() => setShowAddCity(false)}>Отмена</button>
        </div>
      )}
    </div>
  )
}
