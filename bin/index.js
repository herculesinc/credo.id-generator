"use strict";
// IMPORTS
// ================================================================================================
var BigInt = require('big-integer');
// MODULE VARIABLES
// ================================================================================================
var MAX_SHARD = 4096;
var MAX_COUNT = 512;
// ID GENERATOR CLASS
// ================================================================================================
class IdGenerator {
    constructor(options) {
        this.shard = options.shard;
        if (this.shard < 0 || this.shard > MAX_SHARD) {
            throw new Error(`Shard number ${this.shard} exeeds allowed limit of ${MAX_SHARD} or is less than 0`);
        }
        this.epoch = options.epoch;
        if (this.epoch < 0) {
            throw new Error(`Epoch number is less than 0`);
        }
    }
    next() {
        var currentMillisecond = Date.now() - this.epoch;
        if (currentMillisecond === this.previousMillisecond) {
            this.counter++;
            if (this.counter < MAX_COUNT) {
                var id = buildId(currentMillisecond, this.shard, this.counter);
                return Promise.resolve(id);
            }
            else {
                // return a promise that will call next() again in 2 ms
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        this.next()
                            .then((id) => resolve(id))
                            .catch((reason) => reject(reason));
                    }, 2);
                });
            }
        }
        else {
            this.counter = 0;
            this.previousMillisecond = currentMillisecond;
            var id = buildId(currentMillisecond, this.shard, this.counter);
            return Promise.resolve(id);
        }
    }
}
exports.IdGenerator = IdGenerator;
// HELPER FUNCTIONS
// ================================================================================================
function buildId(millisecond, shard, sequence) {
    var id = BigInt(millisecond).shiftLeft(12);
    id = id.or(shard).shiftLeft(9);
    id = id.or(sequence);
    return id.toString(10);
}
//# sourceMappingURL=index.js.map