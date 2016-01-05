declare module "@credo/id-generator" {
    
    // INTERFACES
    // --------------------------------------------------------------------------------------------
    export interface IdGeneratorOptions {
        shard: number;
        epoch: number;
    }

    // GENERATOR
    // --------------------------------------------------------------------------------------------
	export class IdGenerator {
		constructor(options: IdGeneratorOptions);
		getNextId(): Promise<string>;
	}
}