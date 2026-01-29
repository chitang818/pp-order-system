/**
 * 欢迎卡片渲染模块
 */

import { getUser } from '../../utils/auth.js';
import { isRealTauriEnvironment } from '../../utils/tauri-env.js';
import { invokeCommand } from '../../utils/tauri-api.js';

/**
 * 获取缓存的天气信息
 */
function getCachedWeather() {
  try {
    const cached = localStorage.getItem('weather_cache');
    if (cached) {
      const data = JSON.parse(cached);
      // 缓存有效期30分钟
      if (Date.now() - data.timestamp < 30 * 60 * 1000) {
        return data.weather;
      }
    }
  } catch (e) {
    // 忽略缓存错误
  }
  return null;
}

/**
 * 保存天气信息到缓存
 */
function setCachedWeather(weather) {
  try {
    localStorage.setItem('weather_cache', JSON.stringify({
      weather: weather,
      timestamp: Date.now()
    }));
  } catch (e) {
    // 忽略缓存错误
  }
}

/**
 * 安全的 Fetch 方法，在 Tauri 环境下使用后端代理以规避 CORS
 */
async function safeFetch(url, options = {}) {
  const isTauri = isRealTauriEnvironment();
  const acceptHeader = options?.headers?.Accept || options?.headers?.['Accept'];
  const responseType = acceptHeader === 'text/plain' ? 'text' : 'json';

  // 关键点：在 Tauri 打包环境下不要回退到浏览器 fetch（会触发 CORS 报错）。
  if (isTauri) {
    try {
      const result = await invokeCommand('app_http_get', { url, response_type: responseType });
      const ok = !!result?.ok;
      return {
        ok,
        json: async () => {
          if (responseType === 'json') {
            // 优先取 Rust 端解析好的 data；否则尝试解析 text；最后返回空对象
            if (result && typeof result === 'object' && 'data' in result) return result.data;
            if (result?.text) {
              try { return JSON.parse(result.text); } catch (_) { return {}; }
            }
            return {};
          }
          // text 模式：尝试把 text 解析成 json（兼容旧逻辑）
          try { return JSON.parse(result?.text || '{}'); } catch (_) { return {}; }
        },
        text: async () => (responseType === 'text' ? (result?.text || '') : JSON.stringify(result?.data ?? result ?? {})),
      };
    } catch (e) {
      // 返回一个“失败响应”，让调用方继续尝试其它方案，但不触发跨域 fetch。
      return {
        ok: false,
        json: async () => ({}),
        text: async () => '',
      };
    }
  }

  // 浏览器模式：直接使用 fetch（若被 CORS 限制，调用方会继续尝试其它方案）
  return fetch(url, options);
}

/**
 * 通过IP定位获取城市名称（免费，无需API Key）
 */
async function getCityByIP() {
  try {
    // 方案1: 使用ipapi.co（HTTPS，更可靠）
    try {
      const ipApiCoUrl = 'https://ipapi.co/json/';
      const controller1 = new AbortController();
      const timeoutId1 = setTimeout(() => controller1.abort(), 3000);

      const response1 = await safeFetch(ipApiCoUrl, {
        method: 'GET',
        signal: controller1.signal
      });

      clearTimeout(timeoutId1);

      if (response1.ok) {
        const data = await response1.json();
        if (data.city && !data.error) {
          // 中国城市显示格式
          if (data.country_name === 'China' && data.region) {
            return `${data.region} ${data.city}`;
          }
          return data.city;
        }
      }
    } catch (e) {
      // 忽略错误，继续尝试其他方案
    }

    // 方案2: 使用ip-api.com（HTTPS版本）
    try {
      const ipApiUrl = 'https://ip-api.com/json/?lang=zh-CN&fields=status,message,country,regionName,city';
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 3000);

      const response2 = await safeFetch(ipApiUrl, {
        method: 'GET',
        signal: controller2.signal
      });

      clearTimeout(timeoutId2);

      if (response2.ok) {
        const data = await response2.json();
        if (data.status === 'success' && data.city) {
          // 中国城市显示格式：省份 城市
          if (data.country === '中国' && data.regionName) {
            return `${data.regionName} ${data.city}`;
          }
          return data.city;
        }
      }
    } catch (e) {
      // 忽略错误
    }

    // 方案3: 使用ipinfo.io（备选）
    try {
      const ipInfoUrl = 'https://ipinfo.io/json';
      const controller3 = new AbortController();
      const timeoutId3 = setTimeout(() => controller3.abort(), 2000);

      const response3 = await safeFetch(ipInfoUrl, {
        method: 'GET',
        signal: controller3.signal
      });

      clearTimeout(timeoutId3);

      if (response3.ok) {
        const data = await response3.json();
        if (data.city && !data.error) {
          // ipinfo.io返回格式：city, region, country
          if (data.country === 'CN' && data.region) {
            return `${data.region} ${data.city}`;
          }
          return data.city;
        }
      }
    } catch (e) {
      // 忽略错误
    }

    return null;
  } catch (error) {
    console.warn('[Weather] IP定位失败:', error);
    return null;
  }
}

