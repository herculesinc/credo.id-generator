"use strict";
// IMPORTS
// ================================================================================================
const events = require('events');
const redis = require('redis');
const nova = require('nova-base');
const Long = require('long');
// MODULE VARIABLES
// ================================================================================================
const FILLER_LENGTH = 20;
const MAX_SEQUENCE = Math.pow(2, FILLER_LENGTH);
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CACHE_WINDOW = 100;
const ERROR_EVENT = 'error';
const COMMAND_NAME = 'generate id batch';
const since = nova.util.since;
// ID format: [sign:1][millisecond:43][sequence:20]
// ID GENERATOR CLASS
// ================================================================================================
class IdGenerator extends events.EventEmitter {
    constructor(options, logger) {
        super();
        this.name = options.name;
        this.client = isClient(options.redis) ? options.redis : redis.createClient(options.redis);
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
        this.logger && this.logger.debug(`Getting next ID from ${this.name}`);
        if (this.checkpoint === this.getCheckpoint() && this.sequence < this.sequenceMax) {
            this.sequence++;
            return Promise.resolve(buildId(this.timestamp, this.sequence));
        }
        const start = process.hrtime();
        this.logger && this.logger.debug('Generating new ID batch');
        return new Promise((resolve, reject) => {
            this.client.eval(script, 1, this.sequenceKey, this.idBatchSize, (error, reply) => {
                if (error) {
                    error = new IdGeneratorError(error, 'Failed to get next ID');
                    this.logger && this.logger.trace(this.name, COMMAND_NAME, since(start), false);
                    return reject(error);
                }
                this.checkpoint = this.getCheckpoint();
                this.timestamp = reply[2] * 1000 + Math.floor(reply[3] / 1000);
                this.sequence = reply[0];
                this.sequenceMax = reply[1];
                this.logger && this.logger.trace(this.name, COMMAND_NAME, since(start), true);
                resolve(buildId(this.timestamp, this.sequence));
            });
        });
    }
    getCheckpoint() {
        return Math.floor(Date.now() / this.cacheWindow);
    }
}
exports.IdGenerator = IdGenerator;
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
function isClient(redis) {
    return !redis.host && !redis.port && !redis.password;
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