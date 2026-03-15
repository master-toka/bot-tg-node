// index.js
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const { initDatabase, User, District, Request, Refusal, GroupMessage } = require('./models');
const states = require('./states');
const keyboards = require('./keyboards');
const geocoder = require('./geocoder');
const { Op } = require('sequelize');
const moment = require('moment');

// Проверка конфигурации
config.validateConfig();

// Создание бота
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// Хранилище состояний
const userStates = new Map();
const userData = new Map();

// Инициализация базы данных
initDatabase().catch(console.error);

// Middleware для проверки роли
const checkRole = (requiredRole) => {
    return async (msg, next) => {
        const user = await User.findOne({ where: { telegram_id: msg.from.id } });
        if (!user) {
            await bot.sendMessage(msg.chat.id, '❌ Вы не зарегистрированы. Используйте /start');
            return;
        }
        
        if (requiredRole === 'admin' && !user.is_admin) {
            await bot.sendMessage(msg.chat.id, '❌ Доступ запрещён');
            return;
        }
        
        if (requiredRole !== 'admin' && user.role !== requiredRole && !user.is_admin) {
            await bot.sendMessage(msg.chat.id, '❌ Эта функция доступна только ' + 
                (requiredRole === 'client' ? 'заказчикам' : 'монтажникам'));
            return;
        }
        
        msg.dbUser = user;
        next(msg);
    };
};

// ==================== ОБРАБОТЧИКИ КОМАНД ====================

// Команда /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    // Очищаем состояние
    userStates.delete(telegramId);
    userData.delete(telegramId);
    
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    
    if (!user) {
        // Новый пользователь
        await bot.sendMessage(chatId, 
            '👋 Добро пожаловать в бот для заказа монтажных работ!\n\nВыберите вашу роль:',
            { reply_markup: keyboards.getRoleKeyboard() }
        );
    } else {
        // Существующий пользователь
        await showMainMenu(chatId, user);
    }
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    
    if (!user) {
        await bot.sendMessage(chatId, '❓ Используйте /start для начала работы');
        return;
    }
    
    let text = '';
    if (user.role === 'client') {
        text = '❓ <b>Помощь для заказчика</b>\n\n' +
            '📝 <b>Новая заявка</b> - создание заявки на монтажные работы\n' +
            '📋 <b>Мои заявки</b> - просмотр ваших заявок\n' +
            '👤 <b>Мой профиль</b> - информация о вашем профиле\n\n' +
            'Также доступны команды:\n' +
            '/start - главное меню\n' +
            '/profile - мой профиль';
    } else if (user.role === 'installer') {
        text = '❓ <b>Помощь для монтажника</b>\n\n' +
            '📋 <b>Активные заявки</b> - заявки в работе\n' +
            '📊 <b>Все мои заявки</b> - история ваших заявок\n' +
            '👤 <b>Мой профиль</b> - информация о вашем профиле\n' +
            '📊 <b>Статистика</b> - ваша статистика\n\n' +
            'Также доступны команды:\n' +
            '/start - главное меню\n' +
            '/profile - мой профиль';
    } else if (user.is_admin) {
        text = '❓ <b>Помощь для администратора</b>\n\n' +
            '👑 <b>Админ панель</b> - панель управления\n' +
            '📊 <b>Общая статистика</b> - статистика по боту\n' +
            '👷 <b>Монтажники</b> - список монтажников\n' +
            '👤 <b>Клиенты</b> - список клиентов\n' +
            '🏘 <b>Районы</b> - статистика по районах\n\n' +
            'Команда /admin - админ панель';
    }
    
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
});

// Команда /profile
bot.onText(/\/profile/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    const user = await User.findOne({ 
        where: { telegram_id: telegramId },
        include: [
            {
                model: Request,
                as: 'client_requests',
                required: false
            },
            {
                model: Request,
                as: 'installer_requests',
                required: false
            }
        ]
    });
    
    if (!user) {
        await bot.sendMessage(chatId, '❌ Вы не зарегистрированы. Используйте /start');
        return;
    }
    
    let text = '';
    const buttons = [];
    
    if (user.role === 'installer') {
        const allRequests = user.installer_requests || [];
        const completed = allRequests.filter(r => r.status === 'completed').length;
        const inProgress = allRequests.filter(r => r.status === 'in_progress').length;
        
        const refusals = await Refusal.count({ where: { installer_id: user.id } });
        
        text = `👷 <b>Ваш профиль монтажника</b>\n\n` +
            `📋 <b>Информация:</b>\n` +
            `• Имя: ${user.name || 'Не указано'}\n` +
            `• Username: @${user.username || 'нет'}\n` +
            `• Телефон: ${user.phone || 'Не указан'}\n` +
            `• Дата регистрации: ${moment(user.created_at).format('DD.MM.YYYY')}\n\n` +
            `📊 <b>Статистика:</b>\n` +
            `• Всего заявок взято: ${allRequests.length}\n` +
            `• В работе: ${inProgress}\n` +
            `• Выполнено: ${completed}\n` +
            `• Отказов: ${refusals}`;
            
    } else if (user.role === 'client') {
        const allRequests = user.client_requests || [];
        const completed = allRequests.filter(r => r.status === 'completed').length;
        const inProgress = allRequests.filter(r => r.status === 'in_progress').length;
        
        text = `👤 <b>Ваш профиль клиента</b>\n\n` +
            `📋 <b>Информация:</b>\n` +
            `• Имя: ${user.name || 'Не указано'}\n` +
            `• Username: @${user.username || 'нет'}\n` +
            `• Телефон: ${user.phone || 'Не указан'}\n` +
            `• Дата регистрации: ${moment(user.created_at).format('DD.MM.YYYY')}\n\n` +
            `📊 <b>Статистика заявок:</b>\n` +
            `• Всего заявок: ${allRequests.length}\n` +
            `• Активных: ${inProgress}\n` +
            `• Выполнено: ${completed}`;
    }
    
    // Кнопка для профиля в Telegram
    if (user.username) {
        buttons.push([{ text: '📱 Мой профиль в Telegram', url: `https://t.me/${user.username}` }]);
    } else {
        buttons.push([{ text: '📱 Мой ID', callback_data: 'show_my_id' }]);
    }
    
    await bot.sendMessage(chatId, text, { 
        parse_mode: 'HTML',
        reply_markup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined
    });
});

// Команда /admin
bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    if (telegramId !== config.ADMIN_ID) {
        await bot.sendMessage(chatId, '❌ Доступ запрещён');
        return;
    }
    
    await bot.sendMessage(chatId, 
        '👑 <b>Панель администратора</b>\n\nВыберите раздел:',
        { 
            parse_mode: 'HTML',
            reply_markup: keyboards.getAdminKeyboard() 
        }
    );
});

