// config.js
require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    GROUP_ID: parseInt(process.env.GROUP_ID),
    ADMIN_ID: parseInt(process.env.ADMIN_ID),
    DATABASE_PATH: process.env.DATABASE_PATH || './database.sqlite',
    GEOCODER_API_KEY: process.env.GEOCODER_API_KEY,
    
    DISTRICTS: [
        "Советский",
        "Железнодорожный",
        "Октябрьский",
        "Иволгинский",
        "Тарбагатайский",
        "Заиграевский"
    ],

    // Проверка конфигурации
    validateConfig() {
        if (!this.BOT_TOKEN) throw new Error('❌ BOT_TOKEN не найден в .env файле!');
        if (!this.GROUP_ID) throw new Error('❌ GROUP_ID не найден в .env файле!');
        if (!this.ADMIN_ID) throw new Error('❌ ADMIN_ID не найден в .env файле!');
        console.log('✅ Конфигурация загружена успешно!');
    }
};