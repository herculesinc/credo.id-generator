declare module "@credo/id-generator" {
    // IMPORTS
    // --------------------------------------------------------------------------------------------
    import * as redis from 'redis';
    import * as nova from 'nova-base';
    
    // INTERFACES
    // --------------------------------------------------------------------------------------------
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

    // GENERATOR CLASS
    // --------------------------------------------------------------------------------------------
	export class IdGenerator {
		constructor(options: IdGeneratorOptions, logger?: nova.Logger);
		getNextId(): Promise<string>;
	}

    // SINGLETON
    // --------------------------------------------------------------------------------------------
    export function configure(options: IdGeneratorOptions, logger?: nova.Logger): IdGenerator;
    export function getInstance(): IdGenerator;
    export function getNextId(): Promise<string>;

    // ERRORS
    // --------------------------------------------------------------------------------------------
    export class IdGeneratorError extends nova.Exception {
        constructor(cause: Error, message: string);
    }
}