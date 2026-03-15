// geocoder.js
const axios = require('axios');
const config = require('./config');

const logger = console;

async function reverseGeocode(lat, lon) {
    if (!config.GEOCODER_API_KEY) {
        logger.warn('GEOCODER_API_KEY не настроен');
        return null;
    }

    const url = 'https://geocode-maps.yandex.ru/1.x/';
    const params = {
        apikey: config.GEOCODER_API_KEY,
        geocode: `${lon},${lat}`,
        format: 'json',
        lang: 'ru_RU',
        results: 1
    };

    try {
        const response = await axios.get(url, { params, timeout: 10000 });
        
        if (response.status === 200) {
            const data = response.data;
            
            try {
                const featureMember = data.response.GeoObjectCollection.featureMember;
                if (featureMember && featureMember.length > 0) {
                    const geoObject = featureMember[0].GeoObject;
                    const address = geoObject.metaDataProperty.GeocoderMetaData.text;
                    
                    logger.info(`Найден адрес: ${address}`);
                    return address;
                } else {
                    logger.warn('Адрес не найден');
                    return null;
                }
            } catch (error) {
                logger.error('Ошибка парсинга ответа геокодера:', error);
                return null;
            }
        } else {
            logger.error(`Ошибка геокодера: HTTP ${response.status}`);
            return null;
        }
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            logger.error('Таймаут при запросе к геокодеру');
        } else {
            logger.error('Ошибка соединения с геокодером:', error.message);
        }
        return null;
    }
}

async function geocodeAddress(address) {
    if (!config.GEOCODER_API_KEY) return null;

    const url = 'https://geocode-maps.yandex.ru/1.x/';
    const params = {
        apikey: config.GEOCODER_API_KEY,
        geocode: address,
        format: 'json',
        lang: 'ru_RU',
        results: 1
    };

    try {
        const response = await axios.get(url, { params, timeout: 10000 });
        
        if (response.status === 200) {
            const data = response.data;
            
            try {
                const featureMember = data.response.GeoObjectCollection.featureMember;
                if (featureMember && featureMember.length > 0) {
                    const pos = featureMember[0].GeoObject.Point.pos;
                    const [lon, lat] = pos.split(' ').map(Number);
                    return { lat, lon };
                }
            } catch (error) {
                logger.error('Ошибка парсинга координат:', error);
                return null;
            }
        }
    } catch (error) {
        logger.error('Ошибка геокодирования адреса:', error);
    }
    
    return null;
}

module.exports = {
    reverseGeocode,
    geocodeAddress
};