/**
 * 获取天气信息
 * 使用更可靠的方案：IP定位 + 天气API
 */
async function fetchWeather() {
  // 先检查缓存（但如果是无效的城市名称，不使用缓存）
  const cached = getCachedWeather();
  if (cached && cached.city && cached.city !== '未知城市' && cached.city !== '当前位置') {
    return cached;
  }

  try {
    // 第一步：获取城市名称（通过IP定位）
    let cityName = await getCityByIP();
    console.log('[Weather] IP定位结果:', cityName);

    // 如果IP定位失败，尝试使用浏览器地理位置API
    if (!cityName && navigator.geolocation) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 3000,
            maximumAge: 3600000
          });
        });

        const { latitude, longitude } = position.coords;
        // 使用逆地理编码获取城市（通过天气API）
        const geoWeatherUrl = `https://wttr.in/${latitude},${longitude}?format=j1&lang=zh-cn`;
        const geoController = new AbortController();
        const geoTimeoutId = setTimeout(() => geoController.abort(), 3000);
        const geoResponse = await safeFetch(geoWeatherUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: geoController.signal
        });
        clearTimeout(geoTimeoutId);

        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          const nearestArea = geoData.nearest_area?.[0];
          if (nearestArea) {
            const areaName = nearestArea.areaName?.[0]?.value;
            const region = nearestArea.region?.[0]?.value;
            if (areaName) {
              cityName = areaName;
              if (region) {
                cityName = `${region} ${cityName}`;
              }
            }
          }
        }
      } catch (geoError) {
        // 地理位置API失败，继续使用默认方案
      }
    }

    // 第二步：获取天气信息
    // 如果已有城市名称，使用城市名称查询；否则使用自动定位
    const weatherUrl = cityName
      ? `https://wttr.in/${encodeURIComponent(cityName)}?format=j1&lang=zh-cn`
      : `https://wttr.in/?format=j1&lang=zh-cn`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await safeFetch(weatherUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const current = data.current_condition?.[0];
        const nearestArea = data.nearest_area?.[0];

        if (current) {
          // 确定城市名称（优先使用IP定位的结果，其次使用API返回的）
          if (!cityName && nearestArea) {
            // 尝试多种方式获取城市名称
            const areaName = nearestArea.areaName?.[0]?.value;
            const region = nearestArea.region?.[0]?.value;
            const country = nearestArea.country?.[0]?.value;

            // 优先使用areaName
            if (areaName) {
              cityName = areaName;
              // 中国城市添加省份
              if ((country === 'China' || country === '中国') && region) {
                cityName = `${region} ${cityName}`;
              }
            } else if (region) {
              cityName = region;
            }

            // 如果还是没有，尝试从query字段获取
            if (!cityName && data.request?.[0]?.query) {
              const query = data.request[0].query;
              // query可能是城市名称或坐标，如果是坐标则跳过
              if (!query.match(/^-?\d+\.?\d*,-?\d+\.?\d*$/)) {
                cityName = query;
              }
            }
          }

          // 如果还是没有城市名称，尝试从天气API的文本格式获取
          if (!cityName) {
            try {
              const textUrl = cityName
                ? `https://wttr.in/${encodeURIComponent(cityName)}?format=3&lang=zh-cn`
                : `https://wttr.in/?format=3&lang=zh-cn`;
              const textController = new AbortController();
              const textTimeoutId = setTimeout(() => textController.abort(), 2000);
              const textResponse = await safeFetch(textUrl, {
                method: 'GET',
                headers: { 'Accept': 'text/plain' },
                signal: textController.signal
              });
              clearTimeout(textTimeoutId);

              if (textResponse.ok) {
                const text = await textResponse.text().trim();
                // 格式: "城市名: 温度°C 天气描述"
                const match = text.match(/(.+?):\s*([+-]?\d+)°C/);
                if (match && match[1]) {
                  cityName = match[1].trim();
                }
              }
            } catch (e) {
              // 忽略错误
            }
          }

          // 如果还是没有城市名称，使用默认值
          if (!cityName) {
            cityName = '当前位置';
          }

          // 获取温度和天气描述
          const temp = current.temp_C || current.temp_F || '--';
          const condition = current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || '未知';

          console.log('[Weather] 最终城市名称:', cityName, '温度:', temp, '天气:', condition);

          const weather = {
            city: cityName,
            temp: temp,
            condition: condition,
            icon: getWeatherIconByCondition(condition)
          };

          // 只有成功获取城市名称时才缓存
          if (cityName && cityName !== '未知城市' && cityName !== '当前位置') {
            setCachedWeather(weather);
          }
          return weather;
        }
      }
    } catch (apiError) {
      clearTimeout(timeoutId);
      // API失败，如果已有城市名称，至少显示城市
      if (cityName) {
        return {
          city: cityName,
          temp: '--',
          condition: '天气信息获取中',
          icon: '🌤️'
        };
      }
    }

    // 如果所有方案都失败，返回默认信息（不缓存）
    return {
      city: cityName || '未知城市',
      temp: '--',
      condition: '天气信息获取中',
      icon: '🌤️'
    };
  } catch (error) {
    // 返回默认信息
    return {
      city: '未知城市',
      temp: '--',
      condition: '天气信息获取中',
      icon: '🌤️'
    };
  }
}