// ==================== ОБРАБОТЧИКИ ТЕКСТОВЫХ СООБЩЕНИЙ ====================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const text = msg.text;
    
    // Игнорируем сообщения без текста (геолокации и т.д.)
    if (!text) return;
    
    const currentState = userStates.get(telegramId);
    
    // Если пользователь в процессе создания заявки
    if (currentState) {
        await handleStateMessage(msg, currentState);
        return;
    }
    
    // Получаем пользователя из БД
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    
    if (!user) {
        await bot.sendMessage(chatId, '❓ Используйте /start для начала работы');
        return;
    }
    
    // Обрабатываем кнопки меню
    switch (text) {
        // Общие кнопки
        case '❓ Помощь':
            await bot.emit('text:/help', msg);
            break;
        case '👤 Мой профиль':
            await bot.emit('text:/profile', msg);
            break;
            
        // Кнопки клиента
        case '📝 Новая заявка':
            if (user.role === 'client') {
                await startNewRequest(msg);
            }
            break;
        case '📋 Мои заявки':
            if (user.role === 'client') {
                await showClientRequests(msg);
            }
            break;
            
        // Кнопки монтажника
        case '📋 Активные заявки':
            if (user.role === 'installer') {
                await showInstallerActiveRequests(msg);
            }
            break;
        case '📊 Все мои заявки':
            if (user.role === 'installer') {
                await showInstallerAllRequests(msg);
            }
            break;
        case '📊 Статистика':
            if (user.role === 'installer') {
                await showInstallerStats(msg);
            }
            break;
            
        // Кнопки администратора
        case '👑 Админ панель':
            if (user.is_admin) {
                await bot.emit('text:/admin', msg);
            }
            break;
        case '📊 Общая статистика':
            if (user.is_admin) {
                await showAdminStats(msg);
            }
            break;
        case '👷 Монтажники':
            if (user.is_admin) {
                await showAdminInstallers(msg);
            }
            break;
        case '👤 Клиенты':
            if (user.is_admin) {
                await showAdminClients(msg);
            }
            break;
        case '🏘 Районы':
            if (user.is_admin) {
                await showAdminDistricts(msg);
            }
            break;
            
        default:
            // Неизвестная команда
            await showMainMenu(chatId, user, true);
    }
});

// ==================== ОБРАБОТЧИКИ СОСТОЯНИЙ ====================

async function handleStateMessage(msg, state) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const data = userData.get(telegramId) || {};
    
    switch (state) {
        case states.REQUEST_DESCRIPTION:
            await handleRequestDescription(msg, data);
            break;
            
        case states.REQUEST_PHOTOS:
            // Обработка команды /done или текста "✅ Готово"
            if (msg.text === '/done' || msg.text === '✅ Готово') {
                await handlePhotosDone(msg, data);
            }
            break;
            
        case states.REQUEST_MANUAL_ADDRESS:
            await handleManualAddress(msg, data);
            break;
            
        case states.REQUEST_PHONE:
            await handlePhone(msg, data);
            break;
            
        case states.REFUSAL_REASON:
            await handleRefusalReason(msg, data);
            break;
            
        default:
            // Сбрасываем состояние
            userStates.delete(telegramId);
            userData.delete(telegramId);
    }
}

async function handleRequestDescription(msg, data) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    data.description = msg.text;
    userData.set(telegramId, data);
    
    await bot.sendMessage(chatId,
        '📸 Теперь отправьте фотографию (можно несколько).\n' +
        'Когда закончите, отправьте /done или нажмите кнопку ниже:',
        { 
            reply_markup: {
                keyboard: [[{ text: '✅ Готово /done' }]],
                resize_keyboard: true
            }
        }
    );
    
    userStates.set(telegramId, states.REQUEST_PHOTOS);
    data.photos = [];
}

async function handlePhotosDone(msg, data) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    if (!data.photos || data.photos.length === 0) {
        await bot.sendMessage(chatId, '❌ Нужно отправить хотя бы одно фото!');
        return;
    }
    
    await bot.sendMessage(chatId,
        '📍 Выберите способ указания адреса:',
        { reply_markup: keyboards.getGeoChoiceKeyboard() }
    );
    
    userStates.set(telegramId, states.REQUEST_ADDRESS_CHOICE);
}

async function handleManualAddress(msg, data) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    data.address = msg.text;
    userData.set(telegramId, data);
    
    await bot.sendMessage(chatId,
        '📞 Введите номер телефона для связи:',
        { reply_markup: { remove_keyboard: true } }
    );
    
    userStates.set(telegramId, states.REQUEST_PHONE);
}

async function handlePhone(msg, data) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    data.phone = msg.text;
    userData.set(telegramId, data);
    
    // Получаем список районов
    const districts = await District.findAll({ order: [['name', 'ASC']] });
    
    await bot.sendMessage(chatId,
        '🏘 Выберите район:',
        { reply_markup: keyboards.getDistrictsKeyboard(districts) }
    );
    
    userStates.set(telegramId, states.REQUEST_DISTRICT);
}

async function handleRefusalReason(msg, data) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    const { requestId, source } = data;
    const reason = msg.text;
    
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    const request = await Request.findByPk(requestId, {
        include: [{ model: User, as: 'client' }]
    });
    
    if (!request || request.status !== 'in_progress') {
        await bot.sendMessage(chatId, '❌ Заявка уже не в работе или недоступна');
        userStates.delete(telegramId);
        userData.delete(telegramId);
        return;
    }
    
    // Сохраняем отказ
    await Refusal.create({
        request_id: requestId,
        installer_id: user.id,
        reason
    });
    
    // Сбрасываем статус заявки
    request.status = 'new';
    request.installer_id = null;
    request.assigned_at = null;
    await request.save();
    
    // Обновляем сообщение в группе
    const groupMsg = await GroupMessage.findOne({ where: { request_id: requestId } });
    if (groupMsg) {
        try {
            await bot.editMessageCaption(
                `${request.description}\n\n⚠️ Отказ от @${user.username || user.name}: ${reason}\n\nЗаявка снова доступна!`,
                {
                    chat_id: groupMsg.group_chat_id,
                    message_id: groupMsg.message_id,
                    reply_markup: keyboards.getRequestActionKeyboard(requestId)
                }
            );
        } catch (error) {
            console.error('Ошибка при обновлении сообщения в группе:', error);
        }
    }
    
    // Уведомляем клиента
    if (request.client) {
        await bot.sendMessage(request.client.telegram_id,
            `🔄 <b>Заявка №${request.id} снова доступна</b>\n\n` +
            `Монтажник отказался от заявки. Ожидайте, скоро её возьмёт другой специалист.`,
            { parse_mode: 'HTML' }
        );
    }
    
    await bot.sendMessage(chatId, '✅ Отказ зарегистрирован. Заявка снова доступна для других монтажников.');
    
    // Если отказ был из ЛС, показываем активные заявки
    if (source === 'installer_ls') {
        await showInstallerActiveRequests(msg);
    }
    
    userStates.delete(telegramId);
    userData.delete(telegramId);
}

