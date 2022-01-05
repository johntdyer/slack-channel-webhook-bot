const JsonDB = require("node-json-db");
const qs = require("querystring");
const axios = require("axios");

const DB = new JsonDB("channels", true, false);

const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

client.connect();

// generate a unique number based on the current DateTime and a random number
const generateNonce = () =>
  `${+new Date()}${Math.floor(Math.random() * 100 + 1)}`;

const logResult = (result) => {
  console.log(result.data);
};

// Send messages to a Slack channel using chat.postMessage method
const sendNotification = (messageJSON, channelId) => {
  const bodyVars = {
    token: process.env.SLACK_TOKEN,
    channel: channelId,
  };

  // overwrite or add in the token and channel
  const body = Object.assign({}, messageJSON, bodyVars);
  if (messageJSON.attachments) {
    body.attachments = JSON.stringify(messageJSON.attachments);
  }

  const sendMessage = axios.post(
    "https://slack.com/api/chat.postMessage",
    qs.stringify(body)
  );

  sendMessage.then(logResult);

  const leaveChannel = axios.post(
    "https://slack.com/api/conversations.leave",
    qs.stringify(
      Object.assign({}, messageJSON, {
        token: process.env.SLACK_TOKEN,
        channel: channelId,
      })
    )
  );
  leaveChannel.then(logResult);
};

const findOrCreate = (channelId) => {
  let nonce;
  try {
    console.log(
      "Looking up channel_id: " +
        `SELECT * FROM mappings WHERE channel_id = '${channelId}';`
    );
    client.query(
      `SELECT * FROM mappings WHERE channel_id = '${channelId}';`,
      (err, res) => {
        if (err) throw err;
        if (res.rowCount == 0) {
          console.error(`${channelId} not found`);
          nonce = generateNonce();
          console.log(
            "Generated Nonce: " + nonce + " for channel_id: " + channelId
          );
          client.query(`INSERT INTO mappings(
            nonce, channel_id
            ) VALUES (
            '${nonce}',
            '${channelId}')`);
        } else {
          nonce = res.rows[0].nonce;
          console.log("Using found nonce: " + nonce);
        }
        const message = {
          text: `Webhook created for <#${channelId}>:\nBot will now leave channel.. Goodbye`,
          attachments: [
            {
              text: `${process.env.BASE_URL}/incoming/${nonce}`,
              color: "#7e1cc9",
            },
          ],
        };
        sendNotification(message, channelId);
      }
    );
  } catch (error) {
    console.error(`${error}`);
  }
};

const findByNonce = (nonce) => {
  const channels = DB.getData("/");
  return Object.keys(channels).find((key) => channels[key] === nonce);
};

const remove = (channelId) => {
  DB.delete(`/${channelId}`);
};

module.exports = { findOrCreate, findByNonce, sendNotification, remove };
