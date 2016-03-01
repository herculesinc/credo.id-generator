// IMPORTS
// ================================================================================================
import * as redis from 'redis';
import * as Long from 'long';

// INTERFACES
// ================================================================================================
export interface IdGeneratorOptions {
	name   : string;
	redis  : RedisOptions | redis.RedisClient;
}

interface RedisOptions {
    host        : string;
    port        : number;
    auth_pass   : string;
}

// MODULE VARIABLES
// ================================================================================================
var FILLER_LENGTH = 16;
var MAX_SEQUENCE = Math.pow(2, FILLER_LENGTH);

// ID GENERATOR CLASS
// ================================================================================================
export class IdGenerator {
	
    private sequenceKey: string;
    private client: redis.RedisClient;
    
	constructor(options: IdGeneratorOptions) {
        this.sequenceKey = `credo::id-generator::sequence::${options.name}`;
        this.client = hasClient(options) 
            ? options.redis as redis.RedisClient
            : redis.createClient(options.redis as RedisOptions);
	}
    
    getNextId(): Promise<string> {
		return new Promise((resolve, reject) => {
			this.client.eval(script, 1, this.sequenceKey, (err, reply) => {
				if (err) {
					return reject(err);
				}
                
                var id = Long.fromNumber(reply[1] * 1000 + Math.floor(reply[2] / 1000));
                id = id.shiftLeft(FILLER_LENGTH);
                id = id.or(reply[0]);
                
				resolve(id.toString(10));
			});
		});
    }
}

// HELPER FUNCTIONS
// ================================================================================================
function hasClient(options: IdGeneratorOptions): boolean {
    var optionsOrClient = options.redis as any;
    return !optionsOrClient.host && !optionsOrClient.port && !optionsOrClient.auth_password;
}

// LUA SCRIPT
// ================================================================================================
var script = `
    local sequence_key = KEYS[1]

    if redis.call("EXISTS", sequence_key) == 0 then
        redis.call("PSETEX", sequence_key, 1, "0")
    end

    local sequence = redis.call("INCR", sequence_key)

    if sequence >= ${MAX_SEQUENCE} then
        return redis.error_reply("Cannot generate ID, waiting for lock to expire.")
    end

    local time = redis.call("TIME")

    return {
        sequence,
        tonumber(time[1]),
        tonumber(time[2])
    }
`;