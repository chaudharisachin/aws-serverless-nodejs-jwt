const bcrypt = require('bcryptjs-then');
const AWS = require('aws-sdk');

const USERS_TABLE = process.env.USERS_TABLE;

let isConnected;
let dynamoDb;

function connectToDatabase() {
  if (isConnected) {
    console.log('=> using existing database connection');
    return Promise.resolve(); //TODO: do I need to resolve again with value in here ?
  }
  console.log('=> using NEW database connection');
  // Return new promise
  dynamoDb = new AWS.DynamoDB.DocumentClient();
  isConnected = true;
  return Promise.resolve();
};

module.exports.getUserById = function(id) {
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
            result.Item.password = undefined;
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
          password: user.password
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