// ==================== ОБРАБОТЧИКИ ГЕОЛОКАЦИИ ====================

bot.on('location', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const currentState = userStates.get(telegramId);
    
    if (currentState !== states.REQUEST_LOCATION) return;
    
    const data = userData.get(telegramId) || {};
    const { latitude, longitude } = msg.location;
    
    data.latitude = latitude;
    data.longitude = longitude;
    userData.set(telegramId, data);
    
    const processingMsg = await bot.sendMessage(chatId, '🔄 Получаем адрес по координатам...');
    
    const address = await geocoder.reverseGeocode(latitude, longitude);
    
    await bot.deleteMessage(chatId, processingMsg.message_id);
    
    if (address) {
        data.address = address;
        data.location_address = address;
        userData.set(telegramId, data);
        
        await bot.sendMessage(chatId,
            `📍 Найден адрес:\n<code>${address}</code>\n\nВсё верно?`,
            { 
                parse_mode: 'HTML',
                reply_markup: keyboards.getConfirmAddressKeyboard() 
            }
        );
    } else {
        await bot.sendMessage(chatId,
            '❌ Не удалось определить адрес по координатам.\n' +
            'Пожалуйста, введите адрес вручную:',
            { reply_markup: { remove_keyboard: true } }
        );
        userStates.set(telegramId, states.REQUEST_MANUAL_ADDRESS);
    }
});

// ==================== ОБРАБОТЧИКИ ФОТО ====================

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const currentState = userStates.get(telegramId);
    
    if (currentState !== states.REQUEST_PHOTOS) return;
    
    const data = userData.get(telegramId) || {};
    const photos = data.photos || [];
    
    // Получаем file_id самого большого фото
    const photo = msg.photo[msg.photo.length - 1];
    photos.push(photo.file_id);
    
    data.photos = photos;
    userData.set(telegramId, data);
    
    await bot.sendMessage(chatId, `✅ Фото добавлено. Всего: ${photos.length}. Отправьте ещё или /done`);
});

// ==================== ОБРАБОТЧИКИ CALLBACK_QUERY ====================

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
    // Обработка выбора роли
    if (data.startsWith('role_')) {
        await handleRoleSelection(callbackQuery);
        return;
    }
    
    // Обработка выбора способа ввода адреса
    if (data === 'send_geo' || data === 'manual_address') {
        await handleAddressChoice(callbackQuery, data);
        return;
    }
    
    // Обработка подтверждения адреса
    if (data === 'confirm_address' || data === 'edit_address') {
        await handleAddressConfirmation(callbackQuery, data);
        return;
    }
    
    // Обработка выбора района
    if (data.startsWith('district_')) {
        await handleDistrictSelection(callbackQuery);
        return;
    }
    
    // Обработка взятия заявки
    if (data.startsWith('take_')) {
        await handleTakeRequest(callbackQuery);
        return;
    }
    
    // Обработка отказа от заявки из группы
    if (data.startsWith('refuse_') && !data.includes('installer_')) {
        await handleRefuseFromGroup(callbackQuery);
        return;
    }
    
    // Обработка отказа от заявки из ЛС монтажника
    if (data.startsWith('refuse_installer_')) {
        await handleRefuseFromInstaller(callbackQuery);
        return;
    }
    
    // Обработка просмотра заявки
    if (data.startsWith('view_')) {
        await handleViewRequest(callbackQuery);
        return;
    }
    
    // Обработка завершения заявки
    if (data.startsWith('complete_')) {
        await handleCompleteRequest(callbackQuery);
        return;
    }
    
    // Обработка кнопки "Назад к списку"
    if (data === 'back_to_list') {
        await handleBackToList(callbackQuery);
        return;
    }
    
    // Обработка кнопки "Назад к главному меню"
    if (data === 'back_to_main') {
        await handleBackToMain(callbackQuery);
        return;
    }
    
    // Обработка кнопки "Назад к админ панели"
    if (data === 'back_to_admin') {
        await handleBackToAdmin(callbackQuery);
        return;
    }
    
    // Обработка админских кнопок
    if (data.startsWith('admin_')) {
        await handleAdminCallbacks(callbackQuery);
        return;
    }
    
    // Обработка деталей монтажника
    if (data.startsWith('installer_details_')) {
        await handleInstallerDetails(callbackQuery);
        return;
    }
    
    // Обработка деталей клиента
    if (data.startsWith('client_details_')) {
        await handleClientDetails(callbackQuery);
        return;
    }
    
    // Обработка заявок клиента
    if (data.startsWith('client_requests_')) {
        await handleClientRequests(callbackQuery);
        return;
    }
    
    // Обработка заявок монтажника по статусу
    if (data.startsWith('installer_requests_')) {
        await handleInstallerRequestsByStatus(callbackQuery);
        return;
    }
    
    // Обработка отказов монтажника
    if (data.startsWith('installer_refusals_')) {
        await handleInstallerRefusals(callbackQuery);
        return;
    }
    
    // Обработка звонка
    if (data.startsWith('call_')) {
        await handleCallRequest(callbackQuery);
        return;
    }
    
    // Обработка показа карты
    if (data.startsWith('show_map_')) {
        await handleShowMap(callbackQuery);
        return;
    }
    
    // Показать ID
    if (data === 'show_my_id') {
        await bot.sendMessage(chatId, 
            `📱 <b>Ваш Telegram ID:</b>\n<code>${telegramId}</code>`,
            { parse_mode: 'HTML' }
        );
    }
});

// ==================== РЕАЛИЗАЦИЯ ОБРАБОТЧИКОВ ====================

async function showMainMenu(chatId, user, unknownCommand = false) {
    let text = unknownCommand ? '❌ Неизвестная команда.\n\n' : '';
    
    if (user.is_admin) {
        text += `👑 <b>Добро пожаловать, Администратор!</b>\n\nВыберите действие:`;
        await bot.sendMessage(chatId, text, { 
            parse_mode: 'HTML',
            reply_markup: keyboards.getAdminMainKeyboard() 
        });
    } else if (user.role === 'client') {
        text += `👋 <b>Добро пожаловать, ${user.name || 'заказчик'}!</b>\n\nВыберите действие:`;
        await bot.sendMessage(chatId, text, { 
            parse_mode: 'HTML',
            reply_markup: keyboards.getClientMainKeyboard() 
        });
    } else if (user.role === 'installer') {
        text += `🔧 <b>Добро пожаловать, ${user.name || 'монтажник'}!</b>\n\nВыберите действие:`;
        await bot.sendMessage(chatId, text, { 
            parse_mode: 'HTML',
            reply_markup: keyboards.getInstallerMainKeyboard() 
        });
    }
}

