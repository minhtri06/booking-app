require("express-async-errors")

const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const logger = require("morgan")
const passport = require("passport")

const envConfig = require("./configs/envConfig")
const { jwtStrategy } = require("./configs/authStrategies")
const { STATIC_DIRNAME } = require("./constants")
const {
    generalMiddlewares: { handleException, handleNotFound },
} = require("./middlewares")
const router = require("./routes")
const { connectMongoDb, redisClient } = require("./db")
const initSocket = require("./socket")

const app = express()

app.use(helmet())

app.use(
    cors({
        origin: envConfig.CLIENT_URL,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }),
)

app.use(logger("dev"))

app.use(express.json())
app.use(
    express.urlencoded({
        extended: true,
    }),
)

app.use(passport.initialize())
passport.use("jwt", jwtStrategy)

app.use("/api/v1", router)
app.get("/", (req, res) => res.send("oke"))

app.use(express.static(STATIC_DIRNAME))

app.use(handleNotFound)
app.use(handleException)

const start = async () => {
    try {
        await connectMongoDb()
        console.log("Connect MongoDb successfully")

        await redisClient.connect()
        console.log("Connect Redis successfully")

        const server = app.listen(
            envConfig.PORT,
            console.log("🧙‍ Server is running on port " + envConfig.PORT),
        )

        initSocket(server)
    } catch (error) {
        console.log(error)
    }
}

start()
