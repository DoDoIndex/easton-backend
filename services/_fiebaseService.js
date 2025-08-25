import admin from 'firebase-admin';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

const firebaseAdmin = admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
  }),
});

function listAllFirebaseUsers() {
  return new Promise((resolve, reject) => {
    let allUsers = [];

    function listUsersRecursively(pageToken) {
      firebaseAdmin
        .auth()
        .listUsers(1000, pageToken)
        .then((listUsersResult) => {
          const users = listUsersResult.users;
          allUsers = allUsers.concat(users);

          if (listUsersResult.pageToken) {
            listUsersRecursively(listUsersResult.pageToken);
          } else {
            resolve(allUsers);
          }
        })
        .catch((error) => {
          reject(error);
        });
    }
    listUsersRecursively();
  });
}

async function isEmailInFirebase(email) {
  try {
    const firebaseUser = await firebaseAdmin.auth().getUserByEmail(email);
    if (firebaseUser?.uid) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function isUidInFirebase(uid) {
  try {
    const userRecord = await firebaseAdmin.auth().getUser(uid);
    if (userRecord) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

export { listAllFirebaseUsers, isEmailInFirebase, isUidInFirebase };
export default firebaseAdmin;
