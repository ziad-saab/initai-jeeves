'use strict';

const restify = require('restify');
const InitClient = require('initai-node');
const axios = require('axios');
const morgan = require('morgan');

const projectLogicScript = require('./behavior/scripts');

/**
* Send the result of the logic invoation to Init.ai
**/
function sendLogicResult(invocationPayload, result) {
  const invocationData = invocationPayload.invocation_data;
  const requestConfig = {
    method: 'POST',
    baseURL: invocationData.api.base_url,
    url: `/api/v1/remote/logic/invocations/${invocationData.invocation_id}/result`,
    headers: {
      'accept': 'application/json',
      'authorization': `Bearer ${invocationData.auth_token}`,
      'content-type': 'application/json',
    },
    data: {
      invocation: {
        invocation_id: invocationData.invocation_id,
        app_id: invocationPayload.current_application.id,
        app_user_id: Object.keys(invocationPayload.users)[0],
      },
      result: result,
    }
  };

  console.log('Sending logic result:\n%s\n\n', JSON.stringify(result, null, 2));

  axios.request(requestConfig)
  .then(result => {
    console.log('Logic result sent:\n%s\n\n', JSON.stringify(result.data, null, 2));
  })
  .catch(err => {
    console.log('Logic result error:\n%s\n\n', err.stack);
  });
}

const server = restify.createServer();
server.use(restify.bodyParser());
server.use(morgan('dev')); // @TODO change for prod
server.use((req, res, next) => {
  if (req.body) {
    setImmediate(() => console.log(JSON.stringify(req.body, null, 2)));
  }
  next();
})

/**
 * Log any uncaught exceptions for easier debugging
 */
server.on('uncaughtException', (req, res, route, err) => {
  console.error('uncaughtException', err.stack)

  res.send(500)
})

/**
 * Add a POST request handler for webhook invocations
 */
server.post('/', (req, res, next) => {
  const eventType = req.body.event_type;
  const eventData = req.body.data;

  // Both LogicInvocation and MessageOutbound events will be sent to this handler
  if (eventType === 'LogicInvocation') {
    // The `create` factory expects and the event data and an Object modeled
    // to match AWS Lambda's interface which exposes a `succeed` function.
    // By default, the `done` method on the client instance will call this handler
    const initNodeClient = InitClient.create(eventData, {
      succeed(result) {
        sendLogicResult(eventData.payload, result)
      }
    });

    // An instance of the client needs to be provided to the `handle` method
    // exported from behavior/scripts/index.js to emulate the Lambda pattern
    projectLogicScript.handle(initNodeClient);
  }

  // Immediately return a 200 to acknowledge receipt of the Webhook
  res.send(200);
})

/**
 * Add a "heartbeat" endpoint to ensure server is up
 */
server.get('/heartbeat', (req, res) => {
  res.send('ok')
});

const PORT = process.env.PORT || 8888;
server.listen(PORT, () => {
  console.log('%s listening at %s', server.name, server.url);

  // if (process.env.NODE_ENV === 'development') {
  //   const localtunnel = require('localtunnel');
  //
  //   const tunnel = localtunnel(PORT, {subdomain: 'ziadsaab'}, (err, tunnel) => {
  //     if (err) {
  //       console.log('Localtunnel failure', err);
  //     }
  //     else {
  //       console.log('Localtunnel listening at %s', tunnel.url);
  //     }
  //   });
  //
  //   tunnel.on('error', err => console.log('Localtunnel error:\n%s\n\n', err));
  //   tunnel.on('close', () => console.log('Localtunnel closed'));
  // }
});
