// IMPORTS
// ================================================================================================
import * as events from 'events';
import * as redis from 'redis';
import * as nova from 'nova-base';
import * as Long from 'long';

// INTERFACES
// ================================================================================================
export interface IdGeneratorOptions {
	name    : string;
    batch?  : number;
    window? : number;
	redis   : RedisConnectionConfig | redis.RedisClient;
}

export interface RedisConnectionConfig {
    host            : string;
    port            : number;
    password        : string;
    prefix?         : string;
    retry_strategy? : (options: any) => number | Error;
}

// MODULE VARIABLES
// ================================================================================================
const FILLER_LENGTH = 20;
const MAX_SEQUENCE = Math.pow(2, FILLER_LENGTH);
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CACHE_WINDOW = 100; 
const ERROR_EVENT = 'error';
const since = nova.util.since;

// ID format: [sign:1][millisecond:43][sequence:20]

// ID GENERATOR CLASS
// ================================================================================================
export class IdGenerator extends events.EventEmitter {
	
    name            : string;
    private client  : redis.RedisClient;
    private logger? : nova.Logger;
    
    private sequenceKey : string;
    private idBatchSize : number;
    private cacheWindow : number;

    private checkpoint  : number;
    private timestamp   : number;
    private sequence    : number;
    private sequenceMax : number;

	constructor(options: IdGeneratorOptions, logger?: nova.Logger) {
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
    
    getNextId(): Promise<string> {
        this.logger && this.logger.debug(`Getting next ID from ${this.name}`);
        if (this.checkpoint === this.getCheckpoint() && this.sequence < this.sequenceMax) {
            this.sequence++;
            return Promise.resolve(buildId(this.timestamp, this.sequence));            
        }

        const start = process.hrtime();
        this.logger && this.logger.debug('Generating new ID batch');
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

    private getCheckpoint(): number {
        return Math.floor(Date.now() / this.cacheWindow);
    }
}

// SINGLETON
// ================================================================================================
var instance: IdGenerator;

export function configure(options: IdGeneratorOptions, logger?: nova.Logger): IdGenerator {
    if (instance) throw new TypeError('Global ID generator has already been configured');
    instance = new IdGenerator(options, logger);
    return instance;
}

export function getInstance(): IdGenerator {
    if (!instance) throw new TypeError('Global ID generator has not yet been configured');
    return instance;
}

export function getNextId(): Promise<string> {
    if (!instance) throw new TypeError('Global ID generator has not yet been configured');
    return instance.getNextId();
}

// ERRORS
// ================================================================================================
export class IdGeneratorError extends nova.Exception {
    constructor(cause: Error, message: string) {
        super({ cause, message });
    }
}

// HELPER FUNCTIONS
// ================================================================================================
function isClient(redis: any): redis is redis.RedisClient {
    return !redis.host && !redis.port && !redis.password;
}

function buildId(timestamp: number, sequence: number) {
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