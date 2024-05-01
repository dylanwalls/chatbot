// /db/index.js

const sql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    server: process.env.DB_SERVER,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    options: {
        encrypt: true, // for Azure SQL
        trustServerCertificate: false // change to true for local dev / self-signed certs
    }
};

async function getConnection() {
    try {
        if (!global.sqlPoolPromise) {
            global.sqlPoolPromise = sql.connect(config);
        }
        return await global.sqlPoolPromise;
    } catch (err) {
        console.error('Database connection failed:', err);
        throw err;
    }
}

// Check if a user exists
async function userExists(userId) {
    const pool = await getConnection();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query('SELECT COUNT(1) AS count FROM ChatUsers WHERE UserID = @userId');
    return result.recordset[0].count > 0;
}

// Check if a conversation exists
async function conversationExists(conversationId) {
    console.log('Checking existence of conversationId:', conversationId);
    if (typeof conversationId !== 'number' || conversationId <= 0) {
        console.error('Invalid conversationId provided:', conversationId);
        return false; // Assuming non-valid conversationId means non-existing
    }

    const pool = await getConnection();
    try {
        const result = await pool.request()
            .input('conversationId', sql.Int, conversationId)
            .query('SELECT COUNT(1) AS count FROM ChatConversations WHERE ConversationID = @conversationId');
        return result.recordset[0].count > 0;
    } catch (error) {
        console.error('Error checking if conversation exists:', error);
        throw error; // Re-throw the error after logging for further handling upstream
    }
}



async function addUser(username) {
    const pool = await getConnection();
    const result = await pool.request()
        .input('username', sql.NVarChar, username)
        // .input('email', sql.NVarChar, email)
        // .input('passwordHash', sql.NVarChar, passwordHash)
        .query('INSERT INTO ChatUsers (Username) VALUES (@username); SELECT SCOPE_IDENTITY() AS UserID;');
    const userId = result.recordset[0].UserID;
    console.log('new userID:', userId);
    return userId; // Assuming INSERTED returns the new record
}


async function getUserByEmail(email) {
    const pool = await getConnection();
    const result = await pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT * FROM ChatUsers WHERE Email = @email');
    return result.recordset[0]; // Assuming email is unique
}

async function startConversation() {
    const pool = await getConnection();
    const query = "INSERT INTO ChatConversations (IsActive) OUTPUT INSERTED.ConversationID VALUES (1);";
    const result = await pool.request().query(query);
    return result.recordset[0].ConversationID; // Returns the new conversation ID
}

async function addMessage(conversationId, userId, content, role) {
    const pool = await getConnection();
    const result = await pool.request()
        .input('conversationId', sql.Int, conversationId)
        .input('userId', sql.Int, userId)
        .input('content', sql.NVarChar(sql.MAX), content)
        .input('role', sql.NVarChar, role)
        .query('INSERT INTO ChatMessages (ConversationID, UserID, Content, Role) VALUES (@conversationId, @userId, @content, @role)');
    return result.recordset;
}

// Set conversation as inactive
async function resetConversation(conversationId) {
    const pool = await getConnection();
    const query = `UPDATE ChatConversations SET IsActive = 0 WHERE ConversationID = @conversationId`;
    await pool.request()
        .input('conversationId', sql.Int, conversationId)
        .query(query);
}

async function fetchConversationHistory(conversationId) {
    console.log('now within fetchConversationHistory, conversationId:', conversationId);
    const pool = await getConnection();
    const result = await pool.request()
        .input('conversationId', sql.Int, conversationId)
        .query('SELECT * FROM ChatMessages WHERE ConversationID = @conversationId ORDER BY SentAt');
    return result.recordset;
}

async function findOrCreateUserByPhone(phone) {
    const pool = await getConnection();
    let result = await pool.request()
        .input('phone', sql.NVarChar, phone)
        .query('SELECT * FROM ChatUsers WHERE Phone = @phone');
    if (result.recordset.length === 0) {
        // User does not exist, create new
        result = await pool.request()
            .input('phone', sql.NVarChar, phone)
            .query('INSERT INTO ChatUsers (Phone) OUTPUT INSERTED.* VALUES (@phone)');
    }
    return result.recordset[0]; // Return the user record
}

async function resolveActiveConversationId(userId) {
    const pool = await getConnection();
    
    try {
        // Check for an existing active conversation linked through messages
        const activeConversationCheck = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT c.ConversationID
                FROM ChatConversations c
                JOIN ChatMessages m ON m.ConversationID = c.ConversationID
                WHERE m.UserID = @userId AND c.IsActive = 1
                GROUP BY c.ConversationID
            `);

        if (activeConversationCheck.recordset.length > 0) {
            // Return the existing active conversation ID
            return activeConversationCheck.recordset[0].ConversationID;
        } else {
            // No active conversation, start a new one
            const newConversation = await pool.request()
                .query('INSERT INTO ChatConversations (IsActive) OUTPUT INSERTED.ConversationID VALUES (1);');
            return newConversation.recordset[0].ConversationID;
        }
    } catch (err) {
        console.error('Failed to resolve or start conversation:', err);
        throw err;
    }
}


module.exports = { getConnection, userExists, conversationExists, addUser, getUserByEmail, startConversation, addMessage , resetConversation, fetchConversationHistory, findOrCreateUserByPhone, resolveActiveConversationId};
