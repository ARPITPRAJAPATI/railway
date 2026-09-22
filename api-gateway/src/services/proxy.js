// this will do manage circuit breaker and call downstream service

const { config } = require("../config");

class circuitBreaker {
    constructor(serviceName, threshold = config.CIRCUIT_BREAKER_THRESHOLD,
        timeout = config.CIRCUIT_BREAKER_TIMEOUT) {

        this.serviceName = serviceName;
        this.failureCount = 0;
        this.threshold = threshold;
        this.timeout = timeout;
        this.state = 'closed';
        this.nextAttempt = Date.now();

    }
    async execute(request) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new ServiceUnavialError(`Service ${this.serviceName} is currently unavailable`)
            }
            this.state = 'HALF_OPEN';
            logger.info('circuit breaker HALF_OPEN for service: ', this.serviceName);
        }
        try {
            const response = await request();
            this.onSuccess();
            return response;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }

    }
    async onSuccess() {
        this.failureCount = 0;
        if (this.state === 'HALF_OPEN') {
            this.state = 'CLOSED';
            logger.info(`Circuit Breaker closed for ${this.serviceName}`)
        }
    }
    async onFailure() {
        this.failureCount++;
        if (this.failureCount >= this.threshold && this.state === 'CLOSED') {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.timeout;
            logger.error(`Circuit Breaker OPEN for ${this.serviceName}`)
        }
    }
    getState() {
        return {
            service: this.serviceName,
            state: this.state,
            failureCount: this.failureCount,
            nextAttempt: this.nextAttempt
        }
    }
}

const circuitBreakers = {
    userService: new circuitBreaker('userService'),
    bookingService: new circuitBreaker('bookingService'),
    searchService: new circuitBreaker('searchService'),
}

/**
 * Forward request to downstream service with circuit breaker protection
 */
async function forwardRequest(serviceUrl, path, method, data, headers, circuitBreaker) {
    const url = `${serviceUrl}${path}`;
    logger.info(url);
    // http://localhost:4001/auth/login
    const requestConfig = {
        method,
        url,
        timeout: config.SERVICE_TIMEOUT_MS,
        headers: {
            ...headers,
            // Remove host header to avoid conflicts
            host: undefined,
            // Remove content-length to let axios recalculate
            'content-length': undefined,
        },
        // Important: Don't validate status, let service response through
        validateStatus: () => true,
        // Set max redirects
        maxRedirects: 5,
    };

    // Add data based on method
    if (method !== 'GET' && method !== 'DELETE' && data) {
        requestConfig.data = data;
    }

    // For GET and DELETE, add params if data exists
    if ((method === 'GET' || method === 'DELETE') && data) {
        requestConfig.params = data;
    }

    logger.debug(`Forwarding ${method} ${url}`, {
        headers: requestConfig.headers,
        hasData: !!data,
        timeout: config.SERVICE_TIMEOUT_MS,
    });

    try {
        const response = await circuitBreaker.execute(() => axios(requestConfig));

        logger.debug(`Response from ${url}:`, {
            status: response.status,
            statusText: response.statusText,
        });

        return {
            status: response.status,
            data: response.data,
            headers: response.headers,
        };
    } catch (err) {
        logger.error(`Error forwarding to ${serviceUrl}:`, {
            message: err.message,
            code: err.code,
            url: url,
            method: method,
            timeout: config.SERVICE_TIMEOUT_MS,
        });

        if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
            throw new GatewayTimeoutError(`Request to ${serviceUrl} timed out after ${config.SERVICE_TIMEOUT_MS}ms`);
        }

        if (err.code === 'ECONNREFUSED') {
            throw new ServiceUnavailableError(`Cannot connect to ${serviceUrl}. Service may be down.`);
        }

        if (err.response) {
            logger.error(`Service error from ${serviceUrl}:`, {
                status: err.response.status,
                data: err.response.data,
            });

            return {
                status: err.response.status,
                data: err.response.data,
                headers: err.response.headers,
            };
        }

        // Network error or service down--You would have seen this in video
        logger.error(`Network error while calling ${serviceUrl}:`, err.message);
        throw new ServiceUnavailableError(`Service temporarily unavailable: ${err.message}`);
    }
}
/**
 * Proxy middleware factory
 */
function createProxy(serviceName, serviceUrl) {
    const circuitBreaker = circuitBreakers[serviceName];

    if (!circuitBreaker) {
        throw new Error(`No circuit breaker found for service: ${serviceName}`);
    }

    return async (req, res, next) => {
        try {
            // Extract path (remove /api prefix only)
            // Gateway: /api/users/auth/login -> Service: /auth/login
            // Gateway: /api/users/user/profile -> Service: /user/profile
            logger.info(req.path);
            const pathParts = req.path.split('/').filter(Boolean);
            logger.info(pathParts);
            // Remove 'users' (first part), keep the rest
            // ['users', 'auth', 'login'] -> ['auth', 'login'] -> '/auth/login'
            const servicePath = '/' + pathParts.slice(1).join('/');
            logger.info(servicePath);

            const result = await forwardRequest(
                serviceUrl,
                servicePath + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''),
                req.method,
                req.body,
                req.headers,
                circuitBreaker
            );

            // Forward response headers (except some)
            const excludeHeaders = ['connection', 'keep-alive', 'transfer-encoding', 'host'];
            Object.keys(result.headers).forEach((key) => {
                if (!excludeHeaders.includes(key.toLowerCase())) {
                    res.setHeader(key, result.headers[key]);
                }
            });

            // Send response
            res.status(result.status).json(result.data);
        } catch (err) {
            next(err);
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    createProxy,
    circuitBreakers,
};
