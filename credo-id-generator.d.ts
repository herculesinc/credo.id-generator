declare module "@credo/id-generator" {
    // IMPORTS
    // --------------------------------------------------------------------------------------------
    import * as redis from 'redis';
    
    // INTERFACES
    // --------------------------------------------------------------------------------------------
    export interface IdGeneratorOptions {
        name   : string;
        redis  : RedisOptions | redis.RedisClient;
    }

    interface RedisOptions {
        host        : string;
        port        : number;
        auth_pass   : string;
    }

    // GENERATOR
    // --------------------------------------------------------------------------------------------
	export class IdGenerator {
		constructor(options: IdGeneratorOptions);
		getNextId(): Promise<string>;
	}
}