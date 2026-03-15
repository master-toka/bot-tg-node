// keyboards.js
const { InlineKeyboard, Keyboard } = require('node-telegram-bot-api');

// Inline клавиатуры
const getGeoChoiceKeyboard = () => {
    return {
        inline_keyboard: [
            [{ text: '📍 Отправить геолокацию', callback_data: 'send_geo' }],
            [{ text: '✍️ Ввести адрес вручную', callback_data: 'manual_address' }]
        ]
    };
};

const getConfirmAddressKeyboard = () => {
    return {
        inline_keyboard: [
            [
                { text: '✅ Да, верно', callback_data: 'confirm_address' },
                { text: '✍️ Ввести вручную', callback_data: 'edit_address' }
            ]
        ]
    };
};

const getDistrictsKeyboard = (districts) => {
    const buttons = [];
    let row = [];
    
    for (let i = 0; i < districts.length; i++) {
        row.push({
            text: districts[i].name,
            callback_data: `district_${districts[i].id}`
        });
        
        if (row.length === 2 || i === districts.length - 1) {
            buttons.push([...row]);
            row = [];
        }
    }
    
    return { inline_keyboard: buttons };
};

const getRequestActionKeyboard = (requestId) => {
    return {
        inline_keyboard: [
            [
                { text: '✅ Взять', callback_data: `take_${requestId}` },
                { text: '❌ Отказаться', callback_data: `refuse_${requestId}` }
            ]
        ]
    };
};

const getInstallerRequestDetailsKeyboard = (requestId, hasLocation = false, client = null) => {
    const buttons = [];
    
    // Кнопки связи с клиентом
    if (client) {
        if (client.username) {
            buttons.push([
                { text: '💬 Написать клиенту', url: `https://t.me/${client.username}` }
            ]);
        } else {
            buttons.push([
                { text: '💬 Написать клиенту', url: `tg://user?id=${client.telegram_id}` }
            ]);
        }
    }
    
    // Кнопка карты
    if (hasLocation) {
        buttons.push([
            { text: '🗺 Открыть на карте', callback_data: `show_map_${requestId}` }
        ]);
    }
    
    // Кнопка звонка
    buttons.push([
        { text: '📞 Позвонить', callback_data: `call_${requestId}` }
    ]);
    
    // Кнопки действий
    buttons.push([
        { text: '✅ Завершить', callback_data: `complete_${requestId}` },
        { text: '❌ Отказаться', callback_data: `refuse_installer_${requestId}` }
    ]);
    
    // Кнопка назад
    buttons.push([
        { text: '⬅️ Назад к списку', callback_data: 'back_to_list' }
    ]);
    
    return { inline_keyboard: buttons };
};

const getInstallerRequestsKeyboard = (requests) => {
    const buttons = [];
    
    for (const req of requests) {
        const addressShort = req.address.length > 30 
            ? req.address.substring(0, 30) + '...' 
            : req.address;
        
        buttons.push([
            { text: `📋 Заявка №${req.id} - ${addressShort}`, callback_data: `view_${req.id}` }
        ]);
    }
    
    return { inline_keyboard: buttons };
};

const getInstallerAllRequestsKeyboard = (activeRequests, completedRequests) => {
    const buttons = [];
    
    // Активные заявки
    if (activeRequests.length > 0) {
        buttons.push([{ text: '🔨 АКТИВНЫЕ ЗАЯВКИ', callback_data: 'ignore', hide: true }]);
        for (const req of activeRequests) {
            const addressShort = req.address.length > 20 
                ? req.address.substring(0, 20) + '...' 
                : req.address;
            buttons.push([
                { text: `🔨 №${req.id} - ${addressShort}`, callback_data: `view_${req.id}` }
            ]);
        }
    }
    
    // Выполненные заявки
    if (completedRequests.length > 0) {
        if (activeRequests.length > 0) {
            buttons.push([{ text: '✅ ВЫПОЛНЕННЫЕ', callback_data: 'ignore', hide: true }]);
        }
        for (const req of completedRequests) {
            const addressShort = req.address.length > 20 
                ? req.address.substring(0, 20) + '...' 
                : req.address;
            buttons.push([
                { text: `✅ №${req.id} - ${addressShort}`, callback_data: `view_completed_${req.id}` }
            ]);
        }
    }
    
    buttons.push([{ text: '⬅️ Назад', callback_data: 'back_to_main' }]);
    
    return { inline_keyboard: buttons };
};

