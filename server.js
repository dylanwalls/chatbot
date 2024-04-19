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
    const { message, userId, conversationId = 'default_conversation' } = req.body;

    if (message.toLowerCase() === 'reset conversation') {
        await db.resetConversation(conversationId); // Reset conversation in DB
        console.log(`Conversation ${conversationId} reset for user: ${userId}`);
        res.status(200).send("Conversation has been reset.");
        return;
    }

    console.log(`Received message from ${userId} in ${conversationId}: ${message}`);
    const chatResponse = await handleIncomingMessage(userId, conversationId, message);
    res.status(200).send({ message: chatResponse });
});

async function handleIncomingMessage(userId, conversationId, userMessage) {
    const context = await db.fetchConversationHistory(conversationId); // Fetch context from DB
    const reply = await fetchOpenAIResponse(userMessage, context);
    await db.addMessage(conversationId, userId, userMessage, 'user'); // Store user message in DB
    await db.addMessage(conversationId, userId, reply, 'assistant'); // Store bot reply in DB
    return reply;
}

async function fetchOpenAIResponse(userMessage, context) {
    const messages = context.map(m => ({ role: m.role, content: m.content }));
    messages.push({ role: "user", content: userMessage }); // Append the latest message

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4",
            messages: messages
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error fetching response from OpenAI:', error);
        return "Sorry, I couldn't process that message.";
    }
}
