const bcrypt = require('bcryptjs-then');
const AWS = require('aws-sdk');
var crypto = require('crypto');
var base64url = require('base64url');

const USERS_TABLE = process.env.USERS_TABLE;

let isConnected;
let dynamoDb;

/** Sync */
function randomStringAsBase64Url(size) {
  return base64url(crypto.randomBytes(size));
}

/**
 * Return Promise resolved with DynamoDB connection
 */
function connectToDatabase() {
  if (isConnected) {
    console.log('=> using existing database connection');
    return Promise.resolve(); //TODO: do I need to resolve again with value in here ?
  }
  console.log('=> using NEW database connection');
  if (process.env.IS_OFFLINE === 'true') { //The serverless-offline plugin sets an environment variable of IS_OFFLINE to true
    dynamoDb = new AWS.DynamoDB.DocumentClient({
      region: 'localhost',
      endpoint: 'http://localhost:8000'
    })
    console.log(">> Running DynamoDB OFFLINE:", dynamoDb);
  } else {
    dynamoDb = new AWS.DynamoDB.DocumentClient();
  }
  isConnected = true;
  return Promise.resolve();
};

module.exports.getUserById = function(id, includePassword) {
  return connectToDatabase()
    .then( () => {
      console.log('(db.getUserById) using: ' + id);
      const queryParams = {
        TableName: USERS_TABLE,
        Key: {
          id: id
        }
      }
      return new Promise(function(resolve, reject) {
        dynamoDb.get(queryParams, (error, result) => {
          if (error) {
            console.log(error);
            reject(new Error("Could not get user"));
          }
          if (result.Item) {
            console.log("(db.getUserById) -> user found: ", result.Item);
            if (!includePassword) {
              result.Item.password = undefined;
            }
            // const {id, firstName, lastName, password, email} = result.Item;
            resolve(result.Item);
          } else {
            resolve(); //resolve OK with no user
          }
        });
      });
    })
}

module.exports.activateUser = function(user) {
  // Update the item, unconditionally,
  var now = new Date();
  return connectToDatabase()
  .then( () => {
    console.log('(db.activateUser) -> : ', user);
    var params = {
      TableName: USERS_TABLE,
      Key: {
        id: user.id
      },
      // UpdateExpression: "REMOVE verifyToken"
      UpdateExpression: "SET activated = :a",
      ExpressionAttributeValues: {
        ":a": now.toISOString()
      },
      ReturnValues:  "ALL_NEW" //"UPDATED_NEW"
    };

    return new Promise( function(resolve, reject) {
      dynamoDb.update(params, function(err, data) {
        if (err) {
            console.error("(db.activateUser) Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
            reject('Unable to activate user');
        } else {
            console.log("(db.activateUser) success:", JSON.stringify(data, null, 2));
            resolve(user);
        }
      });
    })
  })
}

module.exports.createUser = function(user) {
  return connectToDatabase()
    .then( () => {
      console.log('(db.createUser) -> using: ', user);
      let verifyToken = randomStringAsBase64Url(31);
      var now = new Date();
      const params = {
        TableName: USERS_TABLE,
        Item: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          password: user.password,
          email: user.email,
          verifyToken: verifyToken,
          created: now.toISOString(),
          plans: ["a", "b", "c"],
          data: {
            access: 1,
            permissions: [1,2,3,4],
            address: {
              city: 'Berlin',
              street: 'Kwawa',
              number: 12345
            }
          }
        }
      }
      return new Promise(function(resolve, reject) {
        dynamoDb.put(params, (error) => {
          if (error) {
            console.log(error);
            reject(new Error("Could not create user"));
          } else {
            console.log('(db.createUser) -> returning: ', params.Item);
            params.Item.password = undefined;
            resolve(params.Item);
          }
        });
      });
    })
}
/**
 * Mailgun flow when adding Authorized recipients on the account :
 *
 * "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjcxZmVlMTFhNjkxMWY4MWFiZjAxMGU1ZDAzNWU1NzE1IiwiaWF0IjoxNTQ1MDkxMDI3LCJleHAiOjE1NDUxNzc0Mjd9.1OALF5YPyGSDRhJhTTm9zK-wQ-W_EZxzP-mDCnL9JHM",


GET:
http://email.mailgun.net/c/eJxtjcFqxDAMRL8mOQZLsWL74MOy2ZwK_QbZljeG3SRs3EL_vi60t6I5DDMPTfJg-uJRgQUErUw7GGCwNC-W7BVwntV1uXVaPbk87h_bsEntV-_GCJwyuSkZA4kEQlDBoNKcQcHUP_xa63F246XDpYmPY_h7EfdnS6qctWz35l4Sy1Fkq-cPmPa4Filt8ovXff-lOdbyyVWadaBFIiZGwGBSzto5EZpGQ4Gisg0hxshTypB1sEETBMwjKd2q5e0yv_cv_9_ON7qJUUY

OPEN URL:
https://app.mailgun.com/testing/recipients/adochiei@yahoo.com/activate/914eec2da212b7dff499ee56375b5c08/5a2ca6df1f4b8b451b2f3504/FLADO

Confirm
Are you sure you would like to receive emails on adochiei@yahoo.com from Mailgun account "FLADO"

YES:
 POST https://app.mailgun.com/testing/recipients/add
 csrf_token: bd8fbf91f2ca1f55b0aaaec78c7209d80f7bce6f
 email: adochiei@yahoo.com
 token: 914eec2da212b7dff499ee56375b5c08
 account_id: 5a2ca6df1f4b8b451b2f3504
 account_name: FLADO
 submit: Yes

 200 Response HTML:
  Success
Recipient activated. adochiei@yahoo.com can start receiving emails from "FLADO"
 */