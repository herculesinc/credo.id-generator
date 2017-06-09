"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const events = require("events");
const redis = require("redis");
const nova = require("nova-base");
const Long = require("long");
// MODULE VARIABLES
// ================================================================================================
const FILLER_LENGTH = 20;
const MAX_SEQUENCE = Math.pow(2, FILLER_LENGTH);
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CACHE_WINDOW = 100;
const MAX_RETRY_TIME = 60000; // 1 minute
const MAX_RETRY_INTERVAL = 3000; // 3 seconds
const RETRY_INTERVAL_STEP = 200; // 200 milliseconds
const ERROR_EVENT = 'error';
const since = nova.util.since;
// ID format: [sign:1][millisecond:43][sequence:20]
// ID GENERATOR CLASS
// ================================================================================================
class IdGenerator extends events.EventEmitter {
    constructor(options, logger) {
        super();
        this.name = options.name || 'id-generator';
        this.client = redis.createClient(prepareRedisOptions(options.redis, this.name, logger));
        this.logger = logger;
        this.sequenceKey = `credo::id-generator::${options.name}`;
        this.idBatchSize = options.batch || DEFAULT_BATCH_SIZE;
        this.cacheWindow = options.window || DEFAULT_CACHE_WINDOW;
        // error in redis connection should not bring down the service
        this.client.on('error', (error) => {
            this.emit(ERROR_EVENT, new IdGeneratorError(error, 'ID Generator error'));
        });
    }
    getNextId() {
        this.logger && this.logger.debug(`Getting next ID`, this.name);
        if (this.checkpoint === this.getCheckpoint() && this.sequence < this.sequenceMax) {
            this.sequence++;
            return Promise.resolve(buildId(this.timestamp, this.sequence));
        }
        const start = process.hrtime();
        this.logger && this.logger.debug('Generating new ID batch', this.name);
        return new Promise((resolve, reject) => {
            this.client.eval(script, 1, this.sequenceKey, this.idBatchSize, (error, reply) => {
                this.logger && this.logger.trace(this.name, 'generate ID batch', since(start), !error);
                if (error) {
                    error = new IdGeneratorError(error, 'Failed to get next ID');
                    return reject(error);
                }
                this.checkpoint = this.getCheckpoint();
                this.timestamp = reply[2] * 1000 + Math.floor(reply[3] / 1000);
                this.sequence = reply[0];
                this.sequenceMax = reply[1];
                resolve(buildId(this.timestamp, this.sequence));
            });
        });
    }
    getCheckpoint() {
        return Math.floor(Date.now() / this.cacheWindow);
    }
}
exports.IdGenerator = IdGenerator;
// SINGLETON
// ================================================================================================
var instance;
function configure(options, logger) {
    if (instance)
        throw new TypeError('Global ID generator has already been configured');
    instance = new IdGenerator(options, logger);
    return instance;
}
exports.configure = configure;
function getInstance() {
    if (!instance)
        throw new TypeError('Global ID generator has not yet been configured');
    return instance;
}
exports.getInstance = getInstance;
function getNextId() {
    if (!instance)
        throw new TypeError('Global ID generator has not yet been configured');
    return instance.getNextId();
}
exports.getNextId = getNextId;
// ERRORS
// ================================================================================================
class IdGeneratorError extends nova.Exception {
    constructor(cause, message) {
        super({ cause, message });
    }
}
exports.IdGeneratorError = IdGeneratorError;
// HELPER FUNCTIONS
// ================================================================================================
function prepareRedisOptions(options, limiterName, logger) {
    let redisOptions = options;
    // make sure retry strategy is defined
    if (!redisOptions.retry_strategy) {
        redisOptions = Object.assign({}, redisOptions, { retry_strategy: function (options) {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    return new Error('The server refused the connection');
                }
                else if (options.total_retry_time > MAX_RETRY_TIME) {
                    return new Error('Retry time exhausted');
                }
                logger && logger.warn('Redis connection lost. Trying to recconect', limiterName);
                return Math.min(options.attempt * RETRY_INTERVAL_STEP, MAX_RETRY_INTERVAL);
            } });
    }
    return redisOptions;
}
function buildId(timestamp, sequence) {
    let id = Long.fromNumber(timestamp);
    id = id.shiftLeft(FILLER_LENGTH);
    id = id.or(sequence);
    return id.toString(10);
}
// LUA SCRIPT
// ================================================================================================
const script = `
    local sequence_key = KEYS[1]
    local id_count = tonumber(ARGV[1])

    if redis.call("EXISTS", sequence_key) == 0 then
        redis.call("PSETEX", sequence_key, 1, "0")
    end

    local sequence_start = redis.call("INCR", sequence_key)
    local sequence_end = redis.call("INCRBY", sequence_key, id_count)

    if sequence_end >= ${MAX_SEQUENCE} then
        return redis.error_reply("Cannot generate ID, waiting for lock to expire.")
    end

    local time = redis.call("TIME")

    return {
        sequence_start,
        sequence_end,
        tonumber(time[1]),
        tonumber(time[2])
    }
`;
//# sourceMappingURL=index.js.map