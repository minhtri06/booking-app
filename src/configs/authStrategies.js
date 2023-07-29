const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt")
const createError = require("http-errors")

const {
    jwt: { SECRET },
    googleAuth: { CLIENT_ID, CLIENT_SECRET },
} = require("./envConfig")
const { NORMAL_USER } = require("./roles")
const {
    tokenTypes: { ACCESS },
    authTypes: { GOOGLE },
} = require("../constants")
const { redisService, userService } = require("../services")

const jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken("Authorization")

const jwtStrategy = new JwtStrategy(
    {
        secretOrKey: SECRET,
        jwtFromRequest,
    },
    async (payload, done) => {
        try {
            if (payload.type !== ACCESS) {
                throw createError.BadRequest("Invalid token type")
            }
            const user = await redisService.findOrCacheFindUserById(payload.sub)
            if (!user) {
                throw createError.Unauthorized("Unauthorized")
            }
            return done(null, user)
        } catch (error) {
            done(error, false)
        }
    },
)

module.exports = { jwtStrategy }
