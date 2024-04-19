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

async function addUser(username, email, passwordHash) {
    const pool = await getConnection();
    const result = await pool.request()
        .input('username', sql.NVarChar, username)
        .input('email', sql.NVarChar, email)
        .input('passwordHash', sql.NVarChar, passwordHash)
        .query('INSERT INTO ChatUsers (Username, Email, PasswordHash) VALUES (@username, @email, @passwordHash)');
    return result.recordset;
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
    const result = await pool.request()
        .query('INSERT INTO ChatConversations DEFAULT VALUES; SELECT SCOPE_IDENTITY() AS ConversationID;');
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

async function resetConversation(conversationId) {
    const pool = await getConnection();
    await pool.request()
        .input('conversationId', sql.Int, conversationId)
        .query('DELETE FROM ChatMessages WHERE ConversationID = @conversationId');
}

async function fetchConversationHistory(conversationId) {
    const pool = await getConnection();
    const result = await pool.request()
        .input('conversationId', sql.Int, conversationId)
        .query('SELECT * FROM ChatMessages WHERE ConversationID = @conversationId ORDER BY SentAt');
    return result.recordset;
}


module.exports = { getConnection, addUser, getUserByEmail, startConversation, addMessage , resetConversation, fetchConversationHistory};