async function handleRoleSelection(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const telegramId = callbackQuery.from.id;
    const role = callbackQuery.data.split('_')[1];
    
    const isAdmin = (telegramId === config.ADMIN_ID);
    
    const user = await User.create({
        telegram_id: telegramId,
        role,
        name: callbackQuery.from.first_name + (callbackQuery.from.last_name ? ' ' + callbackQuery.from.last_name : ''),
        username: callbackQuery.from.username,
        is_admin: isAdmin
    });
    
    await bot.deleteMessage(chatId, messageId);
    await showMainMenu(chatId, user);
}

async function handleAddressChoice(callbackQuery, choice) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const telegramId = callbackQuery.from.id;
    
    await bot.deleteMessage(chatId, messageId);
    
    if (choice === 'send_geo') {
        await bot.sendMessage(chatId,
            '📍 Отправьте вашу геолокацию, нажав на кнопку ниже:',
            { reply_markup: keyboards.getLocationKeyboard() }
        );
        userStates.set(telegramId, states.REQUEST_LOCATION);
    } else {
        await bot.sendMessage(chatId,
            '✍️ Введите адрес текстом:',
            { reply_markup: { remove_keyboard: true } }
        );
        userStates.set(telegramId, states.REQUEST_MANUAL_ADDRESS);
    }
}

async function handleAddressConfirmation(callbackQuery, choice) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const telegramId = callbackQuery.from.id;
    
    await bot.deleteMessage(chatId, messageId);
    
    if (choice === 'confirm_address') {
        await bot.sendMessage(chatId,
            '✅ Адрес подтвержден.\n📞 Теперь введите номер телефона для связи:',
            { reply_markup: { remove_keyboard: true } }
        );
        userStates.set(telegramId, states.REQUEST_PHONE);
    } else {
        await bot.sendMessage(chatId,
            '✍️ Введите правильный адрес текстом:',
            { reply_markup: { remove_keyboard: true } }
        );
        userStates.set(telegramId, states.REQUEST_MANUAL_ADDRESS);
    }
}

async function handleDistrictSelection(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const telegramId = callbackQuery.from.id;
    const districtId = parseInt(callbackQuery.data.split('_')[1]);
    
    const data = userData.get(telegramId) || {};
    
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    
    // Создаем заявку
    const request = await Request.create({
        client_id: user.id,
        description: data.description,
        photo_file_id: data.photos ? data.photos.join(',') : null,
        address: data.address || data.location_address,
        latitude: data.latitude,
        longitude: data.longitude,
        location_address: data.location_address,
        contact_phone: data.phone,
        district_id: districtId
    });
    
    // Отправляем в группу
    await sendRequestToGroup(request);
    
    await bot.editMessageText(
        `✅ Заявка №${request.id} создана и отправлена монтажникам!\n` +
        'Мы уведомим вас, когда её возьмут в работу.',
        {
            chat_id: chatId,
            message_id: messageId
        }
    );
    
    // Очищаем состояние
    userStates.delete(telegramId);
    userData.delete(telegramId);
}

async function sendRequestToGroup(request) {
    // Загружаем связанные данные
    const fullRequest = await Request.findByPk(request.id, {
        include: [
            { model: User, as: 'client' },
            { model: District, as: 'district' }
        ]
    });
    
    const district = fullRequest.district;
    const client = fullRequest.client;
    
    const text = `🔔 <b>Новая заявка №${fullRequest.id}</b>\n\n` +
        `👤 Клиент: ${client.name}\n` +
        `📞 Телефон: ${fullRequest.contact_phone}\n` +
        `📍 Район: ${district.name}\n` +
        `🏠 Адрес: ${fullRequest.address || 'Не указан'}\n` +
        `📝 Описание: ${fullRequest.description}\n\n` +
        `Статус: 🆕 Новая`;
    
    let mainMessageId;
    
    if (fullRequest.photo_file_id) {
        const photoIds = fullRequest.photo_file_id.split(',');
        
        if (photoIds.length > 1) {
            const media = photoIds.map((photoId, index) => ({
                type: 'photo',
                media: photoId,
                caption: index === 0 ? text : undefined,
                parse_mode: 'HTML'
            }));
            
            const messages = await bot.sendMediaGroup(config.GROUP_ID, media);
            mainMessageId = messages[0].message_id;
        } else {
            const msg = await bot.sendPhoto(config.GROUP_ID, photoIds[0], {
                caption: text,
                parse_mode: 'HTML',
                reply_markup: keyboards.getRequestActionKeyboard(fullRequest.id)
            });
            mainMessageId = msg.message_id;
        }
    } else {
        const msg = await bot.sendMessage(config.GROUP_ID, text, {
            parse_mode: 'HTML',
            reply_markup: keyboards.getRequestActionKeyboard(fullRequest.id)
        });
        mainMessageId = msg.message_id;
    }
    
    // Отправляем геолокацию если есть
    if (fullRequest.latitude && fullRequest.longitude) {
        await bot.sendLocation(config.GROUP_ID, fullRequest.latitude, fullRequest.longitude, {
            reply_to_message_id: mainMessageId
        });
    }
    
    // Сохраняем информацию о сообщении в группе
    await GroupMessage.create({
        request_id: fullRequest.id,
        group_chat_id: config.GROUP_ID,
        message_id: mainMessageId
    });
}

async function handleTakeRequest(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const telegramId = callbackQuery.from.id;
    const requestId = parseInt(callbackQuery.data.split('_')[1]);
    
    const request = await Request.findByPk(requestId, {
        include: [{ model: User, as: 'client' }]
    });
    
    if (!request || request.status !== 'new') {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Заявка уже недоступна',
            show_alert: true
        });
        return;
    }
    
    const installer = await User.findOne({ where: { telegram_id: telegramId } });
    
    if (!installer || installer.role !== 'installer') {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Вы не монтажник',
            show_alert: true
        });
        return;
    }
    
    // Назначаем монтажника
    request.status = 'in_progress';
    request.installer_id = installer.id;
    request.assigned_at = new Date();
    await request.save();
    
    // Обновляем сообщение в группе
    await bot.editMessageCaption(
        `${callbackQuery.message.caption}\n\n🔨 Взял: @${installer.username || installer.name}`,
        {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [] }
        }
    );
    
    // Уведомляем заказчика
    await bot.sendMessage(request.client.telegram_id,
        `🔔 <b>Заявка №${request.id} взята в работу!</b>\n\n` +
        `Монтажник: @${installer.username || installer.name}\n` +
        `Свяжитесь с ним для уточнения деталей.`,
        { parse_mode: 'HTML' }
    );
    
    // Отправляем детали монтажнику
    await sendRequestDetailsToInstaller(installer.telegram_id, request);
    
    await bot.answerCallbackQuery(callbackQuery.id, {
        text: '✅ Заявка взята в работу!'
    });
}