/**
 * 根据天气描述获取天气图标
 */
function getWeatherIconByCondition(condition) {
  if (!condition) return '🌤️';
  const cond = condition.toLowerCase();
  if (cond.includes('晴') || cond.includes('sunny')) return '☀️';
  if (cond.includes('云') || cond.includes('cloud')) return '☁️';
  if (cond.includes('雨') || cond.includes('rain')) return '🌧️';
  if (cond.includes('雪') || cond.includes('snow')) return '🌨️';
  if (cond.includes('雾') || cond.includes('fog')) return '🌫️';
  if (cond.includes('雷') || cond.includes('thunder')) return '⛈️';
  return '🌤️';
}


/**
 * 渲染欢迎卡片
 */
export async function renderWelcomeCard() {
  const container = document.getElementById('welcomeCard');
  if (!container) {
    console.warn('[WelcomeCard] 欢迎卡片容器未找到');
    return;
  }

  // 获取用户信息
  const user = getUser();
  if (!user) {
    // 未登录，隐藏欢迎卡片
    container.style.display = 'none';
    return;
  }

  // 显示欢迎卡片
  container.style.display = 'block';

  // 更新用户名
  const usernameEl = document.getElementById('welcomeUsername');
  if (usernameEl) {
    usernameEl.textContent = user.displayName || user.username || '用户';
  }

  // 更新头像
  const avatarEl = document.getElementById('welcomeAvatar');
  const avatarDefaultEl = document.getElementById('welcomeAvatarDefault');
  const avatarTextEl = document.getElementById('welcomeAvatarText');

  if (user.avatar) {
    // 有头像URL，显示头像图片
    if (avatarEl) {
      avatarEl.src = user.avatar;
      avatarEl.style.display = 'block';
    }
    if (avatarDefaultEl) {
      avatarDefaultEl.style.display = 'none';
    }
  } else {
    // 没有头像，显示首字母
    if (avatarEl) {
      avatarEl.style.display = 'none';
    }
    if (avatarDefaultEl) {
      avatarDefaultEl.style.display = 'flex';
    }
    if (avatarTextEl) {
      const firstLetter = (user.displayName || user.username || 'U').charAt(0).toUpperCase();
      avatarTextEl.textContent = firstLetter;
    }
  }

  // 获取并显示天气信息（延迟加载，不阻塞页面渲染）
  const weatherEl = document.getElementById('welcomeWeather');
  if (weatherEl) {
    // 先显示默认信息，然后异步加载
    const weatherIcon = weatherEl.querySelector('.weather-icon');
    const weatherText = weatherEl.querySelector('.weather-text');

    if (weatherIcon) {
      weatherIcon.textContent = '🌤️';
    }
    if (weatherText) {
      weatherText.textContent = '加载中...';
    }

    // 延迟加载天气信息，不阻塞页面渲染
    setTimeout(async () => {
      try {
        const weather = await fetchWeather();
        if (weatherIcon) {
          weatherIcon.textContent = weather.icon;
        }
        if (weatherText) {
          // 显示格式：城市名 温度°C 天气描述
          const cityName = weather.city || '未知城市';
          // 如果城市名称是"未知城市"或"当前位置"，尝试再次获取
          if ((cityName === '未知城市' || cityName === '当前位置') && !getCachedWeather()) {
            // 清除缓存，强制重新获取
            try {
              localStorage.removeItem('weather_cache');
            } catch (e) {
              // 忽略错误
            }
          }
          weatherText.textContent = `${cityName} ${weather.temp}°C ${weather.condition}`;
        }
      } catch (error) {
        console.warn('[WelcomeCard] 获取天气失败:', error);
        // 静默失败，保持默认显示
        if (weatherText) {
          weatherText.textContent = '天气信息获取中';
        }
      }
    }, 100); // 延迟100ms，让页面先渲染
  }
}

