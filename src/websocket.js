const { LogType, log, log_raw } = require("./logger.js")
const WebSocket = require('ws');

const db = process.db.users

const ResponseResults = {
    RelationshipChanged: 1,
    MessageReceived: 2,
    MessageDeleted: 3,
    PresenceHeartbeatResponse: 4,
    SubscriptionListUpdated: 9,
    SubscriptionUpdateProfile: 11,
    SubscriptionUpdatePresence: 12,
    SubscriptionUpdateGameSession: 13,
    SubscriptionUpdateRoom: 15,
    ModerationQuitGame: 20,
    ModerationUpdateRequired: 21,
    ModerationKick: 22,
    ModerationKickAttemptFailed: 23,
    ServerMaintenance: 25,
    GiftPackageReceived: 30,
    ProfileJuniorStatusUpdate: 40,
    RelationshipsInvalid: 50,
    StorefrontBalanceAdd: 60,
    ConsumableMappingAdded: 70,
    ConsumableMappingRemoved: 71,
    PlayerEventCreated: 80,
    PlayerEventUpdated: 81,
    PlayerEventDeleted: 82,
    PlayerEventResponseChanged: 83,
    PlayerEventResponseDeleted: 84,
    PlayerEventStateChanged: 85,
    ChatMessageReceived: 90
};



async function processRequest(data) {
    let res;

    try {
        log(LogType.WS, `Data received: ${data}`)

        try {
            data = JSON.parse(data);
        } catch (parseErr) {
            log(LogType.Error, `WS: Failed to parse incoming message as JSON: ${parseErr.message}`)
            return JSON.stringify({ error: "Invalid JSON" })
        }

        if (data.api != undefined) {
            if (data.api === "playerSubscriptions/v1/update") {
                log(LogType.WS, `Presence update called!`)
                res = await createResponse(12, data)
            } else if (data.api === "heartbeat2") {
                log(LogType.WS, `Heartbeat called!`)
                res = await createResponse(4, data)
            } else {
                log(LogType.WS, `Unknown call: "${data.api}". Sending blank response`)
                res = ""
            }
        } else {
            res = JSON.stringify({"SessionId": 2017})
        }

        log(LogType.WS, `Data sent: ${res}`)
        return res;
    } catch (err) {
        log(LogType.Error, `WS: Unhandled error in processRequest: ${err.message}`)
        return JSON.stringify({ error: "Internal server error" })
    }
}

async function createResponse(id, data) {
    try {
        if (!data.param || !data.param.PlayerIds || data.param.PlayerIds.length === 0) {
            log(LogType.Error, `WS: createResponse called with missing or empty param.PlayerIds`)
            return JSON.stringify({ error: "Missing PlayerIds" })
        }

        const playerId = data.param.PlayerIds[0]

        let usr = await db.findOne({ where: { id: playerId }})

        if (!usr) {
            log(LogType.Error, `WS: No user found in database for player ID: ${playerId}`)
            return JSON.stringify({ error: "Player not found" })
        }

        let ses;
        try {
            ses = JSON.parse(usr.session)
        } catch (parseErr) {
            log(LogType.Error, `WS: Failed to parse session data for player ID ${playerId}: ${parseErr.message}`)
            return JSON.stringify({ error: "Invalid session data" })
        }

        return JSON.stringify({
            Id: id,
            Msg: {
                PlayerId: playerId,
                IsOnline: true,
                InScreenMode: false,
                GameSession: ses
            }
        })
    } catch (err) {
        log(LogType.Error, `WS: Unhandled error in createResponse: ${err.message}`)
        return JSON.stringify({ error: "Internal server error" })
    }
}

function start(server) {
    try {
        const wss = new WebSocket.Server({ server });

        wss.on('error', (err) => {
            log(LogType.Error, `WS: WebSocket server error: ${err.message}`)
        })

        wss.on('connection', async (ws) => {
            log(LogType.Debug, "WS: A client connected!")

            ws.on('message', async (data) => {
                try {
                    ws.send(await processRequest(data));
                } catch (err) {
                    log(LogType.Error, `WS: Failed to send response to client: ${err.message}`)
                }
            });

            ws.on('error', (err) => {
                log(LogType.Error, `WS: Client connection error: ${err.message}`)
            })

            ws.on('close', async (ws) => {
                log(LogType.Debug, "WS: A client disconnected!")
            });
        });
    } catch (err) {
        log(LogType.Error, `WS: Failed to initialize WebSocket server: ${err.message}`)
    }
}
module.exports = { start }