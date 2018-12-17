const database = require('../db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs-then');
var md5 = require('md5');

var EMAIL_API_KEY =  process.env.EMAIL_API_KEY;
var EMAIL_API_DOMAIN = process.env.EMAIL_API_DOMAIN;

var mailgun = require('mailgun-js')({apiKey: EMAIL_API_KEY, domain: EMAIL_API_DOMAIN});

/*
 * Functions
 */

/**
 *   login:
    handler: auth/AuthHandler.login
    events:
      - http:
          path: login
          method: post
          cors: true
 */
module.exports.login = (event, context) => {
  console.log('[AuthHandler.login] Received event:', JSON.stringify(event, null, 2));
  context.callbackWaitsForEmptyEventLoop = false;
  return login(JSON.parse(event.body))
    .then(session => ({
      statusCode: 200,
      body: JSON.stringify(session)
    }))
    .catch(err => {
      console.log("ERROR [AuthHandler.login]", err);
      return {
        statusCode: err.statusCode || 500,
        headers: { 'Content-Type': 'text/plain' },
        body: { stack: err.stack, message: err.message }
      }
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
    .then(session => {
      console.log('[AuthHandler.register] 200 OK -> ', session);
      return {
        statusCode: 200,
        body: JSON.stringify(session)
      }
    })
    .catch(err => {
      console.log("ERROR [AuthHandler.register]", err);
      return {
        statusCode: err.statusCode || 500,
        headers: { 'Content-Type': 'text/plain' },
        body: err.message
      }
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
  .then(user => ({
    statusCode: 200,
    body: JSON.stringify(user)
  }))
  .catch(err => {
    console.log("ERROR [AuthHandler.me]", err);
    return {
      statusCode: err.statusCode || 500,
      headers: { 'Content-Type': 'text/plain' },
      body: { stack: err.stack, message: err.message }
    }
  });
};




/**
 * ==========
 *  Helpers
 * ==========
 */

function signToken(id) {
  return jwt.sign({ id: id }, process.env.JWT_SECRET, {
    expiresIn: 86400 // expires in 24 hours
    //TODO: find a way to generate non expiring tokens for public (Free Plan) users ?
  });
}

function checkIfInputIsValid(eventBody) {
  if (
    !(eventBody.password &&
      eventBody.password.length >= 7)
  ) return Promise.reject(new Error('Password error. Password needs to be longer than 7 characters.'));

  if (
    !(eventBody.firstName &&
      eventBody.firstName.length > 2 &&
      typeof eventBody.firstName === 'string')
  ) return Promise.reject(new Error('First name error. First name needs to be longer than 2 characters'));

  if (
    !(eventBody.email && typeof eventBody.email === 'string')
  ) return Promise.reject(new Error('Email error. Email must have valid characters.'));

  return Promise.resolve();
}


function register(eventBody) {
  let emailHash = md5(eventBody.email);
  return checkIfInputIsValid(eventBody) // validate input
    .then(() =>
      database.getUserById(emailHash)
    )
    .then(user =>
      user
        ? Promise.reject(new Error('User with that email exists.'))
        : bcrypt.hash(eventBody.password) // hash the pass
    )
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
        var data = {
          from: 'Florin <florin@flado.co>',
          to: eventBody.email,
          subject: 'Awareness account validation',
          text: 'Testing some Mailgun awesomeness! Click on the link to validate account: '
        };
        console.log('(register) about to send email: ', data);
        return mailgun.messages()
          .send(data)
          .then(sendResponse => {
            console.log('(register) validation email sendResponse: ', sendResponse);
            return Promise.resolve({token: signToken(user.id),auth: true});
          });
      })
    )
}

function login(eventBody) {
  let emailHash = md5(eventBody.email);
  return database.getUserById(emailHash, true)
    .then(user =>
      !user
        ? Promise.reject(new Error('User with that email does not exits.'))
        : comparePassword(eventBody.password, user.password, user.id)
    )
    .then(token =>({token: token, auth: true})
    );
}

function comparePassword(eventPassword, userPassword, userId) {
  return bcrypt.compare(eventPassword, userPassword)
    .then(passwordIsValid =>
      !passwordIsValid
        ? Promise.reject(new Error('The credentials do not match.'))
        : signToken(userId)
    );
}

function me(userId) {
  return database.getUserById(userId)
    .then(user =>
      !user
        ? Promise.reject('No user found.')
        : Promise.resolve(user)
    )
    .catch(err => Promise.reject(new Error(err)));
}