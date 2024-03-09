'use strict';

require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

const PORT = process.env.PORT || 3000;

// 作成したBOTのチャンネルシークレットとチャンネルアクセストークン
const config = {
  channelSecret: process.env.LINE_BOT_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN
};

const getAccessToken = async () => {
  const params = new URLSearchParams()
  params.append('grant_type', 'urn:ibm:params:oauth:grant-type:apikey');
  params.append('apikey', process.env.WATSONX_API_KEY);

  let response;
  try {
      response = await axios.request({
          method:'POST',
          url:'https://iam.cloud.ibm.com/identity/token',
          headers:{
              'Content-Type':'application/x-www-form-urlencoded',
              'Accept': 'application/json'
          },
          data:params
      });
  } catch(e) {
      console.log(e);
  }
  
  return response.data;
}

const askWatsonXAI = async (message, access_token) => {
  let configAI = {
      method:'POST',
      url:'https://jp-tok.ml.cloud.ibm.com/ml/v1/text/generation?version=2023-05-29',
      headers:{
          'Content-Type':'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${access_token}`
      },
      data:{
          input:`You always answer the questions with markdown formatting. 
The markdown formatting you support: headings, bold, italic, links, tables, lists, code blocks, and blockquotes.
You must omit that you answer the questions with markdown.
          
Any HTML tags must be wrapped in block quotes, for example \`\`\`<html>\`\`\`.
You will be penalized for not rendering code in block quotes.
          
When returning code blocks, specify language.
          
You are a helpful, respectful and honest assistant. Always answer as helpfully as possible, while being safe. 
Your answers should not include any harmful, unethical, racist, sexist, toxic, dangerous, or illegal content. 
Please ensure that your responses are socially unbiased and positive in nature.

If a question does not make any sense, or is not factually coherent, explain why instead of answering something not correct.
If you don't know the answer to a question, please don't share false information.
----------------
`,
          parameters: {
              decoding_method: "greedy",
              max_new_tokens: 900,
              min_new_tokens: 200,
              stop_sequences: [],
              repetition_penalty: 1.05
          },
          model_id: "ibm/granite-8b-japanese",
          project_id: process.env.WATSONX_PROJECT_ID
      }
  };

  configAI.data.input += message;

  let response;

  try {
      response = await axios.request(configAI);
  } catch(e) {
      console.log(e);
  }

  return response.data;
}

const app = express();

app.use(express.static(__dirname + '/public'));

// 実際にメッセージを受け付ける
app.post('/webhook', line.middleware(config), (req, res) => {
    console.log(req.body.events);
    
    Promise
      .all(req.body.events.map(handleEvent))
      .then((result) => res.json(result));
});

const client = new line.messagingApi.MessagingApiClient(config);

async function handleEvent(event) {

  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const tokenData = await getAccessToken();

  const message = event.message.text;

  const responseAIData = await askWatsonXAI(message,tokenData.access_token);

  let answer = `[!] AI から、うまく返答されませんでしたm(_ _)m
----
`;

  if(responseAIData){
    answer += JSON.stringify(responseAIData,null, 2);
    if(responseAIData.results){
      if(responseAIData.results.length > 0){
        if(responseAIData.results[0].generated_text != ''){
          answer = `
${responseAIData.results[0].generated_text}
----
results ${responseAIData.results.length}`
;
        }
      }
    }
  }
  
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{
      type: 'text',
      text: answer
    }],
  });
  
}

app.listen(PORT);

console.log(`Server running at ${PORT}`);