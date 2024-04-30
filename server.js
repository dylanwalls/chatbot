//server.js

const express = require('express');
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
const axios = require('axios');
const db = require('./db');  // Import the database module
require('dotenv').config();

const app = express();
// app.use(bodyParser.json());

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

app.post('/webhook', async (req, res) => {
    const message = req.body.Body;
    const userId = req.body.From;
    console.log('Message:', message);
    console.log('From:', userId);
    // const { message, userId, username, conversationId } = req.body;
    console.log('req body:', req.body);

    // Validate conversationId
    if (conversationId !== undefined && (isNaN(parseInt(conversationId)) || parseInt(conversationId) <= 0)) {
        return res.status(400).send("Invalid conversationId provided.");
    }

    console.log('Conversation ID:', conversationId, 'Type:', typeof conversationId);

    if (message.toLowerCase() === 'reset conversation' && conversationId) {
        console.log('calling conversationExists');
        const exists = await db.conversationExists(conversationId);
        if (!exists) {
            return res.status(400).send("Conversation does not exist.");
        }
        console.log('Calling resetConversation');
        await db.resetConversation(conversationId);
        console.log(`Conversation ${conversationId} reset for user: ${userId}`);
        return res.status(200).send("Conversation has been reset.");
    }

    let effectiveUserId = userId;

    // If userId is not provided or user does not exist, create a new user
    console.log('Calling userExists');
    if (!userId || !(await db.userExists(userId))) {
        console.log('Calling addUser');
        const newUser = await db.addUser(username); // Adjust as necessary
        effectiveUserId = newUser.UserID; // Ensure your addUser function returns the new UserId
        console.log(`Created new user with ID: ${effectiveUserId}`);
    }

    console.log('Calling startConversation');
    let effectiveConversationId = conversationId || await db.startConversation();
    console.log('effectiveUserId =', effectiveUserId);
    console.log('effectiveConversationId =', effectiveConversationId);

    console.log(`Received message from ${effectiveUserId} in ${effectiveConversationId}: ${message}`);
    console.log('Calling handleIncomingMessage');
    const chatResponse = await handleIncomingMessage(effectiveUserId, effectiveConversationId, message);
    res.status(200).send({ message: chatResponse, conversationId: effectiveConversationId, userId: effectiveUserId });
});

async function handleIncomingMessage(userId, conversationId, userMessage) {
    console.log('Calling fetchConversationHistory');
    const context = await db.fetchConversationHistory(conversationId); // Fetch context from DB
    console.log('from conversationHistory, context:', context);
    console.log('Calling fetchOpenAIResponse');
    const reply = await fetchOpenAIResponse(userMessage, context);
    console.log('Calling addMessage1');
    await db.addMessage(conversationId, userId, userMessage, 'user'); // Store user message in DB
    console.log('Calling addMessage2');
    await db.addMessage(conversationId, userId, reply, 'assistant'); // Store bot reply in DB
    return reply;
}

async function fetchOpenAIResponse(userMessage, contextMessages) {
    
    if (!contextMessages || contextMessages.length === 0) {
        console.error("No messages found in conversation history.");
        return "No previous messages found.";
    }
    // Fetch all previous messages from the database
    console.log('Calling fetchConversationHistory (within fetchOpenAIResponse) and ');
    // const contextMessages = await db.fetchConversationHistory(conversationId);
    // console.log('contextMessages:', contextMessages);

    // Format messages for API
    const messages = contextMessages.map(msg => {
        console.log(`Mapping message: ${msg.Content} with role: ${msg.Role}`);
        return {
            role: msg.Role,
            content: msg.Content
        };
    });

    // Append the new user message
    messages.push({
        role: "user",
        content: userMessage
    });

    // Log to debug
    console.log("Final message array to OpenAI:", JSON.stringify(messages));

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

