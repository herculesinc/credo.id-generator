// IMPORTS
// ================================================================================================
import { IdGenerator } from './../index';
import { MockLogger } from './mocks/Logger';

// SETUP
// ================================================================================================
const config = {
    name        : 'testgenerator',
    batch       : 10,
    window      : 100,
    redis: {
        host    : '',
        port    : 6379,
        password: '',
        prefix  : 'testgenerator'
    }
};

const generator = new IdGenerator(config, new MockLogger());

// TESTS
// ================================================================================================
async function runTests() {
    try {
        console.log(await generator.getNextId());
        console.log(await generator.getNextId());
        console.log(await generator.getNextId());
        console.log(await generator.getNextId());
        console.log(await generator.getNextId());

        console.log(await generator.getNextId());
        console.log(await generator.getNextId());

        setTimeout(async function() {
            console.log(await generator.getNextId());
            console.log(await generator.getNextId());
            console.log(await generator.getNextId());
        }, 100);
    }
    catch (e) {
        console.log(e.stack);
        console.log(JSON.stringify(e));
    }
}

// RUN TEST
// ================================================================================================
runTests();