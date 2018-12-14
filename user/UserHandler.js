const database = require('../db');

/*
 * Functions
 */

/**
 * GET /user/{id} => is secured by using the API Gateway authorizer: 'verify-token' that will check if JWT is valid
 *
 *  getUser:
    handler: user/UserHandler.getUser
    events:
      - http:
          path: users/{id}
          method: get
          cors: true
          request:
            parameters:
              paths:
                id: true
 */
module.exports.getUser = (event, context) => {
  console.log('[UserHandler.getUser] Received event:', JSON.stringify(event, null, 2));
  context.callbackWaitsForEmptyEventLoop = false;
  return database.getUserById(event.pathParameters.id)
    .then(user =>
      !user ? ({statusCode: 404}) : ({statusCode: 200, body: JSON.stringify(user)})
    )
    .catch(err => {
      console.log("ERROR [UserHandler.getUser]", err);
      return {
        statusCode: err.statusCode || 500,
        headers: { 'Content-Type': 'text/plain' },
        body: { stack: err.stack, message: err.message }
        }
    });
};
