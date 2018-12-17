const bcrypt = require('bcryptjs-then');
const AWS = require('aws-sdk');

const USERS_TABLE = process.env.USERS_TABLE;

let isConnected;
let dynamoDb;

const IS_OFFLINE = process.env.IS_OFFLINE; //The serverless-offline plugin sets an environment variable of IS_OFFLINE to true

/**
 * Return Promise resolved with DynamoDB connection
 */
function connectToDatabase() {
  if (isConnected) {
    console.log('=> using existing database connection');
    return Promise.resolve(); //TODO: do I need to resolve again with value in here ?
  }
  console.log('=> using NEW database connection');
  if (IS_OFFLINE === 'true') {
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


module.exports.createUser = function(user) {
  return connectToDatabase()
    .then( () => {
      console.log('(db.createUser) -> using: ', user);
      const params = {
        TableName: USERS_TABLE,
        Item: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          password: user.password,
          email: user.email,
          verified: false
        }
      }
      return new Promise(function(resolve, reject) {
        dynamoDb.put(params, (error) => {
          if (error) {
            console.log(error);
            reject(new Error("Could not create user"));
          } else {
            console.log('(db.createUser) -> returning: ', user);
            user.password = undefined;
            resolve(user);
          }
        });
      });
    })
}
/**
 * Mailgun flow when adding Authorized recipients on the account :
 *
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