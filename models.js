// models.js
const { Sequelize, DataTypes } = require('sequelize');
const config = require('./config');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: config.DATABASE_PATH,
    logging: false
});

// Модель пользователя
const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    telegram_id: {
        type: DataTypes.BIGINT,
        unique: true,
        allowNull: false
    },
    role: {
        type: DataTypes.STRING,
        allowNull: false
    },
    name: DataTypes.STRING,
    phone: DataTypes.STRING,
    username: DataTypes.STRING,
    is_admin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

// Модель района
const District = sequelize.define('District', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    }
});

// Модель заявки
const Request = sequelize.define('Request', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    client_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    description: DataTypes.TEXT,
    photo_file_id: DataTypes.STRING,
    address: DataTypes.STRING,
    latitude: DataTypes.FLOAT,
    longitude: DataTypes.FLOAT,
    location_address: DataTypes.STRING,
    contact_phone: DataTypes.STRING,
    district_id: DataTypes.INTEGER,
    status: {
        type: DataTypes.STRING,
        defaultValue: 'new'
    },
    installer_id: DataTypes.INTEGER,
    assigned_at: DataTypes.DATE,
    completed_at: DataTypes.DATE,
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

// Модель отказа
const Refusal = sequelize.define('Refusal', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    request_id: DataTypes.INTEGER,
    installer_id: DataTypes.INTEGER,
    reason: DataTypes.TEXT,
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

// Модель сообщений в группе
const GroupMessage = sequelize.define('GroupMessage', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    request_id: DataTypes.INTEGER,
    group_chat_id: DataTypes.BIGINT,
    message_id: DataTypes.INTEGER
});

// Модель кэша геокодера
const GeocodeCache = sequelize.define('GeocodeCache', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    latitude: DataTypes.FLOAT,
    longitude: DataTypes.FLOAT,
    address: DataTypes.STRING,
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    indexes: [
        {
            unique: true,
            fields: ['latitude', 'longitude']
        }
    ]
});

// Устанавливаем связи
User.hasMany(Request, { foreignKey: 'client_id', as: 'client_requests' });
User.hasMany(Request, { foreignKey: 'installer_id', as: 'installer_requests' });
Request.belongsTo(User, { foreignKey: 'client_id', as: 'client' });
Request.belongsTo(User, { foreignKey: 'installer_id', as: 'installer' });
Request.belongsTo(District, { foreignKey: 'district_id', as: 'district' });
District.hasMany(Request, { foreignKey: 'district_id' });
Request.hasMany(Refusal, { foreignKey: 'request_id' });
Refusal.belongsTo(Request, { foreignKey: 'request_id' });
Refusal.belongsTo(User, { foreignKey: 'installer_id', as: 'installer' });

// Инициализация базы данных
async function initDatabase() {
    try {
        await sequelize.sync({ alter: true });
        console.log('✅ База данных синхронизирована');

        // Добавляем районы, если их нет
        const config = require('./config');
        for (const districtName of config.DISTRICTS) {
            const [district, created] = await District.findOrCreate({
                where: { name: districtName }
            });
            if (created) {
                console.log(`➕ Добавлен район: ${districtName}`);
            }
        }
        console.log('✅ Районы добавлены');
    } catch (error) {
        console.error('❌ Ошибка инициализации базы данных:', error);
    }
}

module.exports = {
    sequelize,
    User,
    District,
    Request,
    Refusal,
    GroupMessage,
    GeocodeCache,
    initDatabase
};