// states.js
const States = {
    // Состояния для создания заявки
    REQUEST_DESCRIPTION: 'request_description',
    REQUEST_PHOTOS: 'request_photos',
    REQUEST_ADDRESS_CHOICE: 'request_address_choice',
    REQUEST_MANUAL_ADDRESS: 'request_manual_address',
    REQUEST_LOCATION: 'request_location',
    REQUEST_PHONE: 'request_phone',
    REQUEST_DISTRICT: 'request_district',
    
    // Состояние для отказа
    REFUSAL_REASON: 'refusal_reason'
};

module.exports = States;