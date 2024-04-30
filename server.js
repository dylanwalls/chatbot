//server.js

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const db = require('./db');  // Import the database module
const twilio = require('twilio');

require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// Twilio client setup
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

app.post('/webhook', async (req, res) => {
    const {Body: message, From: from} = req.body;
    const phone = from.split(':')[1];

    console.log('Message:', message);
    console.log('Phone:', phone);
    // const { message, userId, username, conversationId } = req.body;
    console.log('req body:', req.body);

    let user = await db.findOrCreateUserByPhone(phone);
    let conversationId = await db.resolveActiveConversationId(user.UserID) || await db.startConversation();

    console.log(`Received message from ${user.UserID} in ${conversationId}: ${message}`);
    const chatResponse = await handleIncomingMessage(user.UserID, conversationId, message);

    client.messages.create({
        body: chatResponse,
        from: 'whatsapp:+14155238886',
        to: from
    }).then(message => console.log(message.sid))
    .catch(error => console.error(error));

    res.status(200).send('Message processed.');
});

async function handleIncomingMessage(userId, conversationId, userMessage) {
    console.log('Calling fetchConversationHistory');
    const context = await db.fetchConversationHistory(conversationId); // Fetch context from DB
    console.log('from conversationHistory, context:', context);
    console.log('Calling fetchOpenAIResponse');
    const reply = await fetchOpenAIResponse(userMessage, context);
    console.log('Reply:', reply);
    console.log('Calling addMessage1');
    await db.addMessage(conversationId, userId, userMessage, 'user'); // Store user message in DB
    console.log('Calling addMessage2');
    await db.addMessage(conversationId, userId, reply, 'assistant'); // Store bot reply in DB
    return reply;
}

async function fetchOpenAIResponse(userMessage, contextMessages) {
    // Initialize the messages array
    const messages = contextMessages.map(msg => {
        console.log(`Mapping message: ${msg.Content} with role: ${msg.Role}`);
        return {
            role: msg.Role,
            content: msg.Content
        };
    });

    // Always append the new user message
    messages.push({
        role: "user",
        content: userMessage
    });

    // Log to debug
    console.log("Final message array to OpenAI:", JSON.stringify(messages));

    if (messages.length === 1) {
        console.log("First message in conversation, initiating with OpenAI.");
    }

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4",
            messages: messages
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        console.log("OpenAI response:", response.data);

        // Return only the content of the latest response
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error fetching response from OpenAI:', error.response ? error.response.data : error);
        return "Sorry, I couldn't process that message.";
    }
}


