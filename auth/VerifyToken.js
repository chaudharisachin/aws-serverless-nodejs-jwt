const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens

// Policy helper function
const generatePolicy = (principalId, effect, resource) => {
  const authResponse = {};
  authResponse.principalId = principalId;
  if (effect && resource) {
    const policyDocument = {};
    policyDocument.Version = '2012-10-17';
    policyDocument.Statement = [];
    const statementOne = {};
    statementOne.Action = 'execute-api:Invoke';
    statementOne.Effect = effect;
    statementOne.Resource = resource;
    policyDocument.Statement[0] = statementOne;
    authResponse.policyDocument = policyDocument;
  }
  return authResponse;
}

/**
 Custom authorizers functions are executed before a Lambda function is executed and return an Error or a Policy document.
 The Custom authorizer function is passed an event object as below:
 {
  "type": "TOKEN",
  "authorizationToken": "<Incoming bearer token>",
  "methodArn": "arn:aws:execute-api:<Region id>:<Account id>:<API id>/<Stage>/<Method>/<Resource path>"
 }
 */
module.exports.auth = (event, context, callback) => {
  console.log('[VerifyToken.auth] Received event:', JSON.stringify(event, null, 2));

  // check header or url parameters or post parameters for token
  const token = event.authorizationToken;

  if (!token) {
    console.log("[VerifyToken.auth] missing token -> request Unauthorized");
    return callback('Unauthorized'); //by default APIGateway will return 401 with body "Unauthorized"
  }

  // verifies secret and checks exp
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    console.log("[VerifyToken.auth] verify token ...");
    if (err) {
      console.log("[VerifyToken.auth] verify token failed:", err);
      return callback('Unauthorized');
    }

    // if everything is good, save to request for use in other routes
    let policy = generatePolicy(decoded.id, 'Allow', event.methodArn)
    console.log("[VerifyToken.auth] save to request for use in other routes:", policy);
    return callback(null, policy);
  });

};