const getCompleteKeyboard = (requestId) => {
    return {
        inline_keyboard: [
            [{ text: '✅ Подтвердить завершение', callback_data: `complete_${requestId}` }],
            [{ text: '⬅️ Назад к списку', callback_data: 'back_to_list' }]
        ]
    };
};

const getAdminKeyboard = () => {
    return {
        inline_keyboard: [
            [{ text: '📊 Общая статистика', callback_data: 'admin_stats' }],
            [{ text: '🏘 По районам', callback_data: 'admin_districts' }],
            [{ text: '👷 По монтажникам', callback_data: 'admin_installers' }],
            [{ text: '👤 По клиентам', callback_data: 'admin_clients' }],
            [{ text: '📅 За 7 дней', callback_data: 'admin_period' }]
        ]
    };
};

const getBackKeyboard = () => {
    return {
        inline_keyboard: [
            [{ text: '⬅️ Назад', callback_data: 'back_to_main' }]
        ]
    };
};

// Reply клавиатуры
const getClientMainKeyboard = () => {
    return {
        keyboard: [
            [{ text: '📝 Новая заявка' }],
            [{ text: '📋 Мои заявки' }, { text: '👤 Мой профиль' }],
            [{ text: '❓ Помощь' }]
        ],
        resize_keyboard: true,
        input_field_placeholder: 'Выберите действие...'
    };
};

const getInstallerMainKeyboard = () => {
    return {
        keyboard: [
            [{ text: '📋 Активные заявки' }, { text: '📊 Все мои заявки' }],
            [{ text: '👤 Мой профиль' }, { text: '📊 Статистика' }],
            [{ text: '❓ Помощь' }]
        ],
        resize_keyboard: true,
        input_field_placeholder: 'Выберите действие...'
    };
};

const getAdminMainKeyboard = () => {
    return {
        keyboard: [
            [{ text: '👑 Админ панель' }],
            [{ text: '📊 Общая статистика' }, { text: '👷 Монтажники' }],
            [{ text: '👤 Клиенты' }, { text: '🏘 Районы' }],
            [{ text: '❓ Помощь' }]
        ],
        resize_keyboard: true,
        input_field_placeholder: 'Выберите действие...'
    };
};

const getLocationKeyboard = () => {
    return {
        keyboard: [
            [{ text: '📍 Отправить геолокацию', request_location: true }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
    };
};

const getCancelKeyboard = () => {
    return {
        keyboard: [
            [{ text: '❌ Отменить создание заявки' }]
        ],
        resize_keyboard: true
    };
};

const getRoleKeyboard = () => {
    return {
        inline_keyboard: [
            [{ text: '👤 Я заказчик', callback_data: 'role_client' }],
            [{ text: '🔧 Я монтажник', callback_data: 'role_installer' }]
        ]
    };
};

module.exports = {
    getGeoChoiceKeyboard,
    getConfirmAddressKeyboard,
    getDistrictsKeyboard,
    getRequestActionKeyboard,
    getInstallerRequestDetailsKeyboard,
    getInstallerRequestsKeyboard,
    getInstallerAllRequestsKeyboard,
    getCompleteKeyboard,
    getAdminKeyboard,
    getBackKeyboard,
    getClientMainKeyboard,
    getInstallerMainKeyboard,
    getAdminMainKeyboard,
    getLocationKeyboard,
    getCancelKeyboard,
    getRoleKeyboard
};