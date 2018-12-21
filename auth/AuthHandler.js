const database = require('../db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs-then');
var md5 = require('md5');

const EMAIL_API_KEY =  process.env.EMAIL_API_KEY;
const EMAIL_API_DOMAIN = process.env.EMAIL_API_DOMAIN;
const API_HOST = process.env.API_HOST;
const API_STAGE = process.env.API_STAGE;

var mailgun = require('mailgun-js')({apiKey: EMAIL_API_KEY, domain: EMAIL_API_DOMAIN});

/*
 * Functions
 */

/**
 *   login:
    handler: auth/AuthHandler.login
    events:
      - http:s
          path: login
          method: post
          cors: true
 */
module.exports.login = (event, context) => {
  console.log('[AuthHandler.login] Received event:', JSON.stringify(event, null, 2));
  context.callbackWaitsForEmptyEventLoop = false;
  return login(JSON.parse(event.body))
    .then(session => httpOK(session))
    .catch(err => {
      console.log("ERROR [AuthHandler.login]", err);
      return httpError(err);
    });
};

/**
 * register:
    handler: auth/AuthHandler.register
    events:
      - http:
          path: register
          method: post
          cors: true
 */
module.exports.register = async function(event, context) {
  console.log('[AuthHandler.register] Received event:', JSON.stringify(event, null, 2));
  context.callbackWaitsForEmptyEventLoop = false;
  return register(JSON.parse(event.body))
    .then(session => httpOK(session))
    .catch(err => {
      console.log("ERROR [AuthHandler.register]", err);
      return httpError(err);
    });
};

/**
  me:
    handler: auth/AuthHandler.me
    events:
      - http:
          path: me
          method: get
          cors: true
          authorizer: verify-token

 */
module.exports.me = (event, context) => {
  console.log('[AuthHandler.me] Received event:', JSON.stringify(event, null, 2));
  context.callbackWaitsForEmptyEventLoop = false;
  return me(event.requestContext.authorizer.principalId)
  .then((user) => {
    console.log("(me.handler) got user: ", user)
    var response = httpOK(user);
    console.log("(me.handler) returning: ", response);
    return response;
  })
  .catch(err => {
    console.log("ERROR [AuthHandler.me]", err);
    return httpError(err);
  });
};

/**
 * activate-account:
    handler: auth/AuthHandler.activate
    events:
      - http:
          path: activate
          method: get
          cors: true
 */
module.exports.activate = (event, context) => {
  console.log('[AuthHandler.activate] Received event:', JSON.stringify(event, null, 2));
  context.callbackWaitsForEmptyEventLoop = false;
  return activate(event.pathParameters.id, event.queryStringParameters.token)
  .then(user => ({
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: '<html><body><center>The account <b>' + user.email + '</b> has been activated. Enjoy The Awareness Meditation! </center></body></html>'
  }))
  .catch(err => {
    console.log("ERROR [AuthHandler.activate]", err);
    return httpError(err);
  });
};

// ==========
//  HELPERS
// ==========

/**
 * Return Promise.reject with code and message
 * @param {int} statusCode
 * @param {String} message
 */
function statusReject(statusCode, message) {
  var err = new Error(message);
  err.statusCode = statusCode;
  return Promise.reject(err);
}

var badRequestError = (message) => statusReject(400, message ? message : 'Bad Request');
var unauthorizedError = (message) => statusReject(401, message ? message : 'Unauthorized');
var notFoundError = (message) => statusReject(404, message ? message : 'Not found');

var httpError = (err) => ({
    statusCode: err.statusCode || 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({message: err.message})
  });

var httpOK = (data) => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })

/**
 * Activate a user account.
 *
 * @param {string} userId
 * @param {string} verifyToken
 */
function activate(userId, verifyToken) {
  return database.getUserById(userId)
  .then(user => {
    if (user && verifyToken && user.verifyToken && verifyToken === user.verifyToken) {
      //check if already valid user
      if (user.activated) {
        return Promise.resolve(user);
      } else
        return database.activateUser(user)
    } else {
      return Promise.reject('Could not activate account');
    }
  })
}