async function sendRequestDetailsToInstaller(installerId, request) {
    // Загружаем связанные данные
    const fullRequest = await Request.findByPk(request.id, {
        include: [
            { model: User, as: 'client' },
            { model: District, as: 'district' }
        ]
    });
    
    const district = fullRequest.district;
    const client = fullRequest.client;
    
    const text = `🔨 <b>Заявка №${fullRequest.id} (в работе)</b>\n\n` +
        `📝 Описание: ${fullRequest.description}\n` +
        `📍 Район: ${district.name}\n` +
        `🏠 Адрес: ${fullRequest.address}\n` +
        `📞 Телефон: ${fullRequest.contact_phone}`;
    
    const keyboard = keyboards.getInstallerRequestDetailsKeyboard(
        fullRequest.id,
        !!(fullRequest.latitude && fullRequest.longitude),
        client
    );
    
    if (fullRequest.photo_file_id) {
        const photoIds = fullRequest.photo_file_id.split(',');
        
        try {
            await bot.sendPhoto(installerId, photoIds[0], {
                caption: text,
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
            
            for (let i = 1; i < photoIds.length; i++) {
                await bot.sendPhoto(installerId, photoIds[i]);
            }
        } catch (error) {
            await bot.sendMessage(installerId, text, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
    } else {
        await bot.sendMessage(installerId, text, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    }
}

async function handleRefuseFromGroup(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id;
    const requestId = parseInt(callbackQuery.data.split('_')[1]);
    
    userData.set(telegramId, { requestId, source: 'group' });
    userStates.set(telegramId, states.REFUSAL_REASON);
    
    await bot.sendMessage(chatId,
        '❓ Укажите причину отказа (отправьте текстовое сообщение):'
    );
}

async function handleRefuseFromInstaller(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const telegramId = callbackQuery.from.id;
    const requestId = parseInt(callbackQuery.data.split('_')[2]);
    
    userData.set(telegramId, { requestId, source: 'installer_ls' });
    userStates.set(telegramId, states.REFUSAL_REASON);
    
    await bot.sendMessage(chatId,
        '❓ Укажите причину отказа (отправьте текстовое сообщение):'
    );
}

async function handleViewRequest(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const telegramId = callbackQuery.from.id;
    const requestId = parseInt(callbackQuery.data.split('_')[1]);
    
    const request = await Request.findByPk(requestId, {
        include: [
            { model: User, as: 'client' },
            { model: District, as: 'district' }
        ]
    });
    
    if (!request) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Заявка не найдена',
            show_alert: true
        });
        return;
    }
    
    const district = request.district;
    const client = request.client;
    
    const text = `🔨 <b>Заявка №${request.id}</b>\n\n` +
        `📝 Описание: ${request.description}\n` +
        `📍 Район: ${district.name}\n` +
        `🏠 Адрес: ${request.address}\n` +
        `📞 Телефон: ${request.contact_phone}\n` +
        `📊 Статус: ${request.status}`;
    
    const keyboard = keyboards.getInstallerRequestDetailsKeyboard(
        request.id,
        !!(request.latitude && request.longitude),
        client
    );
    
    try {
        await bot.deleteMessage(chatId, messageId);
    } catch (error) {}
    
    if (request.photo_file_id) {
        const photoIds = request.photo_file_id.split(',');
        await bot.sendPhoto(chatId, photoIds[0], {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    } else {
        await bot.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    }
}

async function handleCompleteRequest(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const requestId = parseInt(callbackQuery.data.split('_')[1]);
    
    const request = await Request.findByPk(requestId, {
        include: [{ model: User, as: 'client' }]
    });
    
    if (!request) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Заявка не найдена',
            show_alert: true
        });
        return;
    }
    
    request.status = 'completed';
    request.completed_at = new Date();
    await request.save();
    
    // Уведомляем заказчика
    await bot.sendMessage(request.client.telegram_id,
        `✅ <b>Заявка №${request.id} выполнена!</b>\n\n` +
        `Монтажник завершил работу.\n` +
        `Спасибо за обращение!`,
        { parse_mode: 'HTML' }
    );
    
    await bot.editMessageText(
        `✅ Заявка №${requestId} завершена!`,
        {
            chat_id: chatId,
            message_id: messageId
        }
    );
    
    await bot.answerCallbackQuery(callbackQuery.id, {
        text: '✅ Заявка завершена'
    });
}

async function handleBackToList(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const telegramId = callbackQuery.from.id;
    
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    
    if (!user || user.role !== 'installer') return;
    
    const requests = await Request.findAll({
        where: {
            installer_id: user.id,
            status: 'in_progress'
        },
        order: [['created_at', 'DESC']]
    });
    
    try {
        await bot.deleteMessage(chatId, messageId);
    } catch (error) {}
    
    if (requests.length > 0) {
        await bot.sendMessage(chatId,
            '📋 Ваши заявки в работе:',
            { reply_markup: keyboards.getInstallerRequestsKeyboard(requests) }
        );
    } else {
        await bot.sendMessage(chatId, '📭 У вас нет активных заявок');
    }
}

async function handleBackToMain(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const telegramId = callbackQuery.from.id;
    
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    
    await bot.deleteMessage(chatId, messageId);
    await showMainMenu(chatId, user);
}

async function handleBackToAdmin(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId =callbackQuery.message.message_id;
    
    await bot.editMessageText(
        '👑 <b>Панель администратора</b>\n\nВыберите раздел:',
        {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: keyboards.getAdminKeyboard()
        }
    );
}

async function handleCallRequest(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const requestId = parseInt(callbackQuery.data.split('_')[1]);
    
    const request = await Request.findByPk(requestId);
    
    if (request && request.contact_phone) {
        await bot.sendMessage(chatId,
            `📞 <b>Телефон клиента:</b>\n<code>${request.contact_phone}</code>`,
            { parse_mode: 'HTML' }
        );
    }
}

async function handleShowMap(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const requestId = parseInt(callbackQuery.data.split('_')[2]);
    
    const request = await Request.findByPk(requestId);
    
    if (request && request.latitude && request.longitude) {
        const mapUrl = `https://yandex.ru/maps/?pt=${request.longitude},${request.latitude}&z=17&l=map`;
        
        await bot.sendMessage(chatId,
            `🗺 <b>Открыть на карте:</b>\n${mapUrl}`,
            { parse_mode: 'HTML' }
        );
        
        await bot.sendLocation(chatId, request.latitude, request.longitude);
    }
}

async function showClientRequests(msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    
    const requests = await Request.findAll({
        where: { client_id: user.id },
        include: [{ model: User, as: 'installer' }],
        order: [['created_at', 'DESC']],
        limit: 10
    });
    
    if (requests.length === 0) {
        await bot.sendMessage(chatId, '📭 У вас пока нет заявок.');
        return;
    }
    
    let text = '📋 <b>Ваши заявки:</b>\n\n';
    
    for (const req of requests) {
        const statusEmoji = req.status === 'completed' ? '✅' : 
                           req.status === 'in_progress' ? '🔨' : '🆕';
        const dateStr = moment(req.created_at).format('DD.MM.YYYY');
        const installerName = req.installer ? 
            (req.installer.username ? `@${req.installer.username}` : 'Не назначен') : 
            'Не назначен';
        
        text += `${statusEmoji} <b>Заявка №${req.id}</b> от ${dateStr}\n` +
            `📍 ${req.address.substring(0, 50)}...\n` +
            `👷 Монтажник: ${installerName}\n` +
            `📊 Статус: ${req.status}\n\n`;
    }
    
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

async function showInstallerActiveRequests(msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    
    const requests = await Request.findAll({
        where: {
            installer_id: user.id,
            status: 'in_progress'
        },
        include: [{ model: District, as: 'district' }],
        order: [['created_at', 'DESC']]
    });
    
    if (requests.length === 0) {
        await bot.sendMessage(chatId, '📭 У вас нет активных заявок');
        return;
    }
    
    await bot.sendMessage(chatId,
        '📋 Ваши заявки в работе:',
        { reply_markup: keyboards.getInstallerRequestsKeyboard(requests) }
    );
}

async function showInstallerAllRequests(msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    
    const allRequests = await Request.findAll({
        where: { installer_id: user.id },
        order: [['created_at', 'DESC']]
    });
    
    if (allRequests.length === 0) {
        await bot.sendMessage(chatId, '📭 У вас ещё нет взятых заявок');
        return;
    }
    
    const completed = allRequests.filter(r => r.status === 'completed').length;
    const inProgress = allRequests.filter(r => r.status === 'in_progress').length;
    
    const text = `📊 <b>Ваша статистика</b>\n\n` +
        `📋 Всего взято заявок: ${allRequests.length}\n` +
        `🔨 В работе: ${inProgress}\n` +
        `✅ Выполнено: ${completed}\n\n` +
        `Выберите заявку для просмотра деталей:`;
    
    const activeRequests = allRequests.filter(r => r.status === 'in_progress');
    const completedRequests = allRequests.filter(r => r.status === 'completed').slice(0, 10);
    
    await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboards.getInstallerAllRequestsKeyboard(activeRequests, completedRequests)
    });
}

