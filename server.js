const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const db = require('./db');  // Import the database module
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

app.post('/webhook', async (req, res) => {
    const { message, userId, conversationId } = req.body;

    if (message.toLowerCase() === 'reset conversation' && conversationId) {
        const exists = await db.conversationExists(conversationId);
        if (!exists) {
            return res.status(400).send("Conversation does not exist.");
        }
        await db.resetConversation(conversationId);
        console.log(`Conversation ${conversationId} reset for user: ${userId}`);
        return res.status(200).send("Conversation has been reset.");
    }

    let effectiveUserId = userId;

    // If userId is not provided or user does not exist, create a new user
    if (!userId || !(await db.userExists(userId))) {
        const newUser = await db.addUser(); // Adjust as necessary
        effectiveUserId = newUser.UserID; // Ensure your addUser function returns the new UserId
        console.log(`Created new user with ID: ${effectiveUserId}`);
    }

    let effectiveConversationId = conversationId || await db.startConversation();

    console.log(`Received message from ${effectiveUserId} in ${effectiveConversationId}: ${message}`);
    const chatResponse = await handleIncomingMessage(effectiveUserId, effectiveConversationId, message);
    res.status(200).send({ message: chatResponse, conversationId: effectiveConversationId, userId: effectiveUserId });
});

async function handleIncomingMessage(userId, conversationId, userMessage) {
    const context = await db.fetchConversationHistory(conversationId); // Fetch context from DB
    const reply = await fetchOpenAIResponse(userMessage, context);
    await db.addMessage(conversationId, userId, userMessage, 'user'); // Store user message in DB
    await db.addMessage(conversationId, userId, reply, 'assistant'); // Store bot reply in DB
    return reply;
}

async function fetchOpenAIResponse(userMessage, conversationId) {
    // Fetch all previous messages from the database
    const contextMessages = await db.fetchConversationHistory(conversationId);

    // Format messages for API
    const messages = contextMessages.map(msg => ({
        role: msg.role,
        content: msg.content
    }));

    // Append the new user message
    messages.push({
        role: "user",
        content: userMessage
    });

    // Log to debug
    console.log("Sending to OpenAI:", JSON.stringify(messages));

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

        // Return only the content of the latest response
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error fetching response from OpenAI:', error.response ? error.response.data : error);
        return "Sorry, I couldn't process that message.";
    }
}

