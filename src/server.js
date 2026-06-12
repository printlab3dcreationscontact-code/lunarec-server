// Get variables from other files
let {
    targetVersion,
    port,
    serverAddress,
    logConnections,
    token_signature,
    allow2016AndEarly2017,
    rateLimits
} = require("../config.json");

const { version } = require("../package.json");
const { LevelProgressionMaps, DailyObjectives } = require("../shared-items/configv2.json");

// Clean serverAddress
if (serverAddress && serverAddress.endsWith('/')) {
    serverAddress = serverAddress.slice(0, -1);
}

// Modules
const express = require('express');
const morgan = require('morgan');
const { rateLimit } = require("express-rate-limit");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");

const app = express();
app.set('trust proxy', 1);

const path = require("path");
const fs = require("fs");

// Custom modules
const datamanager = require("./datamanager.js");
const { getPlayerTotal } = require("./players.js");
const { LogType, log, log_raw } = require("./logger.js");

// Middlewares
if (logConnections) {
    app.use(morgan(log_raw(LogType.API, `:remote-addr :method ":url" :status - :response-time ms`)));
}

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// ================= AUTH =================
const authenticateToken = async (req, res, next) => {
    res.set('x-LunarRec-Version', version);
    res.set('Content-Type', 'application/json');

    const noAuthRequired = [
        /^\/$/,
        /^\/img\/.+$/,
        /^\/instance\//,
        /^\/api\/versioncheck\//,
        /^\/api\/config\/v\d+$/,
        /^\/api\/platformlogin\/v\d+$/,
        /^\/api\/platformlogin\/v\d+\/profiles$/,
        /^\/\/api\/platformlogin\/v\d+$/,
        /^\/\/api\/platformlogin\/v\d+\/profiles$/,
        /^\/api\/players\/v\d+\/getorcreate$/,
    ];

    for (const r of noAuthRequired) {
        if (r.test(req.path)) return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    try {
        if (
            allow2016AndEarly2017 &&
            Buffer.from(token).toString('base64') === "recroom@gmail.com:recnet87"
        ) {
            req.uid = req.headers['x-rec-room-profile'];
            return next();
        }
    } catch {}

    jwt.verify(token, token_signature, (err, decoded) => {
        if (err) return res.sendStatus(403);

        req.uid = decoded.PlayerId;
        req.plat = decoded.PlatformId;
        next();
    });
};

// ================= RATE LIMIT =================
const limiter = rateLimit({
    windowMs: rateLimits.window,
    limit: rateLimits.maxRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});

// Debug logs
app.use((req, res, next) => {
    log(LogType.Debug, `[${req.method} "${req.url}"]`);
    next();
});

app.use(authenticateToken);
app.use(limiter);

// ================= ROUTES =================
app.use("/api/players", require("./routes/players.js"));
app.use("/api/avatar", require("./routes/avatar.js"));
app.use("/api/images", require("./routes/images.js"));
app.use("/api/settings", require("./routes/settings.js"));
app.use("/api/gamesessions", require("./routes/gamesessions.js"));
app.use("/api/relationships", require("./routes/relationships.js"));
app.use("/instance", require("./routes/lunarrec.js"));

// ================= ROUTES =================
app.get('/', (req, res) => {
    res.json({
        NOTE: "LunarRec Name Server",
        API: serverAddress,
        Notifications: serverAddress,
        Images: `${serverAddress}/img`
    });
});

app.get('/api/versioncheck/*', (req, res) => {
    const rrversion = req.headers['x-rec-room-version'];

    if (targetVersion) {
        if (rrversion === targetVersion) {
            return res.send({ ValidVersion: true });
        }
        return res.sendStatus(404);
    }

    res.send({ ValidVersion: true });
});

app.get('/api/events/v*/list', (req, res) => res.send("[]"));

app.get('/api/config/v1/amplitude', (req, res) => {
    res.json({ AmplitudeKey: "NoKeyProvided" });
});

app.get('/api/config/v2', (req, res) => {
    res.json({
        MessageOfTheDay: fs.readFileSync("./shared-items/motd.txt", 'utf8'),
        CdnBaseUri: serverAddress,
        ApiBaseUri: serverAddress,
        API: serverAddress,
        Notifications: serverAddress,
        LevelProgressionMaps,
        MatchmakingParams: {
            PreferFullRoomsFrequency: 1,
            PreferEmptyRoomsFrequency: 0
        },
        DailyObjectives,
        ConfigTable: [
            { Key: "Gift.DropChance", Value: "0.5" },
            { Key: "Gift.XP", Value: "0.5" }
        ],
        PhotonConfig: {
            CloudRegion: "us",
            CrcCheckEnabled: false
        }
    });
});

// ================= PORT FIX (IMPORTANT RAILWAY) =================
const PORT = Number(process.env.PORT || port || 3000);

// ================= START SERVER =================
const server = app.listen(PORT, "0.0.0.0", () => {
    log(LogType.Info, `Server started on port ${PORT}`);

    try {
        require("./websocket.js").start(server);
    } catch (e) {
        console.error("Websocket error:", e);
    }
});

// Safe crash logs
server.on("error", (err) => {
    console.error("Server error:", err);
});