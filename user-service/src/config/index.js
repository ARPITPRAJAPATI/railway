const getServiceName = () => {
    try {
        return require('../../package.json').name;
    } catch {
        try {
            return require('../../../package.json').name;
        } catch {
            return 'user-service';
        }
    }
};

const config = {
    SERVICE_NAME: process.env.SERVICE_NAME || getServiceName(),
    PORT: Number(process.env.PORT) || 4001,
    NODE_ENV: process.env.NODE_ENV || "development",
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL
}
module.exports = { config };