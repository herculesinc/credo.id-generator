// IMPORTS
// ================================================================================================
import * as http from 'http';
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

// CREATE SERVER
// ================================================================================================
const server = http.createServer(async function(request, response) {
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

    response.end();
});

server.listen(3000, function() {
    console.log('Server started');
});