async function showInstallerStats(msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    const user = await User.findOne({ where: { telegram_id: telegramId } });
    
    const allRequests = await Request.findAll({
        where: { installer_id: user.id }
    });
    
    const completed = allRequests.filter(r => r.status === 'completed').length;
    const inProgress = allRequests.filter(r => r.status === 'in_progress').length;
    
    const refusals = await Refusal.count({ where: { installer_id: user.id } });
    
    const rating = completed - refusals;
    const percent = allRequests.length > 0 ? Math.round(completed / allRequests.length * 100) : 0;
    
    const text = `📊 <b>Ваша статистика</b>\n\n` +
        `📋 Всего заявок взято: ${allRequests.length}\n` +
        `🔨 В работе: ${inProgress}\n` +
        `✅ Выполнено: ${completed}\n` +
        `❌ Отказов: ${refusals}\n` +
        `⭐ Рейтинг: ${rating}\n\n` +
        `📈 <b>Процент выполнения:</b> ${percent}%`;
    
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

async function startNewRequest(msg) {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    userStates.set(telegramId, states.REQUEST_DESCRIPTION);
    
    await bot.sendMessage(chatId,
        '📝 Опишите, что нужно сделать:',
        { reply_markup: keyboards.getCancelKeyboard() }
    );
}

// ==================== АДМИНСКИЕ ФУНКЦИИ ====================

async function showAdminStats(msg) {
    const chatId = msg.chat.id;
    
    const total = await Request.count();
    const new_ = await Request.count({ where: { status: 'new' } });
    const inProgress = await Request.count({ where: { status: 'in_progress' } });
    const completed = await Request.count({ where: { status: 'completed' } });
    
    const refusals = await Refusal.count();
    
    const installers = await User.count({ where: { role: 'installer' } });
    const clients = await User.count({ where: { role: 'client' } });
    
    const text = `📊 <b>Общая статистика</b>\n\n` +
        `📌 Всего заявок: ${total}\n` +
        `🆕 Новых: ${new_}\n` +
        `🔨 В работе: ${inProgress}\n` +
        `✅ Завершено: ${completed}\n` +
        `❌ Отказов: ${refusals}\n` +
        `👷 Монтажников: ${installers}\n` +
        `👤 Клиентов: ${clients}`;
    
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

async function showAdminInstallers(msg) {
    const chatId = msg.chat.id;
    
    const installers = await User.findAll({
        where: { role: 'installer' },
        order: [['id', 'ASC']]
    });
    
    if (installers.length === 0) {
        await bot.sendMessage(chatId, '👷 Нет зарегистрированных монтажников');
        return;
    }
    
    let text = '👷 <b>Список монтажников</b>\n\n';
    const buttons = [];
    
    for (const installer of installers) {
        const displayName = installer.username ? 
            `@${installer.username}` : 
            (installer.name || `ID ${installer.telegram_id}`);
        
        const active = await Request.count({
            where: {
                installer_id: installer.id,
                status: 'in_progress'
            }
        });
        
        text += `• ${displayName} - активных: ${active}\n`;
        
        buttons.push([{
            text: `${displayName} (активных: ${active})`,
            callback_data: `installer_details_${installer.id}`
        }]);
    }
    
    buttons.push([{ text: '⬅️ Назад', callback_data: 'back_to_admin' }]);
    
    await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function showAdminClients(msg) {
    const chatId = msg.chat.id;
    
    const clients = await User.findAll({
        where: { role: 'client' },
        order: [['created_at', 'DESC']],
        limit: 10
    });
    
    if (clients.length === 0) {
        await bot.sendMessage(chatId, '👤 Нет зарегистрированных клиентов');
        return;
    }
    
    let text = '👤 <b>Последние 10 клиентов</b>\n\n';
    const buttons = [];
    
    for (const client of clients) {
        const displayName = client.username ? 
            `@${client.username}` : 
            (client.name || `ID ${client.telegram_id}`);
        
        const requestsCount = await Request.count({ where: { client_id: client.id } });
        
        text += `• ${displayName} - заявок: ${requestsCount}\n`;
        
        buttons.push([{
            text: `${displayName} (заявок: ${requestsCount})`,
            callback_data: `client_details_${client.id}`
        }]);
    }
    
    buttons.push([{ text: '⬅️ Назад', callback_data: 'back_to_admin' }]);
    
    await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function showAdminDistricts(msg) {
    const chatId = msg.chat.id;
    
    const districts = await District.findAll({ order: [['name', 'ASC']] });
    
    let text = '🏘 <b>Статистика по районам</b>\n\n';
    
    for (const district of districts) {
        const total = await Request.count({ where: { district_id: district.id } });
        const completed = await Request.count({
            where: {
                district_id: district.id,
                status: 'completed'
            }
        });
        const inProgress = await Request.count({
            where: {
                district_id: district.id,
                status: 'in_progress'
            }
        });
        
        text += `• <b>${district.name}</b>\n` +
            `  Всего: ${total} | ✅ ${completed} | 🔨 ${inProgress}\n`;
    }
    
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

async function handleAdminCallbacks(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    
    if (data === 'admin_stats') {
        const total = await Request.count();
        const new_ = await Request.count({ where: { status: 'new' } });
        const inProgress = await Request.count({ where: { status: 'in_progress' } });
        const completed = await Request.count({ where: { status: 'completed' } });
        
        const refusals = await Refusal.count();
        
        const installers = await User.count({ where: { role: 'installer' } });
        const clients = await User.count({ where: { role: 'client' } });
        
        const text = `📊 <b>Общая статистика</b>\n\n` +
            `📌 Всего заявок: ${total}\n` +
            `🆕 Новых: ${new_}\n` +
            `🔨 В работе: ${inProgress}\n` +
            `✅ Завершено: ${completed}\n` +
            `❌ Отказов: ${refusals}\n` +
            `👷 Монтажников: ${installers}\n` +
            `👤 Клиентов: ${clients}`;
        
        await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: keyboards.getBackKeyboard()
        });
    } else if (data === 'admin_districts') {
        await showAdminDistricts({ chat: { id: chatId } });
        await bot.deleteMessage(chatId, messageId);
    } else if (data === 'admin_installers') {
        await showAdminInstallers({ chat: { id: chatId } });
        await bot.deleteMessage(chatId, messageId);
    } else if (data === 'admin_clients') {
        await showAdminClients({ chat: { id: chatId } });
        await bot.deleteMessage(chatId, messageId);
    } else if (data === 'admin_period') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const newWeek = await Request.count({
            where: {
                status: 'new',
                created_at: { [Op.gte]: weekAgo }
            }
        });
        
        const completedWeek = await Request.count({
            where: {
                status: 'completed',
                completed_at: { [Op.gte]: weekAgo }
            }
        });
        
        const activeInstallers = await Request.count({
            where: {
                installer_id: { [Op.ne]: null },
                assigned_at: { [Op.gte]: weekAgo }
            },
            distinct: true,
            col: 'installer_id'
        });
        
        const activeClients = await Request.count({
            where: {
                created_at: { [Op.gte]: weekAgo }
            },
            distinct: true,
            col: 'client_id'
        });
        
        const topInstallers = await Request.findAll({
            where: {
                installer_id: { [Op.ne]: null },
                status: 'completed',
                completed_at: { [Op.gte]: weekAgo }
            },
            attributes: [
                'installer_id',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['installer_id'],
            order: [[sequelize.literal('count'), 'DESC']],
            limit: 3
        });
        
        let text = `📅 <b>Статистика за последние 7 дней</b>\n\n` +
            `🆕 Новых заявок: ${newWeek}\n` +
            `✅ Выполнено заявок: ${completedWeek}\n` +
            `👷 Активных монтажников: ${activeInstallers}\n` +
            `👤 Активных клиентов: ${activeClients}\n`;
        
        if (topInstallers.length > 0) {
            text += '\n🏆 <b>Топ монтажников недели:</b>\n';
            
            for (let i = 0; i < topInstallers.length; i++) {
                const item = topInstallers[i];
                const installer = await User.findByPk(item.installer_id);
                const name = installer ? 
                    (installer.username || installer.name || `ID ${installer.telegram_id}`) : 
                    'Неизвестно';
                text += `${i + 1}. ${name} - ${item.dataValues.count} заявок\n`;
            }
        }
        
        await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: keyboards.getBackKeyboard()
        });
    }
}

async function handleInstallerDetails(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const installerId = parseInt(callbackQuery.data.split('_')[2]);
    
    const installer = await User.findByPk(installerId);
    
    if (!installer) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Монтажник не найден',
            show_alert: true
        });
        return;
    }
    
    const allRequests = await Request.findAll({
        where: { installer_id: installerId }
    });
    
    const completed = allRequests.filter(r => r.status === 'completed').length;
    const inProgress = allRequests.filter(r => r.status === 'in_progress').length;
    
    const refusals = await Refusal.count({ where: { installer_id: installerId } });
    
    const name = installer.username || installer.name || `ID ${installer.telegram_id}`;
    
    const text = `👷 <b>Профиль монтажника</b>\n\n` +
        `📋 <b>Основная информация:</b>\n` +
        `• Имя: ${installer.name || 'Не указано'}\n` +
        `• Username: @${installer.username || 'нет'}\n` +
        `• Telegram ID: <code>${installer.telegram_id}</code>\n` +
        `• Телефон: ${installer.phone || 'Не указан'}\n` +
        `• Дата регистрации: ${moment(installer.created_at).format('DD.MM.YYYY')}\n\n` +
        `📊 <b>Статистика:</b>\n` +
        `• Всего заявок взято: ${allRequests.length}\n` +
        `• В работе: ${inProgress}\n` +
        `• Выполнено: ${completed}\n` +
        `• Отказов: ${refusals}\n\n` +
        `✅ <b>Процент выполнения:</b> ${allRequests.length > 0 ? Math.round(completed / allRequests.length * 100) : 0}%\n` +
        `⭐ <b>Рейтинг:</b> ${completed - refusals}`;
    
    const buttons = [];
    
    if (installer.username) {
        buttons.push([{
            text: '📱 Открыть профиль в Telegram',
            url: `https://t.me/${installer.username}`
        }]);
    } else {
        buttons.push([{
            text: '📱 Написать сообщение',
            url: `tg://user?id=${installer.telegram_id}`
        }]);
    }
    
    if (inProgress > 0) {
        buttons.push([{
            text: `🔨 Заявки в работе (${inProgress})`,
            callback_data: `installer_requests_${installerId}_in_progress`
        }]);
    }
    
    if (completed > 0) {
        buttons.push([{
            text: `✅ Выполненные заявки (${completed})`,
            callback_data: `installer_requests_${installerId}_completed`
        }]);
    }
    
    if (refusals > 0) {
        buttons.push([{
            text: `❌ Отказы (${refusals})`,
            callback_data: `installer_refusals_${installerId}`
        }]);
    }
    
    buttons.push([{
        text: '⬅️ К списку монтажников',
        callback_data: 'admin_installers'
    }]);
    
    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function handleClientDetails(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const clientId = parseInt(callbackQuery.data.split('_')[2]);
    
    const client = await User.findByPk(clientId);
    
    if (!client) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Клиент не найден',
            show_alert: true
        });
        return;
    }
    
    const allRequests = await Request.findAll({
        where: { client_id: clientId }
    });
    
    const total = allRequests.length;
    const completed = allRequests.filter(r => r.status === 'completed').length;
    const inProgress = allRequests.filter(r => r.status === 'in_progress').length;
    const new_ = allRequests.filter(r => r.status === 'new').length;
    
    const name = client.username || client.name || `ID ${client.telegram_id}`;
    
    const text = `👤 <b>Профиль клиента</b>\n\n` +
        `📋 <b>Основная информация:</b>\n` +
        `• Имя: ${client.name || 'Не указано'}\n` +
        `• Username: @${client.username || 'нет'}\n` +
        `• Telegram ID: <code>${client.telegram_id}</code>\n` +
        `• Телефон: ${client.phone || 'Не указан'}\n` +
        `• Дата регистрации: ${moment(client.created_at).format('DD.MM.YYYY')}\n\n` +
        `📊 <b>Статистика заявок:</b>\n` +
        `• Всего заявок: ${total}\n` +
        `• Активных: ${inProgress}\n` +
        `• Выполнено: ${completed}\n` +
        `• Новых: ${new_}`;
    
    const buttons = [];
    
    if (client.username) {
        buttons.push([{
            text: '📱 Открыть профиль в Telegram',
            url: `https://t.me/${client.username}`
        }]);
    } else {
        buttons.push([{
            text: '📱 Написать сообщение',
            url: `tg://user?id=${client.telegram_id}`
        }]);
    }
    
    if (total > 0) {
        buttons.push([{
            text: `📋 Все заявки клиента (${total})`,
            callback_data: `client_requests_${clientId}`
        }]);
    }
    
    buttons.push([{
        text: '⬅️ К списку клиентов',
        callback_data: 'admin_clients'
    }]);
    
    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function handleClientRequests(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const clientId = parseInt(callbackQuery.data.split('_')[2]);
    
    const client = await User.findByPk(clientId);
    
    const requests = await Request.findAll({
        where: { client_id: clientId },
        include: [{ model: User, as: 'installer' }],
        order: [['created_at', 'DESC']],
        limit: 10
    });
    
    if (requests.length === 0) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Заявки не найдены',
            show_alert: true
        });
        return;
    }
    
    let text = `📋 <b>Заявки клиента</b> ${client.name || client.username}\n\n`;
    
    for (const req of requests) {
        const statusEmoji = req.status === 'completed' ? '✅' : 
                           req.status === 'in_progress' ? '🔨' : '🆕';
        const dateStr = moment(req.created_at).format('DD.MM.YYYY');
        
        text += `━━━━━━━━━━━━━━━\n` +
            `${statusEmoji} <b>Заявка №${req.id}</b> от ${dateStr}\n` +
            `📍 Адрес: ${req.address}\n` +
            `📊 Статус: ${req.status}\n`;
        
        if (req.installer) {
            text += `👷 Монтажник: @${req.installer.username || req.installer.name}\n`;
        }
    }
    
    if (requests.length === 10) {
        const total = await Request.count({ where: { client_id: clientId } });
        if (total > 10) {
            text += `\n... и еще ${total - 10} заявок`;
        }
    }
    
    const buttons = [[{
        text: '⬅️ Назад к клиенту',
        callback_data: `client_details_${clientId}`
    }]];
    
    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function handleInstallerRequestsByStatus(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const parts = callbackQuery.data.split('_');
    const installerId = parseInt(parts[2]);
    const status = parts[3];
    
    const installer = await User.findByPk(installerId);
    
    const requests = await Request.findAll({
        where: {
            installer_id: installerId,
            status
        },
        order: [['created_at', 'DESC']],
        limit: 10
    });
    
    if (requests.length === 0) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Заявки не найдены',
            show_alert: true
        });
        return;
    }
    
    const statusText = status === 'in_progress' ? 'в работе' : 'выполненных';
    let text = `📋 <b>${statusText.charAt(0).toUpperCase() + statusText.slice(1)} заявки</b> монтажника ${installer.name || installer.username}\n\n`;
    
    for (const req of requests) {
        const dateStr = moment(req.created_at).format('DD.MM.YYYY HH:mm');
        text += `━━━━━━━━━━━━━━━\n` +
            `📌 <b>Заявка №${req.id}</b> от ${dateStr}\n` +
            `📍 Адрес: ${req.address}\n` +
            `📞 Телефон: ${req.contact_phone}\n`;
        
        if (req.completed_at && status === 'completed') {
            text += `✅ Завершена: ${moment(req.completed_at).format('DD.MM.YYYY HH:mm')}\n`;
        }
    }
    
    if (requests.length === 10) {
        const total = await Request.count({
            where: {
                installer_id: installerId,
                status
            }
        });
        if (total > 10) {
            text += `\n... и еще ${total - 10} заявок`;
        }
    }
    
    const buttons = [[{
        text: '⬅️ Назад к монтажнику',
        callback_data: `installer_details_${installerId}`
    }]];
    
    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function handleInstallerRefusals(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const installerId = parseInt(callbackQuery.data.split('_')[2]);
    
    const installer = await User.findByPk(installerId);
    
    const refusals = await Refusal.findAll({
        where: { installer_id: installerId },
        order: [['created_at', 'DESC']],
        limit: 10
    });
    
    if (refusals.length === 0) {
        await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Отказы не найдены',
            show_alert: true
        });
        return;
    }
    
    let text = `❌ <b>Отказы</b> монтажника ${installer.name || installer.username}\n\n`;
    
    for (const refusal of refusals) {
        const dateStr = moment(refusal.created_at).format('DD.MM.YYYY HH:mm');
        text += `━━━━━━━━━━━━━━━\n` +
            `📌 <b>Заявка №${refusal.request_id}</b>\n` +
            `📅 Дата: ${dateStr}\n` +
            `📝 Причина: ${refusal.reason}\n`;
    }
    
    if (refusals.length === 10) {
        const total = await Refusal.count({ where: { installer_id: installerId } });
        if (total > 10) {
            text += `\n... и еще ${total - 10} отказов`;
        }
    }
    
    const buttons = [[{
        text: '⬅️ Назад к монтажнику',
        callback_data: `installer_details_${installerId}`
    }]];
    
    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
}

// ==================== ЗАПУСК БОТА ====================

console.log('✅ Бот запущен и готов к работе!');

// Обработка ошибок
process.on('uncaughtException', (error) => {
    console.error('Необработанная ошибка:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Необработанное отклонение промиса:', error);
});