function signToken(id) {
  return jwt.sign({ id: id }, process.env.JWT_SECRET, {
    expiresIn: 86400 // expires in 24 hours
    //TODO: find a way to generate non expiring tokens for public (Free Plan) users ?
  });
}

var userSession = (id) => Promise.resolve({token: signToken(id), auth: true});

/**
 * Check payload on /register
 * @param {JSON} eventBody
 */
function checkRegistrationPayload(eventBody) {
  if (
    !(eventBody.password &&
      eventBody.password.length >= 7)
  ) return badRequestError('Password needs to be longer than 7 characters');

  if (
    !(eventBody.firstName &&
      eventBody.firstName.length > 2 &&
      typeof eventBody.firstName === 'string')
  ) return badRequestError('First name needs to be longer than 2 characters');

  if (
    !(eventBody.email && typeof eventBody.email === 'string')
  ) return badRequestError('Email must have valid characters');

  return Promise.resolve();
}

/**
 * User registration
 *
 * @param {JSON} eventBody
 */
function register(eventBody) {
  let emailHash = md5(eventBody.email);
  return checkRegistrationPayload(eventBody) // activate input
    .then(() =>
      database.getUserById(emailHash)
    )
    .then(user => user ? badRequestError() : bcrypt.hash(eventBody.password))
    .then(passwordHash =>
      database.createUser({
        id: emailHash,
        firstName: eventBody.firstName,
        lastName: eventBody.lastName,
        password: passwordHash,
        email: eventBody.email
      })
      .then(user => {
        //send email for account validation
        var activateUrl = 'https://' + API_HOST + "/" + API_STAGE;
        var activateApiPath = "/activate/" + user.id + "?token=" + user.verifyToken;
        activateUrl = (process.env.IS_OFFLINE === 'true' ? 'http://localhost:3000' : activateUrl) + activateApiPath;
        console.log('(register) activate account URL: ', activateUrl);
        var emailData = {
          from: 'Florin <florin@flado.co>',
          to: eventBody.email,
          subject: 'Awareness account validation',
          text: 'Hello ' + user.firstName + ',\n Welcome to The Awareness Meditation!\n Click <a href="' + activateUrl + '">here</a> to activate your account.'
        };
        console.log('(register) about to send email: ', emailData);
        return mailgun.messages()
              .send(emailData)
              .then(sendResponse => {
                console.log('(register) validation email sendResponse: ', sendResponse);
                return userSession(user.id);
              })
              .catch(err => {
                console.log('Error sending email: ', err);
                return userSession(user.id); //resolve OK even if email failed
              });
      })
    )
}


/**
 * Login user with password
 *
 * @param {JSON} eventBody
 * @returns jwtToken or 401
 */
function login(eventBody) {
  let emailHash = md5(eventBody.email);
  return database.getUserById(emailHash, true)
    .then(user => user ? comparePassword(eventBody.password, user.password, user.id) : notFoundError())
    .catch(err => Promise.reject(new Error(err)));
}

/**
 * Compare passwords with bcrypt
 * @param {String} eventPassword non encrypted password
 * @param {String} userPassword encrypted password
 * @param {String} userId
 * @returns jwtToken or 401
 */
function comparePassword(eventPassword, userPassword, userId) {
  return bcrypt.compare(eventPassword, userPassword)
    .then(passwordIsValid => passwordIsValid ? userSession(userId) : unauthorizedError())
    .catch(err => Promise.reject(new Error(err)));
}


/**
 * Return user if any
 *
 * @param {String} userId
 * @returns user or `404 Resource Not Found`
 */
function me(userId) {
  return database.getUserById(userId)
    .then(user => {
      if (user) {
        //remove unwanted fields from user
        if (user.verifyToken) user.verifyToken = undefined;
        console.log("(me) returning user: ", user);
        return Promise.resolve(user);
      } else {
        return notFoundError();
      }
    })
    .catch(err => Promise.reject(new Error(err)));
}